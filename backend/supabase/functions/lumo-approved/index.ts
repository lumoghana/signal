import {createApprovedHandler} from './handler.mjs';
import {createMerchantHandler} from './merchant/handler.mjs';
import {withOperationEvents} from './operations.mjs';
const defaults=['https://lumo-connected-pilot.vercel.app','https://lumo-new-experience.oness15.chatgpt.site','https://lumo-merchant-mobile.oness15.chatgpt.site','https://lumo-merchant.vercel.app','http://127.0.0.1:4173'];
const supabaseUrl=Deno.env.get('SUPABASE_URL')||'',serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
// Weak-password pilot exceptions are restricted to this explicit sandbox.
// A different project or provider mode requires a reviewed production checker.
const providerMode=Deno.env.get('LUMO_ACCESS_MODE')||'sandbox';
const passwordPolicyMode=providerMode==='sandbox'&&supabaseUrl.replace(/\/$/,'')==='https://iwutbrljiiodamtyoorg.supabase.co'?'pilot':'production';
// Match the access service's explicit pilot-only face recovery opt-in. Client
// payloads cannot select this mode, and another project keeps legacy protection.
const prototypeFaceOnly=(Deno.env.get('LUMO_ACCESS_MODE')||'sandbox')==='sandbox'&&supabaseUrl.replace(/\/$/,'')==='https://iwutbrljiiodamtyoorg.supabase.co'&&(Deno.env.get('LUMO_ACCESS_RECOVERY_MODE')||'prototype-face-only')==='prototype-face-only';
const merchantHandler=options=>createMerchantHandler({...options,prototypeFaceOnly,readScalingEnabled:true});
const eventContexts=new WeakMap();
const handler=createApprovedHandler({supabaseUrl,serviceRoleKey,merchantHandler,passwordPolicyMode,availabilityEnabled:true,loyaltyReadScalingEnabled:true,onIdentified:(request,identity)=>eventContexts.set(request,{actorId:identity.userId}),allowedOrigins:[...new Set([...defaults,...(Deno.env.get('LUMO_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean)])]});
Deno.serve(withOperationEvents(handler,{supabaseUrl,serviceRoleKey,contextFor:request=>eventContexts.get(request),readSampleRate:0.01,onEventLoss:event=>console.warn(JSON.stringify({event:'lumo_telemetry_loss',...event}))}));
