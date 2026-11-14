-- Persist authored learning positions and correct local-variable qualification in experience actions.
-- Replaces the installed handler without rewriting the original migration history.
create function lumo_private.learning_state_valid(p_state jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_key text;v_number numeric;v_choice jsonb;
begin
 if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>2000 then return false;end if;
 for v_key in select jsonb_object_keys(p_state) loop
  if v_key not in('questionIndex','correct','path','phase')then return false;end if;
 end loop;
 foreach v_key in array array['questionIndex','correct']loop
  if p_state?v_key then
   if jsonb_typeof(p_state->v_key)is distinct from 'number'then return false;end if;
   v_number:=(p_state->>v_key)::numeric;
   if v_number<>trunc(v_number)or v_number not between 0 and 100 then return false;end if;
  end if;
 end loop;
 if p_state?'phase' and(jsonb_typeof(p_state->'phase')is distinct from 'string'or p_state->>'phase'not in('choice','consequence','completed','lesson'))then return false;end if;
 if p_state?'path'then
  if jsonb_typeof(p_state->'path')is distinct from 'array'then return false;end if;
  if jsonb_array_length(p_state->'path')>100 then return false;end if;
  for v_choice in select value from jsonb_array_elements(p_state->'path')loop
   if jsonb_typeof(v_choice)is distinct from 'number'then return false;end if;
   v_number:=v_choice::text::numeric;
   if v_number<>trunc(v_number)or v_number not between 0 and 2 then return false;end if;
  end loop;
 end if;
 return true;
exception when numeric_value_out_of_range then return false;
end $$;
alter table lumo_private.learning_progress add column state jsonb not null default '{}'::jsonb;
alter table lumo_private.learning_progress add constraint learning_state_bounded check(lumo_private.learning_state_valid(state));
revoke all on function lumo_private.learning_state_valid(jsonb)from public,anon,authenticated,service_role;

create or replace function lumo_private.experience_command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
<<experience_vars>>
declare
 actor uuid:=auth.uid();target lumo_private.profiles%rowtype;request lumo_private.person_requests%rowtype;
 shop_id uuid;id uuid;journal_id uuid;source_id uuid;destination_id uuid;amount bigint;
 query_text text;code_text text;label text;note text;module_id text;revision integer;score integer;
 latitude numeric;longitude numeric;expires timestamptz;has_coords boolean:=false;v_result jsonb;
begin
 if actor is null then return lumo_private.failure('AUTH_REQUIRED','Sign in before continuing.',false);end if;
 if p_command='merchant.discover' then
  if p_payload?'query' and (jsonb_typeof(p_payload->'query') is distinct from 'string' or length(p_payload->>'query')>80) or p_payload?'code' and (jsonb_typeof(p_payload->'code') is distinct from 'string' or length(p_payload->>'code')>32) then return lumo_private.failure('INVALID_INPUT','Use a shop name, campus or merchant code.');end if;
  query_text:=lower(trim(coalesce(p_payload->>'query','')));code_text:=upper(trim(coalesce(p_payload->>'code','')));
  if (p_payload?'latitude')<>(p_payload?'longitude') then return lumo_private.failure('INVALID_INPUT','Send both location coordinates or neither.');end if;
  if p_payload?'latitude' then
   if jsonb_typeof(p_payload->'latitude') is distinct from 'number' or jsonb_typeof(p_payload->'longitude') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Use valid numeric coordinates.');end if;
   latitude:=(p_payload->>'latitude')::numeric;longitude:=(p_payload->>'longitude')::numeric;
   if latitude not between -90 and 90 or longitude not between -180 and 180 then return lumo_private.failure('INVALID_INPUT','Use valid location coordinates.');end if;has_coords:=true;
  end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shops',coalesce((select jsonb_agg(x.data order by x.distance nulls last,x.business_name,x.shop_name,x.shop_id) from(
   select s.id shop_id,m.name business_name,s.name shop_name,
    case when has_coords and ss.latitude is not null then 6371*acos(least(1::double precision,greatest(-1::double precision,sin(radians(latitude::double precision))*sin(radians(ss.latitude::double precision))+cos(radians(latitude::double precision))*cos(radians(ss.latitude::double precision))*cos(radians((ss.longitude-longitude)::double precision))))) else null end distance,
    jsonb_build_object('id',s.id,'shopId',s.id,'merchantId',m.id,'name',s.name,'businessName',m.name,'code',d.code,'location',coalesce(ss.location,''),'campus',d.campus,'category',d.category,'latitude',ss.latitude,'longitude',ss.longitude,
    'distanceKm',case when has_coords and ss.latitude is not null then round((6371*acos(least(1::double precision,greatest(-1::double precision,sin(radians(latitude::double precision))*sin(radians(ss.latitude::double precision))+cos(radians(latitude::double precision))*cos(radians(ss.latitude::double precision))*cos(radians((ss.longitude-longitude)::double precision))))))::numeric,2) else null end) data
   from lumo_private.shop_directory d join lumo_private.shops s on s.id=d.shop_id join lumo_private.merchants m on m.id=s.merchant_id join lumo_private.accounts a on a.id=m.account_id
   left join lumo_private.shop_settings ss on ss.shop_id=s.id
   where ss.published and s.accepting and m.status='active' and a.status='active' and (code_text='' or d.code=code_text) and (query_text='' or position(query_text in lower(m.name||' '||s.name||' '||d.campus||' '||d.category||' '||coalesce(ss.location,'')))>0)
   order by distance nulls last,m.name,s.name,s.id limit 50)x),'[]'::jsonb));
 elsif p_command in('shop.discovery','shop.discovery.get') then
  shop_id:=lumo_private.ext_uuid(p_payload,'shopId');
  if not exists(select 1 from lumo_private.shops s join lumo_private.merchants m on m.id=s.merchant_id where s.id=shop_id and m.owner_user_id=actor) then return lumo_private.failure('FORBIDDEN','Only the business owner can manage discovery.');end if;
  if p_command='shop.discovery' then
   if jsonb_typeof(p_payload->'published') is distinct from 'boolean' then return lumo_private.failure('INVALID_INPUT','Choose whether customers can discover this shop.');end if;
   if (p_payload?'latitude')<>(p_payload?'longitude') then return lumo_private.failure('INVALID_INPUT','Send both location coordinates or neither.');end if;
   if p_payload?'latitude' and (jsonb_typeof(p_payload->'latitude')<>'null' or jsonb_typeof(p_payload->'longitude')<>'null') then
    if jsonb_typeof(p_payload->'latitude') is distinct from 'number' or jsonb_typeof(p_payload->'longitude') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Use valid coordinates or clear both.');end if;
    latitude:=(p_payload->>'latitude')::numeric;longitude:=(p_payload->>'longitude')::numeric;
    if latitude not between -90 and 90 or longitude not between -180 and 180 then return lumo_private.failure('INVALID_INPUT','Use valid location coordinates.');end if;
   end if;
   if p_payload?'campus' and (jsonb_typeof(p_payload->'campus') is distinct from 'string' or length(p_payload->>'campus')>100 or (p_payload->>'campus')~'[[:cntrl:]<>]') or p_payload?'category' and (jsonb_typeof(p_payload->'category') is distinct from 'string' or length(p_payload->>'category')>60 or (p_payload->>'category')~'[[:cntrl:]<>]') then return lumo_private.failure('INVALID_INPUT','Keep campus and category names short.');end if;
   insert into lumo_private.shop_settings(shop_id,published,latitude,longitude) values(shop_id,(p_payload->>'published')::boolean,latitude,longitude)
   on conflict on constraint shop_settings_pkey do update set published=excluded.published,latitude=case when p_payload?'latitude' then excluded.latitude else shop_settings.latitude end,longitude=case when p_payload?'longitude' then excluded.longitude else shop_settings.longitude end;
   update lumo_private.shop_directory d set campus=case when p_payload?'campus' then trim(p_payload->>'campus') else d.campus end,category=case when p_payload?'category' then trim(p_payload->>'category') else d.category end,updated_at=clock_timestamp() where d.shop_id=experience_vars.shop_id;
  end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shopId',shop_id,'discovery',lumo_private.discovery_json(shop_id));
 elsif p_command='favourite.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','favourites',coalesce((select jsonb_agg(lumo_private.favourite_json(f.id) order by f.created_at desc,f.id) from lumo_private.favourites f where f.user_id=actor),'[]'::jsonb));
 elsif p_command='favourite.save' then
  if jsonb_typeof(p_payload->'handle') is distinct from 'string' or lower(trim(p_payload->>'handle')) !~ '^[a-z][a-z0-9_]{2,29}$' then return lumo_private.failure('INVALID_INPUT','Enter an exact Lumo handle.');end if;
  select * into target from lumo_private.profiles p where p.handle=lower(trim(p_payload->>'handle')) and p.status='active';
  if not found or target.user_id=actor then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose another active Lumo account.');end if;
  label:=trim(coalesce(p_payload->>'label',''));
  if p_payload?'label' and (jsonb_typeof(p_payload->'label') is distinct from 'string' or length(label)>60 or label~'[[:cntrl:]<>]') then return lumo_private.failure('INVALID_INPUT','Keep the saved name within 60 characters.');end if;
  if (select count(*) from lumo_private.favourites f where f.user_id=actor)>=50 and not exists(select 1 from lumo_private.favourites f where f.user_id=actor and f.recipient_user_id=target.user_id) then return lumo_private.failure('FAVOURITE_LIMIT','Remove a saved person before adding another.');end if;
  insert into lumo_private.favourites(user_id,recipient_user_id,label) values(actor,target.user_id,label) on conflict(user_id,recipient_user_id) do update set label=excluded.label returning favourites.id into id;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','favourite',lumo_private.favourite_json(id));
 elsif p_command='favourite.delete' then
  id:=lumo_private.ext_uuid(p_payload,'favouriteId');delete from lumo_private.favourites f where f.id=id and f.user_id=actor;
  if not found then return lumo_private.failure('FORBIDDEN','This saved person does not belong to you.');end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','favouriteId',id,'deleted',true);
 elsif p_command='person.request.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','paymentRequests',coalesce((select jsonb_agg(lumo_private.person_request_json(x.id) order by x.created_at desc,x.id) from(select r.id,r.created_at from lumo_private.person_requests r where actor in(r.requester_user_id,r.payer_user_id) order by r.created_at desc,r.id limit 100)x),'[]'::jsonb));
 elsif p_command='person.request.create' then
  amount:=lumo_private.ext_amount(p_payload);
  if jsonb_typeof(p_payload->'payerHandle') is distinct from 'string' or lower(trim(p_payload->>'payerHandle')) !~ '^[a-z][a-z0-9_]{2,29}$' then return lumo_private.failure('INVALID_INPUT','Enter the person’s exact Lumo handle.');end if;
  select * into target from lumo_private.profiles p where p.handle=lower(trim(p_payload->>'payerHandle')) and p.status='active';
  if not found or target.user_id=actor then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose another active Lumo account.');end if;
  note:=trim(coalesce(p_payload->>'note',''));
  if p_payload?'note' and (jsonb_typeof(p_payload->'note') is distinct from 'string' or length(note)>160 or note~'[[:cntrl:]<>]') then return lumo_private.failure('INVALID_INPUT','Keep the request note within 160 characters.');end if;
  expires:=clock_timestamp()+interval '24 hours';
  if p_payload?'expiresAt' then
   if jsonb_typeof(p_payload->'expiresAt') is distinct from 'string' then return lumo_private.failure('INVALID_INPUT','Use a valid future expiry date.');end if;
   begin expires:=(p_payload->>'expiresAt')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then return lumo_private.failure('INVALID_INPUT','Use a valid future expiry date.');end;
  end if;
  if expires<=clock_timestamp()+interval '1 minute' or expires>clock_timestamp()+interval '7 days' then return lumo_private.failure('INVALID_INPUT','Request expiry must be between one minute and seven days.');end if;
  if(select count(*) from lumo_private.person_requests r where r.requester_user_id=actor and r.status='open' and r.expires_at>clock_timestamp())>=20 then return lumo_private.failure('REQUEST_LIMIT','Finish or cancel an open request before adding another.');end if;
  insert into lumo_private.person_requests(requester_user_id,payer_user_id,amount,note,expires_at) values(actor,target.user_id,amount,note,expires) returning person_requests.id into id;
  perform lumo_private.notify_user(target.user_id,'person.request','Payment request','A Lumo contact has requested money. Review it before deciding.','person.request',id);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','requestId',id,'paymentRequest',lumo_private.person_request_json(id));
 elsif p_command in('person.request.pay','person.request.cancel') then
  id:=lumo_private.ext_uuid(p_payload,'requestId');
  select * into request from lumo_private.person_requests r where r.id=id and actor in(r.requester_user_id,r.payer_user_id) for update;
  if not found then return lumo_private.failure('FORBIDDEN','This payment request is unavailable to this account.');end if;
  if request.status<>'open' or request.expires_at<=clock_timestamp() then return lumo_private.failure('REQUEST_UNAVAILABLE','This payment request is already complete, cancelled or expired.');end if;
  if p_command='person.request.cancel' then
   update lumo_private.person_requests set status='cancelled' where person_requests.id=id;
   perform lumo_private.notify_user(case when actor=request.requester_user_id then request.payer_user_id else request.requester_user_id end,'person.request.cancelled','Payment request cancelled','A shared payment request was cancelled.','person.request',id);
   return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','requestId',id,'paymentRequest',lumo_private.person_request_json(id));
  end if;
  if actor<>request.payer_user_id then return lumo_private.failure('FORBIDDEN','Only the person asked to pay can authorise this request.');end if;
  amount:=lumo_private.ext_amount(p_payload);
  if amount<>request.amount then return lumo_private.failure('AMOUNT_LOCKED','The requester’s amount is locked. Ask for a fresh request to change it.');end if;
  if not exists(select 1 from lumo_private.profiles p where p.user_id=request.requester_user_id and p.status='active') then return lumo_private.failure('RECIPIENT_NOT_FOUND','The receiving account is unavailable.');end if;
  select a.id into source_id from lumo_private.accounts a where a.owner_user_id=actor and a.kind='consumer';
  select a.id into destination_id from lumo_private.accounts a where a.owner_user_id=request.requester_user_id and a.kind='consumer';
  journal_id:=lumo_private.post_money(actor,'transfer',amount,source_id,destination_id);
  insert into lumo_private.person_request_postings(journal_id,request_id) values(journal_id,id);
  update lumo_private.person_requests set status='paid',journal_id=experience_vars.journal_id where person_requests.id=id;
  perform lumo_private.planning_after_payment(actor,journal_id,p_payload);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','requestId',id,'paymentRequest',lumo_private.person_request_json(id),'receipt',lumo_private.receipt_json(journal_id));
 elsif p_command='learning.get' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','progress',coalesce((select jsonb_agg(jsonb_build_object('moduleId',p.module_id,'completed',p.completed,'score',p.score,'revision',p.revision,'state',p.state,'updatedAt',p.updated_at) order by p.updated_at desc,p.module_id) from lumo_private.learning_progress p where p.user_id=actor),'[]'::jsonb));
 elsif p_command='learning.save' then
  if p_payload?'state' and not lumo_private.learning_state_valid(p_payload->'state') then return lumo_private.failure('INVALID_INPUT','Save a valid learning position.');end if;
  if p_payload#>>'{state,phase}'='completed' and p_payload->'completed' is distinct from 'true'::jsonb then return lumo_private.failure('INVALID_INPUT','Complete the module before saving a completed position.');end if;
  module_id:=p_payload->>'moduleId';
  if jsonb_typeof(p_payload->'moduleId') is distinct from 'string' or module_id !~ '^[a-z0-9][a-z0-9-]{0,59}$' or jsonb_typeof(p_payload->'completed') is distinct from 'boolean' or jsonb_typeof(p_payload->'score') is distinct from 'number' or jsonb_typeof(p_payload->'revision') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Save a valid learning result.');end if;
  if (p_payload->>'score')::numeric<>trunc((p_payload->>'score')::numeric) or (p_payload->>'score')::numeric not between 0 and 100 or (p_payload->>'revision')::numeric<>trunc((p_payload->>'revision')::numeric) or (p_payload->>'revision')::numeric not between 0 and 2147483646 then return lumo_private.failure('INVALID_INPUT','Save a whole score and current learning revision.');end if;
  revision:=(p_payload->>'revision')::integer;score:=(p_payload->>'score')::integer;
  if revision=0 then
   insert into lumo_private.learning_progress(user_id,module_id,completed,score,state) values(actor,module_id,(p_payload->>'completed')::boolean,score,coalesce(p_payload->'state','{}'::jsonb)) on conflict on constraint learning_progress_pkey do nothing;
   if not found then return lumo_private.failure('REVISION_CONFLICT','Learning changed on another device. Reload before saving.');end if;
  else
   update lumo_private.learning_progress p set completed=(p_payload->>'completed')::boolean,score=experience_vars.score,state=case when p_payload?'state' then p_payload->'state' else p.state end,revision=p.revision+1,updated_at=clock_timestamp() where p.user_id=actor and p.module_id=experience_vars.module_id and p.revision=experience_vars.revision;
   if not found then return lumo_private.failure('REVISION_CONFLICT','Learning changed on another device. Reload before saving.');end if;
  end if;
  select jsonb_build_object('moduleId',p.module_id,'completed',p.completed,'score',p.score,'revision',p.revision,'state',p.state,'updatedAt',p.updated_at) into v_result from lumo_private.learning_progress p where p.user_id=actor and p.module_id=experience_vars.module_id;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','progress',v_result);
 elsif p_command='chat.history' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','messages',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'question',x.question,'answer',x.answer,'createdAt',x.created_at) order by x.created_at,x.id) from(select * from lumo_private.chat_history h where h.user_id=actor order by h.created_at desc,h.id limit 100)x),'[]'::jsonb));
 elsif p_command='chat.clear' then
  delete from lumo_private.chat_history h where h.user_id=actor;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','cleared',true);
 end if;
 return null;
end $$;
revoke all on function lumo_private.experience_command(text,jsonb)from public,anon,authenticated,service_role;
