import assert from 'node:assert/strict';
import {randomBytes,randomUUID,randomInt} from 'node:crypto';
import {writeFile,mkdir,readFile,chmod} from 'node:fs/promises';
const url='https://iwutbrljiiodamtyoorg.supabase.co',key='sb_publishable_4dmChQek8k-opkVhO4N_KA_TCGVjWi6';
const origin=process.env.LUMO_VERIFY_ORIGIN||'https://lumo-connected-pilot.vercel.app';
const privatePath=new URL('../verification/private/approved-merchant-fixtures.json',import.meta.url);
let fixture;try{fixture=JSON.parse(await readFile(privatePath,'utf8'))}catch{fixture={runId:Date.now().toString(36)+randomBytes(2).toString('hex'),identities:{},attempts:{}}}
const runId=fixture.runId,checks=[];
async function save(){await mkdir(new URL('../verification/private/',import.meta.url),{recursive:true,mode:0o700});await writeFile(privatePath,JSON.stringify(fixture),{mode:0o600});await chmod(privatePath,0o600)}
const attempt=prefix=>fixture.attempts[prefix]||=(prefix+'-'+randomUUID());
let reused=[];try{reused=JSON.parse(await readFile(new URL('../verification/private/connected-experience-identities.json',import.meta.url),'utf8'))}catch{}

