-- Disposable, rollback-only tests after the custom friend groups migration.
-- No DDL, customer identities, real payment records, or external notifications.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $test$
#variable_conflict use_variable
declare
 checks integer:=0;a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();e uuid:=gen_random_uuid();merchant uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid();sid2 uuid:=gen_random_uuid();bsid uuid:=gen_random_uuid();dsid uuid:=gen_random_uuid();esid uuid:=gen_random_uuid();msid uuid:=gen_random_uuid();
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);ap jsonb;bp jsonb;dp jsonb;ep jsonb;mp jsonb;out jsonb;out2 jsonb;payload jsonb;legacy_payload jsonb;contract jsonb:='{}'::jsonb;
 gid uuid;gid2 uuid;foreign_gid uuid;replacement uuid;legacy_gid uuid;new_legacy_gid uuid;cap_gid uuid;
 create_req uuid:=gen_random_uuid();friend_req uuid:=gen_random_uuid();delete_req uuid:=gen_random_uuid();cap_req uuid:=gen_random_uuid();
 name text;point integer;k integer;denied boolean;before_revision bigint;
begin
 insert into auth.users(id,aud,role,email,created_at,raw_app_meta_data)
  select id,'authenticated','authenticated',kind||suffix||'@example.test',now(),'{"lumo_pilot":true}'::jsonb from(values(a,'groupa'),(b,'groupb'),(c,'groupc'),(d,'groupd'),(e,'groupe'),(merchant,'groupmerchant'))v(id,kind);
 insert into auth.sessions(id,user_id,created_at) values(sid,a,now()),(sid2,a,now()),(bsid,b,now()),(dsid,d,now()),(esid,e,now()),(msid,merchant,now());
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash)
  values(a,'ga_'||suffix,'Group A','fixture'),(b,'gb_'||suffix,'Group B','fixture'),(c,'gc_'||suffix,'Group C','fixture'),(d,'gd_'||suffix,'Group D','fixture'),(e,'ge_'||suffix,'Group E','fixture'),(merchant,'gm_'||suffix,'Group merchant','fixture');
 insert into lumo_private.approved_profiles(user_id,personal_account) values(a,true),(b,true),(c,true),(d,true),(e,true),(merchant,false);
 insert into lumo_private.accounts(owner_user_id,kind) select id,'consumer' from unnest(array[a,b,c,d,e,merchant])id;
 ap:=jsonb_build_object('actor',a,'session',sid,'schemaVersion',2);bp:=jsonb_build_object('actor',b,'session',bsid,'schemaVersion',2);dp:=jsonb_build_object('actor',d,'session',dsid,'schemaVersion',2);ep:=jsonb_build_object('actor',e,'session',esid,'schemaVersion',2);mp:=jsonb_build_object('actor',merchant,'session',msid,'schemaVersion',2);

 foreach name in array array['anon','authenticated'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('role',name)::text,true);out:=public.lumo_social('friends.list',ap);
  if (out->>'code'='FORBIDDEN') is distinct from true then raise exception 'Groups: direct role must be denied: %',name;end if;checks:=checks+1;
 end loop;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 out:=public.lumo_social('friends.list',ap||jsonb_build_object('session',bsid));if (out->>'code'='SESSION_REVOKED') is distinct from true then raise exception 'Groups: foreign session cannot supply owner';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',mp);if (out->>'code'='ACCOUNT_REQUIRED') is distinct from true then raise exception 'Groups: merchant-only account denied';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',ap);if (out#>'{data,groups}'='[]'::jsonb and out#>'{data,friends}'='[]'::jsonb and out#>>'{data,schemaVersion}'='2' and out#>>'{data,groupLimit}'='50') is distinct from true then raise exception 'Groups: no invented/default groups for a new owner';end if;checks:=checks+1;contract:=contract||jsonb_build_object('empty',out->'data');
 out:=public.lumo_social('friends.list',ap-'schemaVersion');if (out#>'{data,friends}'='[]'::jsonb and not(out->'data' ? 'groups')) is distinct from true then raise exception 'Groups: old empty list shape preserved';end if;checks:=checks+1;
 foreach payload in array array[ap||'{"schemaVersion":1}'::jsonb,ap||'{"schemaVersion":"2"}'::jsonb,ap||'{"schemaVersion":null}'::jsonb,ap||'{"ownerId":"injected"}'::jsonb] loop
  out:=public.lumo_social('friends.list',payload);if (out->>'code'='INVALID_INPUT') is distinct from true then raise exception 'Groups: strict version/list schema';end if;checks:=checks+1;
 end loop;

 payload:=ap||jsonb_build_object('name',U&'  Cafe\0301 friends  ','requestId',create_req);
 out:=public.lumo_social('friends.createGroup',payload);gid:=(out#>>'{data,record,id}')::uuid;
 if (out->>'ok'='true' and gid is not null and out#>>'{data,record,name}'='Café friends' and out#>>'{data,record,revision}'='1') is distinct from true then raise exception 'Groups: normalized group create failed: %',out;end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',payload||jsonb_build_object('session',sid2,'name','Café friends'));
 if (out#>>'{data,duplicate}'='true' and out#>>'{data,record,id}'=gid::text and (select count(*) from lumo_private.social_friend_groups where owner_id=a)=1) is distinct from true then raise exception 'Groups: normalized cross-session retry must create once';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',payload||jsonb_build_object('name','Different name'));if (out->>'code'='IDEMPOTENCY_CONFLICT') is distinct from true then raise exception 'Groups: changed name cannot reuse request ID';end if;checks:=checks+1;
 out:=public.lumo_social('friends.deleteGroup',ap||jsonb_build_object('groupId',gid,'revision',1,'requestId',create_req));if (out->>'code'='IDEMPOTENCY_CONFLICT') is distinct from true then raise exception 'Groups: request ID cannot change operation';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',ap||jsonb_build_object('name','CAFÉ FRIENDS','requestId',gen_random_uuid()));if (out->>'code'='GROUP_NAME_TAKEN') is distinct from true then raise exception 'Groups: case-insensitive Unicode duplicate';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',bp||jsonb_build_object('name','Café friends','requestId',create_req));foreign_gid:=(out#>>'{data,record,id}')::uuid;
 if (out->>'ok'='true' and foreign_gid is not null and foreign_gid<>gid) is distinct from true then raise exception 'Groups: another owner may reuse name and request UUID';end if;checks:=checks+1;
 foreach name in array array['friends.renameGroup','friends.deleteGroup'] loop
  payload:=ap||jsonb_build_object('groupId',foreign_gid,'revision',1,'requestId',gen_random_uuid());if name='friends.renameGroup' then payload:=payload||jsonb_build_object('name','Stolen');end if;
  out:=public.lumo_social(name,payload);if (out->>'code'='GROUP_NOT_FOUND') is distinct from true then raise exception 'Groups: foreign group mutation leaks/accesses owner';end if;checks:=checks+1;
 end loop;
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',b,'groupId',foreign_gid,'requestId',gen_random_uuid()));if (out->>'code'='GROUP_NOT_FOUND') is distinct from true then raise exception 'Groups: foreign group cannot be assigned';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',ap);if (jsonb_array_length(out#>'{data,groups}')=1 and not exists(select 1 from jsonb_array_elements(out#>'{data,groups}')x where x->>'id'=foreign_gid::text)) is distinct from true then raise exception 'Groups: list is owner-isolated';end if;checks:=checks+1;

 foreach name in array array['', '   ',repeat('x',41),U&'Bad\000Aname',U&'Bad\200Bname',U&'Bad\202Ename',U&'Bad\2066name',U&'Bad\FEFFname',U&'\200C\200D',U&' \200C \200D '] loop
  out:=public.lumo_social('friends.createGroup',ap||jsonb_build_object('name',name,'requestId',gen_random_uuid()));if (out->>'code'='INVALID_INPUT') is distinct from true then raise exception 'Groups: invalid name accepted';end if;checks:=checks+1;
 end loop;
 if (lumo_private.social_group_name(repeat('🎓',40))=repeat('🎓',40) and lumo_private.social_group_name(repeat('🎓',41)) is null and lumo_private.social_group_name(repeat(U&'a\0301',40))=repeat('á',40)) is distinct from true then raise exception 'Groups: Unicode codepoint length/NFC mismatch';end if;checks:=checks+1;
 if (lumo_private.social_group_name('👩‍👩‍👧')='👩‍👩‍👧' and lumo_private.social_group_name('👩‍💻 Work friends')='👩‍💻 Work friends' and lumo_private.social_group_name(U&'دوست\200Cها')=U&'دوست\200Cها') is distinct from true then raise exception 'Groups: language and emoji joiners rejected';end if;checks:=checks+1;
 foreach point in array array[1,31,127,159,173,1536,1541,1564,1757,1807,2192,2193,2274,6158,8203,8206,8207,8232,8238,8288,8292,8294,8303,65279,65529,65531,69821,69837,78896,78911,113824,113827,119155,119162,917505,917536,917631] loop
  if lumo_private.social_group_name('a'||chr(point)||'b') is not null then raise exception 'Groups: forbidden control point accepted: %',point;end if;checks:=checks+1;
 end loop;
 foreach point in array array[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279] loop
  if (lumo_private.social_group_name(chr(point)||'Crew'||chr(point))='Crew') is distinct from true then raise exception 'Groups: trim character mismatch: %',point;end if;checks:=checks+1;
 end loop;
 foreach payload in array array[
  ap||jsonb_build_object('name',42,'requestId',gen_random_uuid()),
  ap||jsonb_build_object('name','Bad','groupId',gid,'requestId',gen_random_uuid()),
  (ap-'schemaVersion')||jsonb_build_object('name','Bad','requestId',gen_random_uuid()),
  ap||jsonb_build_object('name','Bad','requestId',gen_random_uuid(),'members',jsonb_build_array(b))
 ] loop
  out:=public.lumo_social('friends.createGroup',payload);if (out->>'code'='INVALID_INPUT') is distinct from true then raise exception 'Groups: strict create payload';end if;checks:=checks+1;
 end loop;
 out:=public.lumo_social('friends.createGroup',ap||jsonb_build_object('name','Trips','requestId',gen_random_uuid()));gid2:=(out#>>'{data,record,id}')::uuid;
 out:=public.lumo_social('friends.renameGroup',ap||jsonb_build_object('groupId',gid,'name','trips','revision',1,'requestId',gen_random_uuid()));if (out->>'code'='GROUP_NAME_TAKEN') is distinct from true then raise exception 'Groups: rename cannot collide';end if;checks:=checks+1;
 payload:=ap||jsonb_build_object('groupId',gid,'name','Weekend friends','revision',1,'requestId',gen_random_uuid());
 out:=public.lumo_social('friends.renameGroup',payload);if (out#>>'{data,record,id}'=gid::text and out#>>'{data,record,revision}'='2') is distinct from true then raise exception 'Groups: rename changes revision and keeps identity';end if;checks:=checks+1;
 out:=public.lumo_social('friends.renameGroup',payload);if (out#>>'{data,duplicate}'='true') is distinct from true then raise exception 'Groups: rename retry';end if;checks:=checks+1;
 out:=public.lumo_social('friends.renameGroup',payload||jsonb_build_object('name','Stale winner','requestId',gen_random_uuid()));if (out->>'code'='REVISION_CONFLICT') is distinct from true then raise exception 'Groups: second writer with same revision cannot win';end if;checks:=checks+1;
 out:=public.lumo_social('friends.deleteGroup',ap||jsonb_build_object('groupId',gid,'revision',1,'requestId',gen_random_uuid()));if (out->>'code'='REVISION_CONFLICT') is distinct from true then raise exception 'Groups: stale delete cannot remove renamed group';end if;checks:=checks+1;

 payload:=ap||jsonb_build_object('recipientId',b,'groupId',gid,'requestId',friend_req);
 out:=public.lumo_social('friends.save',payload);if (out#>>'{data,record,groupId}'=gid::text and out#>>'{data,record,listName}'='Weekend friends' and out#>>'{data,record,revision}'='1') is distinct from true then raise exception 'Groups: save stable group membership';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',ap);contract:=contract||jsonb_build_object('grouped',out->'data');
 out:=public.lumo_social('friends.list',ap-'schemaVersion');if (out#>>'{data,friends,0,listName}'='Circle' and not(out#>'{data,friends,0}' ? 'groupId')) is distinct from true then raise exception 'Groups: legacy projection remains parseable';end if;checks:=checks+1;contract:=contract||jsonb_build_object('legacyProjection',out->'data');
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',b,'groupId',null,'revision',1,'requestId',gen_random_uuid()));if (out#>'{data,record,groupId}'='null'::jsonb and out#>'{data,record,listName}'='null'::jsonb and out#>>'{data,record,revision}'='2') is distinct from true then raise exception 'Groups: explicit ungrouping';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',ap);contract:=contract||jsonb_build_object('ungrouped',out->'data');
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',b,'groupId',gid2,'revision',1,'requestId',gen_random_uuid()));if (out->>'code'='REVISION_CONFLICT') is distinct from true then raise exception 'Groups: stale membership cannot overwrite ungrouping';end if;checks:=checks+1;
 foreach payload in array array[
  ap||jsonb_build_object('recipientId',b,'revision',2,'requestId',gen_random_uuid()),
  ap||jsonb_build_object('recipientId',b,'groupId',gid,'listName','Crew','revision',2,'requestId',gen_random_uuid()),
  ap||jsonb_build_object('recipientId',b,'groupId',42,'revision',2,'requestId',gen_random_uuid())
 ] loop
  out:=public.lumo_social('friends.save',payload);if (out->>'code'='INVALID_INPUT') is distinct from true then raise exception 'Groups: strict stable-ID membership request';end if;checks:=checks+1;
 end loop;
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',a,'groupId',null,'requestId',gen_random_uuid()));if (out->>'code'='SELF_FRIEND') is distinct from true then raise exception 'Groups: self recipient blocked';end if;checks:=checks+1;
 update lumo_private.accounts set status='closed' where owner_user_id=b and kind='consumer';
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',b,'groupId',gid,'revision',2,'requestId',gen_random_uuid()));if (out#>>'{data,record,available}'='false' and out#>>'{data,record,handle}'='' and out#>>'{data,record,name}'='Unavailable Lumo account' and out#>>'{data,record,revision}'='3') is distinct from true then raise exception 'Groups: existing unavailable friend stays reassignable';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',ap);contract:=contract||jsonb_build_object('unavailable',out->'data');
 out:=public.lumo_social('friends.save',(ap-'schemaVersion')||jsonb_build_object('recipientId',b,'listName','Crew','revision',3,'requestId',gen_random_uuid()));if (out->>'code'='RECIPIENT_NOT_FOUND') is distinct from true then raise exception 'Groups: old unavailable-save behavior preserved';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',dp||jsonb_build_object('recipientId',b,'groupId',null,'requestId',gen_random_uuid()));if (out->>'code'='RECIPIENT_NOT_FOUND') is distinct from true then raise exception 'Groups: unavailable recipient cannot be added';end if;checks:=checks+1;
 update lumo_private.accounts set status='active' where owner_user_id=b and kind='consumer';
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',c,'groupId',gid,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.remove',ap||jsonb_build_object('recipientId',c,'revision',1,'requestId',gen_random_uuid()));if (out#>>'{data,removed}'='true') is distinct from true then raise exception 'Groups: saved friend remove before group deletion';end if;checks:=checks+1;
 payload:=ap||jsonb_build_object('groupId',gid,'revision',2,'requestId',delete_req);
 out:=public.lumo_social('friends.deleteGroup',payload);if (out#>>'{data,removed}'='true' and out#>'{data,record}'='null'::jsonb) is distinct from true then raise exception 'Groups: delete acknowledgment';end if;checks:=checks+1;
 if ((select group_id is null and not removed and revision=4 from lumo_private.social_friends where owner_id=a and recipient_id=b) and (select group_id is null and removed and revision=3 from lumo_private.social_friends where owner_id=a and recipient_id=c) and (select deleted and revision=3 from lumo_private.social_friend_groups where owner_id=a and id=gid)) is distinct from true then raise exception 'Groups: delete detaches both active and removed friends, retains records and advances revisions';end if;checks:=checks+1;
 out:=public.lumo_social('friends.deleteGroup',payload);if (out#>>'{data,duplicate}'='true' and (select revision from lumo_private.social_friends where owner_id=a and recipient_id=b)=4) is distinct from true then raise exception 'Groups: delete retry cannot detach/bump twice';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',b,'groupId',gid,'requestId',friend_req));if (out#>>'{data,duplicate}'='true') is distinct from true then raise exception 'Groups: delayed save acknowledgment is replayable';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',ap);if (out#>'{data,friends,0,groupId}'='null'::jsonb and out#>>'{data,friends,0,revision}'='4' and jsonb_array_length(out#>'{data,groups}')=1) is distinct from true then raise exception 'Groups: delayed save cannot resurrect deleted membership';end if;checks:=checks+1;contract:=contract||jsonb_build_object('afterDelete',out->'data');
 out:=public.lumo_social('friends.save',(ap-'schemaVersion')||jsonb_build_object('recipientId',b,'listName','Circle','revision',4,'requestId',gen_random_uuid()));if (out#>>'{data,record,revision}'='5' and (select group_id is null from lumo_private.social_friends where owner_id=a and recipient_id=b) and not exists(select 1 from lumo_private.social_friend_groups gr where gr.owner_id=a and gr.name='Circle')) is distinct from true then raise exception 'Groups: unchanged old projection preserves ungrouped without creating defaults';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',ap||jsonb_build_object('name','Weekend friends','requestId',gen_random_uuid()));replacement:=(out#>>'{data,record,id}')::uuid;
 if (out->>'ok'='true' and replacement<>gid) is distinct from true then raise exception 'Groups: reusing a deleted name receives new identity';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',ap||jsonb_build_object('name','Café friends','requestId',create_req));if (out#>>'{data,duplicate}'='true' and out#>>'{data,record,id}'=gid::text and (select deleted from lumo_private.social_friend_groups where owner_id=a and id=gid)) is distinct from true then raise exception 'Groups: old create replay cannot revive deleted group';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',b,'groupId',gid,'revision',5,'requestId',gen_random_uuid()));if (out->>'code'='GROUP_NOT_FOUND') is distinct from true then raise exception 'Groups: deleted group ID cannot be assigned';end if;checks:=checks+1;
 update lumo_private.accounts set status='closed' where owner_user_id=c and kind='consumer';
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',c,'groupId',null,'requestId',gen_random_uuid()));if (out->>'code'='RECIPIENT_NOT_FOUND') is distinct from true then raise exception 'Groups: removed unavailable recipient cannot be re-added';end if;checks:=checks+1;
 update lumo_private.accounts set status='active' where owner_user_id=c and kind='consumer';
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',c,'groupId',null,'requestId',gen_random_uuid()));if (out#>>'{data,record,revision}'='4' and out#>'{data,record,groupId}'='null'::jsonb) is distinct from true then raise exception 'Groups: explicit re-add respects tombstone revision';end if;checks:=checks+1;
 out:=public.lumo_social('friends.remove',ap||jsonb_build_object('recipientId',c,'revision',2,'requestId',gen_random_uuid()));if (out->>'code'='REVISION_CONFLICT') is distinct from true then raise exception 'Groups: stale remove cannot delete re-added friend';end if;checks:=checks+1;
 out:=public.lumo_social('friends.remove',ap||jsonb_build_object('recipientId',b,'revision',5,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',b,'groupId',gid,'requestId',friend_req));
 if (out#>>'{data,duplicate}'='true' and (select removed and revision=6 from lumo_private.social_friends where owner_id=a and recipient_id=b)) is distinct from true then raise exception 'Groups: delayed save cannot resurrect removed friend';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',ap||jsonb_build_object('recipientId',c,'groupId',gid2,'revision',4,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.renameGroup',ap||jsonb_build_object('groupId',gid2,'name','Trips with friends','revision',1,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.list',ap);if (out#>>'{data,friends,0,groupId}'=gid2::text and out#>>'{data,friends,0,listName}'='Trips with friends' and out#>>'{data,friends,0,revision}'='5') is distinct from true then raise exception 'Groups: rename keeps membership and current display name';end if;checks:=checks+1;contract:=contract||jsonb_build_object('afterRename',out->'data');

 -- Legacy mappings are permanent, including labels first chosen through v2.
 legacy_payload:=(dp-'schemaVersion')||jsonb_build_object('recipientId',a,'listName','Crew','requestId',gen_random_uuid());
 out:=public.lumo_social('friends.save',legacy_payload);select group_id into legacy_gid from lumo_private.social_friends where owner_id=d and recipient_id=a;
 if (out->>'ok'='true' and legacy_gid is not null and (select count(*) from lumo_private.social_friend_groups where owner_id=d)=1) is distinct from true then raise exception 'Groups: old explicit save creates only one requested group';end if;checks:=checks+1;
 out:=public.lumo_social('friends.renameGroup',dp||jsonb_build_object('groupId',legacy_gid,'name','Travel crew','revision',1,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.save',(dp-'schemaVersion')||jsonb_build_object('recipientId',b,'listName','Crew','requestId',gen_random_uuid()));
 if (out->>'ok'='true' and (select group_id=legacy_gid from lumo_private.social_friends where owner_id=d and recipient_id=b) and (select count(*) from lumo_private.social_friend_groups where owner_id=d)=1) is distinct from true then raise exception 'Groups: old label still resolves renamed ID without creating clone';end if;checks:=checks+1;
 out:=public.lumo_social('friends.deleteGroup',dp||jsonb_build_object('groupId',legacy_gid,'revision',2,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.save',(dp-'schemaVersion')||jsonb_build_object('recipientId',c,'listName','Crew','requestId',gen_random_uuid()));if (out->>'code'='GROUP_UNAVAILABLE' and not exists(select 1 from lumo_private.social_friends where owner_id=d and recipient_id=c)) is distinct from true then raise exception 'Groups: old label cannot recreate deleted group';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',legacy_payload);if (out#>>'{data,duplicate}'='true' and (select group_id is null and revision=2 from lumo_private.social_friends where owner_id=d and recipient_id=a)) is distinct from true then raise exception 'Groups: historical v1 replay cannot undo deletion';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',(dp-'schemaVersion')||jsonb_build_object('recipientId',a,'listName','Crew','revision',2,'requestId',gen_random_uuid()));if (out->>'ok'='true' and (select group_id is null and revision=3 from lumo_private.social_friends where owner_id=d and recipient_id=a)) is distinct from true then raise exception 'Groups: unchanged legacy edit remains safe after group deletion';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',dp||jsonb_build_object('name','Crew','requestId',gen_random_uuid()));new_legacy_gid:=(out#>>'{data,record,id}')::uuid;
 if (out->>'ok'='true' and new_legacy_gid<>legacy_gid and (select group_id=legacy_gid from lumo_private.social_legacy_group_labels where owner_id=d and label='Crew')) is distinct from true then raise exception 'Groups: replacement name must not steal original legacy binding';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',(dp-'schemaVersion')||jsonb_build_object('recipientId',c,'listName','Crew','requestId',gen_random_uuid()));if (out->>'code'='GROUP_UNAVAILABLE') is distinct from true then raise exception 'Groups: old app cannot bind replacement with same printed name';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',dp||jsonb_build_object('recipientId',c,'groupId',new_legacy_gid,'requestId',gen_random_uuid()));if (out#>>'{data,record,groupId}'=new_legacy_gid::text) is distinct from true then raise exception 'Groups: explicit current ID can use replacement group';end if;checks:=checks+1;
 out:=public.lumo_social('friends.renameGroup',dp||jsonb_build_object('groupId',new_legacy_gid,'name','Circle','revision',1,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.deleteGroup',dp||jsonb_build_object('groupId',new_legacy_gid,'revision',2,'requestId',gen_random_uuid()));
 out:=public.lumo_social('friends.save',(dp-'schemaVersion')||jsonb_build_object('recipientId',b,'listName','Circle','revision',2,'requestId',gen_random_uuid()));if (out->>'code'='GROUP_UNAVAILABLE') is distinct from true then raise exception 'Groups: v2 rename reserves legacy label permanently';end if;checks:=checks+1;
 out:=public.lumo_social('friends.save',(dp-'schemaVersion')||jsonb_build_object('recipientId',a,'listName','Study Buddies','revision',3,'requestId',gen_random_uuid()));if (out->>'ok'='true' and (select count(*) from lumo_private.social_friend_groups where owner_id=d and not deleted)=1) is distinct from true then raise exception 'Groups: never-used explicit legacy label remains compatible';end if;checks:=checks+1;

 -- Constraints are independent of the Edge Function and owner-scoped RPC checks.
 denied:=false;begin update lumo_private.social_friends set group_id=foreign_gid where owner_id=a and recipient_id=c;exception when foreign_key_violation then denied:=true;end;
 if not denied then raise exception 'Groups: composite membership FK did not reject another owner';end if;checks:=checks+1;
 denied:=false;begin insert into lumo_private.social_legacy_group_labels(owner_id,label,group_id) values(a,'Study Buddies',foreign_gid);exception when foreign_key_violation then denied:=true;end;
 if not denied then raise exception 'Groups: composite legacy FK did not reject another owner';end if;checks:=checks+1;
 denied:=false;begin update lumo_private.social_friend_groups set name=U&'Bad\202Ename' where owner_id=a and id=gid2;exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Groups: name CHECK did not reject direct invalid name';end if;checks:=checks+1;
 if (select count(*)=2 from pg_class cl join pg_namespace ns on ns.oid=cl.relnamespace where ns.nspname='lumo_private' and cl.relname in('social_friend_groups','social_legacy_group_labels') and cl.relrowsecurity) is distinct from true then raise exception 'Groups: new private tables need RLS';end if;checks:=checks+1;
 foreach name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(name,'lumo_private.social_friend_groups','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege(name,'lumo_private.social_legacy_group_labels','SELECT,INSERT,UPDATE,DELETE') or has_function_privilege(name,'lumo_private.social_group_name(text)','EXECUTE') or has_function_privilege(name,'lumo_private.social_friend_json_v2(lumo_private.social_friends)','EXECUTE') then raise exception 'Groups: private privilege leak for %',name;end if;checks:=checks+1;
 end loop;
 if (not has_function_privilege('anon','public.lumo_social(text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.lumo_social(text,jsonb)','EXECUTE') and has_function_privilege('service_role','public.lumo_social(text,jsonb)','EXECUTE')) is distinct from true then raise exception 'Groups: RPC execution boundary changed';end if;checks:=checks+1;

 insert into lumo_private.social_friend_groups(owner_id,name) select e,'Limit group '||n from generate_series(1,50)n;
 out:=public.lumo_social('friends.createGroup',ep||jsonb_build_object('name','Too many','requestId',gen_random_uuid()));if (out->>'code'='GROUP_LIMIT') is distinct from true then raise exception 'Groups: group capacity enforced';end if;checks:=checks+1;
 select id into cap_gid from lumo_private.social_friend_groups where owner_id=e order by id limit 1;
 out:=public.lumo_social('friends.deleteGroup',ep||jsonb_build_object('groupId',cap_gid,'revision',1,'requestId',gen_random_uuid()));
 payload:=ep||jsonb_build_object('name','Freed place','requestId',cap_req);out:=public.lumo_social('friends.createGroup',payload);
 if (out->>'ok'='true' and (select count(*) from lumo_private.social_friend_groups where owner_id=e and not deleted)=50) is distinct from true then raise exception 'Groups: deletion frees active group capacity';end if;checks:=checks+1;
 insert into lumo_private.social_mutations(owner_id,request_id,payload,response) select e,gen_random_uuid(),'{}','{}' from generate_series(1,100-(select count(*)::integer from lumo_private.social_mutations where owner_id=e))n;
 out:=public.lumo_social('friends.createGroup',ep||jsonb_build_object('name','Rate limited','requestId',gen_random_uuid()));if (out->>'code'='RATE_LIMITED') is distinct from true then raise exception 'Groups: shared mutation rate limit enforced';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',payload);if (out#>>'{data,duplicate}'='true') is distinct from true then raise exception 'Groups: known successful retry still works after rate limit';end if;checks:=checks+1;

 update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=sid;
 out:=public.lumo_social('friends.list',ap);if (out->>'code'='SESSION_REVOKED') is distinct from true then raise exception 'Groups: expired session cannot read lists';end if;checks:=checks+1;
 out:=public.lumo_social('friends.createGroup',ap||jsonb_build_object('name','Café friends','requestId',create_req));if (out->>'code'='SESSION_REVOKED') is distinct from true then raise exception 'Groups: revoked session cannot replay old success';end if;checks:=checks+1;
 out:=public.lumo_social('friends.list',ap||jsonb_build_object('session',sid2));if (out->>'ok'='true') is distinct from true then raise exception 'Groups: other live owner session remains valid';end if;checks:=checks+1;
 update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=a;
 out:=public.lumo_social('friends.list',ap||jsonb_build_object('session',sid2));if (out->>'code'='SESSION_REVOKED') is distinct from true then raise exception 'Groups: banned owner blocked';end if;checks:=checks+1;
 perform set_config('lumo.social.groups_contract_fixture',contract::text,true);
 perform set_config('lumo.social.groups_test_checks',checks::text,true);
 raise notice 'Social groups rollback checks passed: %',checks;
end $test$;
select current_setting('lumo.social.groups_test_checks')::integer as checks,current_setting('lumo.social.groups_contract_fixture')::jsonb as contract;
rollback;
