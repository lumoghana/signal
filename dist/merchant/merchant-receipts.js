const list=value=>Array.isArray(value)?value:[];

/** Only server-projected confirmed shop receipts join the receiving feed.
 * They retain shop attribution and never join a cashier's request state. */
export function receivingPayments(snapshot={}) {
 const records=new Map(list(snapshot.transactions).filter(value=>value&&typeof value.id==='string').map(value=>[value.id,value]));
 for(const receipt of [...list(snapshot.shopQRReceipts).filter(value=>!value?.requestId),...list(snapshot.shopLinkReceipts)]){
  if(!receipt||typeof receipt.id!=='string'||!receipt.id||typeof receipt.shopId!=='string'||receipt.status!=='paid'||!Number.isSafeInteger(receipt.amount)||receipt.amount<=0||!receipt.reference||records.has(receipt.id))continue;
  records.set(receipt.id,{...receipt,staffId:null,staffName:null,shiftId:null,counterId:null,unattributed:true});
 }
 return [...records.values()].sort((a,b)=>String(a.confirmedAt||a.createdAt||'').localeCompare(String(b.confirmedAt||b.createdAt||'')));
}

export function shopPaymentReceipts(snapshot={},shopId) {
 const ids=new Set([...list(snapshot.shopQRReceipts).filter(value=>!value?.requestId),...list(snapshot.shopLinkReceipts)].filter(value=>value?.shopId===shopId).map(value=>value?.id));
 return receivingPayments({...snapshot,transactions:[]}).filter(value=>ids.has(value.id)&&value.shopId===shopId).sort((a,b)=>String(b.confirmedAt||b.createdAt||'').localeCompare(String(a.confirmedAt||a.createdAt||'')));
}
