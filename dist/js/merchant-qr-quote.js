const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid=()=>{throw Error('This merchant payment could not be verified. Ask for a fresh code.');};
const future=(value,now)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>now;
const money=value=>Number.isSafeInteger(value)&&value>0&&value<=1000000;

/** A public token resolves identity only; it never authorises a wallet payment. */
export function publicMerchantQrIdentity(reply,token,{now=Date.now()}={}){
 const link=reply?.link,shop=reply?.shop,request=reply?.request;
 if(reply?.ok!==true||reply.currency!=='GHS'||!link||link.publicToken!==token||!/^[a-f0-9]{64}$/.test(token||'')||!UUID.test(link.shopId||'')||shop?.id!==link.shopId||link.status!=='open'||link.expiresAt!==null&&link.expiresAt!==undefined&&!future(link.expiresAt,now))invalid();
 if(link.requestId!==null&&link.requestId!==undefined&&link.requestId!==''){
  if(!UUID.test(link.requestId)||request?.id!==link.requestId||request.shopId!==undefined&&request.shopId!==link.shopId||request.status!=='open'||!future(request.expiresAt,now)||!money(request.amount)||link.amount!==request.amount)invalid();
  return {shopId:link.shopId,requestId:link.requestId,expectedAmount:request.amount};
 }
 if(request!==null&&request!==undefined||link.amount!==null)invalid();
 return {shopId:link.shopId};
}

/** Require an authenticated quote to keep the exact scanned destination/request. */
export function validateMerchantQrQuote(intent,quote,{now=Date.now()}={}){
 const shop=quote?.shop,request=quote?.request;
 if(quote?.ok!==true||!UUID.test(shop?.id||'')||intent.shopId&&shop.id!==intent.shopId)invalid();
 if(intent.requestId){
  if(request?.id!==intent.requestId||request.shopId!==undefined&&request.shopId!==shop.id||!money(request.amount)||request.status!=='open'||!future(request.expiresAt,now)||intent.expectedAmount!==undefined&&request.amount!==intent.expectedAmount)invalid();
 }else if(request!==null&&request!==undefined)invalid();
 return quote;
}
