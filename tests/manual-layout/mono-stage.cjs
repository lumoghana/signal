/* Local QA staging only; never ship __mono or __deep fixture paths. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const dist=path.resolve(__dirname,'../../dist');
const files=['mono-gallery.html','mono-gallery.js','mono-audit.html','mono-audit.js','mono-consistency.js','overflow-seed.js','readiness-fix-fixtures.js','deep-onboarding-fixtures.js','deep-payments-fixtures.js','deep-planning-fixtures.js'];
for(const name of files){const target=path.join(dist,'__'+name);if(process.argv.includes('--clean'))fs.rmSync(target,{force:true});else fs.copyFileSync(path.join(__dirname,name),target);}
console.log(process.argv.includes('--clean')?'Removed monochrome QA assets.':'Staged local monochrome QA: /__mono-gallery.html and /__mono-audit.html');
