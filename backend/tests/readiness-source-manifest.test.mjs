import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {repository,readinessPath,baselinePath,readJson,verifyReadinessManifest,importedClosure,deployedFunctions,hash,baselineSha256} from '../verification/readiness-2.14.0/source-manifest.mjs';

test('readiness source matches the complete reviewed deployment closure and preserves immutable baseline lineage',async()=>{
 const current=await verifyReadinessManifest(),baseline=await readJson(baselinePath);
 assert.equal(current.release,'2.14.0');
 assert.equal(current.functions['lumo-access'].rollout.candidateDisposition,'compatible-fence-disabled-candidate');
 assert.equal(current.functions['lumo-access'].rollout.capabilities.resetFenceEnabled,false);
 assert.equal(current.functions['lumo-access'].rollout.baselineVersion,7);
 assert.equal(current.releaseProfile.name,'active59-public');
 assert.equal(Object.keys(current.migrations).length,59);
 assert.equal(current.releaseProfile.excludedPrivateWork.length,3);
 for(const excluded of current.releaseProfile.excludedPrivateWork)await assert.rejects(readFile(resolve(repository,excluded.path)),{code:'ENOENT'});
 assert.equal(Object.hasOwn(current.migrations,'backend/supabase/migrations/20261118050029_recovery_reconciliation_and_biometric_retention.sql'),false);
 assert.deepEqual(Object.keys(current.functions).sort(),deployedFunctions);
 assert.equal(hash(await readFile(resolve(repository,baselinePath))),baselineSha256);
 assert.equal(Object.keys(baseline.functions['lumo-approved'].files).length,43);
 assert.equal(Object.keys(baseline.functions['lumo-access'].files).length,4);
 assert.equal(Object.keys(baseline.functions['lumo-admin'].files).length,3);
 assert.equal(Object.keys(baseline.migrations).length,47);assert.equal(Object.keys(baseline.recoveredMigrations).length,5);
 assert.equal(Object.values(current.migrations).filter(x=>x.change==='restored-live-source').length,5);
 assert.ok(Object.values(current.migrations).some(x=>x.change==='added'));
 for(const record of Object.values(current.functions))for(const [path,delta]of Object.entries(record.deltas)){
  assert.ok(delta.reason.length>=80,path);assert.ok(delta.evidence.length,path);assert.equal(record.files[path]||null,delta.afterSha256,path);
 }
});

test('readiness verification rejects tampered reviewed bytes, omitted dependencies and unreviewed deltas',async()=>{
 const current=await readJson(readinessPath),handler='backend/supabase/functions/lumo-approved/handler.mjs';
 const badDigest=structuredClone(current);badDigest.functions['lumo-approved'].files[handler]='0'.repeat(64);await assert.rejects(verifyReadinessManifest(badDigest),/source changed|stale/);
 const omitted=structuredClone(current);delete omitted.functions['lumo-approved'].files['backend/supabase/functions/lumo-approved/password-policy.mjs'];await assert.rejects(verifyReadinessManifest(omitted),/source changed|stale/);
 const noRationale=structuredClone(current);delete noRationale.functions['lumo-approved'].deltas[handler];await assert.rejects(verifyReadinessManifest(noRationale),/source changed|stale/);
 const changedHistory=structuredClone(current);changedHistory.immutableHistorical[baselinePath]='0'.repeat(64);await assert.rejects(verifyReadinessManifest(changedHistory),/source changed|stale/);
 const wrongProfile=structuredClone(current);wrongProfile.releaseProfile.activeMigrations=60;await assert.rejects(verifyReadinessManifest(wrongProfile),/source changed|stale/);
 const stageClaim=structuredClone(current);stageClaim.migrations['backend/supabase/migrations/20261118050029_recovery_reconciliation_and_biometric_retention.sql']={change:'added',sha256:'0'.repeat(64)};await assert.rejects(verifyReadinessManifest(stageClaim),/source changed|stale/);
});

test('deployment closure follows cross-function shared imports and refuses external or computed hidden imports',async()=>{
 const source='backend/supabase/functions/lumo-access/index.ts',handler='backend/supabase/functions/lumo-access/handler.mjs';
 const actual=await importedClosure(source);
 assert.ok(actual.has(handler));assert.ok(actual.has('backend/supabase/functions/lumo-approved/password-policy.mjs'));assert.ok(actual.has('backend/supabase/functions/lumo-approved/web-proxy-context.mjs'));
 for(const injected of ["import 'https://unreviewed.invalid/code.js';","const code=await import(dynamicPath);","import '../../../../outside.mjs';"]){
  await assert.rejects(importedClosure(source,{readSource:async path=>path===source?Buffer.from(injected):readFile(resolve(repository,path))}),/Unreviewed external|Computed dynamic|escaped allowed/);
 }
});

// Parsing actual declarations prevents formatting from hiding shipping dependencies.
test('deployment parser follows same-line imports, re-exports and literal dynamic imports without following comment/string decoys',async()=>{
 const entry='backend/supabase/functions/parser-fixture/index.ts';
 const texts=new Map([[entry,`import './one.mjs'; import './two.mjs'; export * from './three.mjs'; const later=()=>import('./four.mjs'); const prose="import './not-code.mjs'"; // import './comment.mjs'
`],...['one','two','three','four'].map(n=>['backend/supabase/functions/parser-fixture/'+n+'.mjs','export const value=1;'])]);
 const closure=await importedClosure(entry,{readSource:async path=>{assert.ok(texts.has(path),'Unexpected import: '+path);return Buffer.from(texts.get(path));}});
 assert.deepEqual([...closure.keys()].sort(),[...texts.keys()].sort());
});
