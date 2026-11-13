import {handleAPI} from './server/api.js';
import {APIError,emptyNetwork,hashToken,resolveSession} from './server/network.js';

const clone=value=>structuredClone(value);
const PUBLIC_GET=/^\/api\/(?:health|directory|lookup|payments\/quote|invitations\/[^/]+)(?:\?|$)/;
const ALIASES={'/api/login':'/api/auth/login','/api/logout':'/api/auth/logout','/api/business':'/api/session','/api/password':'/api/auth/password','/api/recovery/start':'/api/auth/recovery/start','/api/recovery/complete':'/api/auth/recovery/complete','/api/auth/username/recover':'/api/auth/username','/api/ownership/transfer':'/api/auth/transfer','/api/step-up':'/api/auth/step-up','/api/auth/phone/change':'/api/auth/phone'};
const GET_ROUTE=/^\/api\/(?:health|session|directory|lookup|payments\/quote|devices|invitations\/[A-Za-z0-9_-]+)$/;
const POST_ROUTE=/^\/api\/(?:signup|action|auth\/(?:login|logout|step-up|phone|recovery-key(?:\/ack)?)|invitations(?:\/accept|\/[A-Za-z0-9_-]+\/(?:resend|revoke))?|users\/[A-Za-z0-9_-]+|sessions\/[A-Za-z0-9_-]+\/revoke|devices(?:\/[A-Za-z0-9_.-]+)?)$/;
export function normalizeMerchantPath(value){
 const raw=String(value||'');if(raw.length>3000||!raw.startsWith('/api/')||raw.includes('#'))return null;
 const index=raw.indexOf('?'),rawPath=index<0?raw:raw.slice(0,index),query=index<0?'':raw.slice(index);
 if(rawPath.includes('%')||rawPath.includes('\\')||/\/\.{1,2}(?:\/|$)|\/\//.test(rawPath)||!/^\/api\/[A-Za-z0-9_./-]+$/.test(rawPath))return null;
 const pathname=rawPath.replace(/\/+$/,'');return (ALIASES[pathname]||pathname)+query;
}
const LOGIN=new Set(['/api/signup','/api/auth/login','/api/login','/api/invitations/accept']);
const UNAVAILABLE=new Set(['/api/migrate','/api/auth/recovery/start','/api/auth/recovery/complete','/api/auth/username','/api/auth/password','/api/password','/api/auth/transfer']);
const message=code=>({SESSION_REVOKED:'Sign in again to open this business.',CONCURRENT_UPDATE:'This business changed while the request was checked. Retry the same reference.',ACCOUNT_UNAVAILABLE:'The original receiving account is unavailable. No refund was posted.',REFUND_DESTINATION_UNAVAILABLE:'This closed collection cannot receive a refund because its original return destinations are unavailable. No refund was posted. A verified return outside this test service is required.',STEP_UP_REQUIRED:'Confirm your password before returning shared funds.',MERCHANT_COMMIT_FAILED:'The shared merchant service could not commit this request. Retry the same reference.',FORBIDDEN:'Your account does not have access to this business.',UNAVAILABLE_SERVICE:'This service is not connected yet. Your existing details are kept.'}[code]||'Lumo could not complete that request. Keep the original reference and try again.');
function failure(code,status=400){return {ok:false,status,code,error:message(code),message:message(code),sandbox:true,currency:'GHS'};}

// Project only immutable, canonical journals into the original v7 records. Preserve
// their original trading-day, operator and shift attribution once captured.
export function hydrateMerchantNetwork(raw){
 const state=clone(raw.state||emptyNetwork());
 for(const [businessId,b] of Object.entries(state.businesses||{})){
  const ledger=(raw.ledger||[]).filter(j=>j.merchantId===businessId),balance=raw.balances?.[businessId];
  const oldPayments=new Map((b.transactions||[]).map(t=>[t.id,t]));
  const oldRefunds=new Map((b.refunds||[]).map(r=>[r.id,r]));
  const requests=new Map((b.requests||[]).map(r=>[r.id,r]));
  const shopIds=new Set(b.shops.map(s=>s.id));
  for(const request of (raw.requests||[]).filter(r=>shopIds.has(r.shopId))){
   const previous=requests.get(request.id)||{};
   const operator=state.users.find(u=>u._sharedUserId===request.createdBySharedUserId);
   requests.set(request.id,{...previous,...request,staffId:previous.staffId||(operator?.role==='owner'?'owner-'+operator.id:operator?'access-'+operator.id:null),staffName:previous.staffName||operator?.name||null,createdByUserId:previous.createdByUserId||operator?.id||null});
  }
  b.requests=[...requests.values()];
  b.transactions=ledger.filter(j=>j.type==='merchant_payment').map(j=>{
   const old=oldPayments.get(j.id)||{},request=requests.get(j.requestId);
   return {...old,id:j.id,shopId:j.shopId,staffId:old.staffId||request?.staffId||null,staffName:old.staffName||request?.staffName||null,shiftId:old.shiftId||request?.shiftId||null,payer:j.payerName||j.payerHandle||'Lumo customer',amount:j.amount,status:'paid',createdAt:j.createdAt,confirmedAt:j.createdAt,reference:j.reference,method:old.method||(j.requestId?'request':'qr'),requestId:j.requestId||null,sandbox:true};
  });
  const canonicalRefunds=ledger.filter(j=>j.type==='refund').map(j=>{
   const key=j.refundId||j.id,old=oldRefunds.get(key)||{};
   const payment=b.transactions.find(t=>t.id===j.originalPaymentId);
   return {...old,id:key,transactionId:j.originalPaymentId,shopId:j.shopId,amount:j.amount,status:'paid',createdAt:old.createdAt||j.createdAt,paidAt:j.createdAt,payer:old.payer||payment?.payer||'Original payer',reason:old.reason||'Customer refund',by:old.by||'Merchant',_sharedJournalId:j.id};
  });
  const refundedIds=new Set(canonicalRefunds.map(r=>r.id));
  b.refunds=[...(b.refunds||[]).filter(r=>r.status!=='paid'&&!refundedIds.has(r.id)),...canonicalRefunds];
  if(balance){
   b.business.accountId=balance.accountId;b.business.sandbox=true;b.business.verificationStatus='approved-sandbox';
   const paid=b.transactions.reduce((n,t)=>n+t.amount,0),returned=canonicalRefunds.reduce((n,r)=>n+r.amount,0);
   b.openingBalance=balance.balance-paid+returned;
  }
 }
 return state;
}

/** Original v7 HTTP API behind the verified shared-auth boundary. No client state
 * is accepted: closures mutate a fresh service-only snapshot, committed with
 * canonical refund postings in one database transaction. */
export function createMerchantHandler({serviceRpc}){
 if(typeof serviceRpc!=='function')throw new Error('Merchant service RPC is required.');
 return async ({body,identity})=>{
  const path=normalizeMerchantPath(body.path),method=body.method||'GET',pathname=path?.split('?')[0],input=body.body||{};
  if(!path||!['GET','POST'].includes(method))return failure('INVALID_REQUEST');
  if(!identity&&!PUBLIC_GET.test(path))return failure('SESSION_REVOKED',401);
  if(UNAVAILABLE.has(pathname)||/^\/api\/users\/[^/]+\/reset$/.test(pathname))return failure('UNAVAILABLE_SERVICE',503);
  if(/^\/api\/(?:student|sandbox-fund|payments$)/.test(pathname))return failure('UNAVAILABLE_SERVICE',503);
  if(pathname==='/api/simulate'||pathname==='/api/action'&&['PAY','RESOLVE_PAYMENT','SETTLE','RESOLVE_SETTLEMENT'].includes(input.type))return failure('UNAVAILABLE_SERVICE',503);
  if(!(method==='GET'?GET_ROUTE:POST_ROUTE).test(pathname))return failure('INVALID_REQUEST',404);
  const actor=identity?.userId||null,sessionId=identity?.sessionId||null;
  const merchantToken=typeof body.merchantToken==='string'&&/^[a-f0-9]{64}$/.test(body.merchantToken)?body.merchantToken:'';
  const tokenHash=await hashToken(merchantToken);
  let lastRead=null;
  async function read(){
   const raw=await serviceRpc('lumo_approved_merchant_read',{p_actor:actor,p_session:sessionId});
   if(!raw?.ok)throw new APIError(message(raw?.code),raw?.code==='SESSION_REVOKED'?401:503,raw?.code||'STORAGE_UNAVAILABLE');
   const state=hydrateMerchantNetwork(raw),current=resolveSession(state,tokenHash);
   if(current&&current.user._sharedUserId!==actor)throw new APIError(message('FORBIDDEN'),403,'FORBIDDEN');
   lastRead={...raw,state};return {revision:raw.revision,state};
  }
  async function update(mutate){
   if(!identity)throw new APIError('Sign in before changing a merchant record.',401,'SESSION_REVOKED');
   for(let attempt=0;attempt<12;attempt++){
    const {revision,state}=await read(),draft=clone(state),out=await mutate(draft,{revision});
    const loginUser=out?.data?.user;
    if(LOGIN.has(pathname)&&loginUser){
     const linked=draft.users.find(u=>u.id===loginUser.id);
     const emailHandle=String(identity.user?.email||'').split('@')[0].toLowerCase();
     if(!linked||linked.username!==emailHandle||linked._sharedUserId&&linked._sharedUserId!==actor)throw new APIError('Use the shared account belonging to this merchant username.',403,'FORBIDDEN');
     linked._sharedUserId=actor;
    }
    if(pathname==='/api/auth/step-up'&&(out?.data?.stepUpToken||out?.data?.proof)){
     if(identity.passwordVerified!==true)throw new APIError('Confirm the current account password.',403,'STEP_UP_REQUIRED');
     const current=resolveSession(draft,tokenHash);if(current)current.session._sharedStepUpVerified=true;
    }
    const paidBefore=new Set(Object.values(state.businesses).flatMap(b=>(b.refunds||[]).filter(r=>r.status==='paid').map(r=>r.id)));
    const newPaid=Object.values(draft.businesses).flatMap(b=>(b.refunds||[]).filter(r=>r.status==='paid'&&!paidBefore.has(r.id)));
    const originalSession=resolveSession(state,tokenHash);
    const moneyAuthorized=newPaid.length>0&&originalSession?.session._sharedStepUpVerified===true;
    if(newPaid.length&&!moneyAuthorized)throw new APIError(message('STEP_UP_REQUIRED'),403,'STEP_UP_REQUIRED');
    if(moneyAuthorized){const current=resolveSession(draft,tokenHash);if(current)current.session._sharedStepUpVerified=false;}
    if(out?.unchanged&&!newPaid.length&&JSON.stringify(draft)===JSON.stringify(state))return {...out,revision};
    const saved=await serviceRpc('lumo_approved_merchant_commit',{p_actor:actor,p_session:sessionId,p_revision:revision,p_ledger_stamp:lastRead.ledgerStamp,p_state:draft,p_money_authorized:moneyAuthorized});
    if(saved?.ok)return {...out,revision:saved.revision};
    if(saved?.code==='CONCURRENT_UPDATE')continue;
    throw new APIError(message(saved?.code),saved?.code==='SESSION_REVOKED'?401:409,saved?.code||'MERCHANT_COMMIT_FAILED');
   }
   throw new APIError(message('CONCURRENT_UPDATE'),409,'CONCURRENT_UPDATE');
  }
  try{
   const headers={'Accept':'application/json','Cookie':merchantToken?'lumo_session='+merchantToken:'','X-Lumo-Request':'1'};
   if(method==='POST')headers['Content-Type']='application/json';
   const response=await handleAPI(new Request('https://merchant.lumo.internal'+path,{method,headers,...(method==='POST'?{body:JSON.stringify(input)}:{})}),{approvedStore:{read,update}});
   if(!response)return failure('INVALID_REQUEST',404);
   const result=await response.json();
   // Return only the merchant cookie token, never any upstream service credential.
   const cookie=response.headers.get('set-cookie')||'',match=cookie.match(/(?:^|,\s*)lumo_session=([^;]*)/);
   return {...result,ok:response.ok,status:response.status,...(match?{merchantToken:decodeURIComponent(match[1])}:{})};
  }catch(error){return {...failure(error.code||'MERCHANT_SERVICE_ERROR',error.status||503),error:error.message,message:error.message};}
 };
}
