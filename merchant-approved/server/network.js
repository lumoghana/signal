// D1 record shards isolate each merchant's history from other tenants.
// A record-set guard plus one transactional batch commits related wallet,
// business, access and idempotency changes together. Unrelated tenants can commit
// from the same read revision. Applied legacy data stays backed up.
export const NETWORK_VERSION=1;
export const emptyNetwork=()=>({version:NETWORK_VERSION,counters:{business:1000,shop:100000,account:100000},businesses:{},users:[],sessions:[],invitations:[],recoveries:[],wallets:{},studentSessions:[],devices:[],audit:[],attempts:{},rateLimits:{},refundAttempts:{},settlementAttempts:{},signupAttempts:{},importAttempts:{}});
const clone=value=>structuredClone(value);
export class APIError extends Error{
 constructor(message,status=400,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code}
}
const bytes=value=>new TextEncoder().encode(value).byteLength;
const encodeRecord=(id,kind,tenant,document)=>({id,kind,tenant:tenant||'',document:JSON.stringify(document)});
function flatten(n){
 const records=new Map(),add=(id,kind,tenant,value)=>records.set(id,encodeRecord(id,kind,tenant,value));
 add('meta:network','meta','',{version:NETWORK_VERSION,counters:n.counters});
 for(const [id,b]of Object.entries(n.businesses))add('business:'+id,'business',id,b);
 for(const [kind,key]of [['user','users'],['session','sessions'],['invitation','invitations'],['recovery','recoveries'],['device','devices'],['audit','audit']])for(const value of n[key]||[])add(kind+':'+value.id,kind,value.businessId||n.users.find(user=>user.id===value.userId)?.businessId||'',value);
 for(const [id,w]of Object.entries(n.wallets)){
  const {entries=[],...core}=w;add('wallet:'+id,'wallet',id,core);
  for(const entry of entries)add('wallet-entry:'+entry.id,'wallet-entry',id,{walletId:id,entry});
 }
 for(const s of n.studentSessions||[])add('student-session:'+s.id,'student-session',s.walletId,s);
 for(const [kind,key]of [['attempt','attempts'],['rate','rateLimits'],['refund-attempt','refundAttempts'],['settlement-attempt','settlementAttempts'],['signup-attempt','signupAttempts'],['import-attempt','importAttempts']])for(const [id,value]of Object.entries(n[key]||{}))add(kind+':'+id,kind,value.businessId||value.walletId||'',{key:id,value});
 return records;
}
function expand(rows){
 const n=emptyNetwork(),walletEntries=[],maps={'attempt':'attempts','rate':'rateLimits','refund-attempt':'refundAttempts','settlement-attempt':'settlementAttempts','signup-attempt':'signupAttempts','import-attempt':'importAttempts'},lists={user:'users',session:'sessions',invitation:'invitations',recovery:'recoveries',device:'devices',audit:'audit','student-session':'studentSessions'};
 for(const row of rows){
  let value;try{value=JSON.parse(row.document)}catch{throw new APIError('A shared record could not be read safely.',503,'STORAGE_INVALID')}
  if(row.kind==='meta'){if(value.version!==NETWORK_VERSION)throw new APIError('This app needs a storage upgrade.',503,'STORAGE_VERSION');n.counters=value.counters}
  else if(row.kind==='business')n.businesses[value.business.id]=value;
  else if(row.kind==='wallet')n.wallets[value.id]={...value,entries:[]};
  else if(row.kind==='wallet-entry')walletEntries.push(value);
  else if(lists[row.kind])n[lists[row.kind]].push(value);
  else if(maps[row.kind])n[maps[row.kind]][value.key]=value.value;
 }
 for(const {walletId,entry}of walletEntries)if(n.wallets[walletId])n.wallets[walletId].entries.push(entry);
 const order=(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.id||'').localeCompare(String(a.id||''));
 for(const w of Object.values(n.wallets))w.entries.sort(order);
 for(const key of ['users','sessions','invitations','recoveries','studentSessions','devices','audit'])n[key].sort(order);
 return n;
}
function validateRecord(record){
 const size=bytes(record.document),limit=record.kind==='business'?1500000:record.kind==='meta'?16000:record.kind==='user'?12000:record.kind==='wallet-entry'?8000:32000;
 if(size>limit)throw new APIError(record.kind==='business'?'This merchant workspace has reached its sandbox history allowance. Other merchants remain available. Export the history and ask the operator to archive it.':'This record exceeds its sandbox allowance.',507,'TENANT_CAPACITY');
}
async function ensureStorage(env){
 if(!env.DB?.prepare||!env.DB?.batch)throw new APIError('Shared storage is temporarily unavailable. Your browser data has not been changed.',503,'STORAGE_UNAVAILABLE');
 const clock=await env.DB.prepare('SELECT revision FROM lumo_storage_clock WHERE id = ?').bind('network').first();
 if(clock)return;
 for(let attempt=0;attempt<8;attempt++){
  const existing=await env.DB.prepare('SELECT revision FROM lumo_storage_clock WHERE id = ?').bind('network').first();if(existing)return;
  const legacy=await env.DB.prepare('SELECT revision, document FROM lumo_network WHERE id = ?').bind('network').first();
  let n=emptyNetwork();if(legacy){try{n={...emptyNetwork(),...JSON.parse(legacy.document)}}catch{throw new APIError('Saved data could not be migrated safely.',503,'STORAGE_INVALID')}if(n.version!==NETWORK_VERSION)throw new APIError('Saved data needs operator recovery.',503,'STORAGE_VERSION')}
  const records=[...flatten(n).values()];for(const r of records){if(r.kind==='business'&&bytes(r.document)<=1900000)continue;validateRecord(r)}
  const marker='bootstrap-'+crypto.randomUUID(),legacyRevision=Number(legacy?.revision||0),statements=[];
  const condition=legacy?'EXISTS (SELECT 1 FROM lumo_network WHERE id = ? AND revision = ?)':'NOT EXISTS (SELECT 1 FROM lumo_network WHERE id = ?)';
  statements.push(env.DB.prepare('INSERT INTO lumo_commit_guard (id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM lumo_storage_clock WHERE id = ?) AND '+condition).bind(marker,'network','network',...(legacy?[legacyRevision]:[])));
  let chunk=[];let chunkBytes=0;
  function appendChunk(){
   if(!chunk.length)return;
   statements.push(env.DB.prepare("INSERT INTO lumo_records (id, kind, tenant_id, revision, document, updated_at) SELECT json_extract(value, '$.id'), json_extract(value, '$.kind'), json_extract(value, '$.tenant'), 1, json_extract(value, '$.document'), ? FROM json_each(?) WHERE EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)").bind(new Date().toISOString(),JSON.stringify(chunk),marker));
   chunk=[];chunkBytes=0;
  }
  for(const record of records){const len=bytes(JSON.stringify(record));if(len>800000){appendChunk();statements.push(env.DB.prepare('INSERT INTO lumo_records (id, kind, tenant_id, revision, document, updated_at) SELECT ?, ?, ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)').bind(record.id,record.kind,record.tenant,record.document,new Date().toISOString(),marker));continue}if(chunkBytes+len>900000)appendChunk();chunk.push(record);chunkBytes+=len}appendChunk();
  if(legacy)statements.push(env.DB.prepare("UPDATE lumo_network SET revision = revision + 1, document = json_set(document, '$.version', 2, '$._storageMigrated', 'sharded-v2') WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)").bind('network',legacyRevision,marker));
  statements.push(env.DB.prepare('INSERT INTO lumo_storage_clock (id, revision) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)').bind('network',Math.max(1,legacyRevision),marker));
  statements.push(env.DB.prepare('DELETE FROM lumo_commit_guard WHERE id = ?').bind(marker));
  const results=await env.DB.batch(statements);if(Number(results[0].meta?.changes||0)===1)return;
 }
 throw new APIError('Storage migration is busy. Please retry.',503,'STORAGE_BUSY');
}
export async function readNetwork(env){
 await ensureStorage(env);
 const result=await env.DB.prepare("SELECT id, kind, tenant_id, revision, document FROM lumo_records UNION ALL SELECT '__clock', '__clock', '', revision, '{}' FROM lumo_storage_clock WHERE id = ?").bind('network').all();
 const rows=result.results||[],clock=rows.find(r=>r.kind==='__clock');
 if(!clock)throw new APIError('Shared storage is not ready.',503,'STORAGE_UNAVAILABLE');
 const records=rows.filter(r=>r.kind!=='__clock');
 return {revision:Number(clock.revision),state:expand(records),records:new Map(records.map(r=>[r.id,r]))};
}
// Mutation handlers change records within the affected merchant/wallet scopes.
// Guard the complete original row set in each affected scope, not just its writes:
// this also protects session revocation, role changes, device readiness and new
// membership rows on which an action depends. Read-only merchant/wallet snapshots
// included in a mutation response are dependencies too: a new global response
// revision must never certify an older snapshot from outside the write scopes.
// Global allocations and retry keys
// are checked by exact record version/absence. Username uniqueness is checked in
// the same SQL transaction, including concurrent invitations across businesses.
function commitConditions(before,next,changes,deletions,result){
 const scopes=new Set([result?.data?.state?.business?.id,result?.data?.student?.id,result?.data?.wallet?.id,...(result?.readScopes||[])].filter(Boolean)),ids=new Set([...changes.map(record=>record.id),...deletions]);
 for(const id of ids){for(const record of [before.get(id),next.get(id)])if(record?.tenant||record?.tenant_id)scopes.add(record.tenant||record.tenant_id);}
 const expected=[];
 for(const record of before.values())if(ids.has(record.id)||scopes.has(record.tenant_id))expected.push({id:record.id,revision:Number(record.revision)});
 const absent=[...ids].filter(id=>!before.has(id));
 const users=changes.filter(record=>record.kind==='user').map(record=>{const user=JSON.parse(record.document);return {id:record.id,username:user.username}});
 return {scopes:[...scopes],expected,absent,users};
}
export async function updateNetwork(env,mutate){
 for(let attempt=0;attempt<16;attempt++){
  const {revision,state,records:before}=await readNetwork(env),draft=clone(state),result=await mutate(draft,{revision});
  if(result?.unchanged)return {...result,revision};
  const next=flatten(draft),changes=[],deletions=[];
  for(const [id,r]of next)if(before.get(id)?.document!==r.document){validateRecord(r);changes.push(r)}
  for(const id of before.keys())if(!next.has(id))deletions.push(id);
  if(!changes.length&&!deletions.length)return {...result,revision};
  if(changes.length+deletions.length>600)throw new APIError('This update is too large. Import a smaller history or ask the operator for help.',413,'UPDATE_TOO_LARGE');
  const guard=commitConditions(before,next,changes,deletions,result),marker='commit-'+crypto.randomUUID();
  const guardSQL=`INSERT INTO lumo_commit_guard (id) SELECT ?
   WHERE EXISTS (SELECT 1 FROM lumo_storage_clock WHERE id = 'network')
   AND NOT EXISTS (SELECT 1 FROM json_each(?) expected LEFT JOIN lumo_records saved ON saved.id = json_extract(expected.value, '$.id') WHERE saved.id IS NULL OR saved.revision <> json_extract(expected.value, '$.revision'))
   AND NOT EXISTS (SELECT 1 FROM lumo_records saved JOIN json_each(?) scope ON saved.tenant_id = scope.value WHERE NOT EXISTS (SELECT 1 FROM json_each(?) expected WHERE json_extract(expected.value, '$.id') = saved.id))
   AND NOT EXISTS (SELECT 1 FROM lumo_records saved JOIN json_each(?) missing ON saved.id = missing.value)
   AND NOT EXISTS (SELECT 1 FROM json_each(?) candidate JOIN lumo_records saved ON saved.kind = 'user' AND json_extract(saved.document, '$.username') = json_extract(candidate.value, '$.username') WHERE saved.id <> json_extract(candidate.value, '$.id'))`;
  const expectedJSON=JSON.stringify(guard.expected),statements=[env.DB.prepare(guardSQL).bind(marker,expectedJSON,JSON.stringify(guard.scopes),expectedJSON,JSON.stringify(guard.absent),JSON.stringify(guard.users))];
  for(const r of changes){
   const previous=before.get(r.id);
   if(previous)statements.push(env.DB.prepare('UPDATE lumo_records SET kind = ?, tenant_id = ?, revision = ?, document = ?, updated_at = ? WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)').bind(r.kind,r.tenant,Number(previous.revision)+1,r.document,new Date().toISOString(),r.id,Number(previous.revision),marker));
   else statements.push(env.DB.prepare('INSERT INTO lumo_records (id, kind, tenant_id, revision, document, updated_at) SELECT ?, ?, ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)').bind(r.id,r.kind,r.tenant,r.document,new Date().toISOString(),marker));
  }
  for(const id of deletions)statements.push(env.DB.prepare('DELETE FROM lumo_records WHERE id = ? AND EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)').bind(id,marker));
  // This sequence numbers completed responses; it no longer rejects an unrelated
  // merchant's commit. SELECT is in the same batch to return this commit's clock.
  statements.push(env.DB.prepare('UPDATE lumo_storage_clock SET revision = revision + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM lumo_commit_guard WHERE id = ?)').bind('network',marker));
  statements.push(env.DB.prepare('SELECT revision FROM lumo_storage_clock WHERE id = ?').bind('network'));
  statements.push(env.DB.prepare('DELETE FROM lumo_commit_guard WHERE id = ?').bind(marker));
  const writes=await env.DB.batch(statements);if(Number(writes[0].meta?.changes||0)===1)return {...result,revision:Number(writes.at(-2).results[0].revision)};
 }
 throw new APIError('This merchant or wallet changed while the request was being checked. Retry with the same reference; nothing will be submitted twice.',409,'CONCURRENT_UPDATE');
}

