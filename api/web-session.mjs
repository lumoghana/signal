/** Same-origin browser session boundary. Native clients keep their existing
 * direct Auth transport. Browser credentials exist only in an authenticated,
 * encrypted HttpOnly cookie; cookie selectors returned to JS are not credentials.
 * Rotation-specific names prevent a delayed Set-Cookie from overwriting a newer
 * account or refresh. No automatic cookie discovery can resurrect a logout. */
import {createCipheriv,createDecipheriv,randomBytes,createHash,createHmac,createPrivateKey,createPublicKey,sign,hkdfSync,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {WEB_PROXY_KEY_ID,WEB_PROXY_PUBLIC_KEYS} from '../backend/supabase/functions/lumo-approved/web-proxy-public-keys.mjs';
import {APPROVED_CONFIG} from '../dist/js/approved-service.js';
import {handleLux,luxRuntimeCredential,luxRuntimeWorkloadProof} from './lux.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const GEN=/^[a-f0-9]{32}$/,VER=/^[a-f0-9]{24}$/;
const PATHS=new Set(['/functions/v1/lumo-approved','/functions/v1/lumo-maintenance','/functions/v1/lumo-social','/functions/v1/lumo-business','/functions/v1/lumo-access','/api/lux','/auth/v1/token?grant_type=refresh_token','/auth/v1/logout?scope=local']);
const COOKIE=/^__Host-lumo-s-[a-f0-9]{32}-[a-f0-9]{24}$/;
const PROBE_COOKIE=/^__Host-lumo-p-[a-f0-9]{32}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=(code,message,status=400)=>({status,body:{ok:false,code,message},cookies:[]});
const selectors=s=>({generation:s.generation,version:s.version,owner:s.user.id});
const name=s=>'__Host-lumo-s-'+s.generation+'-'+s.version;
const cookieHeader=(key,value,maxAge)=>`${key}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
const parseCookies=value=>Object.fromEntries(String(value||'').split(';').slice(0,30).map(x=>x.trim().split(/=(.*)/s)).filter(x=>(COOKIE.test(x[0])||PROBE_COOKIE.test(x[0]))&&x[1]?.length<=3900).map(x=>[x[0],x[1]]));
const publicSession=s=>({transport:'http-only',webSessionId:s.generation,webSessionVersion:s.version,user:s.user,expires_at:s.expires_at});
const stripped=x=>Array.isArray(x)?x.map(stripped):object(x)?Object.fromEntries(Object.entries(x).filter(([k])=>!['access_token','refresh_token'].includes(k)).map(([k,v])=>[k,stripped(v)])):x;

export function createWebSessionHandler({key,origin='https://lumo-connected-pilot.vercel.app',fetcher=fetch,now=Date.now,lux=handleLux,luxOptions={},proxySigningKey,proxyKeyId=WEB_PROXY_KEY_ID,proxyPublicKeys=WEB_PROXY_PUBLIC_KEYS,clientIp,requireProxyContext=false}={}){
 const configured=typeof key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(key)&&Buffer.from(key,'base64url').length===32;
 const secret=configured?Buffer.from(key,'base64url'):null;
 let signingKey=null;try{if(typeof proxySigningKey==='string'){const parsed=createPrivateKey({key:Buffer.from(proxySigningKey,'base64url'),format:'der',type:'pkcs8'});const actual=createPublicKey(parsed).export({format:'jwk'}),expected=proxyPublicKeys[proxyKeyId];if(parsed.asymmetricKeyType==='ec'&&parsed.asymmetricKeyDetails?.namedCurve==='prime256v1'&&expected?.x===actual.x&&expected?.y===actual.y)signingKey=parsed;}}catch{}
 const ipHashKey=configured?hkdfSync('sha256',secret,Buffer.alloc(0),'lumo-web-ip-key-v1',32):null;
 const probeKey=configured?hkdfSync('sha256',secret,Buffer.alloc(0),'lumo-web-cookie-probe-key-v1',32):null;
 const probeValue=(id,time)=>String(time)+'.'+createHmac('sha256',probeKey).update(origin+'\0'+id+'\0'+time).digest('hex');
 function probeValid(id,cookies){
  if(!GEN.test(id||''))return false;const actual=cookies['__Host-lumo-p-'+id];if(typeof actual!=='string'||!/^\d{13}\.[a-f0-9]{64}$/.test(actual))return false;
  const time=Number(actual.split('.')[0]);if(time>now()+1000||now()-time>60000)return false;
  const expected=probeValue(id,time);return actual.length===expected.length&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
 }
 const allowed=new URL(origin);if(allowed.protocol!=='https:'||allowed.origin!==origin)throw Error('Use an exact HTTPS browser origin.');
 const aad=s=>Buffer.from('lumo-web-session-v1\0'+origin+'\0'+s.generation+'\0'+s.version);
 function seal(s){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',secret,iv);c.setAAD(aad(s));return [iv,Buffer.concat([c.update(JSON.stringify(s)),c.final()]),c.getAuthTag()].map(x=>x.toString('base64url')).join('.');}
 function open(raw,p){try{const a=raw.split('.').map(x=>Buffer.from(x,'base64url'));if(a.length!==3||a[0].length!==12||a[2].length!==16)return null;const c=createDecipheriv('aes-256-gcm',secret,a[0]);c.setAAD(aad(p));c.setAuthTag(a[2]);const s=JSON.parse(Buffer.concat([c.update(a[1]),c.final()]).toString());return s.generation===p.generation&&s.version===p.version&&s.user?.id===p.owner&&s.absoluteAt>now()&&s.cookieUntil>now()?s:null;}catch{return null;}}
 async function upstream(path,body,token){
  const proxyHeaders={};
  if(signingKey&&ipHashKey&&isIP(clientIp||'')){
   const context='v1.'+proxyKeyId+'.'+now()+'.'+createHmac('sha256',ipHashKey).update('lumo-web-ip-v1\0'+clientIp).digest('hex');
   const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
   proxyHeaders['x-lumo-web-context']=context;proxyHeaders['x-lumo-web-signature']=sign('sha256',Buffer.from(['lumo-web-proxy-v1',context,path.split('?')[0].split('/').filter(Boolean).at(-1),hash].join('\n')),{key:signingKey,dsaEncoding:'ieee-p1363'}).toString('hex');
  }
  const response=await fetcher(APPROVED_CONFIG.url+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:APPROVED_CONFIG.publishableKey,...proxyHeaders,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});if(response.redirected)throw Error('Redirect');let text=await response.text();if(text.length>8_388_608)throw Error('Response too large');return {status:response.status,body:response.status===204?{ok:true}:JSON.parse(text)};}
 async function verified(s,owner){
  if(!UUID.test(s?.user?.id||'')||owner&&s.user.id!==owner||typeof s.access_token!=='string'||s.access_token.length>16000||typeof s.refresh_token!=='string'||s.refresh_token.length>2048||!Number.isSafeInteger(s.expires_at))return false;
  const checked=await upstream('/functions/v1/lumo-approved',{action:'snapshot'},s.access_token);
  return checked.body?.ok===true&&checked.body?.account?.userId===s.user.id;
 }
 function issue(auth,previous,cookies){
  const generation=previous?.generation||randomBytes(16).toString('hex');
  const s={generation,version:randomBytes(12).toString('hex'),access_token:auth.access_token,refresh_token:auth.refresh_token,user:{id:auth.user.id,...typeof auth.user.email==='string'?{email:auth.user.email}:{}},expires_at:auth.expires_at,absoluteAt:previous?.absoluteAt||now()+7*86400000,cookieUntil:Math.min(now()+86400000,previous?.absoluteAt||now()+7*86400000)};
  const value=seal(s);if(value.length>3600)throw Error('Session too large');
  // Old rotation/account cookies are harmless without the selected public
  // pointer. Expire them; delayed responses can never overwrite this new name.
  const changed=Object.keys(cookies).filter(k=>k!==name(s)).map(k=>cookieHeader(k,'',0));
  changed.push(cookieHeader(name(s),value,Math.max(1,Math.floor((s.cookieUntil-now())/1000))));
  return {session:s,public:publicSession(s),cookies:changed};
 }
 return async({method='POST',headers={},body})=>{
  const h=new Headers(headers);
  if(method!=='POST')return fail('METHOD_NOT_ALLOWED','Use the Lumo application.',405);
  if(h.get('origin')!==origin||h.get('x-lumo-web')!=='1'||h.get('sec-fetch-site')&&h.get('sec-fetch-site')!=='same-origin')return fail('ORIGIN_NOT_ALLOWED','Open this request from Lumo.',403);
  if(!configured||requireProxyContext&&(!signingKey||!isIP(clientIp||'')))return fail('WEB_SESSION_UNAVAILABLE','Secure web sign-in is unavailable. Try again later.',503);
  if(!object(body)||JSON.stringify(body).length>1_150_000||Object.keys(body).some(k=>!['operation','path','body','authenticated','generation','version','owner','legacy','probe'].includes(k)))return fail('INVALID_INPUT','Review this request.');
  const cookies=parseCookies(h.get('cookie'));
  try{
   if(body.operation==='probe'){
    const id=randomBytes(16).toString('hex');return {status:200,body:{ok:true,probe:id},cookies:[cookieHeader('__Host-lumo-p-'+id,probeValue(id,now()),60)]};
   }
   if(body.operation==='probe-ack')return probeValid(body.probe,cookies)?{status:200,body:{ok:true},cookies:[]}:fail('WEB_COOKIES_REQUIRED','Open Lumo directly in your browser and allow its secure cookies to sign in.',401);
   const needsProbe=body.operation==='migrate'||body.operation==='proxy'&&body.path==='/functions/v1/lumo-approved'&&['login','register'].includes(body.body?.action);
   if(needsProbe&&!probeValid(body.probe,cookies))return fail('WEB_COOKIES_REQUIRED','Open Lumo directly in your browser and allow its secure cookies to sign in.',401);
   if(body.operation==='ack'){
    const p={generation:body.generation,version:body.version,owner:body.owner};
    const selected=GEN.test(p.generation||'')&&VER.test(p.version||'')&&UUID.test(p.owner||'')?open(cookies[name(p)]||'',p):null;
    return selected?{status:200,body:{ok:true},cookies:[]}:fail('WEB_COOKIES_REQUIRED','Open Lumo directly in your browser and allow its secure cookies to sign in.',401);
   }
   if(body.operation==='migrate'||body.operation==='logout-legacy'){
    const legacy=body.legacy;
    if(!object(legacy)||Object.keys(legacy).some(k=>!['access_token','refresh_token','user'].includes(k))||!UUID.test(legacy.user?.id||'')||!await verified({...legacy,expires_at:Math.floor(now()/1000)+60},legacy.user.id))return fail('AUTH_REQUIRED','Sign in again to secure this browser session.',401);
    if(body.operation==='logout-legacy'){
     const result=await upstream('/auth/v1/logout?scope=local',{},legacy.access_token);
     return {status:result.status,body:stripped(result.body),cookies:Object.keys(cookies).map(k=>cookieHeader(k,'',0))};
    }
    const refreshed=await upstream('/auth/v1/token?grant_type=refresh_token',{refresh_token:legacy.refresh_token});
    if(refreshed.status!==200||!await verified(refreshed.body,legacy.user.id))return fail('AUTH_REQUIRED','Sign in again to secure this browser session.',401);
    const issued=issue(refreshed.body,null,cookies);return {status:200,body:{ok:true,session:issued.public},cookies:issued.cookies};
   }
   if(body.operation!=='proxy'||!PATHS.has(body.path)||!object(body.body)||typeof body.authenticated!=='boolean')return fail('INVALID_INPUT','This service route is unavailable.');
   const p={generation:body.generation,version:body.version,owner:body.owner};
   const selected=GEN.test(p.generation||'')&&VER.test(p.version||'')&&UUID.test(p.owner||'')?open(cookies[name(p)]||'',p):null;
   const refresh=body.path==='/auth/v1/token?grant_type=refresh_token',logout=body.path==='/auth/v1/logout?scope=local';
   if((body.authenticated||refresh||logout)&&!selected)return fail('AUTH_REQUIRED','Sign in again to continue.',401);
   if(refresh){
    const refreshed=await upstream(body.path,{refresh_token:selected.refresh_token});
    if(refreshed.status!==200||!await verified(refreshed.body,selected.user.id))return fail('AUTH_REQUIRED','Sign in again to continue.',401);
    const issued=issue(refreshed.body,selected,cookies);return {status:200,body:issued.public,cookies:issued.cookies};
   }
   if(logout){
    const result=await upstream(body.path,{},selected.access_token);
    return {status:result.status,body:stripped(result.body),cookies:Object.keys(cookies).map(k=>cookieHeader(k,'',0))};
   }
   if(body.path==='/api/lux'){
    if(!body.authenticated)return fail('AUTH_REQUIRED','Sign in to ask about your money.',401);
    const result=await lux({method:'POST',authorization:'Bearer '+selected.access_token,origin,body:body.body},luxOptions);
    return {...result,body:stripped(result.body),cookies:[]};
   }
   if(body.path==='/functions/v1/lumo-approved'&&['login','register'].includes(body.body.action)&&body.body.mode==='merchant')return fail('PERSONAL_ACCOUNT_REQUIRED','Use the merchant application for staff access.');
   const result=await upstream(body.path,body.body,body.authenticated?selected.access_token:undefined);
   if(result.body?.session?.access_token){
    if(!['login','register'].includes(body.body.action)||body.authenticated||!await verified(result.body.session,result.body.account?.userId))return fail('AUTH_REQUIRED','This sign-in could not be confirmed.',401);
    const issued=issue(result.body.session,null,cookies);
    // Revoke the previously selected Auth session only on a confirmed new login.
    if(selected)try{await upstream('/auth/v1/logout?scope=local',{},selected.access_token);}catch{}
    return {status:result.status,body:{...stripped(result.body),session:issued.public},cookies:issued.cookies};
   }
   return {status:result.status,body:stripped(result.body),cookies:[]};
  }catch{return fail('WEB_SESSION_UNAVAILABLE','Lumo could not confirm this request. Keep its original reference and retry.',503);}
 };
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(Number(req.headers['content-length']||0)>1_150_000){res.statusCode=413;return res.end(JSON.stringify({ok:false,code:'TOO_LARGE'}));}
 let body;try{body=req.body;if(typeof body==='string')body=JSON.parse(body);}catch{res.statusCode=400;return res.end(JSON.stringify({ok:false,code:'INVALID_INPUT'}));}
 const run=createWebSessionHandler({key:process.env.LUMO_WEB_SESSION_KEY,requireProxyContext:true,proxySigningKey:process.env.LUMO_WEB_PROXY_SIGNING_KEY,clientIp:process.env.VERCEL==='1'?String(req.headers['x-vercel-forwarded-for']||'').trim():undefined,origin:process.env.LUMO_WEB_ORIGIN||'https://lumo-connected-pilot.vercel.app',luxOptions:{credential:luxRuntimeCredential(req.headers),serverProof:luxRuntimeWorkloadProof(req.headers)}});
 const result=await run({method:req.method,headers:req.headers,body});res.statusCode=result.status;if(result.cookies.length)res.setHeader('Set-Cookie',result.cookies);return res.end(JSON.stringify(result.body));
}
