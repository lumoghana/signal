/** Illustrative campus merchants and services. No provider is connected. */
const service = value => Object.freeze(value);
export const PAYMENT_NETWORKS = Object.freeze(['MTN', 'Telecel', 'AT']);
export const DEMO_DATA_BUNDLES = Object.freeze([
  Object.freeze({ id: 'daily', name: 'Demo daily bundle', amount: 500 }),
  Object.freeze({ id: 'weekly', name: 'Demo weekly bundle', amount: 2000 }),
  Object.freeze({ id: 'monthly', name: 'Demo monthly bundle', amount: 5000 }),
]);
export const CAMPUS_BILLERS = Object.freeze({
  'school-fees': Object.freeze([
    Object.freeze({ id: 'ug-demo', name: 'University of Ghana · demo' }),
    Object.freeze({ id: 'knust-demo', name: 'KNUST · demo' }),
  ]),
  'hostel-fees': Object.freeze([
    Object.freeze({ id: 'campus-hostel-demo', name: 'Campus hostel · demo' }),
    Object.freeze({ id: 'off-campus-hostel-demo', name: 'Off-campus hostel · demo' }),
  ]),
});
export const PAYMENT_SERVICES = Object.freeze([
  service({ id: 'gobe-spot', type: 'campus', name: 'Gɔbɛ Spot', description: 'Good gɔbɛ. Better lunch breaks.', category: 'Food', rail: 'campus', icon: 'food', emoji: '🍲', referenceLabel: 'Order or table reference (optional)', referenceRequired: false }),
  service({ id: 'campus-shuttle', type: 'campus', name: 'Campus shuttle', description: 'From lectures to wherever next.', category: 'Transport', rail: 'campus', icon: 'bus', emoji: '🚌', referenceLabel: 'Route or trip reference (optional)', referenceRequired: false }),
  service({ id: 'balme-prints', type: 'campus', name: 'Balme Library prints', description: 'Notes, assignments and last-minute prints.', category: 'Essentials', rail: 'campus', icon: 'printer', emoji: '📚', referenceLabel: 'Print job reference (optional)', referenceRequired: false }),
  service({ id: 'school-fees', type: 'campus-bill', name: 'School fees', description: 'Your next semester starts here.', category: 'Essentials', rail: 'bill', icon: 'graduation', emoji: '🎓', billerRequired: true, billerLabel: 'Your school', referenceLabel: 'Student ID or invoice reference', referenceRequired: true, referencePlaceholder: 'e.g. 00123456' }),
  service({ id: 'hostel-fees', type: 'campus-bill', name: 'Hostel fees', description: 'A place to land after lectures.', category: 'Essentials', rail: 'bill', icon: 'home', emoji: '🏡', billerRequired: true, billerLabel: 'Your hostel', referenceLabel: 'Student ID or booking reference', referenceRequired: true, referencePlaceholder: 'e.g. INV-001234' }),
  service({ id: 'hall-dues', type: 'campus-bill', name: 'Hall dues', description: 'Your hall. Your people.', category: 'Essentials', rail: 'campus', icon: 'home', emoji: '🏠', referenceLabel: 'Hall or student reference (optional)', referenceRequired: false }),
  service({ id: 'electricity', type: 'bill', name: 'ECG electricity', description: 'Keep the lights on.', category: 'Essentials', rail: 'bill', icon: 'bolt', emoji: '⚡', referenceLabel: 'Demo meter number', referenceRequired: true, referencePlaceholder: 'e.g. 0123456789' }),
  service({ id: 'water', type: 'bill', name: 'Water', description: 'The everyday essentials.', category: 'Essentials', rail: 'bill', icon: 'water', emoji: '💧', referenceLabel: 'Demo customer account', referenceRequired: true, referencePlaceholder: 'e.g. GW12345678' }),
  service({ id: 'tv', type: 'bill', name: 'TV subscription', description: 'For the next watch party.', category: 'Essentials', rail: 'bill', icon: 'tv', emoji: '📺', referenceLabel: 'Demo smartcard number', referenceRequired: true, referencePlaceholder: 'e.g. 0123456789' }),
  service({ id: 'airtime', type: 'topup', name: 'Airtime', description: 'Quick top-up. Keep talking.', category: 'Data', rail: 'airtime', icon: 'phone', emoji: '📱', phoneRequired: true }),
  service({ id: 'data', type: 'topup', name: 'Data bundle', description: 'More data for the group chat.', category: 'Data', rail: 'data', icon: 'signal', emoji: '📶', phoneRequired: true, bundleRequired: true }),
]);
export const getPaymentService = id => PAYMENT_SERVICES.find(value => value.id === id) || null;
const resolveService = value => getPaymentService(typeof value === 'string' ? value : value?.id);
export const getServiceHubTab = value => resolveService(value)?.type === 'campus' ? 'campus' : 'bills';
export const isCampusCodeService = value => ['campus', 'campus-bill'].includes(resolveService(value)?.type);
const fail = message => ({ ok: false, message });
const clean = (value, limit) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : '';
const amount = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return NaN;
  const pesewas = Math.round(Number(text) * 100);
  return Number.isSafeInteger(pesewas) && pesewas > 0 && pesewas <= 1000000000 ? pesewas : NaN;
};
function phone(value) {
  const input = clean(value, 30).replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(input)) return input;
  if (/^(?:\+233|233)\d{9}$/.test(input)) return '0' + input.replace(/^\+?233/, '');
  return '';
}

