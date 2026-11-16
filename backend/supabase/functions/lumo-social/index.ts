import {createSocialHandler} from './handler.mjs';
const defaults=['https://lumo-connected-pilot.vercel.app','https://lumo-new-experience.oness15.chatgpt.site','https://lumo-merchant-mobile.oness15.chatgpt.site','https://lumo-merchant.vercel.app','http://127.0.0.1:4173'];
Deno.serve(createSocialHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')||'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',allowedOrigins:[...new Set([...defaults,...(Deno.env.get('LUMO_ALLOWED_ORIGINS')||'').split(',')].map(s=>s.trim()).filter(Boolean))]}));
