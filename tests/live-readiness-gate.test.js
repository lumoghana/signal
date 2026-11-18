import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {checkLiveReadiness,LIVE_GATES} from '../scripts/check-live-readiness.mjs';

test('the checked-in example never turns prototype work into live readiness',async()=>{
 const r=await checkLiveReadiness(new URL('../verification/launch-evidence.example.json',import.meta.url));
 assert.equal(r.ok,false);assert.ok(r.failures.some(s=>s.includes('providers')));assert.ok(r.failures.some(s=>s.includes('installed-devices')));
});
test('accepted gates bind actual report bytes, release, commit, exact artifacts and freshness',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lumo-evidence-'));const now=Date.now(),commit='a'.repeat(40),release='2.14.0',apkSha256='b'.repeat(64),backendBundleSha256='c'.repeat(64);
 try{
  const gates=[];
  for(const id of LIVE_GATES){
   const report={gate:id,release,sourceCommit:commit,apkSha256,backendBundleSha256,result:'passed',environment:'production-acceptance',syntheticOnly:false,checks:[{result:'passed',evidence:'Controlled synthetic test of the evidence validator, not actual provider acceptance.'}]};
   const bytes=JSON.stringify(report);await writeFile(join(root,id+'.json'),bytes);
   gates.push({id,status:'accepted',syntheticOnly:false,reviewedBy:'Synthetic reviewer',reviewedAt:new Date(now).toISOString(),report:id+'.json',sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const file=join(root,'launch.json'),data={schemaVersion:1,product:'Lumo',target:'real-money',release,sourceCommit:commit,apkSha256,backendBundleSha256,gates};
  await writeFile(file,JSON.stringify(data));assert.equal((await checkLiveReadiness(file,{now})).ok,true);
  for(const field of ['apkSha256','backendBundleSha256']){
   const original=data[field];data[field]='d'.repeat(64);await writeFile(file,JSON.stringify(data));
   const changed=await checkLiveReadiness(file,{now});assert.equal(changed.ok,false);assert.equal(changed.failures.length,LIVE_GATES.length,'All old reports must reject an unaccepted replacement artifact');
   data[field]=original;
  }
  await writeFile(file,JSON.stringify(data));assert.equal((await checkLiveReadiness(file,{now})).ok,true);
  await writeFile(join(root,'providers.json'),'{}');assert.equal((await checkLiveReadiness(file,{now})).ok,false);
  gates[0].report='../outside.json';await writeFile(file,JSON.stringify(data));assert.equal((await checkLiveReadiness(file,{now})).ok,false);
  gates[0].report='providers.json';gates[1].reviewedAt=new Date(now-91*86400000).toISOString();await writeFile(file,JSON.stringify(data));assert.ok((await checkLiveReadiness(file,{now})).failures.some(s=>s.includes('liveness-identity: review date')));
 }finally{await rm(root,{recursive:true,force:true});}
});
