import {createMaintenanceHandler} from './handler.mjs';

// These standard values are supplied by the platform. No new secret is needed.
const handler=createMaintenanceHandler({
 supabaseUrl:Deno.env.get('SUPABASE_URL')||'',
 serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
});
Deno.serve(handler);
