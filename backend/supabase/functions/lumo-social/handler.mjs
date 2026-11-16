const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const strict=(x,keys)=>plain(x)&&Object.keys(x).every(k=>keys.includes(k));
const LISTS=['Circle','Crew','Lumo Squad','Study Buddies'];
const MESSAGES={AUTH_REQUIRED:'Sign in to continue.',SESSION_REVOKED:'This session has ended. Sign in again.',ACCOUNT_REQUIRED:'Open an active personal Lumo account to use friends and notifications.',FORBIDDEN:'This action is not available to this account.',INVALID_INPUT:'Check the details and try again.',NOT_FOUND:'This item is no longer available. Refresh and try again.',RECIPIENT_NOT_FOUND:'This Lumo account is not available. Check the username.',SELF_FRIEND:'Choose another Lumo account to add as a friend.',REVISION_CONFLICT:'Your friends or groups changed. Refresh them before saving.',IDEMPOTENCY_CONFLICT:'This request reference was already used for different details.',FRIEND_LIMIT:'Your friends list can hold up to 200 people. Remove someone before adding another.',GROUP_LIMIT:'You can have up to 50 friend groups. Delete a group before creating another.',GROUP_NAME_TAKEN:'You already have a group with this name. Choose another name.',GROUP_NOT_FOUND:'This group is no longer available. Refresh your friends list.',GROUP_UNAVAILABLE:'This group has been deleted. Update Lumo to choose a current group.',RATE_LIMITED:'Too many changes. Try again later.',SERVICE_UNAVAILABLE:'Lumo could not confirm this request. Try again shortly.',ORIGIN_NOT_ALLOWED:'This app origin is not allowed.'};
const fail=(code,status=400)=>Object.assign(new Error(MESSAGES[code]||MESSAGES.SERVICE_UNAVAILABLE),{code,status});
// Keep the Unicode category rule aligned with social_group_name in the migration.
export function normalizeGroupName(value){
 if(typeof value!=='string')return null;
 const name=value.trim().normalize('NFC'),withoutJoiners=name.replace(/[\u200c\u200d]/gu,'');
 return [...name].length>=1&&[...name].length<=40&&withoutJoiners.trim().length>0&&!/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(withoutJoiners)?name:null;
}
async function bodyOf(req){
 if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw fail('INVALID_INPUT');
 const reader=req.body?.getReader();if(!reader)throw fail('INVALID_INPUT');const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){void reader.cancel();throw fail('INVALID_INPUT',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!plain(body))throw Error();return body;}catch{throw fail('INVALID_INPUT');}
}
function claims(token){try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{throw fail('AUTH_REQUIRED',401);}}
export function socialCommand(body){
 if(!plain(body))throw fail('INVALID_INPUT');
 const {action,operation}=body;
 const v2=body.schemaVersion===2;
 if(action==='friends'&&body.schemaVersion!==undefined&&!v2)throw fail('INVALID_INPUT');
 const versionKeys=v2?['schemaVersion']:[];
 if(action==='friends'&&operation==='list'&&strict(body,['action','operation',...versionKeys]))return {command:'friends.list',payload:v2?{schemaVersion:2}:{}};
 if(action==='friends'&&['save','remove'].includes(operation)){
  const keys=['action','operation','recipientId','requestId','revision',...versionKeys,...(operation==='save'?[v2?'groupId':'listName']:[])];
  if(!strict(body,keys)||!UUID.test(body.recipientId||'')||!UUID.test(body.requestId||'')||body.revision!==undefined&&(!Number.isSafeInteger(body.revision)||body.revision<1)||operation==='save'&&(v2?body.groupId!==null&&!UUID.test(body.groupId||''):!LISTS.includes(body.listName))||operation==='remove'&&body.revision===undefined)throw fail('INVALID_INPUT');
  const {action:_a,operation:_o,...payload}=body;return {command:'friends.'+operation,payload};
 }
 if(action==='friends'&&v2&&['createGroup','renameGroup','deleteGroup'].includes(operation)){
  const keys=['action','operation','schemaVersion','requestId',...(operation!=='createGroup'?['groupId','revision']:[]),...(operation!=='deleteGroup'?['name']:[])];
  const name=operation==='deleteGroup'?undefined:normalizeGroupName(body.name);
  if(!strict(body,keys)||!UUID.test(body.requestId||'')||operation!=='createGroup'&&(!UUID.test(body.groupId||'')||!Number.isSafeInteger(body.revision)||body.revision<1)||operation!=='deleteGroup'&&name===null)throw fail('INVALID_INPUT');
  const {action:_a,operation:_o,...payload}=body;return {command:'friends.'+operation,payload:{...payload,...(name===undefined?{}:{name})}};
 }
 if(action==='notifications'&&operation==='list'&&strict(body,['action','operation','page','pageSize'])){
  const page=body.page??1,pageSize=body.pageSize??30;if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)throw fail('INVALID_INPUT');
  return {command:'notifications.list',payload:{page,pageSize}};
 }
 if(action==='notifications'&&operation==='read'&&strict(body,['action','operation','notificationId'])&&typeof body.notificationId==='string'&&/^(payment|partner|support):[A-Za-z0-9_.:-]{1,220}$/.test(body.notificationId))return {command:'notifications.read',payload:{notificationId:body.notificationId}};
 throw fail('INVALID_INPUT');
}
export function createSocialHandler({supabaseUrl,serviceRoleKey,allowedOrigins=[],fetch:transport=globalThis.fetch}={}){
 const base=new URL(supabaseUrl);if(base.protocol!=='https:'||base.pathname!=='/'||!serviceRoleKey)throw Error('Invalid social service configuration');const origins=new Set(allowedOrigins);
 async function upstream(path,body,token=serviceRoleKey){
  let r,d;try{r=await transport(base.origin+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:serviceRoleKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});d=await r.json();}catch{throw fail('SERVICE_UNAVAILABLE',503);}return {ok:r.ok,status:r.status,data:d};
 }
 return async req=>{
  const origin=req.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff',Vary:'Origin',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type','Access-Control-Max-Age':'600'}:{})};
  const respond=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
  try{
   if(origin&&!origins.has(origin))throw fail('ORIGIN_NOT_ALLOWED',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(req.method!=='POST')return respond({ok:false,code:'METHOD_NOT_ALLOWED',message:'Use POST.'},405);
   const parsed=socialCommand(await bodyOf(req)),token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(!token||token.length>16384)throw fail('AUTH_REQUIRED',401);
   const user=await upstream('/auth/v1/user',undefined,token);if(!user.ok||!UUID.test(user.data?.id||'')||user.data.is_anonymous===true)throw fail('AUTH_REQUIRED',401);
   const jwt=claims(token);if(jwt.sub!==user.data.id||!UUID.test(jwt.session_id||'')||!Number.isFinite(jwt.exp)||jwt.exp*1000<=Date.now())throw fail('AUTH_REQUIRED',401);
   const result=await upstream('/rest/v1/rpc/lumo_social',{p_command:parsed.command,p_payload:{...parsed.payload,actor:user.data.id,session:jwt.session_id}});
   if(!result.ok||!plain(result.data)||typeof result.data.ok!=='boolean')throw fail('SERVICE_UNAVAILABLE',503);
   if(!result.data.ok){const code=Object.hasOwn(MESSAGES,result.data.code)?result.data.code:'SERVICE_UNAVAILABLE';throw fail(code,['AUTH_REQUIRED','SESSION_REVOKED'].includes(code)?401:['FORBIDDEN','ACCOUNT_REQUIRED'].includes(code)?403:code==='RATE_LIMITED'?429:code==='SERVICE_UNAVAILABLE'?503:400);}
   return respond(result.data);
  }catch(e){return respond({ok:false,code:e.code||'SERVICE_UNAVAILABLE',message:MESSAGES[e.code]||MESSAGES.SERVICE_UNAVAILABLE},e.status||503);}
 };
}
