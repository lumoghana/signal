#!/usr/bin/env node
/* Prepare isolated local browser geometry QA. Never include temporary dist files in a publication. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dist=path.join(root,'dist');
const args=process.argv.slice(2),clean=args.includes('--clean');
const inputs=[['overflow-audit.html','__overflow-audit.html'],['overflow-audit.js','__overflow-audit.js'],['overflow-seed.js','__overflow-seed.js'],['deep-gallery.html','__deep-gallery.html'],['deep-gallery.js','__deep-gallery.js'],['deep-onboarding-fixtures.js','__deep-onboarding-fixtures.js'],['deep-payments-fixtures.js','__deep-payments-fixtures.js'],['deep-planning-fixtures.js','__deep-planning-fixtures.js']];
inputs.push(['planning-native-history.html','__planning-native-history.html'],['planning-native-history.js','__planning-native-history.js']);
const generated=[...inputs.map(([,name])=>name),'__audit-minna','__audit-hibiscus'];
if(clean){for(const name of generated)fs.rmSync(path.join(dist,name),{recursive:true,force:true});console.log('Removed only temporary overflow audit assets from '+dist);process.exit(0);}
if(args.includes('--help')){console.log('node tests/manual-layout/prepare-overflow-audit.cjs [--prepare] [--minna /checkout] [--hibiscus /checkout]\nnode tests/manual-layout/prepare-overflow-audit.cjs --clean');process.exit(0);}
for(const [source,target]of inputs){const file=path.join(__dirname,source);if(!fs.existsSync(file))throw Error('Audit source is missing: '+file);fs.copyFileSync(file,path.join(dist,target));}
for(const edition of ['minna','hibiscus']){
 const option=args.indexOf('--'+edition),checkout=option>=0?args[option+1]:path.resolve(root,'../lumo-'+edition+'-edition');
 if(!checkout)throw Error('Pass the checkout path after --'+edition);
 const source=path.join(path.resolve(checkout),'dist'),dest=path.join(dist,'__audit-'+edition),prefix='/__audit-'+edition;
 if(!fs.existsSync(path.join(source,'index.html'))){console.log('Skipped unavailable '+edition+' checkout: '+checkout);continue;}
 fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});const index=fs.readFileSync(path.join(source,'index.html'),'utf8');
 const referenced=[...index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(x=>x[1]).filter(x=>/\.(js|css)$/.test(x));
 const files=new Set([...fs.readdirSync(source).filter(x=>/\.(js|css)$/.test(x)&&!x.startsWith('__')),...referenced,'index.html']);
 for(const file of files){const original=path.join(source,file),target=path.join(dest,file);if(!original.startsWith(source+path.sep))throw Error('Invalid source asset path');fs.mkdirSync(path.dirname(target),{recursive:true});let content=fs.readFileSync(original);if(file.endsWith('.css'))content=Buffer.from(content.toString().replace(/url\((['"]?)\/(fonts|assets\/fonts)\//g,'url($1'+prefix+'/$2/'));fs.writeFileSync(target,content);}
 for(const dir of ['fonts','assets/fonts'])if(fs.existsSync(path.join(source,dir)))fs.cpSync(path.join(source,dir),path.join(dest,dir),{recursive:true});
 console.log('Prepared exact '+edition+' source mirror ('+files.size+' source files and edition fonts).');
}
console.log('Open the managed preview at /__overflow-audit.html. Use ?edition=minna or ?edition=hibiscus for prepared peers.');
console.log('After QA, run this helper with --clean before packaging. No customer profile was copied.');
