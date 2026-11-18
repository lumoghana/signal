import {createAccessHandler} from './handler.mjs';
const defaults=['https://lumo-connected-pilot.vercel.app','https://lumo-new-experience.oness15.chatgpt.site','https://lumo-merchant-mobile.oness15.chatgpt.site','https://lumo-merchant.vercel.app','https://lumo-admin-operations.oness15.chatgpt.site','http://127.0.0.1:4173'];
// SMS/NIA remain labelled simulations. Stored face comparison has a separate
// authenticated processor and never falls back to the old face simulator.
// This release explicitly opts in only the already approved prototype project.
// Other projects stay key-protected; non-sandbox providers cannot enable it.
const supabaseUrl=Deno.env.get('SUPABASE_URL')||'';
const providerMode=Deno.env.get('LUMO_ACCESS_MODE')||'sandbox';
const recoveryMode=Deno.env.get('LUMO_ACCESS_RECOVERY_MODE')||'prototype-face-only';
const prototypeFaceOnly=providerMode==='sandbox'&&supabaseUrl.replace(/\/$/,'')==='https://iwutbrljiiodamtyoorg.supabase.co'&&recoveryMode==='prototype-face-only';
Deno.serve(createAccessHandler({supabaseUrl,serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',providerMode,prototypeFaceOnly,faceProcessorUrl:Deno.env.get('LUMO_FACE_PROCESSOR_URL')||'',faceProcessorSecret:Deno.env.get('LUMO_FACE_PROCESSOR_SECRET')||'',allowedOrigins:[...new Set([...defaults,...(Deno.env.get('LUMO_ACCESS_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean)])]}));
