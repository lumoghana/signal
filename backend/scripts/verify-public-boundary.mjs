import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Input contains only a publishable key, never a service-role/secret key.
let stdin='';for await(const chunk of process.stdin)stdin+=chunk;
const input=JSON.parse(stdin);
const {supabaseUrl:url}=JSON.parse(await readFile(new URL('../deployment.json',import.meta.url),'utf8'));
assert.ok(typeof input.publishableKey==='string'&&input.publishableKey.startsWith('sb_publishable_'));
const checks=[];
for(const spec of [
  {name:'anonymous RPC cannot access an account',path:'/rest/v1/rpc/lumo_rpc',method:'POST',body:{p_command:'account.get',p_payload:{}},statuses:[401,403]},
  {name:'private profiles have no public table endpoint',path:'/rest/v1/profiles?select=*',statuses:[404]},
  {name:'private accounts have no public table endpoint',path:'/rest/v1/accounts?select=*',statuses:[404]},
  {name:'private schema cannot be selected through the Data API',path:'/rest/v1/accounts?select=*',profile:'lumo_private',statuses:[406]},
]){
  const response=await fetch(url+spec.path,{method:spec.method||'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:input.publishableKey,Accept:'application/json',...(spec.profile?{'Accept-Profile':spec.profile}:{}),...(spec.body?{'Content-Type':'application/json'}:{})},...(spec.body?{body:JSON.stringify(spec.body)}:{})});
  await response.arrayBuffer();
  assert.ok(spec.statuses.includes(response.status),`${spec.name}: unexpected HTTP ${response.status}`);
  checks.push({name:spec.name,status:response.status,passed:true});
}
const report={checkedAt:new Date().toISOString(),projectId:'iwutbrljiiodamtyoorg',checks};
await writeFile(new URL('../verification/public-boundary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({publicBoundaryChecks:checks.length,passed:true}));
