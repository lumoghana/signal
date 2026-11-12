import {readFile,writeFile} from 'node:fs/promises';
const config=JSON.parse(await readFile(process.argv[2]||new URL('../../pilot/dist/runtime-config.json',import.meta.url),'utf8'));
const fixtures=JSON.parse(await readFile(new URL('../verification/private/http-identities.json',import.meta.url),'utf8'));
const endpoint=config.supabaseUrl+'/functions/v1/lumo-pilot-auth/login';
const checks=[];
function check(name,passed){checks.push({name,passed});if(!passed)throw Error(name);}
const origins=['https://lumo-connected-pilot.vercel.app','https://lumo-connected-pilot-williedark-6795.vercel.app','https://lumo-connected-pilot-o4z6ft2e8-williedark-6795.vercel.app','http://127.0.0.1:4173'];
for(const origin of origins){
 const r=await fetch(endpoint,{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type,apikey'}});
 check('Exact CORS preflight '+origin,r.status===204&&r.headers.get('access-control-allow-origin')===origin);
}
for(const origin of [origins[0],null]){
 const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',apikey:config.publishableKey,...(origin?{origin}:{})},body:JSON.stringify({handle:fixtures[0].handle,password:fixtures[0].password})});
 const d=await r.json();
 check(origin?'Web origin real Auth login':'Native no-Origin real Auth login',r.ok&&d.user?.id===fixtures[0].userId&&!!d.access_token&&d.account?.id===fixtures[0].accountId&&(!origin||r.headers.get('access-control-allow-origin')===origin));
}
const rejected=await fetch(endpoint,{method:'POST',headers:{origin:'https://unapproved.example','content-type':'application/json'},body:'{}'});
check('Unapproved browser origin rejected',rejected.status===403&&!rejected.headers.get('access-control-allow-origin'));
const report={checkedAt:new Date().toISOString(),projectId:'iwutbrljiiodamtyoorg',checks,realAuthHttp:true,browserSessionUsed:false};
await writeFile(new URL('../verification/deployed-origins.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,failed:checks.filter(c=>!c.passed).length}));