/** Validation prepares a local payment; it never debits money or claims fulfilment. */
export function prepareServicePayment(serviceId, values = {}) {
  const selected = getPaymentService(serviceId);
  if (!selected) return fail('Choose a campus merchant or service.');
  const source = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  const network = clean(source.network, 20);
  const number = selected.phoneRequired ? phone(source.phone) : '';
  if (selected.phoneRequired && !PAYMENT_NETWORKS.includes(network)) return fail('Choose MTN, Telecel or AT.');
  if (selected.phoneRequired && !number) return fail('Use a Ghanaian mobile number, such as 024 000 0000.');
  const biller = selected.billerRequired ? CAMPUS_BILLERS[selected.id]?.find(item => item.id === source.biller) : null;
  if (selected.billerRequired && !biller) return fail(`Choose ${selected.id === 'school-fees' ? 'a demo school' : 'a demo hostel'} before continuing.`);
  const reference = clean(source.reference, 1000);
  if (selected.billerRequired && !/^[a-zA-Z0-9][a-zA-Z0-9/-]{3,29}$/.test(reference)) return fail('Use a student or invoice reference with 4 to 30 letters or numbers.');
  if (!selected.billerRequired && selected.referenceRequired && !/^[a-zA-Z0-9-]{5,24}$/.test(reference)) return fail('Use a demo reference with 5 to 24 letters or numbers.');
  if (!selected.referenceRequired && reference.length > 60) return fail('Keep your reference to 60 characters or fewer.');
  const bundle = selected.bundleRequired ? DEMO_DATA_BUNDLES.find(item => item.id === source.bundle) : null;
  if (selected.bundleRequired && !bundle) return fail('Choose a demo data bundle.');
  const paymentAmount = bundle ? bundle.amount : amount(source.amountText);
  if (!Number.isSafeInteger(paymentAmount)) return fail('Enter an amount above zero, with up to two decimal places.');
  const recipientName = selected.phoneRequired ? `${network} ${selected.id === 'data' ? 'Data' : 'Airtime'}` : selected.name;
  const fields = { reference, ...(biller ? { biller: biller.id } : {}), ...(selected.phoneRequired ? { network, phone: number } : {}), amountText: (paymentAmount / 100).toFixed(2), ...(bundle ? { bundle: bundle.id } : {}) };
  return {
    ok: true,
    payment: {
      service: selected, recipient: { id: `service-${selected.id}`, name: recipientName, number: number || reference, emoji: selected.emoji, colour: 'green' },
      amount: paymentAmount, category: selected.category, rail: selected.rail,
      reference: number || reference, bundleName: bundle?.name || '', ...(biller ? { billerName: biller.name } : {}), fields, serviceFields: fields,
    },
  };
}


/** Private shortcuts reuse confirmed recorded details; preparing them never pays again. */
export function getTopUpShortcuts(state, serviceId) {
  if (!['airtime', 'data'].includes(serviceId)) return {};
  const records = (state?.transactions || []).filter(tx => tx.type === 'payment' && tx.direction === 'out' && tx.serviceId === serviceId).sort((a,b) => String(b.at).localeCompare(String(a.at)));
  const latest = records[0];
  const waiting = latest && (latest.status === 'pending' || latest.status === 'success' && latest.delivery?.status !== 'delivered') ? { id: latest.id } : null;
  const completed = waiting ? null : records.find(tx => tx.status === 'success' && tx.delivery?.status === 'delivered' && prepareServicePayment(serviceId, tx.serviceFields).ok);
  const checked = completed ? prepareServicePayment(serviceId, completed.serviceFields) : null;
  const previous = checked?.ok && checked.payment.amount === completed.amount ? { ...checked.payment.serviceFields } : null;
  const lastNetwork = records.map(tx => tx.serviceFields?.network).find(network => PAYMENT_NETWORKS.includes(network));
  return { phone: phone(state?.profile?.phone), network: lastNetwork || 'MTN', previous, waiting };
}
