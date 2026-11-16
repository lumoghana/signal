import {createAccessHandler} from './handler.mjs';
const defaults=['https://lumo-connected-pilot.vercel.app','https://lumo-new-experience.oness15.chatgpt.site','https://lumo-merchant-mobile.oness15.chatgpt.site','https://lumo-merchant.vercel.app','https://lumo-admin-operations.oness15.chatgpt.site','http://127.0.0.1:4173'];
// SMS/NIA remain labelled simulations. Stored face comparison has a separate
// authenticated processor and never falls back to the old face simulator.
Deno.serve(createAccessHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')||'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',providerMode:Deno.env.get('LUMO_ACCESS_MODE')||'sandbox',faceProcessorUrl:Deno.env.get('LUMO_FACE_PROCESSOR_URL')||'',faceProcessorSecret:Deno.env.get('LUMO_FACE_PROCESSOR_SECRET')||'',allowedOrigins:[...new Set([...defaults,...(Deno.env.get('LUMO_ACCESS_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean)])]}));

