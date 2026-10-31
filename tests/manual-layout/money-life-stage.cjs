'use strict';
const fs=require('node:fs'),path=require('node:path'),dir=__dirname,dist=path.resolve(dir,'../../dist');
const staged=['__life-audit.html','__life-audit.js','__life-seed.js','__overflow-seed.js','__readiness-fix-fixtures.js'];
if(process.argv.includes('--clean')){for(const name of staged)fs.rmSync(path.join(dist,name),{force:true});process.exit(0);}
let html=fs.readFileSync(path.join(dir,'mono-audit.html'),'utf8').replace('/__mono-audit.js?v=pause-entrypoints-20261029-1','/__life-audit.js').replace(/<script src="\/__mono-consistency[^>]*><\/script>/,'');
fs.writeFileSync(path.join(dist,'__life-audit.html'),html);
let js=fs.readFileSync(path.join(dir,'mono-audit.js'),'utf8').replace('<script src="/__readiness-fix-fixtures.js"><\\/script>','<script src="/__readiness-fix-fixtures.js"><\\/script><script src="/__life-seed.js"><\\/script>');
const old="[[320,568,1],[375,667,1],[390,844,1],[390,480,1],[320,568,1.5],[568,320,1],[768,1024,1],[1100,900,1]]";
js=js.replaceAll(old,'[[375,667,1],[390,844,1],[320,568,2]]');fs.writeFileSync(path.join(dist,'__life-audit.js'),js);
for(const [source,target]of [['money-life-fixtures.js','__life-seed.js'],['overflow-seed.js','__overflow-seed.js'],['readiness-fix-fixtures.js','__readiness-fix-fixtures.js']])fs.copyFileSync(path.join(dir,source),path.join(dist,target));
console.log('Local-only layout QA ready: /__life-audit.html');
