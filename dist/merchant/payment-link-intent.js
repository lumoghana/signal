// A fixed request must survive every QR entry path. URL amounts are hints to
// compare with the request, never authority for an editable shop payment.
const idPattern=/^[A-Za-z0-9_.:-]{1,180}$/;
const fail=message=>{throw new Error(message)};

export function parseMerchantPaymentLink(input,{origin=globalThis.location?.origin}={}) {
 let link,base;
 try{base=new URL(origin);link=new URL(input instanceof URL?input.href:input)}catch{fail('That QR is not a recognised payment link.')}
 if(!['http:','https:'].includes(link.protocol)||link.origin!==base.origin||link.username||link.password||link.hash)fail('This is not a QR from this Lumo prototype.');
 for(const key of ['pay','request','amount','workspace','testKey','code'])if(link.searchParams.getAll(key).length>1)fail('This QR has conflicting payment details. Ask for a fresh QR.');
 const value=key=>link.searchParams.get(key),shopId=value('pay'),requestId=value('request'),code=value('code'),workspace=value('workspace')||'registered',testKey=value('testKey');
 if(!['sample','registered'].includes(workspace))fail('This QR has an unsupported workspace.');
 if(shopId!==null&&!idPattern.test(shopId)||requestId!==null&&!idPattern.test(requestId))fail('This QR has invalid payment details.');
 if(code!==null&&(!code.trim()||code.length>60||/[<>\u0000-\u001f\u007f]/.test(code)))fail('This QR has an invalid merchant code.');
 if(!shopId&&!requestId&&!code)fail('This QR has no receiving shop.');
 if(testKey!==null&&!/^[A-Za-z0-9_-]{64}$/.test(testKey))fail('This QR has an invalid test link. Ask for a fresh QR.');
 const raw=value('amount');let amount=null;
 if(raw!==null){
  if(!requestId)fail('This amount QR has no payment request. Ask for a fresh fixed-amount QR.');
  amount=/^\d+$/.test(raw)?Number(raw):NaN;
  if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000)fail('This QR has an invalid payment amount.');
 }
 return {shopId,requestId,amount,workspace,testKey,code};
}

export function merchantQuoteParams(intent) {
 const query=new URLSearchParams();
 for(const [key,value] of [['shopId',intent.shopId],['requestId',intent.requestId],['code',intent.code],['testKey',intent.testKey]])if(value)query.set(key,value);
 return query;
}

function validateRequest(intent,shop,request,now) {
 if(intent.requestId){
  if(!request||request.id!==intent.requestId)fail('This fixed-amount request is unavailable. Ask the merchant for a new QR.');
  if(request.shopId&&request.shopId!==shop?.id)fail('This QR request belongs to a different shop. Ask for a fresh QR.');
  if(!Number.isSafeInteger(request.amount)||request.amount<=0||intent.amount!==null&&intent.amount!==request.amount)fail('This QR amount does not match its payment request. Ask for a fresh QR.');
  if(request.status!=='open'||!Number.isFinite(Date.parse(request.expiresAt))||Date.parse(request.expiresAt)<=now)fail('This fixed-amount request has expired, been paid or been cancelled. Ask for a new QR.');
 }else if(request)fail('This QR returned a different payment request. Ask for a fresh QR.');
 if(!shop?.id||intent.shopId&&shop.id!==intent.shopId)fail('This QR belongs to a different shop. Ask for a fresh QR.');
 if(intent.code&&String(shop.code||'').toUpperCase()!==intent.code.trim().toUpperCase())fail('This QR merchant code does not match its shop.');
}

export function resolveSamplePaymentLink(state,intent,{now=Date.now()}={}) {
 const request=intent.requestId?state.requests.find(row=>row.id===intent.requestId):null;
 // Never fall back from a missing fixed request to a known reusable shop QR.
 if(intent.requestId&&!request)fail('This fixed-amount request is not saved in this browser. Use a registered merchant QR to test across phones.');
 const shop=state.shops.find(row=>row.id===(intent.shopId||request?.shopId))||(!intent.shopId&&!request&&intent.code?state.shops.find(row=>row.code?.toUpperCase()===intent.code.trim().toUpperCase()):null);
 validateRequest(intent,shop,request,now);
 if(request&&state.transactions.some(row=>row.requestId===request.id&&['paid','processing'].includes(row.status)))fail('This request already has a payment. Check its status before paying again.');
 if(shop.open===false||!shop.accepting)fail('This shop is not accepting payments right now.');
 return {shop,request};
}

export function validateMerchantPaymentQuote(intent,quote,{now=Date.now()}={}) {
 validateRequest(intent,quote?.shop,quote?.request||null,now);
 return quote;
}
