import {reduceBusiness} from '../dist/domain.js';
import {APIError,resolveSession,requireSession,assigned,uid,iso,randomToken,hashToken,matchesPassword,audit,projectUsers} from './network.js';
const PIN_ITERATIONS=100000;
const pinValid=pin=>typeof pin==='string'&&/^\d{6}$/.test(pin)&&!/^([0-9])\1{5}$/.test(pin)&&!['123456','654321'].includes(pin);
export async function makeCashierPin(pin){
 if(!pinValid(pin))throw new APIError('Choose six digits. Avoid repeated digits and 123456.');
 const salt=crypto.getRandomValues(new Uint8Array(16)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:PIN_ITERATIONS,hash:'SHA-256'},key,256);
 return {salt:btoa(String.fromCharCode(...salt)),hash:btoa(String.fromCharCode(...new Uint8Array(bits))),iterations:PIN_ITERATIONS,algorithm:'PBKDF2-SHA256'};
}
export function cashierRoster(n,businessId,shopId){return n.users.filter(u=>u.businessId===businessId&&u.active&&u.role==='cashier'&&(!shopId||u.shopIds.includes(shopId))).map(u=>({id:'access-'+u.id,userId:u.id,name:u.name,shopIds:[...u.shopIds],pinReady:!!u.cashierPin}));}
export function publicCounter(n,c){
 if(!c?.counter)return null;
 const d=c.counter,b=n.businesses[d.businessId],shop=b?.shops.find(s=>s.id===d.shopId),eligible=cashierRoster(n,d.businessId,d.shopId).filter(p=>d.mode!=='dedicated'||p.userId===d.staffUserId);
 const shift=n.businesses[d.businessId]?.shifts?.find(s=>s.shopId===d.shopId&&s.staffId==='access-'+c.user.id&&s.status==='open');
 return {id:d.id,deviceId:d.deviceId,label:d.label,mode:d.mode,shopId:d.shopId,shopName:shop?.name||'Shop counter',shopCode:shop?.code||'',businessName:b?.business.name||'Lumo merchant',locked:c.locked,staffId:c.locked?null:'access-'+c.user.id,staffName:c.locked?null:c.user.name,eligibleStaff:eligible.map(({id,userId,name,pinReady})=>({id,userId,name,pinReady})),shiftId:c.locked?null:shift?.id||null,pairedAt:d.createdAt};
}
export function lockedCounterState(n,c){
 const b=n.businesses[c.user.businessId],shop=b.shops.find(s=>s.id===c.counter.shopId);
 return {version:b.version,revision:b.revision||0,mode:'registered',business:{id:b.business.id,name:b.business.name,accountNumber:''},openingBalance:0,shops:shop?[{id:shop.id,name:shop.name,code:shop.code,area:shop.area,lat:shop.lat,lng:shop.lng,open:shop.open,accepting:shop.accepting}]:[],staff:[],transactions:[],requests:[],refunds:[],shifts:[],tickets:[],settlements:[],closings:[],reconciliations:[],audit:[]};
}
export function counterScope(n,c,scoped){
 if(!c.counter||!scoped)return scoped;
 const b=n.businesses[c.user.businessId],counter=c.counter;
 // A handover keeps counter receipts visible while preserving the original cashier.
 // General shop QR receipts are not mixed into this request-specific journal.
 scoped.shops=scoped.shops.filter(s=>s.id===counter.shopId);
 scoped.transactions=b.transactions.filter(t=>t.shopId===counter.shopId&&t.counterId===counter.id).map(t=>{const out={...t};delete out.studentWalletId;return out;});
 scoped.requests=b.requests.filter(r=>r.shopId===counter.shopId&&r.counterId===counter.id).map(r=>({...r}));
 const payments=new Set(scoped.transactions.map(t=>t.id));
 scoped.refunds=b.refunds.filter(r=>payments.has(r.transactionId)).map(r=>({...r}));
 scoped.shifts=b.shifts.filter(s=>s.shopId===counter.shopId&&(s.counterId===counter.id||s.staffId==='access-'+c.user.id)).map(s=>({...s}));
 scoped.tickets=b.tickets.filter(t=>payments.has(t.transactionId)).map(t=>({...t}));
 scoped.shopQRReceipts=b.transactions.filter(t=>t.shopId===counter.shopId&&!t.requestId&&t.status==='paid'&&Date.parse(t.confirmedAt||t.createdAt)>=Date.now()-86400000).sort((a,b)=>String(b.confirmedAt||b.createdAt).localeCompare(String(a.confirmedAt||a.createdAt))).slice(0,20).map(t=>({id:t.id,shopId:t.shopId,payer:t.payer,amount:t.amount,status:'paid',createdAt:t.createdAt,confirmedAt:t.confirmedAt||t.createdAt,reference:t.reference,method:'shop-qr',requestId:null,unattributed:true}));
 scoped.accessScope='counter';return scoped;
}
function anchor(n,tokenHash){const c=resolveSession(n,tokenHash);if(!c?.counter)throw new APIError('Set up this shop counter first.',403,'COUNTER_REQUIRED');return c;}
function manage(n,tokenHash,shopId){const c=requireSession(n,tokenHash);if(c.counter||!['owner','manager'].includes(c.user.role))throw new APIError('A business owner or assigned manager must approve this counter.',403,'COUNTER_MANAGER_REQUIRED');if(shopId)assigned(n,c.user,shopId);return c;}
function endShift(n,c,note){
 const b=n.businesses[c.user.businessId],staffId='access-'+c.user.id,shift=b.shifts.find(s=>s.shopId===c.counter.shopId&&s.staffId===staffId&&s.status==='open');
 if(shift){const out=reduceBusiness(b,'END_SHIFT',{id:shift.id,note},c.user.active?{role:'cashier',userId:c.user.id,shopId:c.counter.shopId,staffId}:{role:'owner',userId:c.anchorUser?.id});n.businesses[b.business.id]=out.state;}
}
export async function counterAction(n,tokenHash,path,p){
 if(path==='/api/counter/setup'){
  const c=manage(n,tokenHash,p.shopId),b=n.businesses[c.user.businessId];
  if(!['shared','dedicated'].includes(p.mode))throw new APIError('Choose a shared or dedicated phone.');
  if(typeof p.deviceId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(p.deviceId))throw new APIError('Use this phone’s receiving-device identifier.');
  const eligible=cashierRoster(n,b.business.id,p.shopId),target=eligible.find(st=>st.userId===p.staffUserId||st.id===p.staffUserId);
  if(p.mode==='dedicated'&&!target)throw new APIError('Assign an active cashier for this dedicated phone.');
  const label=String(p.label||'Shop counter').trim();if(!label||label.length>70)throw new APIError('Use a counter name of 70 characters or fewer.');
  const previous=n.devices.find(d=>d.id===p.deviceId);
  if(previous?.revokedAt)throw new APIError('This receiving phone was revoked. Restore it from a fresh owner sign-in before setting up a counter.',403,'DEVICE_REVOKED');
  if(previous&&(previous.businessId!==b.business.id||previous.sessionId!==c.session.id))throw new APIError('This receiving phone is already paired elsewhere. Start a new phone pairing first.',409,'DEVICE_ALREADY_PAIRED');
  b.counterDevices=b.counterDevices||[];
  if(b.counterDevices.filter(d=>!d.revokedAt).length>=30)throw new APIError('Revoke an old counter before pairing another.',429,'COUNTER_LIMIT');
  const d={id:uid('counter'),deviceId:p.deviceId,businessId:b.business.id,shopId:p.shopId,label,mode:p.mode,staffUserId:p.mode==='dedicated'?target.userId:null,authorizedBy:c.user.id,sessionId:c.session.id,createdAt:iso(),revokedAt:null};b.counterDevices.push(d);
  Object.assign(c.session,{counterId:d.id,counterUserId:null,counterLockedAt:iso(),counterUnlockedUntil:null,stepUpHash:null,stepUpExpiresAt:null,_sharedStepUpVerified:false});
  c.session.expiresAt=new Date(Date.now()+30*86400000).toISOString();c.session.remember=true;
  const receiver=previous||{id:p.deviceId,businessId:b.business.id,createdAt:iso()};Object.assign(receiver,{shopId:p.shopId,userId:'locked-'+d.id,label,sessionId:c.session.id,pairedAt:iso(),enabled:true,soundReady:false,announcementFailed:false,failureVersion:0,testedAt:null,revokedAt:null,lastSeen:iso()});if(!previous)n.devices.push(receiver);
  audit(n,'COUNTER_APPROVED',b.business.id,c.user.id,{counterId:d.id,shopId:d.shopId,mode:d.mode});return {};
 }
 if(path==='/api/counter/pin'){
  const c=manage(n,tokenHash),u=n.users.find(u=>u.id===(p.userId||String(p.staffId||'').replace(/^access-/,''))&&u.businessId===c.user.businessId&&u.active&&u.role==='cashier');
  if(!u||c.user.role==='manager'&&!u.shopIds.every(id=>c.user.shopIds.includes(id)))throw new APIError('Choose a cashier at one of your assigned shops.',403,'FORBIDDEN');
  u.cashierPin=await makeCashierPin(p.pin);u.cashierPinVersion=(u.cashierPinVersion||0)+1;u.updatedAt=iso();
  for(const s of n.sessions)if(s.counterUserId===u.id){s.counterLockedAt=iso();s.counterUserId=null;s.counterUnlockedUntil=null;}
  audit(n,'CASHIER_PIN_SET',u.businessId,c.user.id,{userId:u.id});return {success:true};
 }
 if(path==='/api/counter/unlock'){
  const c=anchor(n,tokenHash),d=c.counter,key='counter-pin:'+d.id,now=Date.now();
  const bucket=n.rateLimits[key];if(bucket&&now-bucket.startedAt<300000&&bucket.count>=5)return {counterError:{status:429,code:'PIN_RATE_LIMITED',error:'Too many PIN attempts. Wait five minutes before trying again.'}};
  n.rateLimits[key]=bucket&&now-bucket.startedAt<300000?{...bucket,count:bucket.count+1}:{count:1,startedAt:now,windowMs:300000,businessId:d.businessId};
  const userId=p.userId||String(p.staffId||'').replace(/^access-/,''),u=n.users.find(u=>u.id===userId&&u.businessId===d.businessId&&u.active&&u.role==='cashier'&&u.shopIds.includes(d.shopId));
  const userKey=u?'cashier-pin:'+u.id:null,userBucket=userKey?n.rateLimits[userKey]:null;
  if(userBucket&&now-userBucket.startedAt<300000&&userBucket.count>=5)return {counterError:{status:429,code:'PIN_RATE_LIMITED',error:'Too many PIN attempts for this cashier. Wait five minutes before trying again.'}};
  if(userKey)n.rateLimits[userKey]=userBucket&&now-userBucket.startedAt<300000?{...userBucket,count:userBucket.count+1}:{count:1,startedAt:now,windowMs:300000,businessId:d.businessId};
  const valid=!!u&&(d.mode!=='dedicated'||d.staffUserId===u.id)&&typeof p.pin==='string'&&/^\d{6}$/.test(p.pin)&&await matchesPassword(p.pin,u.cashierPin);
  if(!valid)return {counterError:{status:403,code:'CASHIER_PIN_INVALID',error:'That cashier and PIN could not be verified.'}};
  if(!c.locked&&c.user.id!==u.id)return {counterError:{status:409,code:'HANDOVER_REQUIRED',error:'End the current cashier’s shift before switching.'}};
  if(c.session.counterUserId&&c.session.counterUserId!==u.id){
   const previous=n.users.find(person=>person.id===c.session.counterUserId);if(previous)endShift(n,{...c,user:{...previous,shopIds:[d.shopId]}},String(p.note||'Counter handover').slice(0,500));
  }
  delete n.rateLimits[key];if(userKey)delete n.rateLimits[userKey];Object.assign(c.session,{counterUserId:u.id,counterLockedAt:null,counterUnlockedUntil:new Date(now+12*3600000).toISOString(),lastSeen:iso()});
  const b=n.businesses[d.businessId];projectUsers(n,b);
  const started=reduceBusiness(b,'START_SHIFT',{shopId:d.shopId},{role:'cashier',userId:u.id,shopId:d.shopId,staffId:'access-'+u.id});n.businesses[b.business.id]=started.state;const shift=started.state.shifts.find(s=>s.id===started.entity.id);if(shift&&!shift.counterId)shift.counterId=d.id;
  const receiver=n.devices.find(device=>device.id===d.deviceId);if(receiver)Object.assign(receiver,{userId:u.id,sessionId:c.session.id,lastSeen:iso(),soundReady:false});
  audit(n,'COUNTER_UNLOCKED',d.businessId,u.id,{counterId:d.id,shopId:d.shopId});return {};
 }
 if(path==='/api/counter/lock'){
  const c=anchor(n,tokenHash);
  if(!c.locked&&p.endShift===true){const shift=n.businesses[c.user.businessId].shifts.find(s=>s.shopId===c.counter.shopId&&s.staffId==='access-'+c.user.id&&s.status==='open');if(p.counterStaffId!=='access-'+c.user.id||(p.counterShiftId||null)!==(shift?.id||null))throw new APIError('The cashier changed before this handover arrived. Reopen the current counter.',409,'COUNTER_OPERATOR_CHANGED');}
  if(!c.locked&&p.endShift===true)endShift(n,c,String(p.note||'').trim().slice(0,500));
  c.session.counterLockedAt=iso();c.session.counterUnlockedUntil=null;
  const receiver=n.devices.find(device=>device.id===c.counter.deviceId);if(receiver){receiver.soundReady=false;receiver.userId='locked-'+c.counter.id;}
  audit(n,p.endShift===true?'COUNTER_HANDOVER':'COUNTER_LOCKED',c.user.businessId,c.locked?null:c.user.id,{counterId:c.counter.id});return {};
 }
 if(path==='/api/counter/revoke'){
  const c=manage(n,tokenHash),b=n.businesses[c.user.businessId],d=b.counterDevices?.find(d=>d.id===(p.counterId||p.id));if(!d)throw new APIError('Counter not found.',404);assigned(n,c.user,d.shopId);
  d.revokedAt=iso();const s=n.sessions.find(s=>s.id===d.sessionId);if(s){s.revokedAt=iso();s.revokeReason='Counter revoked';}
  const receiver=n.devices.find(device=>device.id===d.deviceId);if(receiver){receiver.revokedAt=iso();receiver.enabled=false;receiver.soundReady=false;}
  audit(n,'COUNTER_REVOKED',b.business.id,c.user.id,{counterId:d.id});return {success:true};
 }
 throw new APIError('Unknown counter action.',404);
}
