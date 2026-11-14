/* Canonical statement comparison. It never changes merchant funds. */
const array = value => Array.isArray(value) ? value : [];
const key = value => String(value ?? '').trim().toUpperCase();
const confirmed = new Set(['paid', 'confirmed', 'completed', 'success']);
export function reconcileRows(snapshot, input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 1000) throw new Error('Import between 1 and 1,000 statement rows.');
  const aliases = new Map();
  for (const payment of array(snapshot?.transactions)) {
    for (const alias of [payment.reference, payment.id].map(key).filter(Boolean)) {
      if (!aliases.has(alias)) aliases.set(alias, []);
      if (!aliases.get(alias).some(item => item.id === payment.id)) aliases.get(alias).push(payment);
    }
  }
  const seenPayments = new Set(), seenUnknowns = new Set(), listedPayments = new Set();
  const results = input.map(row => {
    const reference = String(row?.reference ?? '').trim(), amount = row?.amount;
    if (!reference || reference.length > 120) throw new Error('Statement reference is required and must be 120 characters or fewer.');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 9999999999) throw new Error('Statement amount must be positive whole pesewas.');
    const statementStatus = String(row.status || row.statementStatus || 'paid').trim().toLowerCase();
    const candidates = aliases.get(key(reference)) || [], payment = candidates.length === 1 ? candidates[0] : null;
    const duplicate = payment ? seenPayments.has(payment.id) : seenUnknowns.has(key(reference));
    if (payment) {seenPayments.add(payment.id);listedPayments.add(payment.id);} else seenUnknowns.add(key(reference));
    const result = duplicate ? 'duplicate' : candidates.length > 1 ? 'ambiguous-reference' : !payment ? 'unmatched' : payment.amount !== amount ? 'amount-mismatch' : payment.status !== 'paid' ? 'payment-not-confirmed' : !confirmed.has(statementStatus) ? 'statement-not-confirmed' : 'matched';
    return {reference, amount, status: statementStatus, statementStatus, result, paymentId: payment?.id || null, transactionId: payment?.id || null, ledgerAmount: payment?.amount ?? null, expectedAmount: payment?.amount ?? null, ledgerStatus: payment?.status || null, expectedStatus: payment?.status || null};
  });
  const counts = results.reduce((all, row) => {all[row.result] = (all[row.result] || 0) + 1;return all;}, {});
  return {
    results, rows: results,
    matched: counts.matched || 0, unmatched: counts.unmatched || 0, duplicates: counts.duplicate || 0,
    mismatches: (counts['amount-mismatch'] || 0) + (counts['payment-not-confirmed'] || 0) + (counts['statement-not-confirmed'] || 0) + (counts['ambiguous-reference'] || 0),
    mismatched: counts['amount-mismatch'] || 0,
    unlisted: array(snapshot?.transactions).filter(payment => payment.status === 'paid' && !listedPayments.has(payment.id)).length,
    exceptions: results.filter(row => row.result !== 'matched').length,
    statementTotal: results.reduce((total, row) => total + row.amount, 0),
    matchedTotal: results.filter(row => row.result === 'matched').reduce((total, row) => total + row.amount, 0), counts
  };
}
