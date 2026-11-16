/** Accept common pasted formatting without guessing or changing any digit. */
export function normalizePartnerCode(value){
  if(typeof value!=='string'||value.length>32)return '';
  const code=value.replace(/[\s-]/gu,'');
  return /^[0-9]{6}$/.test(code)?code:'';
}
