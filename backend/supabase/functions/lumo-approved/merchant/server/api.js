import {mutateBusinessPlan,prepareImportedBusinessPlan} from './planning.js';
import {counterAction,publicCounter,counterScope,cashierRoster,lockedCounterState} from './counter.js';
import {createBusiness,reduceBusiness,metricsFor,applyAutomaticClosings} from '../dist/domain.js';
import {APIError,readNetwork,updateNetwork,uid,iso,randomToken,hashToken,makePassword,matchesPassword,validatePassword,username,text,phone,publicUser,audit,rateLimit,cookieToken,sessionCookie,clearCookie,resolveSession,publicSession,requireSession,revokeSessions,newSession,assigned,validateShops,projectUsers,scopedBusiness,publicShop,publicInvitation,walletInfo} from './network.js';
const copy=x=>structuredClone(x);
const paymentForStudent=t=>t?{id:t.id,shopId:t.shopId,amount:t.amount,status:t.status,payer:t.payer,createdAt:t.createdAt,confirmedAt:t.confirmedAt||t.createdAt,reference:t.reference,method:t.method,requestId:t.requestId||null,sandbox:true}:null;
const recoveryNormalize=s=>String(s||'').replace(/[\s-]/g,'').toUpperCase();
const recoveryHash=s=>hashToken(recoveryNormalize(s));
const newRecoveryKey=()=>('LUMO-'+randomToken().slice(0,32).toUpperCase().match(/.{4}/g).join('-'));
function response(data,status=200,cookies=[]){
 const h=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 for(const cookie of cookies)h.append('Set-Cookie',cookie);
 return new Response(JSON.stringify({sandbox:true,bankConnected:false,smsConnected:false,...data}),{status,headers:h});
}
function publicSessions(n,c){
 return n.sessions.filter(s=>s.businessId===c.user.businessId&&(c.user.role==='owner'||s.userId===c.user.id)).map(s=>{
  const u=n.users.find(u=>u.id===s.userId);return {...publicSession(s,u||c.user),active:!!u?.active&&!s.revokedAt&&Date.parse(s.expiresAt)>Date.now()&&s.userVersion===(u?.sessionVersion||1),revokedAt:s.revokedAt||null,revokeReason:s.revokeReason||null};
 });
}
function studentFor(n,hash){
 const s=n.studentSessions.find(s=>s.tokenHash===hash&&Date.parse(s.expiresAt)>Date.now());return s?n.wallets[s.walletId]||null:null;
}
function publicWallet(n,w,options){
 const info=walletInfo(w,options);if(!info)return info;
 const attempts=new Map(Object.entries(n.attempts||{}).filter(([key])=>key.startsWith(w.id+':')).map(([key,value])=>[value.transactionId,{...value,attemptId:key.slice(w.id.length+1)}]));
 info.entries=(info.entries||[]).map(entry=>{if(entry.type!=='merchant-payment')return entry;const attempt=attempts.get(entry.transactionId),payment=attempt&&n.businesses[attempt.businessId]?.transactions.find(t=>t.id===entry.transactionId);return {...entry,...(attempt?{attemptId:attempt.attemptId}:{}),...(payment?{status:payment.status,confirmedAt:payment.confirmedAt||payment.createdAt}:{} )}});
 return info;
}
function ensureTestAcceptanceTokens(b){let changed=false;for(const shop of b.shops||[])if(typeof shop.testAcceptanceToken!=='string'||!/^[a-f0-9]{64}$/.test(shop.testAcceptanceToken)){shop.testAcceptanceToken=randomToken();changed=true}return changed}
function bundle(n,tokenHash,studentHash,extra={}){
 const c=resolveSession(n,tokenHash),w=studentFor(n,studentHash);
 if(!c)return {counterTransport:false,counter:null,session:null,user:null,state:null,users:[],invitations:[],sessions:[],audit:[],devices:[],student:publicWallet(n,w),...extra};
 const b=n.businesses[c.user.businessId],scoped=c.locked?lockedCounterState(n,c):b?counterScope(n,c,scopedBusiness(b,c.user)):null;if(scoped)scoped.shopReadiness=readiness(n,b,new Set(c.user.role==='owner'?b.shops.map(s=>s.id):c.user.shopIds));
 return {counterTransport:!!c.counter,counter:publicCounter(n,c),session:publicSession(c.session,c.user),user:publicUser(c.user),state:scoped,metrics:b?c.user.role==='owner'?metricsFor(b):null:null,
  users:n.users.filter(u=>u.businessId===c.user.businessId&&(c.user.role==='owner'||u.id===c.user.id)).map(publicUser),
  invitations:c.user.role==='owner'?n.invitations.filter(i=>i.businessId===c.user.businessId).map(publicInvitation):[],
  sessions:c.counter?[]:publicSessions(n,c),audit:c.counter?[]:n.audit.filter(a=>a.businessId===c.user.businessId&&(c.user.role==='owner'||a.userId===c.user.id)).slice(0,300),
  devices:n.devices.filter(d=>d.businessId===c.user.businessId&&(c.counter?d.id===c.counter.deviceId:c.user.role==='owner'||d.userId===c.user.id)).map(d=>publicDevice(d,n)),
  student:publicWallet(n,w),...extra};
}
function publicDevice(d,n){return {id:d.id,businessId:d.businessId,shopId:d.shopId,userId:d.userId,label:d.label,enabled:d.enabled,revokedAt:d.revokedAt||null,lastSeen:d.lastSeen,testedAt:d.testedAt||null,createdAt:d.createdAt,pairedAt:d.pairedAt||d.createdAt,sessionId:d.sessionId||null,soundReady:d.soundReady===true,announcementFailed:d.announcementFailed===true,failureVersion:Number.isSafeInteger(d.failureVersion)?d.failureVersion:0,sessionValid:!!n&&deviceValid(n,d)}}
function allocateBusiness(n,b){
 const businessId=crypto.randomUUID(),oldId=b.business.id;b.business.id=businessId;
 b.business.legacyBusinessId=oldId;b.business.accountNumber='9900'+String(++n.counters.account).padStart(6,'0');
 b.business.bankName='Lumo shared sandbox';b.business.verificationStatus='approved-sandbox';b.business.sandbox=true;
 const map={};for(const s of b.shops){const old=s.id;s.id=crypto.randomUUID();s.code='LUM'+(++n.counters.shop);s.published=false;s.testAcceptanceToken=randomToken();map[old]=s.id}
 for(const key of ['staff','transactions','requests','closings','refunds','tickets','shifts','reconciliations'])for(const item of b[key]||[]){
  if(item.shopId)item.shopId=map[item.shopId]||null;if(item.shopIds)item.shopIds=item.shopIds.map(id=>map[id]).filter(Boolean);
 }
 return b;
}
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const fingerprint=value=>hashToken(canonical(value));
const attemptValue=value=>text(value,'A stable request reference',120);
const migrationFields={
 business:'id name ownerName phone businessType registrationNumber accountNumber bankName destination verificationStatus verification registeredAt cutoff closeMode importedAt legacyBusinessId sandbox',
 shops:'id name area category lat lng code color open accepting manager hours landmark cutoff closeMode activation createdAt published createdCutoff testAcceptanceToken',
 staff:'id name role shopId shopIds active phone createdAt authUserId',
 transactions:'id shopId staffId shiftId payer amount status createdAt confirmedAt reference method requestId attemptId assignedAt studentWalletId sandbox staffName recordedTradingDay recordedCutoff tradingDay tradingCutoff allocationSourceTradingDay allocationSourceCutoff allocationReceiptTradingDay priorPeriodAllocation',
 requests:'id shopId staffId shiftId amount description createdAt expiresAt status staffName createdByRole createdByUserId attemptId',
 closings:'id shopId createdAt businessDay businessDate cutoff automatic zeroSales priorPeriodRefunds priorPeriodAllocations adjustmentNote periodStartedAt transactionIds refundIds gross refunds net count pending by',
 refunds:'id transactionId shopId staffId shiftId amount status createdAt paidAt approvedAt decidedAt decidedBy priorPeriod reason payer by attemptId sourceStaffId sourceShiftId requestedStaffId requestedShiftId requestedBy performedBy performedRole performedUserId legacyPerformer tradingDay tradingCutoff',
 settlements:'id amount fee createdAt status destination reference completedAt attemptId',
 tickets:'id subject message transactionId paymentReference shopId status createdAt updatedAt responses resolvedAt',
 shifts:'id shopId staffId staffName performedBy startedAt status transactionIds refundIds gross refunds net by endedAt note tradingDay tradingCutoff lateConfirmedCount',
 reconciliations:'id source period createdAt by rows results matched unmatched duplicates mismatched mismatches unlisted exceptions statementTotal matchedTotal counts',
 audit:'id type entityId by shopId createdAt description',
 activation:'locationConfirmed qrReady ownerOperated updatedAt',
 verification:'identity face',
 responses:'id message status by createdAt',
 rows:'reference amount status statementStatus paymentId transactionId ledgerAmount expectedAmount ledgerStatus expectedStatus result',
 counts:'matched unmatched duplicate amount-mismatch payment-not-confirmed statement-not-confirmed ambiguous-reference'
};
const booleans=new Set('open accepting active automatic zeroSales priorPeriod priorPeriodAllocation legacyPerformer sandbox published locationConfirmed qrReady ownerOperated identity face'.split(' '));
const numbers=new Set('amount fee gross refunds net count pending priorPeriodRefunds priorPeriodAllocations matched unmatched duplicates mismatched mismatches unlisted lateConfirmedCount exceptions statementTotal matchedTotal ledgerAmount expectedAmount'.split(' '));
function cleanMigrationEntity(value,kind){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new APIError(`A saved ${kind} record is invalid.`);
 const allowed=new Set(migrationFields[kind].split(' ')),out={};
 for(const [key,item]of Object.entries(value)){
  if(!allowed.has(key))throw new APIError(`Unsupported saved ${kind} field: ${key}. Export a compatible workspace.`);
  if(item===null){out[key]=null;continue}
  if(['activation','verification','counts'].includes(key)){out[key]=cleanMigrationEntity(item,key);continue}
  if(['responses','rows','results'].includes(key)){if(!Array.isArray(item)||item.length>1000)throw new APIError('A saved history list is too large.');out[key]=item.map(v=>cleanMigrationEntity(v,key==='results'?'rows':key));continue}
  if(['shopIds','transactionIds','refundIds'].includes(key)){if(!Array.isArray(item)||item.length>5000||item.some(v=>typeof v!=='string'||v.length>220))throw new APIError('Saved record references are invalid.');out[key]=[...item];continue}
  if(booleans.has(key)){if(typeof item!=='boolean')throw new APIError(`A saved ${key} value is invalid.`);out[key]=item;continue}
  if(key==='lat'||key==='lng'){if(typeof item!=='number'||!Number.isFinite(item)||Math.abs(item)>(key==='lat'?90:180))throw new APIError('A saved location is invalid.');out[key]=item;continue}
  if(numbers.has(key)||kind==='counts'){if(!Number.isSafeInteger(item)||Math.abs(item)>9999999999)throw new APIError('A saved monetary value or count is invalid.');if(!['net','ledgerAmount','expectedAmount'].includes(key)&&item<0)throw new APIError('Saved amounts cannot be negative.');out[key]=item;continue}
  if(typeof item!=='string'||item.length>(['message','description','reason','adjustmentNote'].includes(key)?1500:key==='note'?500:220))throw new APIError(`A saved ${key} value is invalid or too long.`);
  out[key]=item;
 }
 return out;
}
function prepareMigration(snapshot){
 // Server-derived planning views are never trusted as imported money or access.
 if(snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)){const {businessPlanAccess,businessPlanSummary,businessPlanDebits,...source}=snapshot;snapshot=source;}
 const allowed=new Set('version revision updatedAt mutationId mode business openingBalance shops staff transactions requests closings refunds settlements tickets audit shifts reconciliations businessPlan'.split(' '));
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||Object.keys(snapshot).some(k=>!allowed.has(k)))throw new APIError('The saved workspace contains unsupported fields.');
 if(!snapshot.business||!Array.isArray(snapshot.shops)||!snapshot.shops.length||snapshot.shops.length>100)throw new APIError('Choose a valid saved owner workspace.');
 if(!Number.isSafeInteger(snapshot.openingBalance)||Math.abs(snapshot.openingBalance)>9999999999)throw new APIError('The saved opening balance is invalid.');
 const b={version:1,mode:'registered',revision:0,updatedAt:iso(),openingBalance:snapshot.openingBalance,business:cleanMigrationEntity(snapshot.business,'business'),shops:snapshot.shops.map(s=>cleanMigrationEntity(s,'shops'))};
 const prefix=uid('import'),ids=new Map(),groups=['staff','transactions','requests','closings','refunds','settlements','tickets','shifts','reconciliations','audit'];let ordinal=0;
 const remap=id=>id?(ids.has(id)?ids.get(id):(ids.set(id,prefix+'-'+(++ordinal).toString(36)),ids.get(id))):null;
 const sourceIds=new Map(),shopIds=new Set();
 function claim(item,kind){if(!item.id||sourceIds.has(item.id))throw new APIError('Every saved record needs a unique identifier. Duplicate identifiers cannot be imported.',400,'IMPORT_ID_COLLISION');sourceIds.set(item.id,kind);}
 for(const shop of b.shops){claim(shop,'shops');shopIds.add(shop.id);text(shop.name,'Shop name',60);if(!Number.isFinite(shop.lat)||!Number.isFinite(shop.lng))throw new APIError('A saved shop location is invalid.');shop.published=false;}
 for(const kind of groups){
  const source=snapshot[kind]||[];if(!Array.isArray(source)||source.length>(kind==='transactions'?5000:2000))throw new APIError('Export a smaller workspace before migrating.');
  b[kind]=source.map(item=>cleanMigrationEntity(item,kind));
  for(const item of b[kind]){claim(item,kind);if(['transactions','requests','refunds','settlements'].includes(kind)&&(!Number.isSafeInteger(item.amount)||item.amount<=0))throw new APIError('A saved amount is invalid.');}
 }
 const known=Object.fromEntries(['shops',...groups].map(kind=>[kind,new Set(b[kind].map(item=>item.id))]));
 function reference(id,kind,label){if(id&&!known[kind].has(id))throw new APIError('A saved '+label+' refers to an unknown '+kind+' record.',400,'IMPORT_REFERENCE_INVALID');}
 function members(item,field,kind){if(!Array.isArray(item[field]))return;const seen=new Set();for(const id of item[field]){reference(id,kind,field);if(seen.has(id))throw new APIError('A saved '+field+' list repeats a record.',400,'IMPORT_REFERENCE_INVALID');seen.add(id);}}
 for(const kind of groups)for(const item of b[kind]){
  reference(item.shopId,'shops','record');for(const id of item.shopIds||[])reference(id,'shops','shop assignment');
  // Historical operator identifiers may outlive the roster. Financial record
  // links must still address an existing record of their original type.
  reference(item.transactionId,'transactions','payment link');reference(item.requestId,'requests','payment request');
  for(const field of ['shiftId','sourceShiftId','requestedShiftId'])reference(item[field],'shifts','shift link');
  members(item,'transactionIds','transactions');members(item,'refundIds','refunds');
  if(kind==='refunds'){
   if(!item.transactionId)throw new APIError('Every saved refund must identify its original payment.',400,'IMPORT_REFERENCE_INVALID');
   const payment=b.transactions.find(payment=>payment.id===item.transactionId);if((item.shopId||null)!==(payment.shopId||null))throw new APIError('A saved refund belongs to a different shop than its payment.',400,'IMPORT_REFERENCE_INVALID');
  }
  if(['closings','shifts'].includes(kind))for(const [field,records]of [['transactionIds',b.transactions],['refundIds',b.refunds]])for(const id of item[field]||[]){if(records.find(record=>record.id===id)?.shopId!==item.shopId)throw new APIError('A saved '+kind+' report contains another shop’s record.',400,'IMPORT_REFERENCE_INVALID');}
  if(kind==='reconciliations')for(const list of ['rows','results'])for(const row of item[list]||[])for(const field of ['paymentId','transactionId'])reference(row[field],'transactions','statement payment link');
 }
 // Allocate an unrelated short identifier for every full source ID. Keeping the
 // original strings as map keys avoids truncation and namespace collisions.
 for(const kind of groups)for(const item of b[kind])item.id=remap(item.id);
 for(const kind of groups)for(const item of b[kind]){
  for(const field of ['staffId','transactionId','requestId','shiftId','entityId','sourceStaffId','sourceShiftId','requestedStaffId','requestedShiftId'])if(item[field])item[field]=remap(item[field]);
  for(const field of ['transactionIds','refundIds'])if(Array.isArray(item[field]))item[field]=item[field].map(remap);
  if(kind==='closings'&&item.businessDate&&!item.businessDay)item.businessDay=item.businessDate;
  if(kind==='reconciliations')for(const list of ['rows','results'])for(const row of item[list]||[])for(const field of ['paymentId','transactionId'])if(row[field])row[field]=remap(row[field]);
  delete item.studentWalletId;if(item.attemptId)item.attemptId=prefix+':'+item.attemptId;
 }
 for(const st of b.staff){st.active=false;delete st.authUserId}
 for(const tx of b.transactions)if(!['paid','processing','failed'].includes(tx.status))throw new APIError('A saved payment status is invalid.');
 for(const r of b.refunds)if(!['paid','processing','requested','rejected'].includes(r.status))throw new APIError('A saved refund status is invalid.');
 for(const s of b.settlements)if(!['paid','processing','requested','failed'].includes(s.status))throw new APIError('A saved settlement status is invalid.');
 b.business={...b.business,id:uid('legacy'),name:text(b.business.name,'Business name',70),ownerName:text(b.business.ownerName,'Owner name',60),phone:phone(b.business.phone),destination:text(b.business.destination||'Sandbox destination not set','Settlement destination',160),registeredAt:b.business.registeredAt||iso(),importedAt:iso()};
 if(snapshot.businessPlan!==undefined)b.businessPlan=prepareImportedBusinessPlan(snapshot.businessPlan,b,remap);
 const balance=metricsFor(b);if(balance.balance<0||balance.available<0)throw new APIError('This saved workspace does not reconcile to a non-negative available balance.');
 return b;
}
function requireFreshDeviceOwner(c,d){
 const created=Date.parse(c.session.createdAt),revoked=Date.parse(d.revokedAt);
 if(c.user.role!=='owner'||c.user.businessId!==d.businessId||c.session.id===d.sessionId||!Number.isFinite(created)||!Number.isFinite(revoked)||created<=revoked)throw new APIError('A business owner must sign in again after this phone was revoked before restoring it.',403,'FRESH_OWNER_REQUIRED');
}
function deviceValid(n,d){
 const s=n.sessions.find(s=>s.id===d.sessionId),u=n.users.find(u=>u.id===d.userId);
 if(s?.counterId){const context=resolveSession(n,s.tokenHash);return !!context?.counter&&!context.locked&&context.user.id===d.userId&&context.counter.deviceId===d.id&&context.counter.shopId===d.shopId;}
 return !!s&&!!u?.active&&!s.revokedAt&&Date.parse(s.expiresAt)>Date.now()&&s.userVersion===(u.sessionVersion||1)&&s.userId===u.id&&s.businessId===d.businessId&&u.businessId===d.businessId&&(u.role==='owner'||u.shopIds.includes(d.shopId));
}
function readiness(n,b,allowed){
 const checkedAt=iso(),now=Date.now();
 return b.shops.filter(s=>allowed.has(s.id)).map(shop=>{
  const paired=n.devices.filter(d=>d.businessId===b.business.id&&d.shopId===shop.id&&!d.revokedAt&&deviceValid(n,d));
  const ready=paired.filter(d=>d.enabled&&d.soundReady===true&&d.testedAt&&Date.parse(d.testedAt)>=Date.parse(d.pairedAt||d.createdAt)&&now-Date.parse(d.lastSeen)<90000);
  const readyUntil=ready.length?new Date(Math.max(...ready.map(d=>Math.min(Date.parse(d.lastSeen)+90000,Date.parse(n.sessions.find(s=>s.id===d.sessionId).expiresAt))))).toISOString():null;
  return {shopId:shop.id,phoneReady:ready.length>0,phoneCount:paired.length,offlineCount:paired.length-ready.length,readyCount:ready.length,checkedAt,readyUntil};
 });
}
function publicationReady(n,b,shop){
 const team=shop.activation?.ownerOperated===true||n.users.some(u=>u.businessId===b.business.id&&u.active&&u.role!=='owner'&&u.shopIds.includes(shop.id));
 return shop.activation?.locationConfirmed===true&&shop.activation?.qrReady===true&&team&&readiness(n,b,new Set([shop.id]))[0]?.phoneReady;
}

