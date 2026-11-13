-- Connected group collections. Group money lives in its own balanced ledger account.
-- All helpers are private and execute only behind the common live-session/PIN/idempotency dispatcher.
create table lumo_private.groups (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id),
 account_id uuid not null unique references lumo_private.accounts(id),
 name text not null check(length(name) between 1 and 80),
 description text not null default '' check(length(description)<=400),
 target bigint not null default 0 check(target between 0 and 10000000),
 deadline timestamptz,
 approval_count integer not null default 2 check(approval_count between 1 and 5),
 approval_threshold bigint not null default 10000 check(approval_threshold between 0 and 1000000),
 join_code text not null unique default replace(gen_random_uuid()::text,'-','') check(join_code ~ '^[a-f0-9]{32}$'),
 status text not null default 'open' check(status in ('open','closed','cancelled')),
 created_at timestamptz not null default clock_timestamp()
);
create index lumo_groups_owner on lumo_private.groups(owner_user_id,created_at desc);
create table lumo_private.group_members (
 group_id uuid not null references lumo_private.groups(id),
 user_id uuid not null references auth.users(id),
 role text not null default 'member' check(role in ('owner','member')),
 status text not null check(status in ('invited','active','declined','removed','left')),
 invited_by uuid not null references auth.users(id),
 joined_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 primary key(group_id,user_id),
 check(role<>'owner' or status='active')
);
create index lumo_group_members_user on lumo_private.group_members(user_id,status,group_id);
create table lumo_private.group_messages (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references lumo_private.groups(id),
 actor_user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('message','system')),
 body text not null check(length(body) between 1 and 1000),
 created_at timestamptz not null default clock_timestamp()
);
create index lumo_group_messages_history on lumo_private.group_messages(group_id,created_at desc,id);
create index lumo_group_messages_actor on lumo_private.group_messages(actor_user_id,created_at desc) where kind='message';
create table lumo_private.group_payouts (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references lumo_private.groups(id),
 requested_by uuid not null references auth.users(id),
 recipient_user_id uuid not null references auth.users(id),
 recipient_account_id uuid not null references lumo_private.accounts(id),
 amount bigint not null check(amount between 1 and 1000000),
 note text not null default '' check(length(note)<=160),
 required_approvals integer not null check(required_approvals between 1 and 5),
 eligible_voters uuid[] not null,
 status text not null default 'pending' check(status in ('pending','paid','cancelled')),
 journal_id uuid unique references lumo_private.journals(id),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '24 hours'),
 check(cardinality(eligible_voters)>=required_approvals),
 check(not(requested_by=any(eligible_voters))),
 check((status='paid')=(journal_id is not null)),
 check(expires_at>created_at)
);
create index lumo_group_payouts_history on lumo_private.group_payouts(group_id,created_at desc,id);
create index lumo_group_payouts_pending on lumo_private.group_payouts(group_id,expires_at) where status='pending';
create index lumo_group_payouts_requester on lumo_private.group_payouts(requested_by);
create index lumo_group_payouts_recipient on lumo_private.group_payouts(recipient_user_id);
create table lumo_private.group_approvals (
 proposal_id uuid not null references lumo_private.group_payouts(id),
 user_id uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(proposal_id,user_id)
);
create index lumo_group_approvals_user on lumo_private.group_approvals(user_id);
create table lumo_private.group_postings (
 journal_id uuid primary key references lumo_private.journals(id),
 group_id uuid not null references lumo_private.groups(id),
 proposal_id uuid unique references lumo_private.group_payouts(id)
);
create index lumo_group_postings_group on lumo_private.group_postings(group_id,journal_id);
alter table lumo_private.groups enable row level security;
alter table lumo_private.group_members enable row level security;
alter table lumo_private.group_messages enable row level security;
alter table lumo_private.group_payouts enable row level security;
alter table lumo_private.group_approvals enable row level security;
alter table lumo_private.group_postings enable row level security;
revoke all on lumo_private.groups,lumo_private.group_members,lumo_private.group_messages,lumo_private.group_payouts,lumo_private.group_approvals,lumo_private.group_postings from public,anon,authenticated,service_role;

