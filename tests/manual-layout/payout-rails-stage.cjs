/* Focused local QA only. Never publish __payout-rails assets. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),dist=path.resolve(__dirname,'../../dist');
for(const file of ['payout-rails-audit.html','payout-rails-audit.js']){const target=path.join(dist,'__'+file);if(process.argv.includes('--clean'))fs.rmSync(target,{force:true});else fs.copyFileSync(path.join(__dirname,file),target);}
console.log(process.argv.includes('--clean')?'Removed payout QA assets.':'Staged /__payout-rails-audit.html');