function findQuote(n,p,context=null){
 let b,s,r;
 if(p.requestId){for(const value of Object.values(n.businesses)){r=value.requests.find(x=>x.id===p.requestId);if(r){b=value;s=b.shops.find(x=>x.id===r.shopId);break}}}
 else if(p.shopId){for(const value of Object.values(n.businesses)){s=value.shops.find(x=>x.id===p.shopId);if(s){b=value;break}}}
 else if(p.code){for(const value of Object.values(n.businesses)){s=value.shops.find(x=>x.code.toUpperCase()===String(p.code).trim().toUpperCase());if(s){b=value;break}}}
 else if(p.accountNumber){
  b=Object.values(n.businesses).find(b=>b.business.accountNumber===String(p.accountNumber).replace(/\s/g,''));
  if(b){
   const listed=b.shops.filter(shop=>shop.published===true||context?.user?.businessId===b.business.id&&(context.user.role==='owner'||context.user.shopIds?.includes(shop.id))||typeof p.testKey==='string'&&p.testKey.length===64&&p.testKey===shop.testAcceptanceToken);
   if(!listed.length||p.selectedShopId&&!listed.some(shop=>shop.id===p.selectedShopId))throw new APIError('No published counter matches this account selection. Ask the merchant for its shop QR.',404,'MERCHANT_NOT_FOUND');
   s=listed.find(shop=>shop.id===p.selectedShopId)||(listed.length===1?listed[0]:null);
  }
 }
 if(!b)throw new APIError('This merchant or payment request could not be found. Ask for its current Lumo QR or code.',404,'MERCHANT_NOT_FOUND');
 if(!s)return {b,s:null,r:null,shopChoices:b.shops.filter(s=>(s.published===true||context?.user?.businessId===b.business.id&&(context.user.role==='owner'||context.user.shopIds?.includes(s.id))||typeof p.testKey==='string'&&p.testKey.length===64&&p.testKey===s.testAcceptanceToken)&&s.open!==false&&s.accepting).map(s=>publicShop(b,s))};
 const merchantAccess=context?.user?.businessId===b.business.id&&(context.user.role==='owner'||context.user.shopIds?.includes(s.id));
 const testAccess=typeof p.testKey==='string'&&typeof s.testAcceptanceToken==='string'&&p.testKey.length===64&&p.testKey===s.testAcceptanceToken;
 if(s.published!==true&&!merchantAccess&&!testAccess)throw new APIError('This counter is not published. Ask the merchant for its current test QR.',404,'MERCHANT_NOT_FOUND');
 const testKey=s.published!==true&&(merchantAccess||testAccess)?s.testAcceptanceToken:undefined;
 if(p.shopId&&r&&p.shopId!==s.id)throw new APIError('This QR belongs to a different shop.');
 if(p.code&&s.code.toUpperCase()!==String(p.code).trim().toUpperCase()||p.accountNumber&&b.business.accountNumber!==String(p.accountNumber).replace(/\s/g,'')||p.selectedShopId&&p.selectedShopId!==s.id)throw new APIError('These payment details refer to different recipients.',409,'RECIPIENT_MISMATCH');
 if(!s.accepting||s.open===false)throw new APIError('This shop is not accepting payments right now.',409,'SHOP_PAUSED');
 if(r?.staffId){const staffValid=b.staff.some(st=>st.id===r.staffId&&st.active&&(st.shopIds||[st.shopId]).includes(r.shopId));const creator=n.users.find(u=>u.id===r.createdByUserId&&u.businessId===b.business.id&&u.active);const ownerValid=r.createdByRole==='owner'&&r.staffId==='owner-'+creator?.id&&(creator?.role==='owner'||creator?.shopIds.includes(r.shopId));if(!staffValid&&!ownerValid)throw new APIError('The staff access for this request changed. Ask the shop for a new QR.',409,'REQUEST_STAFF_CHANGED');}
 if(r?.amount>1000000)throw new APIError('This request is above the shared sandbox payment limit. Ask the shop for a new request.',409,'REQUEST_EXCEEDS_LIMIT');
 if(r&&(r.status!=='open'||Date.parse(r.expiresAt)<=Date.now()))throw new APIError('This payment request has expired, been paid or been cancelled. Ask for a new request.',409,'REQUEST_UNAVAILABLE');
 return {b,s,r,testKey};
}
function quotePublic(n,q,w){return {business:{id:q.b.business.id,name:q.b.business.name,accountNumber:q.b.business.accountNumber,sandbox:true},shop:q.s?publicShop(q.b,q.s):null,shops:q.shopChoices||[],request:q.r?{id:q.r.id,amount:q.r.amount,description:q.r.description,status:q.r.status,expiresAt:q.r.expiresAt}:null,student:publicWallet(n,w),...(q.testKey?{testKey:q.testKey}:{}),fee:0,currency:'GHS',requiresStudentWallet:true,published:q.s?.published===true,listingStatus:q.s?.published===true?'published':'test-only'}}
function actorFor(n,c,b,shopId){
 if(c.user.businessId!==b.business.id)throw new APIError('This business is outside your access.',403);
 if(c.user.role==='owner')return {role:'owner',userId:c.user.id};
 assigned(n,c.user,shopId);return {role:c.user.role,userId:c.user.id,shopId,staffId:'access-'+c.user.id};
}
function stepUp(c,proof,purpose,proofHash){
 if(!proof||c.session.stepUpHash!==proofHash||Date.parse(c.session.stepUpExpiresAt||0)<=Date.now()||![purpose,'owner-action'].includes(c.session.stepUpPurpose))throw new APIError('Confirm your current password before completing this owner action.',403,'STEP_UP_REQUIRED');
 c.session.stepUpHash=null;c.session.stepUpExpiresAt=null;
}
function refundWallets(n,b,prior){
 const before=new Set((prior?.refunds||[]).filter(r=>r.status==='paid').map(r=>r.id));
 for(const r of b.refunds.filter(r=>r.status==='paid'&&!before.has(r.id))){
  const tx=b.transactions.find(t=>t.id===r.transactionId),w=n.wallets[tx?.studentWalletId];
  if(w){w.balance+=r.amount;w.entries.unshift({id:uid('wallet-entry'),type:'refund',amount:r.amount,businessId:b.business.id,shopId:r.shopId,reference:r.id,createdAt:iso()})}
 }
}
function retainRecoveries(n,userId){
 if(!userId)return;
 const own=n.recoveries.filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 const remove=new Set(own.slice(10).slice(-100).map(r=>r.id));n.recoveries=n.recoveries.filter(r=>!remove.has(r.id));
}
async function bodyJSON(request){
 if(!String(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))throw new APIError('Send a JSON request.',415);
 const raw=await request.text();if(raw.length>1200000)throw new APIError('This request is too large.',413);
 try{const value=JSON.parse(raw||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value}catch{throw new APIError('The request could not be read as an object.')}
}
export async function handleAPI(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return null;
 try{
  const method=request.method,path=url.pathname.replace(/\/$/,'');
  if(!['GET','POST'].includes(method))throw new APIError('Method not supported.',405);
  if(method==='POST'){
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw new APIError('This request must come from this Lumo site.',403,'ORIGIN_MISMATCH');
   if(request.headers.get('x-lumo-request')!=='1')throw new APIError('Refresh the app before trying again.',403,'REQUEST_PROOF_REQUIRED');
  }
  const [tokenHash,studentHash]=await Promise.all([hashToken(cookieToken(request)),hashToken(cookieToken(request,'lumo_student'))]);
  const p=method==='POST'?await bodyJSON(request):Object.fromEntries(url.searchParams),ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(method==='POST'&&(/\/(login|recovery|username|step-up|password|transfer|phone)/.test(path)||['/api/signup','/api/migrate','/api/invitations/accept'].includes(path))){
   const key=await hashToken(ip+':'+path);await updateNetwork(env,n=>{rateLimit(n,'request:'+key,path==='/api/signup'||path==='/api/migrate'?10:20,60000);return {}});
  }
  const activeContext=resolveSession((await readNetwork(env)).state,tokenHash);
  if(activeContext?.counter&&!['/api/session','/api/business','/api/logout','/api/auth/logout','/api/counter','/api/counter/unlock','/api/counter/lock','/api/action','/api/devices','/api/health'].includes(path)&&!/^\/api\/devices\/[^/]+$/.test(path))throw new APIError('This phone is restricted to cashier collections. Sign in separately for business management.',403,'COUNTER_ONLY');
  if(path==='/api/business-plan'&&method==='GET'){
   const {state:n,revision}=await readNetwork(env),c=requireSession(n,tokenHash);
   if(c.counter||!['owner','manager'].includes(c.user.role))throw new APIError('Cashier access does not include business planning.',403,'PLANNING_FORBIDDEN');
   return response({...bundle(n,tokenHash,studentHash),revision});
  }
  if(path==='/api/business-plan'&&method==='POST'){
   const out=await updateNetwork(env,n=>{const c=requireSession(n,tokenHash),result=mutateBusinessPlan(n,c,p);c.session.lastSeen=iso();return {...(result.unchanged?{unchanged:true}:{}),data:bundle(n,tokenHash,studentHash,result)};});
   return response({...out.data,revision:out.revision});
  }
  if(method==='GET'&&path==='/api/counter'){
   const {state:n,revision}=await readNetwork(env),c=resolveSession(n,tokenHash);if(!c)throw new APIError('Sign in to open this counter.',401,'SIGN_IN_REQUIRED');
   const management=!c.counter&&['owner','manager'].includes(c.user.role);
   return response({...bundle(n,tokenHash,studentHash),revision,...(management?{counterStaff:cashierRoster(n,c.user.businessId).filter(p=>c.user.role==='owner'||p.shopIds.some(id=>c.user.shopIds.includes(id))),counters:(n.businesses[c.user.businessId].counterDevices||[]).filter(d=>c.user.role==='owner'||c.user.shopIds.includes(d.shopId)).map(d=>({id:d.id,deviceId:d.deviceId,label:d.label,mode:d.mode,shopId:d.shopId,revokedAt:d.revokedAt||null,staffUserId:d.staffUserId,createdAt:d.createdAt}))}: {})});
  }
  if(method==='POST'&&/^\/api\/counter\/(setup|pin|unlock|lock|revoke)$/.test(path)){
   const out=await updateNetwork(env,async n=>{const result=await counterAction(n,tokenHash,path,p);return {data:{...bundle(n,tokenHash,studentHash),...result}};});
   if(out.data.counterError){const error=out.data.counterError;return response({error:error.error,code:error.code,revision:out.revision},error.status);}
   return response({...out.data,revision:out.revision});
  }
  if(path==='/api/health'){const current=await readNetwork(env);return response({ok:true,shared:true,version:9,storage:'D1 isolated record shards with atomic batches',revision:current.revision,limits:{merchantHistoryBytes:1500000,notForRealMoney:true}})}
  if(method==='GET'&&['/api/session','/api/business'].includes(path)){
   const out=await updateNetwork(env,n=>{
    const c=resolveSession(n,tokenHash);let changed=false;
    if(c){const b=n.businesses[c.user.businessId];if(b){if(ensureTestAcceptanceTokens(b))changed=true;const auto=applyAutomaticClosings(b,iso());if(auto.changed){n.businesses[c.user.businessId]=auto.state;changed=true}projectUsers(n,n.businesses[c.user.businessId])}}
    if(path==='/api/business'&&!c)throw new APIError('Sign in to open your business.',401,'SIGN_IN_REQUIRED');
    return {unchanged:!changed,data:bundle(n,tokenHash,studentHash)};
   });return response({...out.data,revision:out.revision});
  }
if(method==='POST'&&path==='/api/signup'){
   const registration=p.business||p,creds=p.credentials||p,uname=username(creds.username),attempt=attemptValue(p.attemptId),password=await makePassword(creds.password),recoveryKey=newRecoveryKey(),keyHash=await recoveryHash(recoveryKey),token=randomToken(),newHash=await hashToken(token);
   const normalized={...registration};delete normalized.credentials;delete normalized.password;delete normalized.username;delete normalized.attemptId;delete normalized.remember;delete normalized.deviceLabel;
   const bodyHash=await fingerprint({registration:normalized,username:uname});
   const out=await updateNetwork(env,async n=>{
    const prior=n.signupAttempts[attempt];
    if(prior){
     const u=n.users.find(u=>u.id===prior.userId);
     if(prior.fingerprint!==bodyHash||!u?.active||u.username!==uname||!await matchesPassword(creds.password,u.password))throw new APIError('This signup reference was already used for another request.',409,'IDEMPOTENCY_MISMATCH');
     newSession(n,u,newHash,!!p.remember,String(p.deviceLabel||'Owner browser'));
     return {data:bundle(n,newHash,studentHash,{replayed:true,recoveryKeyAvailable:false,recoveryAction:'regenerate'})};
    }
    rateLimit(n,'signup:'+ip,8,3600000);
    if(n.users.some(u=>u.username===uname))throw new APIError('That username is already in use. Choose another.');
    const b=allocateBusiness(n,createBusiness(registration));
    const u={id:uid('user'),businessId:b.business.id,username:uname,name:b.business.ownerName,phone:b.business.phone,role:'owner',shopIds:b.shops.map(s=>s.id),active:true,password,recoveryHash:keyHash,recoveryKeyPending:true,recoveryKeyReference:uid('recovery-key'),recoveryKeyIssuedAt:iso(),sessionVersion:1,createdAt:iso(),updatedAt:iso(),passwordChangedAt:iso()};
    n.users.push(u);projectUsers(n,b);n.businesses[b.business.id]=b;newSession(n,u,newHash,!!p.remember,String(p.deviceLabel||'Owner browser'));
    n.signupAttempts[attempt]={userId:u.id,businessId:b.business.id,fingerprint:bodyHash,createdAt:iso()};audit(n,'BUSINESS_CREATED',b.business.id,u.id);
    return {data:bundle(n,newHash,studentHash,{recoveryKey,recoveryKeyReference:u.recoveryKeyReference,recoveryKeyAvailable:true,replayed:false})};
   });return response({...out.data,revision:out.revision},out.data.replayed?200:201,[sessionCookie(token,!!p.remember)]);
  }
  if(method==='POST'&&path==='/api/migrate'){
   const attempt=attemptValue(p.attemptId),bodyHash=await fingerprint(p.snapshot);
   const out=await updateNetwork(env,async n=>{
    const c=requireSession(n,tokenHash,true);
    if(p.confirmImport!==true)throw new APIError('Confirm that you want to import this saved history into your empty shared business.',400,'IMPORT_CONSENT_REQUIRED');
    if(!await matchesPassword(p.currentPassword,c.user.password))throw new APIError('Confirm your current shared-account password before importing history.',403,'PASSWORD_REQUIRED');
    const prior=n.importAttempts[c.user.businessId];
    if(prior){if(prior.fingerprint!==bodyHash||prior.userId!==c.user.id)throw new APIError('History has already been imported into this business. Existing records were kept.',409,'IMPORT_ALREADY_APPLIED');return {unchanged:true,data:bundle(n,tokenHash,studentHash,{replayed:true,imported:true})}}
    const current=n.businesses[c.user.businessId];
    if((current.businessPlan?.expenses||[]).length||current.businessPlan?.stockReserve?.amount>0||['transactions','requests','closings','refunds','settlements','tickets','shifts','reconciliations'].some(k=>(current[k]||[]).length)||n.users.some(u=>u.businessId===c.user.businessId&&u.id!==c.user.id)||n.devices.some(d=>d.businessId===c.user.businessId&&!d.revokedAt)||n.invitations.some(i=>i.businessId===c.user.businessId&&i.status==='pending'))throw new APIError('Import only into your newly created empty shared business. Existing activity will not be overwritten.',409,'BUSINESS_NOT_EMPTY');
    const b=prepareMigration(p.snapshot),oldShopIds=new Map();
    for(const shop of b.shops){const old=shop.id;shop.id='shop-'+(++n.counters.shop);shop.code='LUM'+n.counters.shop;shop.published=false;shop.testAcceptanceToken=randomToken();oldShopIds.set(old,shop.id)}
    for(const key of ['staff','transactions','requests','closings','refunds','tickets','shifts','reconciliations','audit'])for(const item of b[key]||[]){if(item.shopId)item.shopId=oldShopIds.get(item.shopId)||null;if(item.shopIds)item.shopIds=item.shopIds.map(id=>oldShopIds.get(id)).filter(Boolean)}
    if(b.businessPlan)for(const expense of b.businessPlan.expenses)if(expense.shopId)expense.shopId=oldShopIds.get(expense.shopId)||null;
    b.business={...b.business,id:current.business.id,accountNumber:current.business.accountNumber,bankName:current.business.bankName,ownerName:c.user.name,phone:c.user.phone,verificationStatus:'approved-sandbox',sandbox:true,legacyBusinessId:p.snapshot.business.id||null};
    c.user.shopIds=b.shops.map(s=>s.id);projectUsers(n,b);n.businesses[c.user.businessId]=b;
    n.importAttempts[c.user.businessId]={attemptId:attempt,userId:c.user.id,businessId:c.user.businessId,fingerprint:bodyHash,createdAt:iso()};audit(n,'BUSINESS_HISTORY_IMPORTED',b.business.id,c.user.id);
    return {data:bundle(n,tokenHash,studentHash,{imported:true,replayed:false})};
   });return response({...out.data,revision:out.revision});
  }

  if(method==='POST'&&['/api/login','/api/auth/login'].includes(path)){
   const uname=username(p.username),token=randomToken(),newHash=await hashToken(token);
   const out=await updateNetwork(env,async n=>{
    rateLimit(n,'login:'+ip+':'+uname,12);
    const u=n.users.find(u=>u.username===uname);
    const matched=u?await matchesPassword(p.password,u.password):false;
    if(!matched)throw new APIError('The username or password is incorrect.',401,'INVALID_CREDENTIALS');
    if(!u.active)throw new APIError('This account has been suspended. Ask the owner to restore access.',403,'ACCOUNT_SUSPENDED');
    newSession(n,u,newHash,!!p.remember,String(p.deviceLabel||'Browser'));audit(n,'SIGNED_IN',u.businessId,u.id);
    return {data:bundle(n,newHash,studentHash)};
   });return response({...out.data,revision:out.revision},200,[sessionCookie(token,!!p.remember)]);
  }
  if(method==='POST'&&['/api/logout','/api/auth/logout'].includes(path)){
   const out=await updateNetwork(env,n=>{const c=resolveSession(n,tokenHash);if(c){c.session.revokedAt=iso();c.session.revokeReason='Signed out';audit(n,'SIGNED_OUT',c.user.businessId,c.user.id)}return {data:bundle(n,'',studentHash)}});
   return response({...out.data,revision:out.revision},200,[clearCookie()]);
  }
  if(method==='POST'&&['/api/auth/password','/api/password'].includes(path)){
   const password=await makePassword(p.newPassword),token=randomToken(),newHash=await hashToken(token);
   const out=await updateNetwork(env,async n=>{
    const c=requireSession(n,tokenHash);if(!await matchesPassword(p.currentPassword,c.user.password))throw new APIError('Your current password is incorrect.',403);
    if(await matchesPassword(p.newPassword,c.user.password))throw new APIError('Choose a different password.');
    c.user.password=password;c.user.passwordChangedAt=iso();c.user.sessionVersion=(c.user.sessionVersion||1)+1;c.user.updatedAt=iso();
    revokeSessions(n,c.user.id,'Password changed');for(const r of n.recoveries)if(r.userId===c.user.id)r.usedAt=iso();
    newSession(n,c.user,newHash,c.session.remember,c.session.deviceLabel);audit(n,'PASSWORD_CHANGED',c.user.businessId,c.user.id);
    return {data:bundle(n,newHash,studentHash,{success:true})};
   });return response({...out.data,revision:out.revision},200,[sessionCookie(token,!!out.data.session?.remember)]);
  }
  if(method==='POST'&&['/api/auth/recovery/start','/api/recovery/start'].includes(path)){
   const uname=username(p.username);
   const out=await updateNetwork(env,n=>{
    rateLimit(n,'recovery:'+ip,10);
    const u=n.users.find(u=>u.username===uname),challenge={id:uid('recovery'),userId:u?.id||null,userVersion:u?.sessionVersion||null,expiresAt:new Date(Date.now()+5*60000).toISOString(),createdAt:iso(),usedAt:null};
    if(u){n.recoveries.unshift(challenge);retainRecoveries(n,u.id)}
    return {data:{challengeId:challenge.id,maskedPhone:'your saved account phone',method:'recovery-key',expiresAt:challenge.expiresAt,notice:'Use the recovery key saved when this shared sandbox account was created. No SMS is sent.'}};
   });return response({...out.data,revision:out.revision});
  }
  if(method==='POST'&&['/api/auth/recovery/complete','/api/recovery/complete'].includes(path)){
   const password=await makePassword(p.newPassword),keyHash=await recoveryHash(p.recoveryKey);
   const out=await updateNetwork(env,n=>{
    rateLimit(n,'recovery-complete:'+ip,12);
    const r=n.recoveries.find(r=>r.id===p.challengeId),u=n.users.find(u=>u.id===r?.userId);
    if(!r||r.usedAt||Date.parse(r.expiresAt)<=Date.now()||!u||u.recoveryHash!==keyHash||r.userVersion!==(u.sessionVersion||1))throw new APIError('The recovery key is incorrect or this request has expired.',403,'RECOVERY_FAILED');
    if(!u.active)throw new APIError('Ask the owner to restore this suspended account first.',403);
    r.usedAt=iso();u.password=password;u.passwordChangedAt=iso();u.updatedAt=iso();u.sessionVersion=(u.sessionVersion||1)+1;
    revokeSessions(n,u.id,'Password recovered');for(const x of n.recoveries)if(x.userId===u.id)x.usedAt=iso();
    audit(n,'PASSWORD_RECOVERED',u.businessId,u.id);return {data:{success:true,session:null}};
   });return response({...out.data,revision:out.revision},200,[clearCookie()]);
  }
  if(method==='POST'&&['/api/auth/username','/api/auth/username/recover'].includes(path)){
   const normalized=phone(p.phone),keyHash=await recoveryHash(p.recoveryKey);
   const out=await updateNetwork(env,n=>{
    rateLimit(n,'username-recovery:'+ip,10);const u=n.users.find(u=>u.phone===normalized&&u.recoveryHash===keyHash);
    if(!u)throw new APIError('The phone and recovery key could not be matched.',403,'RECOVERY_FAILED');
    return {data:{username:u.username,usernames:[u.username],method:'recovery-key'}};
   });return response(out.data);
  }
  if(method==='POST'&&path==='/api/auth/recovery-key'){
   const recoveryKey=newRecoveryKey(),keyHash=await recoveryHash(recoveryKey);
   const out=await updateNetwork(env,async n=>{
    const c=requireSession(n,tokenHash);if(!await matchesPassword(p.currentPassword,c.user.password))throw new APIError('Your current password is incorrect.',403);
    c.user.recoveryHash=keyHash;c.user.recoveryKeyPending=true;c.user.recoveryKeyReference=uid('recovery-key');c.user.recoveryKeyIssuedAt=iso();c.user.recoveryKeyAcknowledgedAt=null;c.user.updatedAt=iso();for(const r of n.recoveries)if(r.userId===c.user.id)r.usedAt=iso();
    audit(n,'RECOVERY_KEY_REGENERATED',c.user.businessId,c.user.id);return {data:bundle(n,tokenHash,studentHash,{recoveryKey,recoveryKeyReference:c.user.recoveryKeyReference,success:true})};
   });return response({...out.data,revision:out.revision});
  }
  if(method==='POST'&&path==='/api/auth/recovery-key/ack'){
   const reference=text(p.reference,'The recovery key reference',120);
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash);
    if(reference!==c.user.recoveryKeyReference)throw new APIError('This recovery key was replaced. Confirm your password to create and save the current key.',409,'RECOVERY_KEY_CHANGED');
    if(c.user.recoveryKeyPending!==true)return {unchanged:true,data:bundle(n,tokenHash,studentHash,{success:true,acknowledged:true})};
    c.user.recoveryKeyPending=false;c.user.recoveryKeyAcknowledgedAt=iso();c.user.updatedAt=iso();
    audit(n,'RECOVERY_KEY_SAVED',c.user.businessId,c.user.id);
    return {data:bundle(n,tokenHash,studentHash,{success:true,acknowledged:true})};
   });return response({...out.data,revision:out.revision});
  }
  if(method==='POST'&&['/api/auth/phone','/api/auth/phone/change'].includes(path)){
   const normalized=phone(p.newPhone);
   const out=await updateNetwork(env,async n=>{
    const c=requireSession(n,tokenHash);if(!await matchesPassword(p.currentPassword,c.user.password))throw new APIError('Your current password is incorrect.',403);
    c.user.phone=normalized;c.user.updatedAt=iso();if(c.user.role==='owner')n.businesses[c.user.businessId].business.phone=normalized;
    projectUsers(n,n.businesses[c.user.businessId]);audit(n,'PHONE_CHANGED',c.user.businessId,c.user.id,{carrierVerified:false});
    return {data:bundle(n,tokenHash,studentHash,{success:true,carrierVerified:false})};
   });return response({...out.data,revision:out.revision});
  }
  if(method==='POST'&&['/api/auth/step-up','/api/step-up'].includes(path)){
   const proof=randomToken(),proofHash=await hashToken(proof),purpose=String(p.purpose||'owner-action');
   if(!['owner-action','settlement','destination','transfer','refund'].includes(purpose))throw new APIError('Choose a supported owner action.');
   const out=await updateNetwork(env,async n=>{
    const c=requireSession(n,tokenHash,purpose!=='refund');if(purpose==='refund'&&!['owner','manager'].includes(c.user.role))throw new APIError('Only the owner or shop manager can return funds.',403);if(!await matchesPassword(p.currentPassword,c.user.password))throw new APIError('Your current password is incorrect.',403);
    c.session.stepUpHash=proofHash;c.session.stepUpPurpose=purpose;c.session.stepUpExpiresAt=new Date(Date.now()+3*60000).toISOString();
    audit(n,'OWNER_VERIFIED',c.user.businessId,c.user.id,{purpose});return {data:{proof,expiresAt:c.session.stepUpExpiresAt,purpose,success:true}};
   });return response(out.data);
  }
  if(method==='POST'&&['/api/auth/transfer','/api/ownership/transfer'].includes(path)){
   const out=await updateNetwork(env,async n=>{
    const c=requireSession(n,tokenHash,true),target=n.users.find(u=>u.id===p.targetUserId&&u.businessId===c.user.businessId);
    if(!target?.active||target.id===c.user.id)throw new APIError('Choose an active team member to take ownership.');
    if(p.confirmation!=='TRANSFER'||p.acceptResponsibility!==true)throw new APIError('Confirm the ownership handover explicitly.');
    if(!await matchesPassword(p.currentPassword,c.user.password))throw new APIError('Your current password is incorrect.',403);
    const b=n.businesses[c.user.businessId];target.role='owner';target.shopIds=b.shops.map(s=>s.id);target.updatedAt=iso();target.sessionVersion=(target.sessionVersion||1)+1;
    c.user.role='manager';c.user.shopIds=b.shops.map(s=>s.id);c.user.updatedAt=iso();c.user.sessionVersion=(c.user.sessionVersion||1)+1;
    b.business.ownerName=target.name;b.business.phone=target.phone;revokeSessions(n,target.id,'Ownership changed');revokeSessions(n,c.user.id,'Ownership transferred');
    projectUsers(n,b);audit(n,'OWNERSHIP_TRANSFERRED',b.business.id,c.user.id,{targetUserId:target.id});return {data:{success:true,session:null}};
   });return response({...out.data,revision:out.revision},200,[clearCookie()]);
  }
  if(method==='GET'&&path==='/api/directory'){
   const {state:n,revision}=await readNetwork(env);return response({revision,shops:Object.values(n.businesses).flatMap(b=>b.shops.filter(s=>s.published===true).map(s=>publicShop(b,s)))});
  }
  if(method==='GET'&&['/api/payments/quote','/api/lookup'].includes(path)){
   const {state:n,revision}=await readNetwork(env);return response({...quotePublic(n,findQuote(n,p,resolveSession(n,tokenHash)),studentFor(n,studentHash)),revision});
  }
  if(method==='GET'&&path==='/api/student'){
   const {state:n,revision}=await readNetwork(env),student=publicWallet(n,studentFor(n,studentHash),{cursor:p.cursor||'',limit:p.limit||25});return response({revision,student,entries:student?.entries||[],history:student?.history||{nextCursor:null,total:0,limit:25}});
  }
  if(method==='POST'&&['/api/student','/api/student/open'].includes(path)){
   const token=randomToken(),newHash=await hashToken(token);
   const out=await updateNetwork(env,n=>{
    const previous=studentFor(n,studentHash);if(previous)return {unchanged:true,data:{student:walletInfo(previous),existing:true}};rateLimit(n,'student-open:'+ip,120,3600000);
    const w={id:uid('student'),name:text(p.name||'Campus tester','Student display name',60),balance:0,entries:[],createdAt:iso()};
    n.wallets[w.id]=w;n.studentSessions.push({id:uid('student-session'),tokenHash:newHash,walletId:w.id,createdAt:iso(),expiresAt:new Date(Date.now()+30*86400000).toISOString()});
    return {data:{student:walletInfo(w),existing:false}};
   });return response({...out.data,revision:out.revision},201,out.data.existing?[]:[sessionCookie(token,true,'lumo_student')]);
  }
  if(method==='POST'&&['/api/student/fund','/api/sandbox-fund'].includes(path)){
   if(p.confirmSandbox!==true)throw new APIError('Confirm that these are test funds with no real monetary value.');
   const amount=p.amount;if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0||amount>100000)throw new APIError('Add between GH₵0.01 and GH₵1,000 of test funds.');
   const out=await updateNetwork(env,n=>{
    const w=studentFor(n,studentHash);if(!w)throw new APIError('Open your test student wallet first.',401,'STUDENT_REQUIRED');
    if(Object.hasOwn(p,'walletId')&&(typeof p.walletId!=='string'||p.walletId!==w.id))throw new APIError('This request belongs to a different student wallet. Check the original wallet before retrying.',409,'WALLET_CHANGED');
    const attempt=String(p.attemptId||'');if(attempt){const prior=w.entries.find(e=>e.type==='test-funding'&&e.attemptId===attempt);if(prior){if(prior.amount!==amount)throw new APIError('This funding reference was already used for another amount.');return {unchanged:true,data:{student:walletInfo(w),entry:prior}}}}
    rateLimit(n,'fund:'+w.id,20,3600000);if(w.balance+amount>1000000)throw new APIError('The test wallet balance limit is GH₵10,000.',400,'TEST_WALLET_LIMIT');
    w.balance+=amount;const entry={id:uid('wallet-entry'),type:'test-funding',amount,attemptId:attempt,createdAt:iso(),description:'Sandbox funds. No real money.'};w.entries.unshift(entry);
    return {data:{student:walletInfo(w),entry}};
   });return response({...out.data,revision:out.revision});
  }
  if(method==='POST'&&path==='/api/payments'){
   const attempt=text(p.attemptId,'Payment attempt reference',100),amount=p.amount;
   if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0||amount>1000000)throw new APIError('Shared sandbox payments must be between GH₵0.01 and GH₵10,000.');
   const out=await updateNetwork(env,n=>{
    const w=studentFor(n,studentHash);if(!w)throw new APIError('Open your test student wallet before paying.',401,'STUDENT_REQUIRED');
    if(Object.hasOwn(p,'walletId')&&(typeof p.walletId!=='string'||p.walletId!==w.id))throw new APIError('This payment belongs to a different student wallet. Check the original wallet before retrying.',409,'WALLET_CHANGED');
    const prior=n.attempts[w.id+':'+attempt];
    if(prior){const b=n.businesses[prior.businessId],shop=b?.shops.find(s=>s.id===prior.shopId);const mismatch=prior.amount!==amount||p.shopId&&prior.shopId!==p.shopId||(prior.requestId||null)!==(p.requestId||null)||p.selectedShopId&&prior.shopId!==p.selectedShopId||p.code&&shop?.code.toUpperCase()!==String(p.code).trim().toUpperCase()||p.accountNumber&&b?.business.accountNumber!==String(p.accountNumber).replace(/\s/g,'');if(mismatch)throw new APIError('This payment reference was used for a different recipient or payment.',409,'IDEMPOTENCY_MISMATCH');const t=b?.transactions.find(t=>t.id===prior.transactionId);if(!t)throw new APIError('The original payment is unavailable. Check your activity before retrying.',409);return {unchanged:true,data:{payment:paymentForStudent(t),student:walletInfo(w),attemptId:attempt,replayed:true}}}
    const q=findQuote(n,p,resolveSession(n,tokenHash));if(!q.s)throw new APIError('Choose the receiving shop before paying.');
    if(q.r&&q.r.amount!==amount)throw new APIError('The amount must match this payment request.');
    if(w.balance<amount)throw new APIError('Your test student wallet has insufficient funds. Add sandbox funds to continue.',409,'INSUFFICIENT_FUNDS');
    const auto=applyAutomaticClosings(q.b,iso()),b=auto.state;
    const change=reduceBusiness(b,'PAY',{shopId:q.s.id,amount,payer:w.name,requestId:q.r?.id,attemptId:w.id+':'+attempt,method:p.method|| (q.r?'request':'qr'),status:'paid'},{role:'student'});
    if(!change.changed||change.entity.status!=='paid')throw new APIError('This request already has a payment in progress. Ask the merchant to check its status before trying again.',409,'REQUEST_PROCESSING');
    const t=change.entity;if(q.r?.counterId)t.counterId=q.r.counterId;t.studentWalletId=w.id;t.sandbox=true;t.confirmedAt=t.confirmedAt||iso();
    const stored=change.state.transactions.find(x=>x.id===t.id);Object.assign(stored,t);n.businesses[b.business.id]=change.state;
    w.balance-=amount;w.entries.unshift({id:uid('wallet-entry'),type:'merchant-payment',amount:-amount,attemptId:attempt,status:t.status,confirmedAt:t.confirmedAt,businessId:b.business.id,shopId:q.s.id,reference:t.reference,transactionId:t.id,createdAt:iso(),description:b.business.name+' · '+q.s.name});
    n.attempts[w.id+':'+attempt]={businessId:b.business.id,shopId:q.s.id,requestId:q.r?.id||null,transactionId:t.id,amount,createdAt:iso()};
    audit(n,'SANDBOX_PAYMENT_CONFIRMED',b.business.id,null,{transactionId:t.id,shopId:q.s.id,amount});
    return {data:{payment:paymentForStudent(t),student:walletInfo(w),attemptId:attempt,replayed:false}};
   });return response({...out.data,revision:out.revision},201);
  }
  if(method==='POST'&&['/api/action','/api/simulate'].includes(path)){
   const type=path==='/api/simulate'?'PAY':String(p.type||''),payload=copy(p.payload||p),proof=p.stepUpProof||payload.stepUpProof,proofHash=proof?await hashToken(proof):'';
   delete payload.stepUpProof;
   if(type==='APPROVE_REFUND'&&typeof payload.approve!=='boolean')throw new APIError('The refund decision must be true or false.',400,'INVALID_REFUND_DECISION');
   const refundAttempt=type==='REFUND'?attemptValue(payload.attemptId):null,refundHash=type==='REFUND'?await fingerprint({transactionId:payload.transactionId,amount:payload.amount,reason:String(payload.reason||'Customer refund').trim()}):null,settlementAttempt=type==='SETTLE'?attemptValue(payload.attemptId):null;
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash),b=n.businesses[c.user.businessId];
    if(c.counter&&!['CREATE_REQUEST','CANCEL_REQUEST','REFUND','ADD_TICKET','START_SHIFT','END_SHIFT'].includes(type))throw new APIError('Cashiers can collect payments and raise receipt-linked requests only.',403,'CASHIER_ACTION_FORBIDDEN');
    if(c.counter){
     const currentShift=b.shifts.find(shift=>shift.shopId===c.counter.shopId&&shift.staffId==='access-'+c.user.id&&shift.status==='open');
     if(payload.counterStaffId!=='access-'+c.user.id||(payload.counterShiftId||null)!==(currentShift?.id||null))throw new APIError('The cashier changed before this request arrived. Reopen the current counter before continuing.',409,'COUNTER_OPERATOR_CHANGED');
     delete payload.counterStaffId;delete payload.counterShiftId;
     const request=b.requests.find(r=>r.id===payload.id),tx=b.transactions.find(t=>t.id===payload.transactionId);
     const belongs=record=>record&&(c.counter?record.counterId===c.counter.id:record.staffId==='access-'+c.user.id);
     const permittedReceipt=record=>{if(belongs(record))return true;const confirmed=Date.parse(record?.confirmedAt||record?.createdAt||'');return !!record&&record.shopId===c.counter.shopId&&record.status==='paid'&&!record.counterId&&(record.attribution==='shop'||record.source==='guest-momo')&&Number.isFinite(confirmed)&&confirmed>=Date.now()-86400000&&confirmed<=Date.now()+30000;};
     if(type==='ADD_TICKET'&&!payload.transactionId&&payload.shopId!==c.counter.shopId)throw new APIError('Help requests must belong to this counter’s shop.',403,'COUNTER_SCOPE');
     if(type==='CANCEL_REQUEST'&&!belongs(request))throw new APIError('This request belongs to another counter.',403,'COUNTER_SCOPE');
     if((type==='REFUND'||type==='ADD_TICKET'&&payload.transactionId)&&!permittedReceipt(tx))throw new APIError('Choose a receipt collected at this counter.',403,'COUNTER_SCOPE');
    }
    if(['RESOLVE_PAYMENT','RESOLVE_SETTLEMENT'].includes(type)&&c.user.role!=='owner')throw new APIError('Only the sandbox owner can resolve simulated outcomes.',403);
    if(['REGISTER_BUSINESS','ADD_STAFF','UPDATE_STAFF'].includes(type))throw new APIError('Use account signup and user invitations to manage access.',403);
    const settlementKey=settlementAttempt?b.business.id+':'+settlementAttempt:null;
    if(type==='SETTLE'){
     if(c.user.role!=='owner')throw new APIError('Only the business owner can settle funds.',403,'OWNER_REQUIRED');
     const saved=n.settlementAttempts[settlementKey],original=saved?b.settlements.find(entry=>entry.id===saved.settlementId):b.settlements.find(entry=>entry.attemptId===settlementAttempt);
     if(saved&&!original)throw new APIError('The original settlement is unavailable. Contact support before starting another payout.',409,'SETTLEMENT_UNAVAILABLE');
     if(original){
      if(payload.amount!==original.amount||'destination'in payload&&payload.destination!==original.destination)throw new APIError('This settlement reference was already used for another amount or destination.',409,'IDEMPOTENCY_MISMATCH');
      return {unchanged:true,data:bundle(n,tokenHash,studentHash,{entity:copy(original),changed:false,replayed:true})};
     }
     if('destination'in payload&&payload.destination!==b.business.destination)throw new APIError('Settlements can use only the saved business destination. Update and verify the destination first.',403,'DESTINATION_MISMATCH');
     payload.destination=b.business.destination;stepUp(c,proof,'settlement',proofHash);
    }
    if(type==='UPDATE_BUSINESS'&&'destination'in payload)stepUp(c,proof,'destination',proofHash);
    if(type==='PAY'&&(c.user.role!=='owner'||path!=='/api/simulate'))throw new APIError('Student payments must come from a test wallet. Owners can use the clearly marked simulation tool.',403);
    const shopId=payload.shopId||(type==='UPDATE_SHOP'?b.shops.find(s=>s.id===payload.id)?.id:null)||b.transactions.find(t=>t.id===payload.transactionId||t.id===payload.id)?.shopId||b.requests.find(r=>r.id===payload.id)?.shopId||b.shifts?.find(s=>s.id===payload.id)?.shopId||c.user.shopIds[0];
    const actor=type==='PAY'?{role:'student'}:actorFor(n,c,b,shopId);
    const refundKey=refundAttempt?c.user.businessId+':'+c.user.id+':'+refundAttempt:null;
    if(refundKey&&n.refundAttempts[refundKey]){const old=n.refundAttempts[refundKey];if(old.fingerprint!==refundHash)throw new APIError('This refund reference was already used for another request.',409,'IDEMPOTENCY_MISMATCH');const entity=b.refunds.find(r=>r.id===old.refundId);if(!entity)throw new APIError('The original refund is unavailable. Contact the owner before trying again.',409);assigned(n,c.user,entity.shopId);return {unchanged:true,data:bundle(n,tokenHash,studentHash,{entity:copy(entity),changed:false,replayed:true})};}
    if(type==='REFUND'&&['owner','manager'].includes(c.user.role)||type==='APPROVE_REFUND'&&payload.approve===true&&b.refunds.find(r=>r.id===payload.id)?.status==='requested')stepUp(c,proof,'refund',proofHash);
    if(type==='CREATE_REQUEST'&&Number(payload.amount)>1000000)throw new APIError('Shared payment requests cannot exceed GH₵10,000.');
    if(type==='UPDATE_SHOP'&&payload.published===true){const target=b.shops.find(s=>s.id===payload.id);if(!target||!publicationReady(n,b,target))throw new APIError('Confirm location, display the QR, assign a counter operator and test a connected receiving phone before publishing.',409,'SHOP_NOT_READY');}
    projectUsers(n,b);const auto=applyAutomaticClosings(b,iso()),prior=copy(auto.state),change=reduceBusiness(auto.state,type,payload,actor);
    if(type==='CREATE_REQUEST'&&change.changed){const previousId=change.entity.id;change.entity.id=crypto.randomUUID();const request=change.state.requests.find(r=>r.id===previousId);request.id=change.entity.id;}
    if(type==='CREATE_REQUEST'&&c.counter){
     if(change.entity.counterId&&change.entity.counterId!==c.counter.id)throw new APIError('This request belongs to a different counter.',409,'IDEMPOTENCY_MISMATCH');
     const request=change.state.requests.find(r=>r.id===change.entity.id);request.counterId=c.counter.id;change.entity.counterId=c.counter.id;
    }
    if(type==='ADD_SHOP'){const previousId=change.entity.id;change.entity.id=crypto.randomUUID();change.state.shops.find(s=>s.id===previousId).id=change.entity.id;change.entity.code='LUM'+(++n.counters.shop);const sh=change.state.shops.find(s=>s.id===change.entity.id);sh.code=change.entity.code;sh.testAcceptanceToken=randomToken();change.entity.testAcceptanceToken=sh.testAcceptanceToken;c.user.shopIds=change.state.shops.map(s=>s.id)}
    if(refundKey)n.refundAttempts[refundKey]={businessId:b.business.id,userId:c.user.id,refundId:change.entity.id,fingerprint:refundHash,createdAt:iso()};
    if(settlementKey)n.settlementAttempts[settlementKey]={businessId:b.business.id,userId:c.user.id,settlementId:change.entity.id,amount:change.entity.amount,destination:change.entity.destination,createdAt:iso()};
    refundWallets(n,change.state,prior);projectUsers(n,change.state);n.businesses[b.business.id]=change.state;
    c.session.lastSeen=iso();return {data:bundle(n,tokenHash,studentHash,{entity:copy(change.entity),changed:change.changed})};
   });return response({...out.data,revision:out.revision});
  }
  if(method==='POST'&&path==='/api/invitations'){
   const token=randomToken();
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash,true),b=n.businesses[c.user.businessId],normalized=phone(p.phone),role=String(p.role);
    if(!['manager','cashier'].includes(role))throw new APIError('Choose a shop manager or cashier role.');
    const shops=validateShops(b,p.shopIds);
    if(n.invitations.filter(i=>i.businessId===b.business.id&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now()).length>=100)throw new APIError('This sandbox business already has 100 pending invitations. Revoke or accept them first.',429);
    if(n.invitations.some(i=>i.businessId===b.business.id&&i.phone===normalized&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now()))throw new APIError('An invitation is already waiting for this phone number.');
    const i={id:uid('invite'),token,businessId:b.business.id,name:text(p.name,'Full name',70),phone:normalized,role,shopIds:shops,status:'pending',createdAt:iso(),expiresAt:new Date(Date.now()+72*3600000).toISOString(),createdBy:c.user.id};
    n.invitations.push(i);audit(n,'INVITATION_CREATED',b.business.id,c.user.id,{invitationId:i.id});return {data:bundle(n,tokenHash,studentHash,{invitation:publicInvitation(i),...publicInvitation(i)})};
   });return response({...out.data,revision:out.revision},201);
  }
  if(method==='GET'&&path.startsWith('/api/invitations/')){
   const token=decodeURIComponent(path.split('/').pop()),{state:n}=await readNetwork(env),i=n.invitations.find(i=>i.token===token);
   if(!i)throw new APIError('This invitation could not be found.',404);
   const b=n.businesses[i.businessId];return response({invitation:{...publicInvitation(i),phone:undefined,shopNames:i.shopIds.map(id=>b.shops.find(s=>s.id===id)?.name||'Shop'),businessName:b.business.name,status:i.status==='pending'&&Date.parse(i.expiresAt)<=Date.now()?'expired':i.status,retryAllowed:i.status==='accepted'}});
  }
  if(method==='POST'&&path==='/api/invitations/accept'){
   const uname=username(p.username),password=await makePassword(p.password),recoveryKey=newRecoveryKey(),keyHash=await recoveryHash(recoveryKey),token=randomToken(),newHash=await hashToken(token);
   const out=await updateNetwork(env,async n=>{
    rateLimit(n,'invite-accept:'+ip,20);
    const i=n.invitations.find(i=>i.token===p.token);
    if(!i)throw new APIError('This invitation could not be found. Check its link or ask the owner for a new invitation.',404,'INVITATION_INVALID');
    if(i.status==='accepted'){
     const u=n.users.find(user=>user.id===i.acceptedBy&&user.businessId===i.businessId),b=n.businesses[i.businessId];
     if(!u||u.username!==uname||!await matchesPassword(p.password,u.password))throw new APIError('This invitation was already accepted. Retry with the original account details or sign in with that account.',409,'INVITATION_ACCEPTED');
     if(!u.active||!b||!['owner','manager','cashier'].includes(u.role))throw new APIError('This account’s access has changed. Ask the business owner to restore access before signing in.',403,'INVITATION_ACCESS_CHANGED');
     try{validateShops(b,u.role==='owner'?b.shops.map(shop=>shop.id):u.shopIds)}catch{throw new APIError('This account’s shop access has changed. Ask the owner to confirm its assignments.',403,'INVITATION_ACCESS_CHANGED')}
     newSession(n,u,newHash,false,String(p.deviceLabel||'Shop browser'));audit(n,'INVITATION_ACCEPTANCE_RESUMED',b.business.id,u.id,{invitationId:i.id});
     return {data:bundle(n,newHash,studentHash,{replayed:true,recoveryKeyAvailable:false,keyUnavailable:true,recoveryAction:'regenerate'})};
    }
    if(i.status==='revoked')throw new APIError('This invitation was revoked. Ask the owner for a new invitation.',409,'INVITATION_REVOKED');
    if(i.status!=='pending')throw new APIError('This invitation is no longer available. Ask the owner to confirm your access.',409,'INVITATION_INVALID');
    if(Date.parse(i.expiresAt)<=Date.now())throw new APIError('This invitation expired. Ask the owner for a new invitation.',409,'INVITATION_EXPIRED');
    if(n.users.some(u=>u.username===uname))throw new APIError('That username is already in use. Choose another username for this invitation.',400,'USERNAME_TAKEN');
    const b=n.businesses[i.businessId];validateShops(b,i.shopIds);if(n.users.filter(u=>u.businessId===b.business.id).length>=100)throw new APIError('This sandbox business has reached its 100-user allowance.',429);
    const u={id:uid('user'),businessId:i.businessId,username:uname,name:i.name,phone:i.phone,role:i.role,shopIds:[...i.shopIds],active:true,password,recoveryHash:keyHash,recoveryKeyPending:true,recoveryKeyReference:uid('recovery-key'),recoveryKeyIssuedAt:iso(),sessionVersion:1,createdAt:iso(),updatedAt:iso(),passwordChangedAt:iso()};
    n.users.push(u);i.status='accepted';i.acceptedAt=iso();i.acceptedBy=u.id;projectUsers(n,b);newSession(n,u,newHash,false,String(p.deviceLabel||'Shop browser'));audit(n,'INVITATION_ACCEPTED',b.business.id,u.id);
    return {data:bundle(n,newHash,studentHash,{recoveryKey,recoveryKeyReference:u.recoveryKeyReference,recoveryKeyAvailable:true,replayed:false})};
   });return response({...out.data,revision:out.revision},out.data.replayed?200:201,[sessionCookie(token)]);
  }
  const inviteAction=path.match(/^\/api\/invitations\/([^/]+)\/(resend|revoke)$/);
  if(method==='POST'&&inviteAction){
   const token=randomToken();
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash,true),i=n.invitations.find(i=>i.id===inviteAction[1]&&i.businessId===c.user.businessId);
    if(!i||i.status==='accepted')throw new APIError('This invitation cannot be changed.');
    if(inviteAction[2]==='resend'){i.token=token;i.status='pending';i.expiresAt=new Date(Date.now()+72*3600000).toISOString();i.resentAt=iso()}else{i.status='revoked';i.revokedAt=iso()}
    audit(n,'INVITATION_'+(inviteAction[2]==='resend'?'REISSUED':'REVOKED'),i.businessId,c.user.id,{invitationId:i.id});return {data:bundle(n,tokenHash,studentHash,{invitation:publicInvitation(i),...publicInvitation(i)})};
   });return response({...out.data,revision:out.revision});
  }
  const userPath=path.match(/^\/api\/users\/([^/]+)(?:\/(reset))?$/);
  if(method==='POST'&&userPath){
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash,true),u=n.users.find(u=>u.id===userPath[1]&&u.businessId===c.user.businessId),b=n.businesses[c.user.businessId];
    if(!u)throw new APIError('User not found.',404);
    if(userPath[2]==='reset'){
     const r={id:uid('recovery'),userId:u.id,userVersion:u.sessionVersion||1,createdAt:iso(),expiresAt:new Date(Date.now()+5*60000).toISOString(),usedAt:null};n.recoveries.unshift(r);retainRecoveries(n,u.id);
     audit(n,'PASSWORD_RECOVERY_REQUESTED',u.businessId,c.user.id,{targetUserId:u.id});return {data:{challengeId:r.id,username:u.username,maskedPhone:'••••'+u.phone.slice(-4),method:'recovery-key',expiresAt:r.expiresAt}};
    }
    const changes=p.updates||p,previous=JSON.stringify([u.role,u.shopIds,u.active]);
    if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new APIError('Send account changes as an object.',400,'INVALID_ACCOUNT_STATUS');
    if('active'in changes&&typeof changes.active!=='boolean')throw new APIError('Account status must be true or false.',400,'INVALID_ACCOUNT_STATUS');
    if(u.role==='owner'&&('role'in changes&&changes.role!=='owner'||changes.active===false))throw new APIError('Use ownership handover before changing the owner’s access.');
    if(changes.name!==undefined)u.name=text(changes.name,'Full name',70);
    if(changes.role!==undefined){if(!['manager','cashier','owner'].includes(changes.role)||changes.role==='owner'&&u.role!=='owner')throw new APIError('Use ownership handover to appoint an owner.');u.role=changes.role}
    if(changes.shopIds!==undefined)u.shopIds=u.role==='owner'?b.shops.map(s=>s.id):validateShops(b,changes.shopIds);
    if(changes.active!==undefined)u.active=changes.active;u.updatedAt=iso();
    if(previous!==JSON.stringify([u.role,u.shopIds,u.active])){u.sessionVersion=(u.sessionVersion||1)+1;revokeSessions(n,u.id,'Account access changed')}
    if(u.role==='owner')b.business.ownerName=u.name;for(const d of n.devices)if(d.userId===u.id&&(!u.active||u.role!=='owner'&&!u.shopIds.includes(d.shopId))){d.enabled=false;d.revokedAt=iso()}projectUsers(n,b);audit(n,'USER_UPDATED',u.businessId,c.user.id,{targetUserId:u.id});return {data:bundle(n,tokenHash,studentHash,{user:publicUser(u)})};
   });return response({...out.data,revision:out.revision});
  }
  const sessionPath=path.match(/^\/api\/sessions\/([^/]+)\/revoke$/);
  if(method==='POST'&&sessionPath){
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash),s=n.sessions.find(s=>s.id===sessionPath[1]&&s.businessId===c.user.businessId);
    if(!s||c.user.role!=='owner'&&s.userId!==c.user.id)throw new APIError('This session is outside your access.',403);
    s.revokedAt=iso();s.revokeReason='Session revoked';if(s.counterId){const counter=n.businesses[c.user.businessId]?.counterDevices?.find(d=>d.id===s.counterId);if(counter)counter.revokedAt=s.revokedAt;}audit(n,'SESSION_REVOKED',c.user.businessId,c.user.id,{sessionId:s.id});return {data:bundle(n,tokenHash,studentHash,{success:true})};
   });return response({...out.data,revision:out.revision});
  }
  if(method==='GET'&&path==='/api/devices'){
   const {state:n,revision}=await readNetwork(env),c=requireSession(n,tokenHash);
   return response({revision,devices:n.devices.filter(d=>d.businessId===c.user.businessId&&(c.counter?d.id===c.counter.deviceId:c.user.role==='owner'||d.userId===c.user.id)).map(d=>publicDevice(d,n))});
  }