create function lumo_private.group_proposal_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'groupId',r.group_id,'recipientHandle',p.handle,'recipientName',p.display_name,
 'amount',r.amount,'note',r.note,'requestedBy',r.requested_by,'requesterHandle',q.handle,
 'status',case when r.status='pending' and r.expires_at<=clock_timestamp() then 'expired' else r.status end,
 'requiredApprovals',r.required_approvals,'approvals',(select count(*) from lumo_private.group_approvals v
   join lumo_private.group_members gm on gm.group_id=r.group_id and gm.user_id=v.user_id and gm.status='active'
   join lumo_private.profiles vp on vp.user_id=v.user_id and vp.status='active' where v.proposal_id=r.id),
 'approvedBy',coalesce((select jsonb_agg(vp.handle order by v.created_at,v.user_id) from lumo_private.group_approvals v join lumo_private.profiles vp on vp.user_id=v.user_id where v.proposal_id=r.id),'[]'::jsonb),
 'journalId',r.journal_id,'createdAt',r.created_at,'expiresAt',r.expires_at)
 from lumo_private.group_payouts r join lumo_private.profiles p on p.user_id=r.recipient_user_id join lumo_private.profiles q on q.user_id=r.requested_by where r.id=p_id;
$$;
create function lumo_private.group_json(p_id uuid,p_actor uuid,p_detail boolean default true) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare g lumo_private.groups%rowtype;m lumo_private.group_members%rowtype;result jsonb;
begin
 select * into g from lumo_private.groups where id=p_id;
 select * into m from lumo_private.group_members where group_id=p_id and user_id=p_actor and status in ('active','invited');
 if g.id is null or m.user_id is null then return null;end if;
 result:=jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'target',g.target,'deadline',g.deadline,'status',g.status,
  'ownerUserId',g.owner_user_id,'role',m.role,'membershipStatus',m.status,'approvalCount',g.approval_count,
  'approvalThreshold',g.approval_threshold,'memberCount',(select count(*) from lumo_private.group_members where group_id=g.id and status='active'),'createdAt',g.created_at);
 -- An invitation is not membership and cannot reveal group money, chat, history or join codes.
 if m.status='invited' then return result;end if;
 result:=result||jsonb_build_object('accountId',g.account_id,'balance',(select balance from lumo_private.accounts where id=g.account_id),
  'contributed',coalesce((select sum(j.amount) from lumo_private.group_postings gp join lumo_private.journals j on j.id=gp.journal_id where gp.group_id=g.id and j.type='group_contribution' and j.actor_user_id=p_actor),0));
 if m.role='owner' and g.status='open' then result:=result||jsonb_build_object('joinCode',g.join_code);end if;
 if not p_detail then return result;end if;
 result:=result||jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',gm.user_id,'handle',p.handle,'displayName',p.display_name,'role',gm.role,'status',gm.status) order by case when gm.role='owner' then 0 else 1 end,gm.created_at,gm.user_id) from lumo_private.group_members gm join lumo_private.profiles p on p.user_id=gm.user_id where gm.group_id=g.id and gm.status in ('active','invited')),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'text',x.body,'handle',p.handle,'displayName',p.display_name,'createdAt',x.created_at) order by x.created_at,x.id) from (select * from lumo_private.group_messages where group_id=g.id order by created_at desc,id desc limit 100)x join lumo_private.profiles p on p.user_id=x.actor_user_id),'[]'::jsonb),
 'proposals',coalesce((select jsonb_agg(lumo_private.group_proposal_json(x.id) order by x.created_at desc,x.id) from (select id,created_at from lumo_private.group_payouts where group_id=g.id order by created_at desc,id desc limit 100)x),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(lumo_private.receipt_json(x.id) order by x.created_at desc,x.id) from (select j.id,j.created_at from lumo_private.group_postings gp join lumo_private.journals j on j.id=gp.journal_id where gp.group_id=g.id order by j.created_at desc,j.id desc limit 100)x),'[]'::jsonb));
 return result;
end $$;
create function lumo_private.group_system(p_group uuid,p_actor uuid,p_text text) returns void language sql security invoker set search_path='' as $$
 insert into lumo_private.group_messages(group_id,actor_user_id,kind,body) values(p_group,p_actor,'system',p_text);
$$;

