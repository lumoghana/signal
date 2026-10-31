/* Selective module tests may expand the canonical entry only after proving
   that it describes the real shipped bundles. The default DOM harness must
   continue executing index.html's actual scripts, without this expansion. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function local(url){
 assert.equal(typeof url,'string','An entry URL must be a string');assert(url.startsWith('/')&&!url.startsWith('//'),'Entry assets must be same-origin absolute URLs');
 const file=decodeURIComponent(url.split(/[?#]/)[0]).slice(1);assert(file&&!file.includes('\\')&&!file.split('/').some(part=>!part||part==='.'||part==='..'),'Unsafe entry asset path');return file;
}
function read(root){
 root=path.resolve(root);const dist=path.join(root,'dist'),html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
 const actual={scripts:[...html.matchAll(/<script\b[^>]*\bsrc=(['"])(.*?)\1[^>]*>/gi)].map(m=>m[2]),styles:[...html.matchAll(/<link\b[^>]*>/gi)].filter(m=>/\brel=(['"])stylesheet\1/i.test(m[0])).map(m=>m[0].match(/\bhref=(['"])(.*?)\1/i)?.[2])};
 const generated=Object.values(actual).flat().some(url=>/^lumo-(?:runtime|ui)\./.test(local(url)));
 if(!generated)return {scripts:actual.scripts.map(local),styles:actual.styles.map(local)};
 const registry=JSON.parse(fs.readFileSync(path.join(dist,'platform-assets.json'),'utf8')),canonical=JSON.parse(fs.readFileSync(path.join(root,'config/platform-entry.json'),'utf8'));
 assert.equal(registry.schemaVersion,1,'Unsupported bundle registry schema');assert.equal(canonical.schemaVersion,1,'Unsupported canonical entry schema');assert.deepEqual(registry.entry,canonical,'Bundle registry must retain the exact reviewed canonical order');
 for(const [kind,key,list]of [['scripts','script',canonical.scripts],['styles','stylesheet',canonical.styles]]){
  assert(Array.isArray(list)&&list.length,'Canonical entry must contain '+kind);assert.equal(new Set(list.map(local)).size,list.length,'Canonical entry cannot repeat a source');
  const meta=registry.bundles?.[key];assert(meta&&typeof meta.path==='string','Missing '+key+' bundle metadata');
  assert.equal(local('/'+meta.path),meta.path,'Unsafe bundle path');assert.deepEqual(actual[kind],['/'+meta.path],'Shipped entry must contain exactly its reviewed '+key+' bundle');
  const bundleBytes=fs.readFileSync(path.join(dist,meta.path));assert.equal(sha(bundleBytes),meta.sha256,'Shipped '+key+' bundle hash has changed');assert.equal(bundleBytes.length,meta.sizeBytes,'Shipped bundle size has changed');
  assert(Array.isArray(meta.sources),'Bundle must retain original source metadata');assert.deepEqual(meta.sources.map(source=>source.url),list,'Bundle source order must match the canonical entry');
  for(const source of meta.sources){assert.equal(source.path,local(source.url),'Bundle source URL/path mismatch');const bytes=fs.readFileSync(path.join(dist,source.path));assert.equal(sha(bytes),source.sha256,'Canonical source hash has changed: '+source.path);assert.equal(bytes.length,source.sizeBytes,'Canonical source size has changed: '+source.path);}
 }
 return {scripts:canonical.scripts.map(local),styles:canonical.styles.map(local)};
}
module.exports={scripts:root=>read(root).scripts,styles:root=>read(root).styles};
