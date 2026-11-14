const HANDLE=/^[a-z][a-z0-9_]{2,29}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_MESSAGES={
  INVALID_INPUT:'Check the handle, name, password and transaction PIN.',
  CREDENTIALS_INCORRECT:'That handle and password could not be verified.',
  RATE_LIMITED:'Too many attempts. Please wait before trying again.',
  REGISTRATION_PENDING:'This test account is still being created. Retry with the same details shortly.',
  ACCOUNT_SETUP_REQUIRED:'Finish creating this test account using the same handle and password.',
  ACCOUNT_UNAVAILABLE:'This test account is unavailable. Try signing in with your existing details.',
  SERVICE_UNAVAILABLE:'Lumo could not complete this request. Keep your details and try again.',
  ORIGIN_NOT_ALLOWED:'Open Lumo from its approved app or website.',
  NOT_FOUND:'Choose a supported account action.',
  METHOD_NOT_ALLOWED:'Use a supported account action.',
  REQUEST_TOO_LARGE:'This request is too large.',
};
class AuthFailure extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status;}}
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=(code,status)=>{throw new AuthFailure(code,status);};
const emailFor=handle=>`${handle}@pilot.lumo.invalid`;

async function boundedJson(request){
  if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')fail('INVALID_INPUT',400);
  const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>4096))fail('REQUEST_TOO_LARGE',413);
  const reader=request.body?.getReader();if(!reader)fail('INVALID_INPUT',400);
  let bytes=0;const parts=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();fail('REQUEST_TOO_LARGE',413);}parts.push(value);}}
  finally{reader.releaseLock();}
  const buffer=new Uint8Array(bytes);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.byteLength;}
  try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));if(!plain(value))fail('INVALID_INPUT',400);return value;}
  catch(error){if(error instanceof AuthFailure)throw error;fail('INVALID_INPUT',400);}
}

