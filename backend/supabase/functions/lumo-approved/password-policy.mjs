import {newPasswordError} from './domain/password-policy.js';
import {PASSWORD_DENYLIST_SHA256} from './password-denylist.mjs';

/** A deployment can inject a reviewed, privacy-preserving breach checker.
 * It receives the original secret only in trusted memory; this module does not
 * send it to any endpoint. Production fails closed if the checker is absent or
 * cannot confirm a result. Login compatibility is deliberately independent. */
export function createPasswordPolicy({mode='pilot',checkBreach}={}) {
 if(!['pilot','production'].includes(mode)||checkBreach!==undefined&&typeof checkBreach!=='function')throw Error('Invalid password policy configuration.');
 const error=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
 return async function assertNewPassword(value,{module='consumer',handle=''}={}) {
  const message=newPasswordError(value,{minLength:module==='admin'?12:10,maxLength:module==='admin'?72:128,maxBytes:module==='admin'?72:Infinity,handle});
  if(message)throw error('PASSWORD_REJECTED',message);
  const digest=[...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(PASSWORD_DENYLIST_SHA256.has(digest))throw error('PASSWORD_REJECTED','Choose a password that is not a widely exposed example.');
  if(!checkBreach){if(mode==='production')throw error('PASSWORD_POLICY_UNAVAILABLE','Password screening is unavailable. Try again later.',503);return {mode,commonChecked:true,breachChecked:false};}
  let result;try{result=await checkBreach(value);}catch{throw error('PASSWORD_POLICY_UNAVAILABLE','Password screening is unavailable. Try again later.',503);}
  if(result?.checked!==true||typeof result.breached!=='boolean')throw error('PASSWORD_POLICY_UNAVAILABLE','Password screening is unavailable. Try again later.',503);
  if(result.breached)throw error('PASSWORD_REJECTED','Choose a password that is not known to have been exposed.');
  return {mode,commonChecked:true,breachChecked:true};
 };
}
