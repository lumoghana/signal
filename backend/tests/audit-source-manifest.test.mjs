import {readJson,readinessPath,currentFunctionDigest,verifyReadinessManifest} from '../verification/branding-2.15.0/source-manifest.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const backend=new URL('../',import.meta.url),read=path=>readFile(new URL(path,backend)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('audit retains historical source records and matches an explicit per-file review patch',async()=>{
 const audit=JSON.parse(await read('verification/audit-2026-11-16/reviewed-source-delta.json'));
 const readiness=await readJson(readinessPath);await verifyReadinessManifest(readiness);
 for(const [path,digest]of Object.entries(audit.historicalManifests))assert.equal(sha(await read(path)),digest,path+' historical record changed');
 for(const [path,record]of Object.entries(audit.migrations))assert.equal(sha(await read(path)),record.sha256,path+' changed since review');
 assert.equal(audit.functions['lumo-approved'].baselineVersion,18);assert.equal(audit.functions['lumo-admin'].baselineVersion,4);
 assert.equal(audit.functions['lumo-admin'].baselineBundleSha256,'6cb9f145c3200782c30d152d3ce649ba45c603ddab273d682dda2d81ac128d6e');
 assert.equal(sha(await read(audit.reviewPatch.path)),audit.reviewPatch.sha256,'review patch must describe the frozen candidate');
 for(const [name,record]of Object.entries(audit.functions))for(const [path,digest]of Object.entries(record.files))assert.equal(sha(await read('supabase/functions/'+name+'/'+path)),currentFunctionDigest(readiness,name,path)||digest,name+'/'+path+' differs from historical source or explicit current readiness delta');
 assert.deepEqual(Object.keys(audit.functions['lumo-admin'].deltas),['handler.mjs']);
 for(const [path,digest]of Object.entries(audit.functions['lumo-admin'].baselineFiles)){
  const change=audit.functions['lumo-admin'].deltas[path];assert.equal(change?.beforeSha256||audit.functions['lumo-admin'].files[path],digest,path+' must retain live4 baseline or reviewed change');
 }
 const handler=(await read('supabase/functions/lumo-admin/handler.mjs')).toString();
 assert.ok(handler.includes('const mfaEnforced=requireMfa===true||staff.data?.mfaEnforced!==false;'));
 assert.ok(handler.includes("if(who.mfaRequired)throw fail('MFA_REQUIRED',403);"));
});
