import {jwtVerify,createRemoteJWKSet,decodeJwt} from 'npm:jose@6.2.17';
import {createVercelProofVerifier} from './vercel-proof.mjs';
import {createQuotaHandler} from './handler.mjs';
// No extra long-lived service credential is supplied to the Vercel apps.
Deno.serve(createQuotaHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')||'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',verifyServerProof:createVercelProofVerifier({jwtVerify,createRemoteJWKSet,decodeJwt})}));
