/* Rebuild the ordered shell and pin the final HTML in its public cache map. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {buildPlatformAssets}=require('./build-platform-assets.cjs');
const root=path.resolve(__dirname,'..'),index=path.join(root,'dist/index.html');
if(process.argv.includes('--check')){console.log(JSON.stringify(buildPlatformAssets({root,check:true})));process.exit(0);}
const entry=path.join(root,'config/platform-entry.json');
const result=buildPlatformAssets({root,capture:!fs.existsSync(entry)});
let html=fs.readFileSync(index,'utf8'),scripts=0,styles=0;
const fallback='<section id="lumo-load-recovery" hidden role="alert" aria-labelledby="lumo-load-title"><div><h1 id="lumo-load-title">Lumo could not open.</h1><p>Check your connection, then try loading again.</p><button type="button" onclick="location.reload()">Reload Lumo</button></div></section>';
html=html.replace(/<section id="lumo-load-recovery"[\s\S]*?<\/section>\s*/g,'');
html=html.replace(/<script\b/,fallback+'\n<script');
html=html.replace(/<script\b[^>]*\bsrc=(['"])[^'"]+\1[^>]*>\s*<\/script>/gi,()=>scripts++?'':'<script src="'+result.script+'" onerror="document.getElementById(\'lumo-load-recovery\').hidden=false;for(const node of document.body.children)node.inert=node.id!==\'lumo-load-recovery\';document.querySelector(\'#lumo-load-recovery button\').focus()"></script>');
html=html.replace(/<link\b[^>]*>/gi,tag=>/\brel=(['"])stylesheet\1/i.test(tag)?styles++?'':'<link rel="stylesheet" href="'+result.stylesheet+'">':tag);
if(!scripts||!styles)throw Error('The release entry must contain its script and stylesheet.');
html=html.replace(/\n{3,}/g,'\n\n');fs.writeFileSync(index,html);
console.log(JSON.stringify(buildPlatformAssets({root}),null,2));
