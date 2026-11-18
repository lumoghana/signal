import {createAdminHandler} from './handler.mjs';
const origins=['https://lumo-admin-operations.oness15.chatgpt.site','http://127.0.0.1:4173'];
Deno.serve(createAdminHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')||'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',requireMfa:Deno.env.get('LUMO_ENVIRONMENT')==='production',recoveryResetsEnabled:false,allowedOrigins:[...new Set([...origins,...(Deno.env.get('LUMO_ADMIN_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean)])]}));
