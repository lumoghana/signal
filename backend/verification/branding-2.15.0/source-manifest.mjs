import assert from 'node:assert/strict';
import {parse,version as parserVersion} from 'acorn';
import {readFile,readdir,access,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {repository,hash,readJson,importedClosure,baselinePath,baselineSha256} from '../readiness-2.14.0/source-manifest.mjs';
export {repository,hash,readJson,importedClosure,baselinePath,baselineSha256};
export const readinessPath='backend/verification/branding-2.15.0/reviewed-source-delta.json';
export const brandingBaselinePath='backend/verification/branding-2.15.0/live-baseline-sha256.json';
export const brandingBaselineSha256='3b0a076ce6190b5639a6b1aba7b0f95c1af2aa723bf1150ed037063b651a2602';
export const parentReadinessPath='backend/verification/readiness-2.14.0/reviewed-source-delta.json';
export const parentReadinessSha256='d5a9e935cc6cafb1ea68ca9a42612dac82cfa41148346c3761494b6da051909c';
export const notesPath='backend/verification/branding-2.15.0/review-notes.json';
export const summaryProofPath='backend/verification/branding-2.15.0/admin-summary-literal-delta.json';
export const summaryProofSha256='690d4e7c6d386661bf0b2ba1ef8f4b705c2752c3c877a214a51a70a8111f1eac';
export const deployedFunctions=['lumo-access','lumo-admin','lumo-approved','lumo-maintenance'];
const read=path=>readFile(resolve(repository,path));
const sorted=object=>Object.fromEntries(Object.entries(object).sort(([a],[b])=>a.localeCompare(b)));
function visitAst(node,callback){if(!node||typeof node!=='object')return;callback(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(child=>visitAst(child,callback));else visitAst(value,callback);}}
function requireLiteralDisabledFlag(bytes,calleeName,flagName){
 const ast=parse(bytes.toString(),{ecmaVersion:'latest',sourceType:'module'});let found=0;
 visitAst(ast,node=>{if(node.type!=='CallExpression'||node.callee.type!=='Identifier'||node.callee.name!==calleeName)return;
  const options=node.arguments[0];assert.equal(options?.type,'ObjectExpression');
  const flag=options.properties.find(p=>p.type==='Property'&&(p.key.name||p.key.value)===flagName);
  assert.ok(flag?.value.type==='Literal'&&flag.value.value===false,'Blocked recovery feature must remain literal false: '+flagName);found++;
 });assert.equal(found,1,'Expected one explicit reviewed handler entrypoint: '+calleeName);
}
function canonicalAst(node){
 if(Array.isArray(node))return node.map(canonicalAst);if(!node||typeof node!=='object')return node;
 return Object.fromEntries(Object.entries(node).filter(([key])=>!['start','end'].includes(key)&&!(key==='raw'&&node.type==='Literal'&&typeof node.value==='string')).map(([key,value])=>[key,canonicalAst(value)]));
}
async function verifySummaryLiteralDelta(baseline){
 assert.equal(hash(await read(summaryProofPath)),summaryProofSha256,'Reviewed summary literal inventory changed.');
 const proof=await readJson(summaryProofPath),bytes=await read(proof.path);
 assert.equal(proof.beforeSha256,baseline.functions['lumo-admin'].files[proof.path]);assert.equal(proof.afterSha256,hash(bytes));
 const ast=parse(bytes.toString(),{ecmaVersion:'latest',sourceType:'module'}),strings=[];visitAst(ast,node=>{if(node.type==='Literal'&&typeof node.value==='string')strings.push(node);});
 assert.equal(proof.deltas.length,30);
 for(const change of proof.deltas){assert.equal(strings[change.stringLiteralIndex]?.value,change.after);assert.equal(change.after,change.before.replace(/\bLux\b/g,'Lumo').replace(/\bLUX\b/g,'LUMO'));strings[change.stringLiteralIndex].value=change.before;}
 assert.equal(hash(JSON.stringify(canonicalAst(ast))),proof.baselineAstSha256,'Generated summary executable AST must preserve the exact baseline.');
 return {path:summaryProofPath,sha256:summaryProofSha256,literalChanges:proof.deltas.length,nonliteralAstUnchanged:true};
}
async function noteFor(path,notes){
 const note=notes.changes[path];assert.ok(note,'Unreviewed branding source change: '+path);
 assert.ok(typeof note.reason==='string'&&note.reason.length>=80,'Substantive branding review reason required: '+path);
 assert.ok(Array.isArray(note.evidence)&&note.evidence.length>0,'Meaningful branding evidence required: '+path);
 for(const evidence of note.evidence){assert.ok(!evidence.startsWith('/')&&!evidence.includes('..'));await access(resolve(repository,evidence));}
 return {reason:note.reason,findings:['LUMO-NAME-2.15'],evidence:note.evidence};
}
export async function buildReadinessManifest({status='candidate-active59-branding-source',generatedAt=new Date().toISOString()}={}){
 assert.ok(['candidate-active59-branding-source','frozen-active59-branding-source'].includes(status));
 assert.equal(hash(await read(brandingBaselinePath)),brandingBaselineSha256,'Immutable pre-branding baseline changed.');
 assert.equal(hash(await read(parentReadinessPath)),parentReadinessSha256,'Immutable 2.14 source record changed.');
 assert.equal(hash(await read(baselinePath)),baselineSha256,'Immutable original live baseline changed.');
 const baseline=await readJson(brandingBaselinePath),parent=await readJson(parentReadinessPath),notes=await readJson(notesPath),functions={};
 assert.equal(baseline.sourceCommit,'57ca03aa201240cbc03dbdb1c6ea1e46a839cfd1');assert.deepEqual(Object.keys(baseline.functions).sort(),deployedFunctions);
 assert.equal(baseline.parentManifest.sha256,parentReadinessSha256);assert.equal(parent.releaseProfile.activeMigrations,59);
 const immutableHistorical={};for(const [path,digest]of Object.entries(baseline.immutableHistorical)){assert.equal(hash(await read(path)),digest,'Historical release evidence changed: '+path);immutableHistorical[path]=digest;}
 // The three prior gateway sources are authenticated by 2.14's exact live capture;
 // maintenance is authenticated independently against the immutable audit closure.
 for(const name of ['lumo-access','lumo-admin','lumo-approved'])assert.deepEqual(baseline.functions[name].files,parent.functions[name].files,'2.14 baseline differs: '+name);
 const audit=await readJson('backend/verification/audit-2026-11-16/reviewed-source-delta.json');
 for(const [path,digest]of Object.entries(baseline.functions['lumo-maintenance'].files))assert.equal(digest,audit.functions['lumo-maintenance'].files[path.replace('backend/supabase/functions/lumo-maintenance/','')]);
 for(const name of deployedFunctions){
  const original=baseline.functions[name],closure=await importedClosure(original.entrypoint),files=Object.fromEntries([...closure].map(([path,bytes])=>[path,hash(bytes)])),brandingDeltas={};
  assert.equal(original.hostedBaselineNamesAndBytesMatch,true);assert.equal(original.verifyJwt,false);
  assert.deepEqual(Object.keys(files),Object.keys(original.files),'Branding must not add, remove or widen an imported runtime dependency: '+name);
  if(name==='lumo-access')requireLiteralDisabledFlag(closure.get(original.entrypoint),'createAccessHandler','resetFenceEnabled');
  if(name==='lumo-admin')requireLiteralDisabledFlag(closure.get(original.entrypoint),'createAdminHandler','recoveryResetsEnabled');
  for(const [path,digest]of Object.entries(files)){if(digest===original.files[path])continue;brandingDeltas[path]={change:'modified',beforeSha256:original.files[path],afterSha256:digest,...await noteFor(path,notes)};}
  const prior=parent.functions[name],deltas=structuredClone(prior?.deltas||{});
  for(const [path,change]of Object.entries(brandingDeltas)){
   const previous=deltas[path];deltas[path]=previous?{...previous,afterSha256:change.afterSha256,reason:previous.reason+' Branding 2.15: '+change.reason,findings:[...previous.findings,...change.findings],evidence:[...new Set([...previous.evidence,...change.evidence])]}:change;
  }
  functions[name]={...(prior||{entrypoint:original.entrypoint,baselineVersion:original.version,baselineBundleSha256:original.bundleSha256,rollout:{candidateDisposition:'brand-only-exact-source-replacement',requiresExactHostedSourceVerification:true}}),brandingBaselineVersion:original.version,brandingBaselineBundleSha256:original.bundleSha256,verifyJwt:original.verifyJwt,files,deltas,brandingDeltas};
 }
 assert.equal(Object.keys(functions['lumo-access'].brandingDeltas).length,0,'Naming must not redeploy or change access authentication.');
 assert.equal(Object.keys(notes.changes).length,Object.values(functions).reduce((n,r)=>n+Object.keys(r.brandingDeltas).length,0),'Stale or unshipped review-note entry.');
 const migrations={},migrationRoot='backend/supabase/migrations/';
 for(const name of (await readdir(resolve(repository,migrationRoot))).filter(name=>name.endsWith('.sql')).sort()){
  const path=migrationRoot+name,digest=hash(await read(path));assert.equal(digest,baseline.migrations[path],'No migration changes are authorized for naming: '+path);assert.equal(digest,parent.migrations[path]?.sha256);migrations[path]=parent.migrations[path];
 }
 assert.deepEqual(Object.keys(migrations),Object.keys(baseline.migrations));assert.equal(Object.keys(migrations).length,59);
 const excludedPrivateWork=parent.releaseProfile.excludedPrivateWork;assert.equal(excludedPrivateWork.length,3);
 for(const excluded of excludedPrivateWork){assert.equal(excluded.included,false);await assert.rejects(access(resolve(repository,excluded.path)),{code:'ENOENT'},'Private Auth DDL/stage-only tests must stay absent.');}
 const verificationTools={};for(const path of ['backend/verification/branding-2.15.0/source-manifest.mjs','backend/tests/readiness-source-manifest.test.mjs','backend/tests/approved-engine.test.mjs','backend/tests/audit-source-manifest.test.mjs','backend/tests/maintenance-isolated-handler.test.mjs','backend/tests/branding-literal-delta.test.mjs','scripts/update-readiness-source-manifest.mjs','backend/package.json','backend/package-lock.json'])verificationTools[path]=hash(await read(path));
 return {schemaVersion:3,release:'2.15.0',status,generatedAt,releaseProfile:{name:'active59-public',activeMigrations:59,excludedPrivateWork},scope:'Branding-only overlay on the authentic 2.14 live gateway source and audited maintenance closure. Exactly enumerated presentation changes; no database migration, dependency, authentication or financial-rule change. Hosted activation is recorded separately; source verification alone does not establish real-money readiness.',importParser:{package:'acorn',version:parserVersion},baselineManifest:{path:brandingBaselinePath,sha256:brandingBaselineSha256,sourceCommit:baseline.sourceCommit},parentRelease:{path:parentReadinessPath,sha256:parentReadinessSha256,release:'2.14.0',meaning:'Immutable prior release record, including original audit lineage and active59 migration evidence.'},reviewNotes:{path:notesPath,sha256:hash(await read(notesPath))},summaryLiteralProof:await verifySummaryLiteralDelta(baseline),verificationTools,immutableHistorical:sorted({...immutableHistorical,[brandingBaselinePath]:brandingBaselineSha256}),functions,migrations};
}
export async function verifyReadinessManifest(manifest=undefined){manifest??=await readJson(readinessPath);const current=await buildReadinessManifest({status:manifest.status,generatedAt:manifest.generatedAt});assert.deepEqual(manifest,current,'Branding source changed or closure/rationale/lineage is stale. Review explicit deltas, then run node scripts/update-readiness-source-manifest.mjs --write --candidate (or --frozen after freeze).');return manifest;}
export async function writeReadinessManifest({frozen=false}={}){const manifest=await buildReadinessManifest({status:frozen?'frozen-active59-branding-source':'candidate-active59-branding-source'});await writeFile(resolve(repository,readinessPath),JSON.stringify(manifest,null,2)+'\n');return manifest;}
export function currentFunctionDigest(manifest,name,path){return manifest.functions[name]?.files['backend/supabase/functions/'+name+'/'+path];}
export function hasCurrentFunctionDelta(manifest,name,path){return Object.hasOwn(manifest.functions[name]?.deltas||{},'backend/supabase/functions/'+name+'/'+path);}