const phone=()=> '02'+String(randomInt(10000000,99999999));
async function call(body,token){const response=await fetch(url+'/functions/v1/lumo-approved',{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});const data=await response.json();return {...data,httpStatus:response.status};}
function check(condition,label){assert.ok(condition,label);checks.push(label);console.log('PASS '+label);}
function ok(data,label){check(data.ok===true,label+(data.ok?'':' ['+(data.code||data.error?.code||data.httpStatus)+']'));return data;}
async function register(label,mode){
 const indexes={owner:3,a:0,b:1,cashier:2};const prior=fixture.identities[label]||reused[indexes[label]];
 const user=prior?{...prior,phone:prior.phone||phone()}:{handle:'mv7'+runId+label,password:randomBytes(20).toString('hex')+'Aa1',phone:phone(),pin:String(randomInt(100000,999999))};
 fixture.identities[label]=user;await save();
 const result=ok(await call(prior?{action:'login',mode,handle:user.handle,password:user.password}:{action:'register',mode,handle:user.handle,password:user.password,displayName:'Merchant verification '+label,phone:user.phone,...(mode==='merchant'?{}:{pin:user.pin})}),label+' account opens with exact approved credentials');
 user.token=result.session.access_token;if(!Object.hasOwn(user,'initialBalance'))user.initialBalance=result.account.balance;await save();return user;
}
async function merchant(user,path,body){await save();const result=await call({action:'merchant',path,method:body?'POST':'GET',body:body||{},merchantToken:user.merchantToken||null,...(path==='/api/auth/step-up'?{password:user.password}:{})},user.token);if(Object.hasOwn(result,'merchantToken'))user.merchantToken=result.merchantToken;await save();return result;}
const action=async(user,type,payload,id=attempt(type+'-'+user.handle))=>{await save();return call({action:'action',type,payload,attemptId:id,pin:user.pin},user.token)};
const mutate=(user,type,payload)=>merchant(user,'/api/action',{type,payload});
async function stepup(user){const result=ok(await merchant(user,'/api/auth/step-up',{currentPassword:user.password,purpose:'refund'}),'merchant password confirmation is checked by both services');return result.proof;}
async function joinStaff(owner,handle,role,shopIds){const staff=await register(handle,'merchant'),invite=ok(await merchant(owner,'/api/invitations',{name:'Verification '+role,phone:staff.phone,role,shopIds}),'original '+role+' invitation creates shared access');const accepted=ok(await merchant(staff,'/api/invitations/accept',{token:invite.invitation.token,username:staff.handle,password:staff.password}),'invited '+role+' accepts using original username/password flow');return {staff,accepted};}
try{
 const owner=await register('owner','merchant'),a=await register('a'),b=await register('b');
 const signed=ok(await merchant(owner,'/api/signup',{name:'Approved v7 verification '+runId,ownerName:'Verification Owner',phone:owner.phone,businessType:'sole-trader',destination:'Test destination only',verification:{identity:true,face:true},shop:{name:'Verification Night Market',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:owner.handle,password:owner.password},attemptId:attempt('signup')}),'seven-stage merchant payload creates business without an extra PIN');
 const shopId=signed.state.shops[0].id,businessId=signed.state.business.id,testKey=signed.state.shops[0].testAcceptanceToken;
 await merchant(owner,'/api/auth/recovery-key/ack',{reference:signed.recoveryKeyReference});
 ok(await action(a,'fund',{amount:50000,source:'Pilot test funding',rail:'lumo'}),'first consumer receives explicit pilot test funds');
 ok(await action(b,'fund',{amount:20000,source:'Pilot test funding',rail:'lumo'}),'second consumer receives explicit pilot test funds');
 const payload={shopId,amount:20000,description:'Verified fixed order',attemptId:attempt('fixed-request')};
 const created=ok(await mutate(owner,'CREATE_REQUEST',payload),'approved keypad creates canonical fixed request');
 check(/^[a-f0-9-]{36}$/.test(created.entity.id),'fixed request uses canonical UUID');
 const repeated=ok(await mutate(owner,'CREATE_REQUEST',payload),'retry finds original fixed request');check(repeated.entity.id===created.entity.id,'retry does not generate a second QR request');
 const quote=ok(await call({action:'quote',shopId,requestId:created.entity.id,testKey},a.token),'consumer quote resolves same approved merchant request');check(quote.request.amount===20000,'server quote locks fixed amount');
 const mismatched=await action(a,'payment',{rail:'merchant',shopId,testKey,requestId:created.entity.id,amount:19999,merchant:'Verification order'});check(mismatched.ok===false,'changed fixed amount cannot move money');
 const paymentId=attempt('consumer-merchant-payment'),paymentPayload={rail:'merchant',shopId,testKey,requestId:created.entity.id,amount:20000,merchant:'Verification order',fee:0};
 const paid=ok(await action(a,'payment',paymentPayload,paymentId),'first consumer pays the approved merchant');const paidAgain=ok(await action(a,'payment',paymentPayload,paymentId),'lost-response retry resolves original merchant payment');
 check(paid.account.balance===a.initialBalance+30000&&paidAgain.account.balance===a.initialBalance+30000,'consumer debit occurs exactly once');
 const ownerView=ok(await merchant(owner,'/api/session'),'merchant refresh receives canonical consumer receipt');check(ownerView.state.transactions.length===1&&ownerView.state.transactions[0].amount===20000,'original merchant receipt shows canonical payment amount');
 const request2=ok(await mutate(owner,'CREATE_REQUEST',{shopId,amount:5000,description:'Second consumer',attemptId:attempt('fixed-request-second')}),'second fixed request creates independently');
 ok(await action(b,'payment',{rail:'merchant',shopId,testKey,requestId:request2.entity.id,amount:5000,merchant:'Second verification order',fee:0}),'second consumer pays the same merchant backend');
 const beforeRefund=ok(await merchant(owner,'/api/session'),'merchant has both consumer payments');check(beforeRefund.state.transactions.length===2,'both consumer receipts share the same approved merchant workspace');
 const refundPayload={transactionId:ownerView.state.transactions[0].id,amount:2500,reason:'Verification partial return',attemptId:attempt('refund'),stepUpProof:await stepup(owner)};
 const refund=ok(await mutate(owner,'REFUND',refundPayload),'approved refund returns shared funds to original payer');const refundAgain=ok(await mutate(owner,'REFUND',refundPayload),'refund retry finds original canonical outcome');check(refund.entity.id===refundAgain.entity.id,'refund retry does not return funds twice');
 const aAfter=ok(await call({action:'snapshot'},a.token),'original consumer receives refund');check(aAfter.account.balance===a.initialBalance+32500,'consumer balance includes exactly one merchant refund');
 const close=ok(await mutate(owner,'CLOSE_DAY',{shopId}),'approved daily close archives current shop report');check(close.entity.gross===25000&&close.entity.refunds===2500&&close.entity.net===22500,'daily close archives exact shared gross/refunds/net');
 const afterClose=ok(await merchant(owner,'/api/session'),'merchant refresh preserves business funds after close');const paidTotal=afterClose.state.transactions.reduce((n,t)=>n+t.amount,0),refundTotal=afterClose.state.refunds.filter(r=>r.status==='paid').reduce((n,r)=>n+r.amount,0);check(afterClose.state.openingBalance+paidTotal-refundTotal===22500,'daily close resets shop view without removing master account funds');
 const denied=await call({action:'merchant',path:'/api/session',method:'GET',merchantToken:owner.merchantToken,body:{}},b.token);check(denied.ok===false&&denied.code==='FORBIDDEN','another consumer cannot reuse merchant session authority');
 const anonRead=await fetch(url+'/rest/v1/rpc/lumo_approved_merchant_read',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}'});check(!anonRead.ok,'raw merchant network RPC is inaccessible to public callers');
 if(process.env.LUMO_MERCHANT_FULL_TEST==='1'){
  const second=ok(await mutate(owner,'ADD_SHOP',{name:'Verification Pentagon',area:'Legon',category:'Food',lat:5.66,lng:-.19}),'approved add-shop flow creates canonical second shop');
  const {staff:cashier,accepted}=await joinStaff(owner,'cashier','cashier',[shopId]);check(accepted.state.shops.length===1,'cashier sees only assigned shop');
  const wrongShop=await mutate(cashier,'CREATE_REQUEST',{shopId:second.entity.id,amount:100,attemptId:attempt('denied')});check(wrongShop.ok===false,'cashier cannot collect for another shop');
  const proposal=ok(await mutate(cashier,'REFUND',{transactionId:beforeRefund.state.transactions.find(t=>t.amount===20000).id,amount:1000,reason:'Cashier owner approval',attemptId:attempt('cashier-refund')}),'cashier refund uses approved owner proposal flow');check(proposal.entity.status==='requested','cashier proposal does not post money');
  const {staff:manager}=await joinStaff(owner,'manager','manager',[shopId]);
  const originalId=beforeRefund.state.transactions.find(t=>t.amount===20000).id;
  const partial=ok(await mutate(manager,'REFUND',{transactionId:originalId,amount:5000,reason:'Manager partial',attemptId:attempt('manager-refund'),stepUpProof:await stepup(manager)}),'manager authorizes refund within cumulative limit');check(partial.entity.status==='paid','manager partial refund posts canonical money');
  const over=ok(await mutate(manager,'REFUND',{transactionId:originalId,amount:2500,reason:'Manager cumulative threshold',attemptId:attempt('manager-threshold'),stepUpProof:await stepup(manager)}),'manager cumulative threshold keeps original approval flow');check(over.entity.status==='requested','cumulative amount above GH100 waits for owner');
  const paired=ok(await merchant(cashier,'/api/devices',{deviceId:'receiver-'+runId,label:'Verification receiver',shopId}),'approved receiver phone pairs to cashier session');check(paired.device.soundReady===false,'receiver is not ready before audio test');
  const tested=ok(await merchant(cashier,'/api/devices/receiver-'+runId,{action:'test',soundReady:true,expectedFailureVersion:0}),'receiver audio-test acknowledgment persists');check(tested.devices.some(d=>d.id==='receiver-'+runId&&d.soundReady),'tested receiver is ready in shared snapshot');
 }
 const report={ok:true,at:new Date().toISOString(),runId,businessId,shopId,checks};await mkdir(new URL('../verification/',import.meta.url),{recursive:true});await writeFile(new URL('../verification/approved-merchant-live.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log('Verified '+checks.length+' approved merchant checks.');
}catch(error){console.error('FAIL '+error.message);process.exitCode=1;}
