import assert from 'node:assert/strict';
import {parse,version as parserVersion} from 'acorn';
import {readFile,readdir,access,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {relative,resolve,sep} from 'node:path';

export const repository=fileURLToPath(new URL('../../../',import.meta.url));
export const readinessPath='backend/verification/readiness-2.14.0/reviewed-source-delta.json';
export const baselinePath='backend/verification/readiness-2.14.0/live-baseline-sha256.json';
export const notesPath='backend/verification/readiness-2.14.0/review-notes.json';
export const rolloutPath='backend/verification/readiness-2.14.0/rollout-plan.json';
export const activeDeploymentPath='backend/verification/readiness-2.14.0/active-deployment.json';
export const deployedFunctions=['lumo-access','lumo-admin','lumo-approved'];
export const baselineSha256='d601451356acf8553de0cfc438546c04487624fb3a5b85fa56886456fc7a9c4b';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sorted=object=>Object.fromEntries(Object.entries(object).sort(([a],[b])=>a.localeCompare(b)));
const read=path=>readFile(resolve(repository,path));
export const readJson=async path=>JSON.parse(await read(path));
const canonical=path=>relative(repository,path).split(sep).join('/');
const historical=[
 'backend/verification/maintenance-2.12.0/approved18-baseline-sha256.json',
 'backend/verification/maintenance-2.12.0/approved-release-delta.json',
 'backend/verification/maintenance-2.12.0/isolated-function-source.json',
 'backend/verification/audit-2026-11-16/reviewed-source-delta.json',
 'backend/verification/audit-2026-11-16/reviewed-function-changes.patch',
 'backend/verification/merchant-loyalty-1.0.0/live22-baseline-sha256.json',
 'backend/verification/merchant-loyalty-1.0.0/reviewed-source-delta.json',
 'backend/verification/merchant-loyalty-1.0.0/reviewed-function-changes.patch',
 'backend/verification/consumer-loyalty-2.13.0/live23-baseline-sha256.json',
 'backend/verification/consumer-loyalty-2.13.0/reviewed-source-delta.json',
 'backend/verification/consumer-loyalty-2.13.0/reviewed-function-changes.patch',
 'backend/verification/recovery-review-2026-11-17/merchant-server-reviewed.patch',
 baselinePath
];

/** Exact ESM deployment closure, including explicit relative shared-function imports.
 * External and computed dynamic imports are rejected instead of omitted silently. */
export async function importedClosure(entrypoint,{readSource=read,allowedRoot='backend/supabase/functions/'}={}){
 const files=new Map();
 async function visit(path){
  const absolute=resolve(repository,path),name=canonical(absolute);
  assert.ok(name.startsWith(allowedRoot)&&!name.includes('..'),'Dependency escaped allowed source root: '+name);
  if(files.has(name))return;
  const bytes=await readSource(name),source=bytes.toString('utf8');files.set(name,bytes);
  const imports=[];
  let ast;try{ast=parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});}catch(error){throw Error('Cannot parse reviewed module '+name+': '+error.message);}
  function visitNode(node){
   if(!node||typeof node!=='object')return;
   if(node.type==='ImportDeclaration'||(node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration')&&node.source)imports.push(node.source.value);
   if(node.type==='ImportExpression'){
    assert.ok(node.source.type==='Literal'&&typeof node.source.value==='string','Computed dynamic import is not reviewed: '+name);imports.push(node.source.value);
   }
   for(const value of Object.values(node)){if(Array.isArray(value)){for(const child of value)visitNode(child);}else if(value&&typeof value==='object')visitNode(value);}
  }
  visitNode(ast);
  for(const specifier of imports){
   assert.ok(specifier.startsWith('.'),'Unreviewed external dependency in '+name+': '+specifier);
   const dependency=new URL(specifier,new URL('file://'+absolute));assert.equal(dependency.search,'');assert.equal(dependency.hash,'');
   await visit(canonical(fileURLToPath(dependency)));
  }
 }
 await visit(entrypoint);return new Map([...files].sort(([a],[b])=>a.localeCompare(b)));
}

function requireLiteralDisabledFlag(bytes,calleeName,flagName){
 const ast=parse(bytes.toString('utf8'),{ecmaVersion:'latest',sourceType:'module'});let found=0;
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name===calleeName){
   const options=node.arguments[0];assert.equal(options?.type,'ObjectExpression','Explicit rollout options required: '+calleeName);
   const flag=options.properties.find(p=>p.type==='Property'&&(p.key.name||p.key.value)===flagName);
   assert.ok(flag?.value.type==='Literal'&&flag.value.value===false,'Blocked recovery feature must remain literal false: '+flagName);found++;
  }
  for(const value of Object.values(node)){if(Array.isArray(value)){for(const child of value)visit(child);}else if(value&&typeof value==='object')visit(value);}
 }
 visit(ast);assert.equal(found,1,'Expected one reviewed handler entrypoint: '+calleeName);
}

