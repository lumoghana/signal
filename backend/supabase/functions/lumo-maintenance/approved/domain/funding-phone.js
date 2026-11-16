/** MoMo top-ups use the registered Lumo phone, in local Ghana format. */
export function normalizeFundingPhone(value) {
  const compact = String(value ?? '').trim().replace(/[\s()-]/g, '');
  const local = compact.replace(/^(?:\+233|233)/, '0');
  return /^0[25]\d{8}$/.test(local) ? local : '';
}
export const accountFundingPhone = state => normalizeFundingPhone(state?.profile?.phone);
