/** Versioned local digest denylist of widely circulated common/example secrets.
 * It is intentionally small. Full breach screening is a separate reviewed
 * checker and mandatory in production; this is not a complete breach corpus. */
export const PASSWORD_DENYLIST_VERSION='2026-11-18.1';
export const PASSWORD_DENYLIST_SHA256=new Set([
 '3700adf1f25fab8202c1343c4b0b4e3fec706d57cad574086467b8b3ddf273ec',
 'b2d1349ea3f52597f37566ed4095e10729c8329c612b64563849dcf29ee9de6e',
 '48486e1514e842346ff405b1e45f44059ae82619f2306f99d0940dcb386e91f7',
 'c4bbcb1fbec99d65bf59d85c8cb62ee2db963f0fe106f483d9afa73bd4e39a8a',
 '7abdae32d3c9fd31959fd66c8c48de11bdff24b1dad2542f46faa0ebc50329fe',
]);
