// Only these production projects may reserve inference capacity. These are
// public workload identifiers, not credentials. Keys always come from Vercel.
export const WORKLOADS=Object.freeze({
 prj_CtYjW81x8T0lsX37HJDuE2D7sbrv:'lumo-connected-pilot',
 prj_ojLlx4gBQypX5q0Bx0Hd9QPpXllA:'lumo-merchant',
});
const TEAM='williedark-6795',OWNER='team_OPfmdrLsTwXjPhqTwBtctJzP';
const ISSUERS=['https://oidc.vercel.com/'+TEAM,'https://oidc.vercel.com'];
export function createVercelProofVerifier({jwtVerify,createRemoteJWKSet,decodeJwt}){
 const keys=new Map(ISSUERS.map(issuer=>[issuer,createRemoteJWKSet(new URL(issuer+'/.well-known/jwks'),{timeoutDuration:3000,cooldownDuration:30000,cacheMaxAge:300000})]));
 return async token=>{
  try{
   if(typeof token!=='string'||token.length>16000)return false;
   // Decoding selects from two fixed URLs only. It never establishes trust.
   const issuer=decodeJwt(token).iss,key=keys.get(issuer);if(!key)return false;
   const {payload}=await jwtVerify(token,key,{issuer,audience:'https://vercel.com/'+TEAM,algorithms:['RS256'],requiredClaims:['iss','aud','sub','iat','nbf','exp','owner_id','project_id','environment'],maxTokenAge:'70m',clockTolerance:5});
   const project=WORKLOADS[payload.project_id];
   return !!project&&payload.owner_id===OWNER&&payload.owner===TEAM&&payload.project===project&&payload.environment==='production'&&payload.sub===`owner:${TEAM}:project:${project}:environment:production`;
  }catch{return false;}
 };
}
