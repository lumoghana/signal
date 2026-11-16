const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const claims=token=>{try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{return null;}};
export function createQuotaHandler({supabaseUrl,serviceRoleKey,verifyServerProof,fetch:transport=globalThis.fetch}){
 const base=new URL(supabaseUrl);if(base.protocol!=='https:'||base.pathname!=='/'||!serviceRoleKey||typeof verifyServerProof!=='function')throw Error('Invalid quota configuration');
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 const upstream=async(path,token,body)=>{
  const result=await transport(base.origin+path,{method:body===undefined?'GET':'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4000),headers:{apikey:serviceRoleKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!result.ok)throw Error('Upstream denied');return result.json();
 };
 return async request=>{
  if(request.method!=='POST')return response({allowed:false,reason:'METHOD_NOT_ALLOWED'},405);
  // Browsers do not receive CORS access, and only a verified production workload
  // proof can reach Auth or the reservation RPC. A customer JWT alone cannot.
  const proof=request.headers.get('x-lumo-workload-proof');
  if(!await verifyServerProof(proof))return response({allowed:false,reason:'SERVER_REQUIRED'},403);
  const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/)?.[1];
  if(!token||token.length>16000)return response({allowed:false,reason:'AUTH_REQUIRED'},401);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return response({allowed:false,reason:'INVALID_INPUT'},400);
  // The protocol carries no question, account fields, amounts or credentials.
  // Read only a bounded empty JSON object, never an arbitrary request body.
  try{
   const reader=request.body?.getReader();if(!reader)return response({allowed:false,reason:'INVALID_INPUT'},400);let size=0,text='';
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>64){await reader.cancel();return response({allowed:false,reason:'INVALID_INPUT'},400);}text+=new TextDecoder().decode(part.value);}}finally{reader.releaseLock();}
   const body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)return response({allowed:false,reason:'INVALID_INPUT'},400);
   const user=await upstream('/auth/v1/user',token),jwt=claims(token);
   if(!UUID.test(user?.id||'')||user.app_metadata?.lumo_pilot!==true||jwt?.sub!==user.id||!UUID.test(jwt?.session_id||''))return response({allowed:false,reason:'AUTH_REQUIRED'},401);
   const result=await upstream('/rest/v1/rpc/lumo_lux_reserve_server',serviceRoleKey,{p_payload:{actor:user.id,session:jwt.session_id}});
   if(result.allowed===true)return response({allowed:true});
   return response({allowed:false,reason:['AI_DAILY_CAP','AI_RATE_LIMITED'].includes(result.reason)?result.reason:'AI_QUOTA_UNAVAILABLE'});
  }catch{return response({allowed:false,reason:'AI_QUOTA_UNAVAILABLE'},503);}
 };
}
