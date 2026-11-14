-- Keep outage evidence after recovery. Existing admin audit is append-only.
create function lumo_private.service_transition_audit()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.circuit is distinct from new.circuit then
  perform lumo_private.admin_log(null,'system','service.'||case new.circuit when 'open' then 'opened' when 'recovering' then 'recovering' else 'recovered' end,'service',new.id,
   case new.circuit when 'open' then 'Shared test gateway infrastructure failure threshold reached. Customer validation failures are excluded.' when 'recovering' then 'A validated read-only shared gateway and persistence check succeeded after the cooldown.' else 'Three spaced shared gateway and persistence checks succeeded. No live external provider was tested.' end,
   null,lumo_private.service_json(old,true),lumo_private.service_json(new,true));
 end if;
 return new;
end $$;
revoke all on function lumo_private.service_transition_audit() from public,anon,authenticated;
create trigger service_transition_audit after update on lumo_private.service_availability for each row execute function lumo_private.service_transition_audit();
