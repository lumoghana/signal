#!/usr/bin/env node
/* Explicit release-coordinator operation after approved source freeze. Never changes app source. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),integration=JSON.parse(fs.readFileSync(path.join(root,'docs/review-2026-10-27/peer-integration.json')));
const allowed=new Set(integration.sharedFiles.map(f=>path.basename(f)));
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function source(repo,file){let text=fs.readFileSync(path.join(repo,'dist',file),'utf8');if(file==='core.js')text=text.replace(/const key='lumo-(?:everyday|minna|hibiscus)-edition-v1';/,"const key='lumo-everyday-edition-v1';");return text;}
function pin(repo,file,prior){const value=hash(source(repo,file));if(allowed.has(file))assert.equal(value,hash(source(root,file)),file+' must match the authorised shared source');else if(prior)assert.equal(value,prior,file+' is outside the approved change list');return value;}
for(const [edition,name]of [['minna','editions.json'],['hibiscus','hibiscus-edition.json']]){
 const repo=path.join(path.dirname(root),'lumo-'+edition+'-edition'),file=path.join(repo,'config',name),m=JSON.parse(fs.readFileSync(file));
 if(edition==='minna'){
  for(const f of m.baseline.scripts){const reviewed=pin(repo,f,m.baseline.sha256[f]);m.baseline.sha256[f]=f==='core.js'?hash(source(repo,f).replace("const key='lumo-everyday-edition-v1';","const key='__EDITION_STORAGE_KEY__';")):reviewed;}
  for(const f of new Set([...m.featureScripts,...m.featureStyles]))m.featureSha256[f]=pin(repo,f,m.featureSha256[f]);
  for(const f of m.peerPresentationScripts)assert.equal(hash(source(root,f)),m.peerPresentationSha256[f],f+' Everyday adapter remains separately pinned');
 }else{
  for(const f of m.baseline.scripts){const approved=m.approvedFeatureOverrides?.[f]||m.approvedPresentationOverrides?.[f],prior=approved?.sha256||m.baseline.sha256[f],value=pin(repo,f,prior);if(value!==prior){assert(allowed.has(f));const override=m.approvedFeatureOverrides[f]||{reason:m.releaseReview.review};override.sha256=value;m.approvedFeatureOverrides[f]=override;}}
  for(const f of m.featureSync.scripts)m.featureSync.sha256[f]=pin(repo,f,m.featureSync.sha256[f]);
  for(const f of m.featureStyles)m.featureStyleSha256[f]=pin(repo,f,m.featureStyleSha256[f]);
 }
 const expected=[...m.baseline.scripts,...m.presentationScripts,...m.featureScripts],actual=[...fs.readFileSync(path.join(repo,'dist/index.html'),'utf8').matchAll(/<script\b[^>]*src="\/([^"?]+)/g)].map(x=>x[1]);assert.deepEqual(actual,expected,'Exact reviewed '+edition+' load order');
 const tests=m.verification?.regressionTests||m.regressionTests;for(const name of ['onboarding','payments','planning','primary','product'])assert(tests.includes('tests/'+name+'-finish.test.cjs'),'All five finishing suites stay in the full gate');
 m.releaseReview.status='Reviewed source contract; verification status and evidence are in RELEASE-REVIEW.md';for(const f of Object.keys(m.releaseReview.editionAdapterSha256))m.releaseReview.editionAdapterSha256[f]=hash(source(repo,f));
 fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');console.log(JSON.stringify({edition,scripts:actual.length,regressionFiles:tests.length}));
}