create function lumo_private.groups_command(p_command text,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid();g lumo_private.groups%rowtype;m lumo_private.group_members%rowtype;target_member lumo_private.group_members%rowtype;
 person lumo_private.profiles%rowtype;own lumo_private.accounts%rowtype;dest lumo_private.accounts%rowtype;r lumo_private.group_payouts%rowtype;
 gid uuid;pid uuid;aid uuid;jid uuid;v_name text;v_description text;v_text text;v_handle text;v_code text;v_numeric numeric;
 v_target bigint:=0;v_threshold bigint:=10000;v_count integer:=2;amount bigint;required integer;votes integer;eligible uuid[];result jsonb;member_id uuid;v_deadline timestamptz;
 cancellation_receipts jsonb:='[]'::jsonb;refund_row record;remaining bigint;total_contributed numeric;rounding_units bigint;part bigint;chunk bigint;
 v_actor_name text;
begin
 if actor is null or jsonb_typeof(p_payload) is distinct from 'object' then return lumo_private.failure('AUTH_REQUIRED','Sign in to your shared Lumo account.',false);end if;
 select display_name into v_actor_name from lumo_private.profiles where user_id=actor and status='active';
 if v_actor_name is null then return lumo_private.failure('ACCOUNT_SUSPENDED','This account is unavailable.',false);end if;
 if p_command='group.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groups',coalesce((select jsonb_agg(lumo_private.group_json(g1.id,actor,false) order by g1.created_at desc,g1.id) from lumo_private.groups g1 join lumo_private.group_members gm on gm.group_id=g1.id and gm.user_id=actor and gm.status in ('active','invited')),'[]'::jsonb));
 end if;
 if p_command='group.create' then
  v_name:=trim(p_payload->>'name');v_description:=trim(coalesce(p_payload->>'description',''));
  if jsonb_typeof(p_payload->'name') is distinct from 'string' or length(coalesce(v_name,'')) not between 1 and 80 or v_name~'[[:cntrl:]<>]' or (p_payload?'description' and jsonb_typeof(p_payload->'description') is distinct from 'string') or length(v_description)>400 or v_description~'[[:cntrl:]<>]' then return lumo_private.failure('INVALID_GROUP','Enter a group name and a short description.');end if;
  if p_payload?'target' then
   if jsonb_typeof(p_payload->'target') is distinct from 'number' then return lumo_private.failure('INVALID_AMOUNT','Use an integer pesewa target.');end if;
   v_numeric:=(p_payload->>'target')::numeric;
   if v_numeric<>trunc(v_numeric) or v_numeric<0 or v_numeric>10000000 then return lumo_private.failure('INVALID_AMOUNT','Use a group target between zero and GH₵100,000.');end if;
   v_target:=v_numeric::bigint;
  end if;
  if p_payload?'approvalCount' then
   if jsonb_typeof(p_payload->'approvalCount') is distinct from 'number' then return lumo_private.failure('INVALID_MANDATE','Choose between one and five approvals.');end if;
   v_numeric:=(p_payload->>'approvalCount')::numeric;
   if v_numeric<>trunc(v_numeric) or v_numeric<1 or v_numeric>5 then return lumo_private.failure('INVALID_MANDATE','Choose between one and five approvals.');end if;
   v_count:=v_numeric::integer;
  end if;
  if p_payload?'approvalThreshold' then
   if jsonb_typeof(p_payload->'approvalThreshold') is distinct from 'number' then return lumo_private.failure('INVALID_MANDATE','Use an integer pesewa approval threshold.');end if;
   v_numeric:=(p_payload->>'approvalThreshold')::numeric;
   if v_numeric<>trunc(v_numeric) or v_numeric<0 or v_numeric>1000000 then return lumo_private.failure('INVALID_MANDATE','Use an approval threshold up to GH₵10,000.');end if;
   v_threshold:=v_numeric::bigint;
  end if;
  if p_payload?'deadline' and p_payload->'deadline'<>'null'::jsonb then
   if jsonb_typeof(p_payload->'deadline') is distinct from 'string' or (p_payload->>'deadline') !~ '^\d{4}-\d{2}-\d{2}T' then return lumo_private.failure('INVALID_DEADLINE','Choose a future collection deadline.');end if;
   begin v_deadline:=(p_payload->>'deadline')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then return lumo_private.failure('INVALID_DEADLINE','Choose a valid future collection deadline.');end;
   if v_deadline<=clock_timestamp() or v_deadline>clock_timestamp()+interval '5 years' then return lumo_private.failure('INVALID_DEADLINE','Choose a collection deadline within the next five years.');end if;
  end if;
  if (select count(*) from lumo_private.groups where owner_user_id=actor)>=50 or (select count(*) from lumo_private.group_members where user_id=actor and status='active')>=50 then return lumo_private.failure('GROUP_LIMIT','This pilot account already has fifty groups.');end if;
  insert into lumo_private.accounts(owner_user_id,kind) values(actor,'group') returning id into aid;
  insert into lumo_private.groups(owner_user_id,account_id,name,description,target,deadline,approval_count,approval_threshold) values(actor,aid,v_name,v_description,v_target,v_deadline,v_count,v_threshold) returning * into g;
  insert into lumo_private.group_members(group_id,user_id,role,status,invited_by,joined_at) values(g.id,actor,'owner','active',actor,clock_timestamp());
  perform lumo_private.group_system(g.id,actor,v_actor_name||' created the group. Payouts require another member’s approval.');
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',g.id,'group',lumo_private.group_json(g.id,actor));
 end if;
 if p_command='group.join' then
  v_code:=lower(trim(p_payload->>'code'));
  if jsonb_typeof(p_payload->'code') is distinct from 'string' or v_code is null or v_code!~'^[a-f0-9]{32}$' then return lumo_private.failure('GROUP_NOT_FOUND','Enter the private group code shared by its owner.');end if;
  select * into g from lumo_private.groups where join_code=v_code for update;
  if not found or g.status<>'open' then return lumo_private.failure('GROUP_NOT_FOUND','That private group code is unavailable.');end if;
  select * into m from lumo_private.group_members where group_id=g.id and user_id=actor;
  if m.status='removed' then return lumo_private.failure('GROUP_FORBIDDEN','Ask the owner for a new invitation.');end if;
  if m.status='active' then return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',g.id,'group',lumo_private.group_json(g.id,actor));end if;
  if (select count(*) from lumo_private.group_members where group_id=g.id and status in ('active','invited'))>=100 and m.status is distinct from 'invited' then return lumo_private.failure('GROUP_LIMIT','This group already has one hundred members and invitations.');end if;
  if (select count(*) from lumo_private.group_members where user_id=actor and status='active')>=50 then return lumo_private.failure('GROUP_LIMIT','This account already belongs to fifty groups.');end if;
  insert into lumo_private.group_members(group_id,user_id,role,status,invited_by,joined_at) values(g.id,actor,'member','active',g.owner_user_id,clock_timestamp())
   on conflict(group_id,user_id) do update set status='active',joined_at=clock_timestamp();
  perform lumo_private.group_system(g.id,actor,v_actor_name||' joined the group.');
  perform lumo_private.notify_user(g.owner_user_id,'group.member','A member joined',v_actor_name||' joined '||g.name||'.','group',g.id);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',g.id,'group',lumo_private.group_json(g.id,actor));
 end if;
 begin
  if jsonb_typeof(p_payload->'groupId') is distinct from 'string' then raise invalid_text_representation;end if;
  gid:=(p_payload->>'groupId')::uuid;
 exception when invalid_text_representation then return lumo_private.failure('INVALID_GROUP','Choose one of your groups.');end;
 if p_command='group.get' then
  result:=lumo_private.group_json(gid,actor);
  if result is null or result->>'membershipStatus'<>'active' then return lumo_private.failure('GROUP_FORBIDDEN','Only active group members can view this group.');end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',gid,'group',result);
 end if;
 -- Group row is always locked before payout rows or money accounts, serialising changes to membership and mandates.
 select * into g from lumo_private.groups where id=gid for update;
 select * into m from lumo_private.group_members where group_id=gid and user_id=actor;
 if g.id is null or m.user_id is null then return lumo_private.failure('GROUP_FORBIDDEN','Only group members can use this group.');end if;
 if g.status<>'open' then return lumo_private.failure('GROUP_CLOSED','This group is closed. Its history is still available.');end if;
 if p_command='group.respond' then
  if m.status<>'invited' then return lumo_private.failure('INVITATION_UNAVAILABLE','This invitation is no longer waiting for your decision.');end if;
  if jsonb_typeof(p_payload->'accept') is distinct from 'boolean' then return lumo_private.failure('INVALID_INPUT','Accept or decline the invitation.');end if;
  if p_payload->'accept'='true'::jsonb then
   if (select count(*) from lumo_private.group_members where user_id=actor and status='active')>=50 then return lumo_private.failure('GROUP_LIMIT','This account already belongs to fifty groups.');end if;
   update lumo_private.group_members set status='active',joined_at=clock_timestamp() where group_id=gid and user_id=actor;
   perform lumo_private.group_system(gid,actor,v_actor_name||' accepted the invitation.');
   perform lumo_private.notify_user(g.owner_user_id,'group.member','Invitation accepted',v_actor_name||' joined '||g.name||'.','group',gid);
   return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',gid,'accepted',true,'group',lumo_private.group_json(gid,actor));
  end if;
  update lumo_private.group_members set status='declined' where group_id=gid and user_id=actor;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',gid,'accepted',false);
 end if;
 if m.status<>'active' then return lumo_private.failure('GROUP_FORBIDDEN','Accept your invitation before using this group.');end if;
 if p_command='group.invite' then
  if m.role<>'owner' then return lumo_private.failure('GROUP_FORBIDDEN','Only the owner can invite members.');end if;
  v_handle:=lower(trim(p_payload->>'handle'));
  if jsonb_typeof(p_payload->'handle') is distinct from 'string' or v_handle is null or v_handle!~'^[a-z][a-z0-9_]{2,29}$' then return lumo_private.failure('RECIPIENT_NOT_FOUND','Enter an exact Lumo handle.');end if;
  select * into person from lumo_private.profiles where handle=v_handle and status='active';
  if not found then return lumo_private.failure('RECIPIENT_NOT_FOUND','No active Lumo account matches that handle.');end if;
  select * into target_member from lumo_private.group_members where group_id=gid and user_id=person.user_id;
  if target_member.status in ('active','invited') then return lumo_private.failure('ALREADY_MEMBER','This person already belongs to the group or has an invitation.');end if;
  if (select count(*) from lumo_private.group_members where group_id=gid and status in ('active','invited'))>=100 then return lumo_private.failure('GROUP_LIMIT','This group already has one hundred members and invitations.');end if;
  insert into lumo_private.group_members(group_id,user_id,role,status,invited_by) values(gid,person.user_id,'member','invited',actor)
   on conflict(group_id,user_id) do update set status='invited',invited_by=actor,joined_at=null;
  perform lumo_private.notify_user(person.user_id,'group.invite','Group invitation',v_actor_name||' invited you to '||g.name||'. Accept to join.','group',gid);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',gid,'group',lumo_private.group_json(gid,actor));
 elsif p_command='group.message' then
  v_text:=trim(p_payload->>'text');
  if jsonb_typeof(p_payload->'text') is distinct from 'string' or length(coalesce(v_text,'')) not between 1 and 1000 or v_text~'[\x00-\x08\x0B\x0C\x0E-\x1F]' then return lumo_private.failure('INVALID_MESSAGE','Write a message up to one thousand characters.');end if;
  if (select count(*) from lumo_private.group_messages where actor_user_id=actor and kind='message' and created_at>clock_timestamp()-interval '1 minute')>=20 then return lumo_private.failure('MESSAGE_LIMIT','Wait a moment before sending another message.');end if;
  insert into lumo_private.group_messages(group_id,actor_user_id,kind,body) values(gid,actor,'message',v_text);
 elsif p_command='group.contribute' then
  if g.deadline is not null and g.deadline<=clock_timestamp() then return lumo_private.failure('GROUP_DEADLINE','The collection deadline has passed. Group funds and payout approval remain available.');end if;
  if jsonb_typeof(p_payload->'amount') is distinct from 'number' then return lumo_private.failure('INVALID_AMOUNT','Enter an amount in whole pesewas.');end if;
  v_numeric:=(p_payload->>'amount')::numeric;
  if v_numeric<>trunc(v_numeric) or v_numeric<1 or v_numeric>1000000 then return lumo_private.failure('INVALID_AMOUNT','Contribute between one pesewa and GH₵10,000.');end if;
  amount:=v_numeric::bigint;
  select * into own from lumo_private.accounts where owner_user_id=actor and kind='consumer';
  jid:=lumo_private.post_money(actor,'group_contribution',amount,own.id,g.account_id);
  insert into lumo_private.group_postings(journal_id,group_id) values(jid,gid);
  perform lumo_private.group_system(gid,actor,v_actor_name||' contributed GH₵'||to_char(amount::numeric/100,'FM999999990.00')||'.');
  for member_id in select user_id from lumo_private.group_members where group_id=gid and status='active' and user_id<>actor loop
   perform lumo_private.notify_user(member_id,'group.contribution','Group contribution',v_actor_name||' contributed to '||g.name||'.','group',gid);
  end loop;
 elsif p_command='group.payout.request' then
  if jsonb_typeof(p_payload->'amount') is distinct from 'number' then return lumo_private.failure('INVALID_AMOUNT','Enter an amount in whole pesewas.');end if;
  v_numeric:=(p_payload->>'amount')::numeric;
  if v_numeric<>trunc(v_numeric) or v_numeric<1 or v_numeric>1000000 then return lumo_private.failure('INVALID_AMOUNT','Request between one pesewa and GH₵10,000.');end if;
  amount:=v_numeric::bigint;v_handle:=lower(trim(p_payload->>'recipientHandle'));v_text:=trim(coalesce(p_payload->>'note',''));
  if jsonb_typeof(p_payload->'recipientHandle') is distinct from 'string' or v_handle is null or v_handle!~'^[a-z][a-z0-9_]{2,29}$' then return lumo_private.failure('RECIPIENT_NOT_FOUND','Enter an exact recipient handle.');end if;
  if (p_payload?'note' and jsonb_typeof(p_payload->'note') is distinct from 'string') or length(v_text)>160 or v_text~'[[:cntrl:]<>]' then return lumo_private.failure('INVALID_NOTE','Keep your payout note within 160 characters.');end if;
  select * into person from lumo_private.profiles where handle=v_handle and status='active';
  select * into dest from lumo_private.accounts where owner_user_id=person.user_id and kind='consumer' and status='active';
  if person.user_id is null or dest.id is null then return lumo_private.failure('RECIPIENT_NOT_FOUND','No active Lumo account matches that handle.');end if;
  -- Do not let an otherwise high-value recipient payout be split into small requests
  -- to evade the mandate. Recent paid and unresolved amounts to the same recipient count.
  required:=case when amount+coalesce((select sum(gp.amount) from lumo_private.group_payouts gp where gp.group_id=gid
   and gp.recipient_user_id=person.user_id and gp.created_at>clock_timestamp()-interval '24 hours'
   and (gp.status='paid' or gp.status='pending' and gp.expires_at>clock_timestamp())),0)<=g.approval_threshold then 1 else g.approval_count end;
  select array_agg(gm.user_id order by gm.user_id) into eligible from lumo_private.group_members gm join lumo_private.profiles p on p.user_id=gm.user_id and p.status='active' where gm.group_id=gid and gm.status='active' and gm.user_id<>actor;
  if coalesce(cardinality(eligible),0)<required then return lumo_private.failure('MANDATE_QUORUM','Invite enough other members to meet this payout’s approval mandate.');end if;
  if (select balance from lumo_private.accounts where id=g.account_id)<amount then return lumo_private.failure('INSUFFICIENT_FUNDS','The group does not have enough money for this payout.');end if;
  if (select count(*) from lumo_private.group_payouts where group_id=gid and status='pending' and expires_at>clock_timestamp())>=20 then return lumo_private.failure('PAYOUT_LIMIT','Resolve the group’s existing payout requests first.');end if;
  insert into lumo_private.group_payouts(group_id,requested_by,recipient_user_id,recipient_account_id,amount,note,required_approvals,eligible_voters) values(gid,actor,person.user_id,dest.id,amount,v_text,required,eligible) returning * into r;
  pid:=r.id;
  perform lumo_private.group_system(gid,actor,v_actor_name||' requested GH₵'||to_char(amount::numeric/100,'FM999999990.00')||' to @'||v_handle||'. Waiting for '||required||' other member approval(s).');
  foreach member_id in array eligible loop
   perform lumo_private.notify_user(member_id,'group.approval','Group payout needs approval',g.name||': GH₵'||to_char(amount::numeric/100,'FM999999990.00')||' to @'||v_handle||'.','group',gid);
  end loop;
 elsif p_command in ('group.payout.approve','group.payout.cancel') then
  begin
   if jsonb_typeof(p_payload->'proposalId') is distinct from 'string' then raise invalid_text_representation;end if;
   pid:=(p_payload->>'proposalId')::uuid;
  exception when invalid_text_representation then return lumo_private.failure('INVALID_PAYOUT','Choose a pending group payout.');end;
  select * into r from lumo_private.group_payouts where id=pid and group_id=gid for update;
  if not found then return lumo_private.failure('PAYOUT_UNAVAILABLE','That group payout is unavailable.');end if;
  if r.status<>'pending' or r.expires_at<=clock_timestamp() then return lumo_private.failure('PAYOUT_UNAVAILABLE','That payout has already completed, expired or been cancelled.');end if;
  if p_command='group.payout.cancel' then
   if r.requested_by<>actor and m.role<>'owner' then return lumo_private.failure('GROUP_FORBIDDEN','Only the requester or group owner can cancel this payout.');end if;
   update lumo_private.group_payouts set status='cancelled' where id=pid;
   perform lumo_private.group_system(gid,actor,v_actor_name||' cancelled a payout request.');
  else
   if r.requested_by=actor or not(actor=any(r.eligible_voters)) then return lumo_private.failure('APPROVAL_FORBIDDEN','The requester cannot approve their own payout. Only members present when it was requested can approve.');end if;
   if exists(select 1 from lumo_private.group_approvals where proposal_id=pid and user_id=actor) then return lumo_private.failure('ALREADY_APPROVED','You have already approved this payout.');end if;
   if not exists(select 1 from lumo_private.group_members gm join lumo_private.profiles p on p.user_id=gm.user_id and p.status='active' where gm.group_id=gid and gm.user_id=r.requested_by and gm.status='active') then return lumo_private.failure('PAYOUT_UNAVAILABLE','The original requester is no longer eligible. Cancel this payout.');end if;
   if not exists(select 1 from lumo_private.profiles where user_id=r.recipient_user_id and status='active') then return lumo_private.failure('RECIPIENT_NOT_FOUND','The recipient is unavailable. Cancel this payout.');end if;
   insert into lumo_private.group_approvals(proposal_id,user_id) values(pid,actor);
   select count(*) into votes from lumo_private.group_approvals v join lumo_private.group_members gm on gm.group_id=gid and gm.user_id=v.user_id and gm.status='active' join lumo_private.profiles p on p.user_id=v.user_id and p.status='active' where v.proposal_id=pid;
   if votes>=r.required_approvals then
    jid:=lumo_private.post_money(actor,'group_payout',r.amount,g.account_id,r.recipient_account_id);
    update lumo_private.group_payouts set status='paid',journal_id=jid where id=pid;
    insert into lumo_private.group_postings(journal_id,group_id,proposal_id) values(jid,gid,pid);
    perform lumo_private.group_system(gid,actor,'Approved payout of GH₵'||to_char(r.amount::numeric/100,'FM999999990.00')||' completed. Receipt '||(select reference from lumo_private.journals where id=jid)||'.');
    for member_id in select user_id from lumo_private.group_members where group_id=gid and status='active' loop
     perform lumo_private.notify_user(member_id,'group.payout','Group payout completed',g.name||' paid GH₵'||to_char(r.amount::numeric/100,'FM999999990.00')||'.','group',gid);
    end loop;
   else
    perform lumo_private.group_system(gid,actor,v_actor_name||' approved the payout. '||votes||' of '||r.required_approvals||' approvals received.');
   end if;
  end if;
 elsif p_command in ('group.member.remove','group.leave') then
  if exists(select 1 from lumo_private.group_payouts where group_id=gid and status='pending' and expires_at>clock_timestamp()) then return lumo_private.failure('PENDING_PAYOUT','Complete or cancel pending payouts before changing membership.');end if;
  if p_command='group.leave' then
   if m.role='owner' then return lumo_private.failure('GROUP_OWNER','The owner must keep responsibility for this group. Close it after its balance is zero.');end if;
   update lumo_private.group_members set status='left' where group_id=gid and user_id=actor;
   perform lumo_private.group_system(gid,actor,v_actor_name||' left the group.');
   return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',gid,'left',true);
  end if;
  if m.role<>'owner' then return lumo_private.failure('GROUP_FORBIDDEN','Only the owner can remove a member.');end if;
  v_handle:=lower(trim(p_payload->>'handle'));
  if jsonb_typeof(p_payload->'handle') is distinct from 'string' or v_handle is null or v_handle!~'^[a-z][a-z0-9_]{2,29}$' then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose an exact member handle.');end if;
  select * into person from lumo_private.profiles where handle=v_handle;
  select * into target_member from lumo_private.group_members where group_id=gid and user_id=person.user_id;
  if target_member.user_id is null or target_member.status not in ('active','invited') or target_member.role='owner' then return lumo_private.failure('GROUP_FORBIDDEN','Choose a current member other than the owner.');end if;
  update lumo_private.group_members set status='removed' where group_id=gid and user_id=person.user_id;
  perform lumo_private.group_system(gid,actor,v_actor_name||' removed @'||v_handle||'.');
  perform lumo_private.notify_user(person.user_id,'group.member','Group membership ended','The owner removed you from '||g.name||'.','group',gid);
 elsif p_command='group.cancel' then
  if m.role<>'owner' then return lumo_private.failure('GROUP_FORBIDDEN','Only the owner can cancel a group collection.');end if;
  if exists(select 1 from lumo_private.group_payouts where group_id=gid and status='pending' and expires_at>clock_timestamp()) then return lumo_private.failure('PENDING_PAYOUT','Complete or cancel pending payouts before refunding the collection.');end if;
  -- Lock the group and every original contributor account in one global account order.
  -- Each refund then re-enters post_money with those locks already held. A failed recipient
  -- or journal rolls the entire command back; nobody receives a partial cancellation.
  perform 1 from lumo_private.accounts a where a.id=g.account_id or a.id in (
   select j.payer_account_id from lumo_private.group_postings gp join lumo_private.journals j on j.id=gp.journal_id where gp.group_id=gid and j.type='group_contribution'
  ) order by a.id for update;
  select balance into remaining from lumo_private.accounts where id=g.account_id;
  select coalesce(sum(j.amount),0) into total_contributed from lumo_private.group_postings gp join lumo_private.journals j on j.id=gp.journal_id where gp.group_id=gid and j.type='group_contribution';
  if remaining>0 and total_contributed<=0 then raise exception using errcode='P0001',message='GROUP_ACCOUNTING';end if;
  if remaining>0 then
   -- Largest-remainder allocation is deterministic and conserves every pesewa, even
   -- after partial payouts. Historical contributions, not current membership, determine shares.
   select remaining-coalesce(sum(floor(remaining::numeric*c.total/total_contributed)),0) into rounding_units
   from (select j.payer_account_id,sum(j.amount)::numeric total from lumo_private.group_postings gp join lumo_private.journals j on j.id=gp.journal_id where gp.group_id=gid and j.type='group_contribution' group by j.payer_account_id)c;
   for refund_row in
    select c.payer_account_id,c.total,floor(remaining::numeric*c.total/total_contributed)::bigint base,
     row_number() over(order by (remaining::numeric*c.total/total_contributed-floor(remaining::numeric*c.total/total_contributed)) desc,c.payer_account_id) position
    from (select j.payer_account_id,sum(j.amount)::numeric total from lumo_private.group_postings gp join lumo_private.journals j on j.id=gp.journal_id where gp.group_id=gid and j.type='group_contribution' group by j.payer_account_id)c
    order by c.payer_account_id
   loop
    part:=refund_row.base+case when refund_row.position<=rounding_units then 1 else 0 end;
    while part>0 loop
     chunk:=least(part,1000000);
     jid:=lumo_private.post_money(actor,'group_refund',chunk,g.account_id,refund_row.payer_account_id);
     insert into lumo_private.group_postings(journal_id,group_id) values(jid,gid);
     cancellation_receipts:=cancellation_receipts||jsonb_build_array(lumo_private.receipt_json(jid));
     part:=part-chunk;
    end loop;
   end loop;
  end if;
  if (select balance from lumo_private.accounts where id=g.account_id)<>0 then raise exception using errcode='P0001',message='GROUP_ACCOUNTING';end if;
  update lumo_private.groups set status='cancelled' where id=gid;
  perform lumo_private.group_system(gid,actor,v_actor_name||' cancelled the collection. Remaining funds were returned proportionately to the original contributors.');
  for member_id in select user_id from lumo_private.group_members where group_id=gid and status='active' loop
   perform lumo_private.notify_user(member_id,'group.refund','Group collection cancelled',g.name||': remaining funds were returned to the original contributors.','group',gid);
  end loop;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',gid,'group',lumo_private.group_json(gid,actor),'receipts',cancellation_receipts,'refunded',remaining);
 elsif p_command='group.close' then
  if m.role<>'owner' then return lumo_private.failure('GROUP_FORBIDDEN','Only the owner can close this group.');end if;
  if exists(select 1 from lumo_private.group_payouts where group_id=gid and status='pending' and expires_at>clock_timestamp()) then return lumo_private.failure('PENDING_PAYOUT','Complete or cancel pending payouts first.');end if;
  perform 1 from lumo_private.accounts where id=g.account_id for update;
  if (select balance from lumo_private.accounts where id=g.account_id)<>0 then return lumo_private.failure('GROUP_BALANCE','Pay out the group’s remaining money through its mandate before closing.');end if;
  update lumo_private.groups set status='closed' where id=gid;
  perform lumo_private.group_system(gid,actor,v_actor_name||' closed the group. Its history is preserved.');
 else return lumo_private.failure('UNKNOWN_COMMAND','Choose a supported group action.');
 end if;
 result:=jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','groupId',gid,'group',lumo_private.group_json(gid,actor));
 if pid is not null then result:=result||jsonb_build_object('proposalId',pid,'proposal',lumo_private.group_proposal_json(pid));end if;
 if jid is not null then result:=result||jsonb_build_object('receipt',lumo_private.receipt_json(jid));end if;
 return result;
end $$;
revoke all on function lumo_private.group_proposal_json(uuid),lumo_private.group_json(uuid,uuid,boolean),lumo_private.group_system(uuid,uuid,text),lumo_private.groups_command(text,jsonb) from public,anon,authenticated,service_role;
