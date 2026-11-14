/** A receipt can be allocated to IOUs and expense splits only once. Amounts are integer pesewas. */
export function unmatchedReceiptAmount(receipt,{requireLedger=false}={}) {
  if (!receipt || receipt.type!=='income' || receipt.direction!=='in' || receipt.status!=='success' || (requireLedger&&!receipt.ledgerJournalId) || !Number.isSafeInteger(receipt.amount) || receipt.amount<=0) return 0;
  const sum=items=>{
    if (!Array.isArray(items)) return items==null?0:NaN;
    let total=0;
    for (const item of items) { if (!Number.isSafeInteger(item?.amount)||item.amount<0) return NaN; total+=item.amount; if (!Number.isSafeInteger(total)) return NaN; }
    return total;
  };
  // Older receipts used a single iouId rather than a list of partial allocations.
  const iouAllocated=receipt.iouId&&!receipt.iouAllocations?receipt.amount:sum(receipt.iouAllocations);
  const allocated=iouAllocated+sum(receipt.splitAllocations);
  return Number.isSafeInteger(allocated)?Math.max(0,receipt.amount-allocated):0;
}
export const unmatchedReceipts=(transactions,options)=> (transactions||[]).filter(receipt=>unmatchedReceiptAmount(receipt,options)>0);
