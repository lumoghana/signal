import { requestActivationFunding, checkActivationFunding } from '../../dist/js/activation-model.js';
import { simulateActivationFundingReceipt, readDemoActivationFundingReceipt } from '../../dist/js/activation-funding-demo.js';

/** Fixtures follow the same request → provider receipt → confirmation contract. */
export function confirmFunding(draft, { amount = 10000, source = 'Mobile money', phone = '0240000000' } = {}) {
  const request = requestActivationFunding(draft, { amount, source, phone });
  if (!request.ok) return request;
  if (request.status === 'confirmed') return checkActivationFunding(draft);
  const simulated = simulateActivationFundingReceipt(draft, { outcome: 'confirmed' });
  if (!simulated.ok) return simulated;
  return checkActivationFunding(draft, { receipt: readDemoActivationFundingReceipt(draft) });
}
