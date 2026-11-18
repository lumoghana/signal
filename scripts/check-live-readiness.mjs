/** Evidence validation, not a compliance opinion or an automatic rating. */
import {readFile,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const LIVE_GATES=Object.freeze(['providers','liveness-identity','privileged-access','restore-recovery','installed-devices','security-capacity']);
export async function checkLiveReadiness(file,{now=Date.now()}={}){
 const path=await realpath(file),root=dirname(path),evidence=JSON.parse(await readFile(path,'utf8')),failures=[];
 if(evidence.schemaVersion!==1||evidence.product!=='Lumo'||evidence.target!=='real-money')failures.push('Invalid release evidence envelope.');
 if(!/^[0-9a-f]{40}$/.test(evidence.sourceCommit||''))failures.push('Pin the reviewed source commit.');
 if(!/^\d+\.\d+\.\d+$/.test(evidence.release||''))failures.push('Pin the release version.');
 if(!/^[0-9a-f]{64}$/.test(evidence.apkSha256||'')||!/^[0-9a-f]{64}$/.test(evidence.backendBundleSha256||''))failures.push('Pin signed APK and backend bundle checksums.');
 for(const id of LIVE_GATES){
  const matches=(evidence.gates||[]).filter(g=>g.id===id);
  if(matches.length!==1){failures.push(id+': exactly one acceptance is required.');continue;}
  const g=matches[0],date=Date.parse(g.reviewedAt||'');
  if(g.status!=='accepted'||g.syntheticOnly!==false||typeof g.reviewedBy!=='string'||g.reviewedBy.trim().length<3){failures.push(id+': current independent acceptance is missing.');continue;}
  if(!Number.isFinite(date)||date>now+300000||date<now-90*86400000){failures.push(id+': review date is stale or invalid.');continue;}
  if(typeof g.report!=='string'||isAbsolute(g.report)||g.report.includes('..')||!/^[0-9a-f]{64}$/.test(g.sha256||'')){failures.push(id+': pin a report inside the private evidence directory.');continue;}
  try{
   const reportPath=await realpath(resolve(root,g.report)),sub=relative(root,reportPath);
   if(sub.startsWith('..')||isAbsolute(sub))throw Error('Outside evidence directory');
   const bytes=await readFile(reportPath);
   if(createHash('sha256').update(bytes).digest('hex')!==g.sha256)throw Error('Report checksum mismatch');
   const report=JSON.parse(bytes.toString('utf8'));
   if(report.gate!==id||report.release!==evidence.release||report.sourceCommit!==evidence.sourceCommit||report.apkSha256!==evidence.apkSha256||report.backendBundleSha256!==evidence.backendBundleSha256||report.result!=='passed'||report.environment!=='production-acceptance'||report.syntheticOnly!==false||!Array.isArray(report.checks)||!report.checks.length||report.checks.some(c=>c.result!=='passed'||typeof c.evidence!=='string'||!c.evidence.trim()))throw Error('Report is not a matching accepted result for the exact source, APK and backend bundle');
  }catch(error){failures.push(id+': '+error.message);}
 }
 return {ok:failures.length===0,release:evidence.release||null,target:'real-money',failures,notice:'Evidence integrity is checked. Human ownership, provider truth, legal approval and signatures still require independent review.'};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=process.argv.indexOf('--evidence');
 if(index<0||!process.argv[index+1]){console.error('Use --evidence /absolute/private/launch-evidence.json. No gate is waived by default.');process.exitCode=1;}
 else {try{const result=await checkLiveReadiness(process.argv[index+1]);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}}
}
