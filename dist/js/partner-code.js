/** Codes stay text: accept common paste formatting without changing their digits. */
export function normalizePartnerCode(value) {
  if (typeof value !== 'string' || value.length > 32) return '';
  const code = value.replace(/[\s-]/g, '');
  return /^[0-9]{6}$/.test(code) ? code : '';
}

export function validPartnerCode(value) {
  return normalizePartnerCode(value) !== '';
}
