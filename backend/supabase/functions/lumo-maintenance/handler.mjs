import {createApprovedHandler} from './approved/handler.mjs';

export const MAINTENANCE_ORIGINS=Object.freeze([
 'https://lumo-connected-pilot.vercel.app',
 'https://lumo-new-experience.oness15.chatgpt.site',
]);
export const MAINTENANCE_TYPES=Object.freeze([
 'externalMovement','confirmExternalBalance','saveCommitment','reuseEssentialPlan',
 'setEssentialRecurring','setMaintenancePreferences','completeMoneyCheck',
]);
const types=new Set(MAINTENANCE_TYPES),keys=new Set(['action','type','payload','attemptId']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const MAX_BODY_BYTES=131072;

/** A separate, record-only endpoint. The original gateway is not replaced. */
export function createMaintenanceHandler({supabaseUrl,serviceRoleKey,allowedOrigins=MAINTENANCE_ORIGINS,fetch,crypto}={}){
 const origins=new Set(allowedOrigins);
 const approved=createApprovedHandler({supabaseUrl,serviceRoleKey,allowedOrigins:[...origins],fetch,crypto,merchantHandler:null,availabilityEnabled:false});
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff',Vary:'Origin',
   ...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info','Access-Control-Max-Age':'600'}:{})};
  const reject=(code,message,status=400)=>new Response(JSON.stringify({ok:false,sandbox:true,currency:'GHS',code,message,noMutation:true,result:{ok:false,message}}),
   {status,headers:{...headers,'X-Lumo-Outcome':'rejected','X-Lumo-Error-Code':code,'X-Lumo-No-Mutation':'true'}});
  if(origin&&!origins.has(origin))return reject('ORIGIN_NOT_ALLOWED','This app origin is not allowed.',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reject('METHOD_NOT_ALLOWED','Use a POST request to update money records.',405);
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reject('INVALID_INPUT','Use a JSON record update.');
  let body;
  try{
   const reader=request.body?.getReader();if(!reader)return reject('INVALID_INPUT','Provide the record update.');
   const parts=[];let length=0;
   try{
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
     if(length>MAX_BODY_BYTES){await reader.cancel();return reject('REQUEST_TOO_LARGE','This record update is too large.',413);}parts.push(value);
    }
   }finally{reader.releaseLock();}
   const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
   body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{return reject('INVALID_INPUT','Provide a valid JSON record update.');}
  if(!plain(body)||Object.keys(body).length!==4||Object.keys(body).some(key=>!keys.has(key))
   ||!['action','recover'].includes(body.action)||!types.has(body.type)||!plain(body.payload)||!/^[A-Za-z0-9_.:-]{10,100}$/.test(body.attemptId||''))
   return reject('MAINTENANCE_ACTION_REQUIRED','Choose one of the supported money-record updates.');
  // Only these four validated keys reach the reused authenticated transaction
  // path. Registration, login, merchant and all money operations stop above.
  const forwardedHeaders=new Headers(request.headers);forwardedHeaders.delete('content-length');
  return approved(new Request(request.url,{method:'POST',headers:forwardedHeaders,body:JSON.stringify({action:body.action,type:body.type,payload:body.payload,attemptId:body.attemptId}),signal:request.signal}));
 };
}
