do $purpose_tests$
#variable_conflict use_variable
declare ctx jsonb:=current_setting('lumo.guest.test_context',true)::jsonb;actor uuid;session_id uuid;token_hash text;shop uuid;a jsonb;b jsonb;again jsonb;q jsonb;
 suffix text:=replace(gen_random_uuid()::text,'-','');purpose_a text;purpose_b text;attempt text;
begin
 actor:=(ctx->>'actor')::uuid;session_id:=(ctx->>'authSession')::uuid;token_hash:=ctx->>'merchantTokenHash';shop:=(ctx->>'shopId')::uuid;purpose_a:='QA reusable order A '||suffix;purpose_b:='QA reusable order B '||suffix;attempt:='purpose-'||suffix;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 a:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'description',purpose_a,'attemptId',attempt||'-a'));
 b:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'description',purpose_b,'attemptId',attempt||'-b'));
 if a->>'ok'<>'true' or b->>'ok'<>'true' then raise exception 'Purpose link create failed: %, %',a,b;end if;
 if a#>>'{link,publicToken}'=b#>>'{link,publicToken}' or a#>>'{link,kind}'<>'shop' or b#>>'{link,kind}'<>'shop' then raise exception 'Different reusable purposes shared the same public checkout';end if;
 again:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'description',purpose_a,'attemptId',attempt||'-same-purpose'));
 if again#>>'{link,publicToken}'<>a#>>'{link,publicToken}' then raise exception 'Same purpose did not reuse its stable shop link';end if;
 q:=public.lumo_guest_checkout('quote',jsonb_build_object('link',a#>>'{link,publicToken}','rateKey',repeat('a',64)));
 if q#>>'{link,description}'<>purpose_a or q#>'{link,amount}'<>'null'::jsonb then raise exception 'Public checkout A description or editable amount changed';end if;
 q:=public.lumo_guest_checkout('quote',jsonb_build_object('link',b#>>'{link,publicToken}','rateKey',repeat('a',64)));
 if q#>>'{link,description}'<>purpose_b then raise exception 'Public checkout B kept a stale order purpose';end if;
 again:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'description',purpose_a,'attemptId',attempt||'-a'));
 if again#>>'{link,publicToken}'<>a#>>'{link,publicToken}' then raise exception 'Original request reference was not idempotent';end if;
 again:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'description',purpose_b,'attemptId',attempt||'-a'));
 if again->>'code'<>'IDEMPOTENCY_CONFLICT' then raise exception 'Changing purpose rebound an existing reference';end if;
 raise notice 'Reusable link purpose assertions passed';
end $purpose_tests$;