/** The deployment injects credentials; public callers never supply or receive them. */
export function createPilotAuthHandler({supabaseUrl,serviceRoleKey,allowedOrigins=[],fetch:transport=globalThis.fetch,crypto:cryptoApi=globalThis.crypto,timeoutMs=12000}={}){
  const url=new URL(supabaseUrl);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid server configuration');
  if(typeof serviceRoleKey!=='string'||serviceRoleKey.length<30||typeof transport!=='function')throw new Error('Invalid server configuration');
  const origins=new Set(allowedOrigins.filter(origin=>{
    try{const parsed=new URL(origin);return parsed.origin===origin&&(parsed.protocol==='https:'||parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname));}catch{return false;}
  }));
  async function upstream(path,body,{token=serviceRoleKey,allowFailure=false}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await transport(url.origin+path,{method:'POST',redirect:'error',signal:controller.signal,headers:{apikey:serviceRoleKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
      let data;try{data=await response.json();}catch{fail('SERVICE_UNAVAILABLE',503);}
      if(!plain(data))fail('SERVICE_UNAVAILABLE',503);
      if(!response.ok&&!allowFailure)fail('SERVICE_UNAVAILABLE',503);
      return {ok:response.ok,status:response.status,data};
    }catch(error){if(error instanceof AuthFailure)throw error;fail('SERVICE_UNAVAILABLE',503);}
    finally{clearTimeout(timer);}
  }
  async function bootstrap(action,payload){
    const response=await upstream('/rest/v1/rpc/lumo_pilot_bootstrap',{p_action:action,p_payload:payload});
    if(response.data.ok!==true){if(response.data.code==='RATE_LIMITED')fail('RATE_LIMITED',429);if(response.data.code==='HANDLE_UNAVAILABLE')fail('ACCOUNT_UNAVAILABLE',409);if(response.data.code==='REGISTRATION_PENDING')fail('REGISTRATION_PENDING',409);fail('SERVICE_UNAVAILABLE',503);}
    return response.data;
  }
  async function passwordSession(handle,password){
    const response=await upstream('/auth/v1/token?grant_type=password',{email:emailFor(handle),password},{allowFailure:true});
    if(!response.ok)fail(response.status===429?'RATE_LIMITED':'CREDENTIALS_INCORRECT',response.status===429?429:401);
    const s=response.data;
    if(typeof s.access_token!=='string'||!s.access_token||typeof s.refresh_token!=='string'||!s.refresh_token||!plain(s.user)||!UUID.test(s.user.id)||s.user.email!==emailFor(handle))fail('SERVICE_UNAVAILABLE',503);
    return s;
  }
  async function userRpc(session,command,payload){
    const data=(await upstream('/rest/v1/rpc/lumo_rpc',{p_command:command,p_payload:payload},{token:session.access_token})).data;
    if(data.ok===true&&(data.sandbox!==true||data.currency!=='GHS'))fail('SERVICE_UNAVAILABLE',503);
    return data;
  }
  async function revoke(session){
    // This only revokes the short-lived provisioning session, never deletes a user or posted account.
    try{await upstream('/auth/v1/logout?scope=local',{}, {token:session.access_token,allowFailure:true});}catch{/* no secret or upstream body is logged */}
  }
  function publicSession(session,account){
    if(!plain(account)||account.userId!==session.user.id||!UUID.test(account.id)||account.currency!=='GHS'||account.sandbox!==true||!Number.isSafeInteger(account.balance)||account.balance<0)fail('SERVICE_UNAVAILABLE',503);
    const now=Math.floor(Date.now()/1000),expiresIn=Number.isSafeInteger(session.expires_in)&&session.expires_in>0?session.expires_in:3600;
    return {access_token:session.access_token,refresh_token:session.refresh_token,token_type:'bearer',expires_in:expiresIn,expires_at:Number.isSafeInteger(session.expires_at)?session.expires_at:now+expiresIn,user:{id:session.user.id,email:session.user.email},account,sandbox:true,contactVerified:false};
  }
  return async request=>{
    const origin=request.headers.get('origin'),cors={Vary:'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(origin&&origins.has(origin)){cors['Access-Control-Allow-Origin']=origin;cors['Access-Control-Allow-Methods']='POST, OPTIONS';cors['Access-Control-Allow-Headers']='apikey, authorization, content-type, x-client-info';cors['Access-Control-Max-Age']='600';}
    const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
    try{
      if(origin&&!origins.has(origin))fail('ORIGIN_NOT_ALLOWED',403);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
      if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
      const path=new URL(request.url).pathname.replace(/\/+$/,'');
      const action=path.endsWith('/register')?'register':path.endsWith('/login')?'login':null;
      if(!action)fail('NOT_FOUND',404);
      const body=await boundedJson(request),keys=action==='register'?['handle','displayName','password','pin']:['handle','password'];
      if(Object.keys(body).some(key=>!keys.includes(key))||typeof body.handle!=='string'||typeof body.password!=='string')fail('INVALID_INPUT',400);
      const handle=body.handle.trim().toLowerCase(),password=body.password;
      if(!HANDLE.test(handle)||new TextEncoder().encode(password).byteLength<8||new TextEncoder().encode(password).byteLength>72)fail('INVALID_INPUT',400);
      if(action==='register'&&(typeof body.displayName!=='string'||body.displayName.trim().length<1||body.displayName.trim().length>80||/[\p{Cc}<>]/u.test(body.displayName)||typeof body.pin!=='string'||!/^\d{4,6}$/.test(body.pin)))fail('INVALID_INPUT',400);
      // Use the final forwarded hop, and share one fallback bucket when ingress identity is absent.
      // The database's global ceiling is enforced independently of every client-address header.
      const address=(request.headers.get('x-forwarded-for')||'unknown').split(',').at(-1).trim().slice(0,160)||'unknown';
      const digest=await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode('lumo-pilot-auth:'+address));
      const ipHash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(action==='login'){
        await bootstrap('login.check',{handle,ipHash});
        const session=await passwordSession(handle,password);
        try{
          const found=await userRpc(session,'account.get',{});
          if(found.ok!==true)fail(found.code==='ACCOUNT_REQUIRED'?'ACCOUNT_SETUP_REQUIRED':'ACCOUNT_UNAVAILABLE',409);
          return respond(publicSession(session,found.account));
        }catch(error){await revoke(session);throw error;}
      }
      const reservation=await bootstrap('register.reserve',{handle,ipHash});
      if(!UUID.test(reservation.registrationId))fail('SERVICE_UNAVAILABLE',503);
      if(reservation.mode==='new'){
        // Admin createUser auto-confirms only the synthetic, non-contact address. It sends no message.
        // If the Auth call committed but its response was interrupted, the same password login below
        // can resume on the next registration attempt. Never delete a potentially opened account.
        try{
          const created=await upstream('/auth/v1/admin/users',{email:emailFor(handle),password,email_confirm:true,app_metadata:{lumo_pilot:true,contact_verified:false}},{allowFailure:true});
          if(!created.ok&&created.status>=500)fail('SERVICE_UNAVAILABLE',503);
          if(!created.ok){
            const aborted=await bootstrap('register.abort',{handle,registrationId:reservation.registrationId});
            if(aborted.identityPresent!==true)fail(created.status===429?'RATE_LIMITED':'INVALID_INPUT',created.status===429?429:400);
          }
        }catch(error){
          // Release only if the database confirms no Auth identity or profile exists. An unknown
          // committed create retains its identity and can resume using the original password.
          try{await bootstrap('register.abort',{handle,registrationId:reservation.registrationId});}catch{/* preserve unknown reservation */}
          throw error;
        }
      }
      const session=await passwordSession(handle,password);
      try{
        await bootstrap('register.bind',{handle,registrationId:reservation.registrationId,userId:session.user.id});
        const opened=await userRpc(session,'account.open',{handle,displayName:body.displayName.trim(),pin:body.pin});
        if(opened.ok!==true||opened.account?.handle!==handle)fail('ACCOUNT_UNAVAILABLE',409);
        await bootstrap('register.complete',{handle,registrationId:reservation.registrationId,userId:session.user.id});
        return respond(publicSession(session,opened.account));
      }catch(error){await revoke(session);throw error;}
    }catch(error){
      const failure=error instanceof AuthFailure?error:new AuthFailure('SERVICE_UNAVAILABLE',503);
      return respond({ok:false,sandbox:true,error:{code:failure.code,message:SAFE_MESSAGES[failure.code]||SAFE_MESSAGES.SERVICE_UNAVAILABLE}},failure.status);
    }
  };
}
