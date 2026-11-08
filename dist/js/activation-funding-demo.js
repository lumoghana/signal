/** Local provider simulation only. No bank or mobile-money service is called. */
export function simulateActivationFundingReceipt(d, { outcome = 'confirmed', now = Date.now() } = {}) {
  const attempt = d?.fundingAttempt;
  if (!attempt || attempt.status !== 'pending' || !['confirmed', 'failed', 'expired'].includes(outcome)) return { ok: false, message: 'Choose an outcome for a pending demo request.' };
  if (attempt.demoReceipt) return { ok: true, message: 'A demo result is already waiting to be checked.', receipt: structuredClone(attempt.demoReceipt) };
  const receipt = { mode: 'simulation', attemptId: attempt.id, amount: attempt.amount, source: attempt.source, rail: attempt.rail, accountNumber: attempt.accountNumber, status: outcome, providerReference: 'DEMO-' + attempt.id.replace(/[^a-z0-9]/gi, '').slice(-32), at: Number.isFinite(now) ? now : Date.now() };
  attempt.demoReceipt = receipt;
  return { ok: true, message: 'Demo provider result is ready for the next status check.', receipt: structuredClone(receipt) };
}

/** Reading or repeatedly checking never invents an approval or a receipt. */
export function readDemoActivationFundingReceipt(d) {
  const attempt = d?.fundingAttempt;
  return attempt?.demoReceipt ? structuredClone(attempt.demoReceipt) : null;
}
