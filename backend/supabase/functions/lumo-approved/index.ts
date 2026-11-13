import {createApprovedHandler} from './handler.mjs';
import {createMerchantHandler} from './merchant/handler.mjs';
const defaults=['https://lumo-connected-pilot.vercel.app','https://lumo-new-experience.oness15.chatgpt.site','https://lumo-merchant-mobile.oness15.chatgpt.site','http://127.0.0.1:4173'];
Deno.serve(createApprovedHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')||'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',merchantHandler:createMerchantHandler,allowedOrigins:[...new Set([...defaults,...(Deno.env.get('LUMO_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean)])]}));
