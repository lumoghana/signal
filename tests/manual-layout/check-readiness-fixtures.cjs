/* Source-only fixture validation. Exercises prepared surfaces, not geometry. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHarness}=require('../helpers/task-sheet-dom.cjs');
const scripts=['overflow-seed.js','readiness-fix-fixtures.js'].map(file=>({file,source:fs.readFileSync(path.join(__dirname,file),'utf8')}));
function harness(){
 const h=createHarness({clock:true,testing:true}),storage=h.context.localStorage,read=storage.getItem,write=storage.setItem;let reads=false,writes=false;
 storage.getItem=function(...args){if(reads)throw Error('Isolated QA storage read failure');return read.apply(this,args);};storage.setItem=function(...args){if(writes)throw Error('Isolated QA storage quota failure');return write.apply(this,args);};
 h.context.__readinessStorage={kind:'isolated-memory',failReads:v=>{reads=v===true;},failWrites:v=>{writes=v===true;},makeStale(){const entry=[...h.store.entries()].find(([key])=>/^lumo-.*-v1$/.test(key));assert(entry,'A saved isolated sample exists');const next=JSON.parse(entry[1]);next._fixtureOtherTab='newer-readiness-progress';h.store.set(entry[0],JSON.stringify(next));}};
 for(const s of scripts)vm.runInContext(s.source,h.context,{filename:s.file});return h;
}
const first=harness(),cases=Array.from(first.context.__overflowCases).filter(c=>c.variant.startsWith('readiness-')),rows=[];
for(const c of cases){const h=harness(),result=h.context.__overflowSeed(c);h.flushHistory();h.flush();const overlay=h.document.getElementById('persistence-recovery'),view=overlay||h.document.getElementById('view'),text=view.textContent;
 const errors=[...result.errors,...h.errors];if(h.L.route!==c.route)errors.push('Expected '+c.route+', received '+h.L.route);if(/Let’s try that again/.test(text))errors.push('Renderer fallback');if(!view.querySelector('h1,h2'))errors.push('Missing heading');
 if(c.variant.startsWith('readiness-save-failed'))assert.equal(h.L.persistence.status().reason,'save-failed');if(c.variant.startsWith('readiness-stale'))assert.equal(h.L.persistence.status().reason,'stale');if(c.variant.startsWith('readiness-storage-unavailable'))assert.equal(h.L.persistence.status().reason,'unavailable');
 rows.push({name:c.name,requested:c.route,actual:h.L.route,persistence:h.L.persistence.status().reason,headings:view.querySelectorAll('h1,h2').map(e=>e.textContent),errors});
}
const bad=rows.filter(r=>r.errors.length);console.log(JSON.stringify({total:rows.length,passed:rows.length-bad.length,failed:bad.length,first:rows.filter(r=>r.name.endsWith('first')).length,returning:rows.filter(r=>r.name.endsWith('returning')).length,failures:bad},null,2));if(bad.length)process.exitCode=1;
