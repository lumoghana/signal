// Test-only transport for the retained D1 domain/UI compatibility suites.
// These suites exercise real views, account state and the legacy D1 API, not
// Supabase integration. Production connected-service.js is checked separately
// by connected-service.test.mjs without this substitution.
import {registerHooks} from 'node:module';

const transportURL=new URL('../dist/connected-service.js',import.meta.url).href;
registerHooks({load(url,context,nextLoad){
 if(url!==transportURL)return nextLoad(url,context);
 return {format:'module',shortCircuit:true,source:`
  import {getMerchantLuxAnswer} from ${JSON.stringify(new URL('../dist/lux-brain.js',import.meta.url).href)};
  export const MERCHANT_CAPABILITIES=Object.freeze({passwordChange:true,passwordRecovery:true,usernameRecovery:true,staffReset:true,ownershipTransfer:true,settlement:true,simulation:true,customerWallet:true});
  export const CONNECTED_CONSUMER_ORIGIN='https://lumo-connected-pilot.vercel.app';
  export async function merchantFetch(path,options={}){
   if(path==='/api/lux'){
    const input=JSON.parse(options.body||'{}'),snapshotResponse=await globalThis.fetch('/api/session',{method:'GET',signal:options.signal}),snapshot=await snapshotResponse.json();
    if(!snapshot.session||!snapshot.user)return new Response(JSON.stringify({ok:false,code:'SESSION_INVALID'}),{status:401,headers:{'Content-Type':'application/json'}});
    const answer=getMerchantLuxAnswer(snapshot.state,input.question,{actor:snapshot.user,shopId:input.shopId,context:input.context,mode:'recorded',settlementConnected:true});
    return new Response(JSON.stringify({...snapshot,ok:true,answer,mode:'recorded'}),{headers:{'Content-Type':'application/json'}});
   }
   // The legacy owner-only password endpoint predates the named refund purpose.
   // Keep its real password check for UI/retry compatibility. Production refund
   // purpose and money authority are covered by the Supabase backend tests.
   if(path==='/api/auth/step-up'&&options.body){
    const body=JSON.parse(options.body);
    if(body.purpose==='refund')options={...options,body:JSON.stringify({...body,purpose:'owner-action'})};
   }
   return globalThis.fetch(path,options);
  }
 `};
}});