async function noteFor(path,notes){
 const note=notes.changes[path];assert.ok(note,'Unreviewed source change: '+path+'; add explicit reason and meaningful evidence before regenerating.');
 assert.ok(typeof note.reason==='string'&&note.reason.length>=80,'Substantive reason required: '+path);
 assert.ok(Array.isArray(note.findings)&&note.findings.length>0,'Finding reference required: '+path);
 assert.ok(Array.isArray(note.evidence)&&note.evidence.length>0,'Evidence references required: '+path);
 for(const evidence of note.evidence){assert.ok(!evidence.startsWith('/')&&!evidence.includes('..'),'Evidence must stay in repository: '+evidence);await access(resolve(repository,evidence));}
 return {reason:note.reason,findings:note.findings,evidence:note.evidence};
}

export async function buildReadinessManifest({status='candidate-active59-public-source',generatedAt=new Date().toISOString()}={}){
 assert.ok(['candidate-active59-public-source','frozen-active59-public-source'].includes(status));
 assert.equal(hash(await read(baselinePath)),baselineSha256,'Immutable pre-change live baseline was modified.');
 const baseline=await readJson(baselinePath),notes=await readJson(notesPath),rollout=await readJson(rolloutPath),activeDeployment=await readJson(activeDeploymentPath),functions={},migrations={};
 assert.equal(activeDeployment.status,'deployed-and-exact-source-verified');assert.equal(activeDeployment.activeMigrationCount,59);assert.equal(activeDeployment.managedAuthFenceInstalled,false);
 assert.equal(rollout.profile,'active59-public');assert.equal(rollout.activeMigrationCount,59);
 assert.deepEqual(Object.keys(rollout.functions).sort(),deployedFunctions);
 assert.equal(rollout.functions['lumo-access'].candidateDisposition,'compatible-fence-disabled-candidate');
 assert.equal(rollout.functions['lumo-access'].capabilities.resetFenceEnabled,false);
 assert.equal(rollout.functions['lumo-access'].baselineVersion,baseline.functions['lumo-access'].version);
 assert.equal(baseline.sourceCommit,'99b7b1024978ba0dc3a143c0033db0af5e3ebc4e');
 assert.deepEqual(Object.keys(baseline.functions).sort(),deployedFunctions);
 for(const name of deployedFunctions){
  const original=baseline.functions[name],closure=await importedClosure(original.entrypoint);
  if(name==='lumo-access')requireLiteralDisabledFlag(closure.get(original.entrypoint),'createAccessHandler','resetFenceEnabled');
  if(name==='lumo-admin')requireLiteralDisabledFlag(closure.get(original.entrypoint),'createAdminHandler','recoveryResetsEnabled');
  const files=Object.fromEntries([...closure].map(([path,bytes])=>[path,hash(bytes)])),deltas={};
  for(const path of [...new Set([...Object.keys(original.files),...Object.keys(files)])].sort()){
   const beforeSha256=original.files[path]??null,afterSha256=files[path]??null;if(beforeSha256===afterSha256)continue;
   deltas[path]={change:beforeSha256===null?'added':afterSha256===null?'removed':'modified',beforeSha256,afterSha256,...await noteFor(path,notes)};
  }
  assert.deepEqual(files,activeDeployment.functions[name].sourceHashes,'Public runtime source must remain exact to the active reviewed gateway: '+name);
  functions[name]={entrypoint:original.entrypoint,baselineVersion:original.version,baselineBundleSha256:original.bundleSha256,rollout:rollout.functions[name],files,deltas};
 }
 const migrationRoot='backend/supabase/migrations/';
 for(const name of (await readdir(resolve(repository,migrationRoot))).filter(n=>n.endsWith('.sql')).sort()){
  const path=migrationRoot+name,digest=hash(await read(path)),beforeSha256=baseline.migrations[path]??null,recovered=baseline.recoveredMigrations[path];
  if(beforeSha256){assert.equal(digest,beforeSha256,'Historical migration changed: '+path);migrations[path]={change:'unchanged',sha256:digest};}
  else if(recovered){assert.equal(digest,recovered.sha256,'Recovered live migration changed: '+path);migrations[path]={change:'restored-live-source',sha256:digest,...await noteFor(path,notes)};}
  else migrations[path]={change:'added',sha256:digest,...await noteFor(path,notes)};
 }
 for(const path of [...Object.keys(baseline.migrations),...Object.keys(baseline.recoveredMigrations)])assert.ok(migrations[path],'Historical/recovered migration removed: '+path);
 assert.equal(Object.keys(migrations).length,59,'Public export must contain the complete active59 migration chain.');
 for(const excluded of rollout.excludedPrivateWork){assert.equal(excluded.included,false);await assert.rejects(access(resolve(repository,excluded.path)),{code:'ENOENT'},'Private stage file must be absent from public export: '+excluded.path);}
 assert.equal(rollout.excludedPrivateWork.length,3,'Keep the exact private-only exclusion inventory.');
 const baselineReplicas={};for(const [path,digest]of Object.entries(baseline.functions['lumo-access'].files)){const copy='backend/verification/readiness-2.14.0/access7-baseline/'+path.split('/').at(-1);assert.equal(hash(await read(copy)),digest,'Immutable access7 reference source changed: '+copy);baselineReplicas[copy]=digest;}
 const verificationTools={};for(const path of ['backend/verification/readiness-2.14.0/source-manifest.mjs','backend/verification/readiness-2.14.0/active-schema.mjs','backend/tests/readiness-source-manifest.test.mjs','backend/tests/approved-engine.test.mjs','backend/tests/audit-source-manifest.test.mjs','backend/tests/maintenance-isolated-handler.test.mjs','scripts/update-readiness-source-manifest.mjs','backend/package.json','backend/package-lock.json'])verificationTools[path]=hash(await read(path));
 const immutableHistorical={};for(const path of historical){
  const digest=hash(await read(path)),expected=path===baselinePath?baselineSha256:baseline.immutableHistorical[path];
  assert.ok(expected,'Missing immutable historical anchor: '+path);assert.equal(digest,expected,'Historical source record changed: '+path);immutableHistorical[path]=digest;
 }
 return {schemaVersion:2,release:'2.14.0',status,generatedAt,releaseProfile:{name:rollout.profile,activeMigrations:59,excludedPrivateWork:rollout.excludedPrivateWork},importParser:{package:'acorn',version:parserVersion},verificationTools,scope:'Exact imported source closure for the deployed3-function release and complete active59 migration lineage. The private unapplied managed Auth migration and stage-only SQL fixtures are absent. Source verification alone does not establish real-money readiness.',baselineManifest:baselinePath,activeDeployment:{path:activeDeploymentPath,sha256:hash(await read(activeDeploymentPath))},rolloutPlan:{path:rolloutPath,sha256:hash(await read(rolloutPath)),meaning:rollout.meaning},reviewNotes:{path:notesPath,sha256:hash(await read(notesPath))},immutableHistorical:sorted({...immutableHistorical,...baselineReplicas}),functions,migrations};
}

export async function verifyReadinessManifest(manifest=undefined){
 manifest??=await readJson(readinessPath);
 const current=await buildReadinessManifest({status:manifest.status,generatedAt:manifest.generatedAt});
 assert.deepEqual(manifest,current,'Readiness source changed or closure/rationale/lineage is stale. Review changes, then run node scripts/update-readiness-source-manifest.mjs --write --candidate (or --frozen after the final source freeze).');
 return manifest;
}
export async function writeReadinessManifest({frozen=false}={}){
 const manifest=await buildReadinessManifest({status:frozen?'frozen-active59-public-source':'candidate-active59-public-source'});
 // Update only this release record. Historical manifests and baseline are never rewritten.
 await writeFile(resolve(repository,readinessPath),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export function currentFunctionDigest(manifest,name,path){return manifest.functions[name]?.files['backend/supabase/functions/'+name+'/'+path];}
export function hasCurrentFunctionDelta(manifest,name,path){return Object.hasOwn(manifest.functions[name]?.deltas||{},'backend/supabase/functions/'+name+'/'+path);}
