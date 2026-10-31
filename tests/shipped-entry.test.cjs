'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const entry=require('./helpers/shipped-entry.cjs'),{buildPlatformAssets}=require('../scripts/build-platform-assets.cjs');
function fixture(t,bundled=true){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lumo-shipped-entry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.mkdirSync(path.join(root,'config'),{recursive:true});
 const originals={'a.js':'window.order=["a"];','b.js':'window.order.push("b");','a.css':'body{color:black}','b.css':'body{background:white}','manifest.webmanifest':'{"name":"Lumo"}','sw.js':'/* public shell */','index.html':'<link href="/a.css?v=1" rel="stylesheet"><link rel="stylesheet" href="/b.css"><script src="/a.js?v=1"></script><script src="/b.js"></script>'};
 for(const [file,body]of Object.entries(originals))fs.writeFileSync(path.join(root,'dist',file),body);
 if(!bundled)return {root};
 const built=buildPlatformAssets({root,capture:true});fs.writeFileSync(path.join(root,'dist/index.html'),'<link rel="stylesheet" href="'+built.stylesheet+'"><script src="'+built.script+'"></script>');buildPlatformAssets({root});return {root,built};
}
const read=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const write=(root,file,data)=>fs.writeFileSync(path.join(root,file),JSON.stringify(data));
test('unbundled readers follow the actual entry without requiring a generated registry',t=>{
 const {root}=fixture(t,false);assert.deepEqual(entry.scripts(root),['a.js','b.js']);assert.deepEqual(entry.styles(root),['a.css','b.css']);
});
test('bundled selective readers expand verified original source and cascade order',t=>{
 const {root}=fixture(t);assert.deepEqual(entry.scripts(root),['a.js','b.js']);assert.deepEqual(entry.styles(root),['a.css','b.css']);
});
test('selective expansion rejects a changed bundle or changed original source',t=>{
 for(const kind of ['script','stylesheet','source']){
  const {root,built}=fixture(t),file=kind==='source'?'a.js':built[kind].slice(1);fs.appendFileSync(path.join(root,'dist',file),' /* changed */');assert.throws(()=>entry.scripts(root),/hash has changed/);assert.throws(()=>entry.styles(root),/hash has changed/);
 }
});
test('selective expansion rejects canonical or registry source order changes',t=>{
 for(const kind of ['canonical','registry','source']){
  const {root}=fixture(t),file=kind==='canonical'?'config/platform-entry.json':'dist/platform-assets.json',data=read(root,file);
  if(kind==='canonical')data.scripts.reverse();else if(kind==='registry')data.entry.scripts.reverse();else data.bundles.script.sources.reverse();write(root,file,data);assert.throws(()=>entry.scripts(root),/order/);
 }
});
test('a mixed, duplicated or wrong actual bundle entry cannot expand as if it were reviewed',t=>{
 for(const kind of ['mixed','duplicated','wrong','style']){
  const {root,built}=fixture(t),file=path.join(root,'dist/index.html');let html=fs.readFileSync(file,'utf8');
  if(kind==='mixed')html+='<script src="/a.js"></script>';else if(kind==='duplicated')html+='<script src="'+built.script+'"></script>';else if(kind==='style')html+='<link rel="stylesheet" href="/a.css">';else html=html.replace(built.script,'/lumo-runtime.000000000000.js');
  fs.writeFileSync(file,html);assert.throws(()=>entry.scripts(root),/exactly/);
 }
});