if(method==='POST'&&path==='/api/devices'){
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash);if(c.counter)throw new APIError('This counter is already paired. Ask the owner to change its setup.',403,'COUNTER_ONLY');assigned(n,c.user,p.shopId);
    const deviceId=text(p.deviceId,'Device identifier',100),previous=n.devices.find(d=>d.id===deviceId);
    if(previous?.revokedAt)requireFreshDeviceOwner(c,previous);
    if(previous&&(previous.businessId!==c.user.businessId||previous.userId!==c.user.id))throw new APIError('This browser was paired by another account. Use a new pairing identifier.',409);
    if(!previous&&n.devices.filter(d=>d.userId===c.user.id&&!d.revokedAt).length>=10)throw new APIError('Revoke an old receiving phone before pairing another.',429);
    const d=previous||{id:deviceId,businessId:c.user.businessId,userId:c.user.id,createdAt:iso()};
    Object.assign(d,{shopId:p.shopId,label:text(p.label||'Receiving phone','Device label',70),sessionId:c.session.id,pairedAt:iso(),enabled:true,soundReady:false,announcementFailed:false,failureVersion:Number.isSafeInteger(previous?.failureVersion)?previous.failureVersion:0,testedAt:null,revokedAt:null,lastSeen:iso()});if(!previous)n.devices.push(d);
    audit(n,'DEVICE_PAIRED',c.user.businessId,c.user.id,{deviceId,shopId:p.shopId});return {data:bundle(n,tokenHash,studentHash,{device:publicDevice(d,n)})};
   });return response({...out.data,revision:out.revision});
  }
  const devicePath=path.match(/^\/api\/devices\/([^/]+)$/);
  if(method==='POST'&&devicePath){
   const out=await updateNetwork(env,n=>{
    const c=requireSession(n,tokenHash),d=n.devices.find(d=>d.id===decodeURIComponent(devicePath[1])&&d.businessId===c.user.businessId);
    if(c.counter&&(!['heartbeat','test','disable','enable'].includes(p.action)||d?.id!==c.counter.deviceId))throw new APIError('This receiving phone is outside your counter access.',403,'COUNTER_ONLY');
    if(!d||c.user.role!=='owner'&&d.userId!==c.user.id)throw new APIError('This receiving phone is outside your access.',403);
    if(p.action!=='revoke')assigned(n,c.user,d.shopId);
    if(d.revokedAt&&p.action!=='enable'&&p.action!=='revoke')throw new APIError('This receiving phone was revoked. Pair it again.',403);
    if(d.revokedAt&&p.action==='enable')requireFreshDeviceOwner(c,d);
    if(['heartbeat','test'].includes(p.action)&&d.sessionId!==c.session.id)throw new APIError('Pair this receiving phone with the current sign-in before testing or updating it.',403,'DEVICE_SESSION_CHANGED');
    if(p.action==='heartbeat'){d.lastSeen=iso();if(p.announcementFailed===true){d.announcementFailed=true;d.failureVersion=(Number.isSafeInteger(d.failureVersion)?d.failureVersion:0)+1;}d.soundReady=d.announcementFailed!==true&&p.soundReady===true&&d.enabled===true&&!!d.testedAt}
    else if(p.action==='test'){if(!d.enabled||p.soundReady!==true)throw new APIError('Play and confirm the voice test on this phone first.');const version=Number.isSafeInteger(d.failureVersion)?d.failureVersion:0,expected=p.expectedFailureVersion===undefined&&version===0?0:p.expectedFailureVersion;if(!Number.isSafeInteger(expected)||expected!==version)throw new APIError('This sound test was completed before the latest announcement failure. Play a new test before serving.',409,'AUDIO_TEST_STALE');d.testedAt=iso();d.soundReady=true;d.announcementFailed=false;d.lastSeen=iso()}
    else if(p.action==='revoke'){
     const ids=d.sessionId?[d.sessionId]:n.sessions.filter(s=>s.userId===d.userId&&s.businessId===d.businessId&&!s.revokedAt).map(s=>s.id);
     for(const s of n.sessions)if(ids.includes(s.id)&&!s.revokedAt){s.revokedAt=iso();s.revokeReason='Receiving phone revoked';if(s.counterId){const counter=n.businesses[c.user.businessId]?.counterDevices?.find(counter=>counter.id===s.counterId);if(counter)counter.revokedAt=s.revokedAt;}}
     for(const device of n.devices)if(device.id===d.id||ids.includes(device.sessionId)){device.revokedAt=iso();device.enabled=false;device.soundReady=false}
     audit(n,'DEVICE_AND_SESSION_REVOKED',c.user.businessId,c.user.id,{deviceId:d.id});
    }
    else if(p.action==='disable'){d.enabled=false;d.soundReady=false}
    else if(p.action==='enable'){d.enabled=true;d.revokedAt=null;d.soundReady=false;d.lastSeen=iso()}
    else throw new APIError('Choose a supported receiving-phone action.');
    return {data:bundle(n,tokenHash,studentHash,{device:publicDevice(d,n)})};
   });return response({...out.data,revision:out.revision});
  }

  throw new APIError('This service route was not found.',404,'NOT_FOUND');
 }catch(error){
  const internal=!(error instanceof APIError)&&/(D1_ERROR|SQLITE_|no such table|Cannot read|undefined|not a function|PBKDF2|WebCrypto)/i.test(error?.message||'');
  return response({error:internal?'The shared service is temporarily unavailable. Please retry when connected.':error?.message||'The request could not be completed.',code:internal?'SERVICE_UNAVAILABLE':error.code||'REQUEST_FAILED'},internal?503:error.status||400);
 }
}
