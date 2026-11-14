import {normalizeFundingPhone} from './domain/funding-phone.js';

const NETWORKS=Object.freeze(['mtn','telecel','airteltigo']);
const LABELS=Object.freeze({mtn:'MTN MoMo',telecel:'Telecel Cash',airteltigo:'AT Money'});
// These are synthetic directory records, including deliberately ported-looking
// numbers. They demonstrate why a phone prefix cannot establish its network.
const FIXTURES=Object.freeze({'0241234567':'telecel','0551234567':'telecel'});
const invalid=()=>Object.assign(new Error('Use a valid Ghana MoMo number.'),{code:'INVALID_INPUT',status:400,noMutation:true});

function canonicalPhone(value){
 if(typeof value!=='string'||value.length>50||!value.trim()||/[\u0000-\u001f\u007f]/.test(value)||!/^[+\d() \u00a0-]+$/.test(value.trim()))throw invalid();
 const raw=value.trim();
 if(/^-|-$|--/.test(raw))throw invalid();
 let depth=0;
 for(const character of raw){
  if(character==='('&&++depth>1||character===')'&&--depth<0)throw invalid();
 }
 if(depth||/\([ \u00a0-]*\)/.test(raw))throw invalid();
 const phone=normalizeFundingPhone(raw);
 if(!phone)throw invalid();
 return phone;
}

/** Number-only test lookup. This adapter never contacts a live directory and
 * never asserts the current network or registered name of a real subscriber.
 * Production lookup must replace this adapter with an authenticated provider.
 */
export async function lookupGuestPayer(value,{crypto:cryptoApi=globalThis.crypto}={}){
 const phone=canonicalPhone(value);
 let network=FIXTURES[phone];
 if(!network){
  if(!cryptoApi?.subtle?.digest)throw Object.assign(new Error('The test phone lookup is unavailable.'),{code:'LOOKUP_UNAVAILABLE',status:503,noMutation:true});
  const bytes=new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode('lumo-guest-payer-sandbox-v1:'+phone)));
  // Hash the entire canonical number. No prefix or caller-supplied network is
  // used, and every application instance produces the same synthetic record.
  let bucket=0;for(const byte of bytes)bucket=(bucket*256+byte)%NETWORKS.length;
  network=NETWORKS[bucket];
 }
 return {phone,payer:{phoneMasked:'••••••'+phone.slice(-4),network,networkLabel:LABELS[network],registeredName:'Test customer '+phone.slice(-4),providerMode:'sandbox',lookupSource:'sandbox-directory',networkVerified:false,nameVerified:false}};
}
