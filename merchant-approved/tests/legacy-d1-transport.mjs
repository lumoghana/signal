// Test-only transport for the retained D1 domain/UI compatibility suites.
// These suites exercise real views, account state and the legacy D1 API, not
// Supabase integration. Production connected-service.js is checked separately
// by connected-service.test.mjs without this substitution.
import {registerHooks} from 'node:module';

const transportURL=new URL('../dist/connected-service.js',import.meta.url).href;
registerHooks({load(url,context,nextLoad){
 if(url!==transportURL)return nextLoad(url,context);
 return {format:'module',shortCircuit:true,source:`
  export const CONNECTED_CONSUMER_ORIGIN='https://lumo-connected-pilot.vercel.app';
  export function merchantFetch(path,options={}){
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