export const uid=prefix=>prefix+'-'+crypto.randomUUID();
export const iso=()=>new Date().toISOString();
export const toBase64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
const fromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function hashToken(value){return toBase64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))))}
export async function makePassword(password){
 validatePassword(password);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const hash=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);
 return {salt:toBase64(salt),hash:toBase64(hash),iterations:100000,algorithm:'PBKDF2-SHA256'};
}
export async function matchesPassword(password,record){
 if(!record?.salt||!record?.hash||typeof password!=='string'||password.length>128)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const hash=await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromBase64(record.salt),iterations:record.iterations,hash:'SHA-256'},key,256);
 const a=new Uint8Array(hash),b=fromBase64(record.hash);let diff=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a[i]||0)^(b[i]||0);
 return diff===0;
}
export function validatePassword(value){
 if(typeof value!=='string'||value.length<10||value.length>128||!/[A-Za-z]/.test(value)||!/\d/.test(value))throw new APIError('Use 10–128 characters with at least one letter and one number.');
 return value;
}
export function username(value){
 const s=String(value||'').trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9._]{2,23}$/.test(s))throw new APIError('Choose a username of 3–24 letters, numbers, dots or underscores.');
 return s;
}
export function text(value,label,max=100){
 const s=String(value??'').trim();if(!s||s.length>max)throw new APIError(`${label} is required and must be ${max} characters or fewer.`);return s;
}
export function phone(value){
 const s=String(value||'').replace(/\D/g,'');
 if(/^0[1-9]\d{8}$/.test(s))return '+233'+s.slice(1);
 if(/^233[1-9]\d{8}$/.test(s))return '+'+s;
 if(/^[1-9]\d{8}$/.test(s))return '+233'+s;
 throw new APIError('Enter a valid Ghana mobile number.');
}
export function publicUser(u){if(!u)return null;return {id:u.id,businessId:u.businessId,username:u.username,name:u.name,phone:u.phone,role:u.role,shopIds:[...u.shopIds],active:u.active,createdAt:u.createdAt,updatedAt:u.updatedAt,passwordChangedAt:u.passwordChangedAt,requiresPasswordReset:!!u.requiresPasswordReset}}
export function audit(n,type,businessId,userId,detail={}){
 n.audit.unshift({id:uid('audit'),type,businessId,userId,detail,createdAt:iso()});const own=n.audit.filter(entry=>entry.businessId===businessId),remove=new Set(own.slice(1200).map(entry=>entry.id));n.audit=n.audit.filter(entry=>!remove.has(entry.id));
}
export function rateLimit(n,key,limit=20,windowMs=60000){
 const now=Date.now(),r=n.rateLimits[key];
 if(!r||now-r.startedAt>windowMs)n.rateLimits[key]={count:1,startedAt:now,windowMs};
 else{r.count++;if(r.count>limit)throw new APIError('Too many attempts. Please wait a minute before trying again.',429,'RATE_LIMITED')}
 const keys=Object.keys(n.rateLimits);if(keys.length>2000){let removed=0;for(const k of keys)if(now-n.rateLimits[k].startedAt>(n.rateLimits[k].windowMs||60000)){delete n.rateLimits[k];if(++removed>=100)break}}
}
export function cookieToken(request,name='lumo_session'){
 const item=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
 if(!item)return '';try{return decodeURIComponent(item.slice(name.length+1))}catch{return ''}
}
export function sessionCookie(token,remember=false,name='lumo_session'){
 return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax${remember?'; Max-Age=2592000':''}`;
}
export function clearCookie(name='lumo_session'){return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
export function resolveSession(n,tokenHash){
 const s=n.sessions.find(s=>s.tokenHash===tokenHash),u=n.users.find(u=>u.id===s?.userId);
 if(!s||!u?.active||s.revokedAt||Date.parse(s.expiresAt)<=Date.now()||s.userVersion!==(u.sessionVersion||1))return null;
 return {session:s,user:u};
}
export function publicSession(s,u){return {id:s.id,userId:u.id,businessId:u.businessId,role:u.role,shopIds:[...u.shopIds],username:u.username,name:u.name,phone:u.phone,createdAt:s.createdAt,lastSeen:s.lastSeen,expiresAt:s.expiresAt,remember:!!s.remember,deviceLabel:s.deviceLabel||'Browser',recoveryKeyPending:u.recoveryKeyPending===true,recoveryKeyReference:u.recoveryKeyPending===true?u.recoveryKeyReference||null:null}}
export function requireSession(n,tokenHash,owner=false){
 const c=resolveSession(n,tokenHash);if(!c)throw new APIError('Sign in to continue.',401,'SIGN_IN_REQUIRED');
 if(owner&&c.user.role!=='owner')throw new APIError('Only the business owner can do that.',403,'OWNER_REQUIRED');
 return c;
}
export function revokeSessions(n,userId,reason,except){
 for(const s of n.sessions)if(s.userId===userId&&s.id!==except&&!s.revokedAt){s.revokedAt=iso();s.revokeReason=reason}
}
export function newSession(n,u,tokenHash,remember=false,label='Browser'){
 const s={id:uid('session'),userId:u.id,businessId:u.businessId,userVersion:u.sessionVersion||1,tokenHash,createdAt:iso(),lastSeen:iso(),expiresAt:new Date(Date.now()+(remember?30*86400000:12*3600000)).toISOString(),remember,deviceLabel:label.slice(0,80)};
 n.sessions.unshift(s);const own=n.sessions.filter(item=>item.userId===u.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));const remove=new Set(own.slice(20).slice(-100).map(item=>item.id));n.sessions=n.sessions.filter(item=>!remove.has(item.id));return s;
}
export function assigned(n,u,shopId){
 const b=n.businesses[u.businessId];if(!b?.shops.some(s=>s.id===shopId))throw new APIError('Shop not found.',404);
 if(u.role!=='owner'&&!u.shopIds.includes(shopId))throw new APIError('This shop is outside your assigned access.',403);
 return b;
}
export function validateShops(b,ids,required=true){
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!b.shops.some(s=>s.id===id)))throw new APIError('Choose valid shops in this business.');
 const clean=[...new Set(ids)];if(required&&!clean.length)throw new APIError('Assign at least one shop.');return clean;
}
export function projectUsers(n,b){
 const linked=n.users.filter(u=>u.businessId===b.business.id&&u.role!=='owner');
 b.staff=b.staff||[];
 b.staff=b.staff.map(s=>({...s,active:false}));
 for(const u of linked){
  const p={id:'access-'+u.id,authUserId:u.id,name:u.name,phone:u.phone,role:u.role,shopId:u.shopIds[0]||null,shopIds:[...u.shopIds],active:u.active};
  const old=b.staff.find(s=>s.id===p.id);if(old)Object.assign(old,p);else b.staff.push({...p,createdAt:iso()});
 }
 for(const shop of b.shops){const manager=linked.find(u=>u.active&&u.role==='manager'&&u.shopIds.includes(shop.id));shop.manager=manager?.name||b.business.ownerName||'Unassigned'}
}
export function scopedBusiness(b,u){
 const c=clone(b);if(u.role==='owner')return c;
 const allowed=new Set(u.shopIds);
 c.shops=c.shops.filter(s=>allowed.has(s.id));
 for(const key of ['transactions','requests','closings','refunds','tickets','shifts','reconciliations'])c[key]=(c[key]||[]).filter(x=>allowed.has(x.shopId));
 c.staff=c.staff.filter(s=>(u.role!=='cashier'||s.active)&&(s.shopIds||[s.shopId]).some(id=>allowed.has(id))).map(s=>{const ids=(s.shopIds||[s.shopId]).filter(id=>allowed.has(id)),scope={shopIds:ids,shopId:allowed.has(s.shopId)?s.shopId:ids[0]};return u.role==='cashier'?{id:s.id,name:s.name,role:s.role,active:s.active,...scope,...(s.authUserId===u.id?{authUserId:s.authUserId}: {})}:{...s,...scope}});
 c.settlements=[];c.openingBalance=0;c.audit=[];
 c.business={id:c.business.id,name:c.business.name,accountNumber:c.business.accountNumber,bankName:c.business.bankName,verificationStatus:c.business.verificationStatus,registeredAt:c.business.registeredAt};
 c.accessScope='shops';return c;
}
export function publicShop(b,s){return {id:s.id,businessId:b.business.id,businessName:b.business.name,name:s.name,area:s.area,category:s.category,code:s.code,accountNumber:b.business.accountNumber,lat:s.lat,lng:s.lng,hours:s.hours||'',landmark:s.landmark||'',open:s.open!==false,accepting:!!s.accepting,published:s.published===true,sandbox:true}}
export function publicInvitation(i){
 if(!i)return null;
 return {id:i.id,token:i.token,businessId:i.businessId,name:i.name,phone:i.phone,role:i.role,shopIds:[...i.shopIds],createdAt:i.createdAt,expiresAt:i.expiresAt,status:i.status};
}
export function walletInfo(w,{cursor='',limit=25}={}){
 if(!w)return null;
 const size=Math.min(100,Math.max(1,Number.isSafeInteger(Number(limit))?Number(limit):25)),all=w.entries||[];
 let start=0;if(cursor){const at=all.findIndex(entry=>entry.id===cursor);if(at<0)throw new APIError('This history cursor does not belong to this wallet.',400,'INVALID_CURSOR');start=at+1}
 const entries=all.slice(start,start+size),history={nextCursor:start+entries.length<all.length?entries.at(-1)?.id||null:null,total:all.length,limit:size};
 return {id:w.id,name:w.name,balance:w.balance,currency:'GHS',sandbox:true,entries,history};
}
