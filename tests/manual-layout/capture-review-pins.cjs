#!/usr/bin/env node
/* Source-only review evidence. Reads shipped assets without loading the application. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const baseline={everyday:{version:53,commit:'a4c0ecb596ac8a2bbe45f6c64078e4549a535d8e'},minna:{version:34,commit:'c6b13e05cea8579aa303d893f1743f1b3931daae'},hibiscus:{version:28,commit:'a7b2042a865596c073314cdd05420575f3ab19fe'}};
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function filePin(file){const data=fs.readFileSync(file);return{sha256:digest(data),bytes:data.length};}
function captureEdition(edition,checkout=path.join(path.dirname(root),'lumo-'+edition+'-edition')){
 const dist=path.join(checkout,'dist'),index=fs.readFileSync(path.join(dist,'index.html'),'utf8');
 const scripts=[...index.matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
 const styles=[...index.matchAll(/<link\b[^>]*\bhref="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]).filter(f=>f.endsWith('.css'));
 const runtimeFiles=fs.readdirSync(dist).filter(f=>/\.(?:js|css)$/.test(f)&&!f.startsWith('__')).sort();
 const files=Object.fromEntries([...new Set(['index.html',...runtimeFiles,...scripts,...styles])].map(f=>[f,filePin(path.join(dist,f))]));
 const helpers=path.join(checkout,'tests/helpers');
 const helperFiles=fs.existsSync(helpers)?Object.fromEntries(fs.readdirSync(helpers).filter(f=>/\.(?:cjs|js)$/.test(f)).sort().map(f=>['tests/helpers/'+f,filePin(path.join(helpers,f))])):{};
 const reviewPaths=['AGENTS.md'];for(const directory of ['config','scripts'])if(fs.existsSync(path.join(checkout,directory)))for(const file of fs.readdirSync(path.join(checkout,directory)).sort())if(/\.(?:json|cjs|js)$/.test(file))reviewPaths.push(directory+'/'+file);
 const reviewFiles=Object.fromEntries(reviewPaths.filter(f=>fs.existsSync(path.join(checkout,f))).map(f=>[f,filePin(path.join(checkout,f))]));
 return{edition,checkout,openedBaseline:baseline[edition],commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim(),title:index.match(/<title>([^<]*)<\/title>/)?.[1]||'',scripts,styles,files,helperFiles,reviewFiles,sourceFingerprint:digest(JSON.stringify({files,helperFiles,reviewFiles})),shippedFingerprint:digest(JSON.stringify(Object.fromEntries(['index.html',...scripts,...styles].map(f=>[f,files[f]||filePin(path.join(dist,f))]))))};
}
function captureAll(){return{capturedAt:new Date().toISOString(),scope:'Current checkout source pins, not a publication receipt.',editions:Object.fromEntries(Object.keys(baseline).map(e=>[e,captureEdition(e)]))};}
function changedPins(before,after){const changes=[];for(const edition of Object.keys(before.editions)){for(const group of ['files','helperFiles','reviewFiles']){const a=before.editions[edition][group],b=after.editions[edition][group];for(const file of new Set([...Object.keys(a),...Object.keys(b)]))if(a[file]?.sha256!==b[file]?.sha256)changes.push({edition,file,from:a[file]?.sha256||null,to:b[file]?.sha256||null});}}return changes;}
module.exports={captureAll,captureEdition,changedPins,filePin};
if(require.main===module){const option=process.argv.indexOf('--output'),output=option<0?path.join(root,'docs/review-2026-10-27/source-pins-current.json'):path.resolve(process.argv[option+1]||'');if(option>=0&&!process.argv[option+1])throw Error('--output requires a file path');const data=captureAll();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({output,fingerprints:Object.fromEntries(Object.entries(data.editions).map(([e,d])=>[e,d.sourceFingerprint]))}));}
