/**
 * Disposable visual QA snapshots of the real Campus Run renderers.
 * Run: node scripts/generate-game-ui-audit.mjs [output-directory]
 * Output stays outside the project and is never part of the deployed app.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createDemoState,applyAction} from '../dist/js/model.js';
import {CAMPUS_MISSIONS,getCampusRun} from '../dist/js/learning-game-model.js';
import {renderCampusGame,renderCampusGameEntry} from '../dist/js/learning-game-ui.js';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(projectRoot,'dist');
const outputRoot=path.resolve(process.argv[2]||path.join(tmpdir(),'lumo-game-ui-audit'));
const inProject=path.relative(projectRoot,outputRoot);
if(inProject===''||(!inProject.startsWith('..'+path.sep)&&inProject!=='..'&&!path.isAbsolute(inProject))){
 throw new Error('Choose an audit output directory outside the project. Fixtures must not ship in production dist.');
}
const output=path.join(outputRoot,'dist');
try{
 const config=JSON.parse(await fs.readFile(path.join(outputRoot,'.openai/hosting.json'),'utf8'));
 if(config.project_id)throw new Error('The audit output is a registered Site. Choose a disposable directory instead.');
}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.mkdir(path.join(output,'cases'),{recursive:true});
// Only public static assets are copied. No app JavaScript, worker, storage or runtime is used.
await fs.cp(source,output,{recursive:true,filter:entry=>!entry.endsWith('.js')});
await fs.rm(path.join(output,'js'),{recursive:true,force:true});
await fs.rm(path.join(output,'sw.js'),{force:true});
const original=await fs.readFile(path.join(source,'index.html'),'utf8');
const originalHead=original.slice(original.indexOf('<head>')+6,original.indexOf('</head>'));
const head=originalHead.replace(/<title>.*?<\/title>/,'<title>Lumo UI audit snapshot</title>').replace(/<link\b[^>]*rel="manifest"[^>]*>/g,'');
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const clone=value=>JSON.parse(JSON.stringify(value));
const cases=[];
const must=(state,type,payload)=>{
 const result=applyAction(state,type,payload);
 if(!result.ok)throw new Error(`${type}: ${result.message}`);
 return result;
};
function student(){const state=createDemoState();must(state,'learningEnroll',{goal:'allowance',personalised:false});return state;}
function choose(state,id,choiceId){const run=getCampusRun(state,id);return must(state,'campusChoose',{runId:id,stepId:run.stepId,choiceId:choiceId||run.turn.choices[0].id});}
function advance(state,id){const run=getCampusRun(state,id);return must(state,'campusContinue',{runId:id,stepId:run.stepId});}
function finish(state,missionId){const id=must(state,'campusStart',{missionId,replay:true}).runId;for(let i=0;i<3;i++){choose(state,id);advance(state,id);}return id;}
async function save(name,label,type,state,route,{entry=false}={}){
 const context={state,draft:{campusMotionOff:true},route};
 const markup=entry?renderCampusGameEntry(context):renderCampusGame(context,route);
 const html=`<!doctype html><html lang="en-GH"><head>${head}</head><body data-audit-case="${esc(name)}"><div class="app-frame"><div id="app" class="app" data-flow="true"><div id="shell"></div><main id="view" tabindex="-1">${markup}</main><div id="overlay-root"></div><div id="toast" role="status" aria-live="polite"></div></div></div></body></html>`;
 const file=`cases/${name}.html`;
 await fs.writeFile(path.join(output,file),html);
 cases.push({id:name,label,type,url:'/'+file});
}

const base=student();
await save('entry-new','Entry · new player','entry',base,{section:'learn',page:'home'},{entry:true});
await save('map-new','Map · locked chapters','map',base,{section:'learn',page:'game'});
await save('rewards-new','Looks · mostly locked','rewards',base,{section:'learn',page:'rewards'});
for(const mission of CAMPUS_MISSIONS){
 const state=clone(base),id=must(state,'campusStart',{missionId:mission.id,replay:true}).runId;
 // Walk every reachable prefix so variant labels, amounts and outcomes use the engine.
 async function walk(current,prefix=[]){
  const run=getCampusRun(current,id),route={section:'learn',page:'play',id};
  const stem=`${mission.index+1}-${mission.id}-t${run.turnIndex+1}-${prefix.length?prefix.join('-'):'root'}`;
  const prefixLabel=prefix.length?prefix.map(n=>n+1).join('.'):'start';
  await save(stem+'-choice',`${mission.index+1}. ${mission.title} · ${run.turnIndex+1}/3 · ${prefixLabel} · choice`,'choice',current,route);
  for(let index=0;index<run.turn.choices.length;index++){
   const child=clone(current);choose(child,id,run.turn.choices[index].id);
   const choices=prefix.concat(index).map(n=>n+1).join('.');
   await save(stem+`-c${index+1}-outcome`,`${mission.index+1}. ${mission.title} · ${run.turnIndex+1}/3 · ${choices} · outcome`,'outcome',child,route);
   advance(child,id);
   if(getCampusRun(child,id).status!=='completed')await walk(child,prefix.concat(index));
   else if(index===0&&prefix.every(n=>n===0)){
    const chapter=`${mission.index+1}-${mission.id}`;
    await save(chapter+'-result',`${mission.index+1}. ${mission.title} · chapter result`,'result',child,route);
    await save(chapter+'-lesson',`${mission.index+1}. ${mission.title} · lesson`,'lesson',child,{...route,step:'lesson'});
    await save(chapter+'-insight',`${mission.index+1}. ${mission.title} · insight`,'insight',child,{...route,step:'insight'});
   }
  }
 }
 await walk(state);
 finish(base,mission.id);
 if(mission.index<5)await save(`map-after${mission.index+1}`,`Map · after ${mission.index+1} completed chapter${mission.index?'s':''}`,'map',base,{section:'learn',page:'game'});
}
await save('map-complete','Map · all chapters complete','map',base,{section:'learn',page:'game'});
await save('rewards-complete','Looks · all unlocked','rewards',base,{section:'learn',page:'rewards'});
await save('entry-complete','Entry · all chapters complete','entry',base,{section:'learn',page:'home'},{entry:true});

// This is a controlled font-size stress test, not Android or iOS font emulation.
// Capture every original computed size before applying any overrides; each font scales once.
const textStress=`<script>const sizes=Array.from(document.querySelectorAll('body *')).filter(el=>el.namespaceURI==='http://www.w3.org/1999/xhtml').map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);for(const [el,size] of sizes)if(Number.isFinite(size))el.style.fontSize=(size*1.5)+'px';document.documentElement.dataset.auditReady='true';</script>`;
for(const item of cases.filter(item=>['lesson','insight'].includes(item.type))){
 const id=item.id+'-text150',file=`cases/${id}.html`;
 let html=await fs.readFile(path.join(output,item.url.slice(1)),'utf8');
 html=html.replace(`data-audit-case="${item.id}"`,`data-audit-case="${id}" data-audit-text-stress="150% simulated"`).replace('</body>',textStress+'</body>');
 await fs.writeFile(path.join(output,file),html);
 cases.push({id,label:item.label+' · 150% text stress (simulated)',type:item.type+'-textstress',url:'/'+file});
}

const options=cases.map(item=>`<option value="${esc(item.url)}">${esc(item.label)}</option>`).join('');
const links=cases.map(item=>`<a href="${esc(item.url)}">${esc(item.label)}</a>`).join('');
const index=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lumo UI audit · local snapshots</title><style>html,body{margin:0;background:#0d0e13;color:#eee;font:13px system-ui}header{position:sticky;top:0;z-index:2;background:#171820;padding:10px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}label{display:flex;gap:5px;align-items:center}select,a{font:inherit}select{max-width:520px;padding:6px;background:#24252d;color:#eee}a{color:#d4f65a}main{padding:14px;display:flex;gap:20px;align-items:flex-start}iframe{display:block;border:1px solid #555;background:#191a22;flex-shrink:0}aside{width:270px;max-height:850px;overflow:auto;font-size:11px}aside a{display:block;padding:4px}p{line-height:1.45}</style></head><body><header><strong>READ-ONLY UI SNAPSHOTS</strong><label>Screen<select id="case">${options}</select></label><label>Viewport<select id="size"><option value="360x640">360 × 640</option><option value="320x568">320 × 568</option><option value="390x844">390 × 844</option><option value="430x880">430 × 880</option></select></label><a id="direct" href="${cases[0].url}">Open this snapshot</a></header><main><iframe id="phone" title="Lumo audit viewport" width="360" height="640" src="${cases[0].url}"></iframe><aside><p>Actual production markup and stylesheet order. No account storage, app actions or financial runtime. ${cases.length} static states, including every branch prefix and outcome. Text stress cases are simulations, not OS font-setting emulation. These snapshots do not test movement timing.</p>${links}</aside></main><script>const select=document.querySelector('#case'),size=document.querySelector('#size'),frame=document.querySelector('#phone'),direct=document.querySelector('#direct');select.addEventListener('change',()=>{frame.src=select.value;direct.href=select.value});size.addEventListener('change',()=>{const [w,h]=size.value.split('x');frame.width=w;frame.height=h});</script></body></html>`;
await fs.writeFile(path.join(output,'index.html'),index);
await fs.writeFile(path.join(output,'cases.json'),JSON.stringify(cases,null,2));
await fs.mkdir(path.join(outputRoot,'.openai'),{recursive:true});
await fs.writeFile(path.join(outputRoot,'.openai/hosting.json'),JSON.stringify({static:{directory:'dist'}},null,2));
const counts=Object.fromEntries([...new Set(cases.map(item=>item.type))].map(type=>[type,cases.filter(item=>item.type===type).length]));
console.log(JSON.stringify({directory:outputRoot,cases:cases.length,counts,viewports:['320x568','360x640','390x844','430x880'],previewCommand:`sites-preview start ${JSON.stringify(outputRoot)}`,limits:'Static layout snapshots. Motion, keyboard, storage and live journeys need separate browser QA. 150% text cases are controlled simulations.'},null,2));
