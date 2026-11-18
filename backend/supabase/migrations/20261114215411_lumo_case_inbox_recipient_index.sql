-- Make recipient ownership an explicit leading predicate for the inbox indexes.
do $patch$
declare src text;
begin
 src:=pg_get_functiondef('public.lumo_case_inbox(jsonb)'::regprocedure);
 if strpos(src,'n.recipient_id=actor and n.audience=audience')>0 then raise exception 'Recipient predicate already installed; review the migration';end if;
 if strpos(src,'n.audience=audience')=0 then raise exception 'Inbox access seam changed';end if;
 execute replace(src,'n.audience=audience','n.recipient_id=actor and n.audience=audience');
end $patch$;

