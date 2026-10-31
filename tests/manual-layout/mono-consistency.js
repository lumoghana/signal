/* Local computed-style audit. Reuses the reviewed isolated route fixtures and
   geometry checks in mono-audit.js; never load this file in the product. */
'use strict';
const consistencyRuns=[...document.querySelectorAll('button[id^="run"]')];
let consistencyReady=false;
for(const button of consistencyRuns)button.disabled=true;

function monoVisualFacts(){
 const d=frame.contentDocument,w=frame.contentWindow,app=d.getElementById('persistence-recovery')||d.getElementById('app');
 const cache=new WeakMap(),style=e=>{if(!cache.has(e))cache.set(e,w.getComputedStyle(e));return cache.get(e);};
 const parentChain=e=>{const out=[];for(let p=e;p;p=p.parentElement)out.push(p);return out;};
 const hidden=e=>{
  if(!e.getClientRects().length||e.closest('svg,script,style,noscript,[hidden],[inert],[aria-hidden="true"],.sr-only,.desktop-note,input,select,textarea'))return true;
  for(const p of parentChain(e)){
   const s=style(p),r=p.getBoundingClientRect();
   if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)<.8||s.contentVisibility==='hidden')return true;
   if(s.clip!=='auto'||s.clipPath!=='none'||r.width<=2&&r.height<=2&&/hidden|clip/.test(s.overflow))return true;
   if(p.localName==='details'&&!p.open){const first=[...p.children].find(n=>n.localName==='summary');if(!first?.contains(e))return true;}
  }
  return false;
 };
 const rgba=value=>{const m=value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\s*\)$/);return m?[...m.slice(1,4).map(Number),m[4]===undefined?1:Number(m[4])]:null;};
 const over=(front,back)=>front.slice(0,3).map((value,i)=>value*front[3]+back[i]*(1-front[3]));
 const luminance=rgb=>rgb.map(value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
 const background=e=>{
  let value=[255,255,255],source=null;
  for(const p of parentChain(e).reverse()){
   const s=style(p);
   if(s.backgroundImage!=='none'||s.mixBlendMode!=='normal'||s.backdropFilter&&s.backdropFilter!=='none')return {unknown:true,reason:'image, gradient or blend'};
   const c=rgba(s.backgroundColor);if(c?.[3]>.01){value=over(c,value);source={tag:p.localName,id:p.id,cls:typeof p.className==='string'?p.className:''};}
   // Decorative overlays and photographs require separate visual inspection.
   for(const pseudo of ['::before','::after']){const ps=w.getComputedStyle(p,pseudo);if(ps.content&&ps.content!=='none'&&ps.content!=='normal'&&(rgba(ps.backgroundColor)?.[3]>.01||ps.backgroundImage!=='none'))return {unknown:true,reason:'painted pseudo element'};}
  }
  return {rgb:value.map(Math.round),source};
 };
 const info=(e,text)=>{const s=style(e);return {tag:e.localName,id:e.id,cls:typeof e.className==='string'?e.className:'',text:text.slice(0,90),family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,numeric:s.fontVariantNumeric,features:s.fontFeatureSettings,spacing:s.letterSpacing,color:s.color};};
 const families=new Map(),numbers=[],findings=[],contrastSkipped=[],sampled=[];
 const walker=d.createTreeWalker(app,w.NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  const value=node.textContent.trim().replace(/\s+/g,' '),e=node.parentElement;if(!value||!e||hidden(e))continue;
  const s=style(e),fact=info(e,value);if(Number.parseFloat(s.fontSize)<1)continue;
  families.set(s.fontFamily,(families.get(s.fontFamily)||0)+1);sampled.push(fact);
  if(!/^['"]?Manrope UI['"]?(?:,|$)/.test(s.fontFamily))findings.push({kind:'font-family',...fact});
  if(/\d/.test(value)&&!e.closest('.wordmark,.actual-wordmark')){
   const role=e.closest('[class*="money"],[class*="amount"],[class*="balance"],[class*="metric"],[class*="total"],.gm-summary,.receipt,.summary-line,dd');
   numbers.push({...fact,role:role?.className||e.localName,monetary:/GH[₵¢]|\bGHS\b/.test(value)||!!role});
  }
  if(e.closest('button:disabled,[aria-disabled="true"]'))continue;
  const bg=background(e),fg=rgba(s.color);if(bg.unknown){contrastSkipped.push({text:value.slice(0,55),reason:bg.reason});continue;}
  if(!fg||fg[3]<.8)continue;
  const foreground=over(fg,bg.rgb),a=luminance(foreground),b=luminance(bg.rgb),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  const size=Number.parseFloat(s.fontSize),large=size>=24||size>=18.666&&Number(s.fontWeight)>=700,required=large?3:4.5;
  if(ratio+.02<required)findings.push({kind:'low-solid-contrast',...fact,background:bg.rgb,backgroundSource:bg.source,contrast:Math.round(ratio*100)/100,required,large});
 }
 const surfaces=[...app.querySelectorAll('.card,.receipt,.soft,.notice,.mono-money-card,.mono-conversation-card,.box-card,.goal-card,.story-preview,.gm-summary,.gm-mandate-summary,.cpr-source,.cc-source')].filter(e=>!hidden(e)).map(e=>{const s=style(e);return {tag:e.localName,cls:e.className,background:s.backgroundColor,color:s.color,border:s.borderTopColor,radius:s.borderTopLeftRadius,hasImage:s.backgroundImage!=='none'};});
 const unique=rows=>[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
 return {fontsLoaded:d.fonts.status,manropeDigitsLoaded:d.fonts.check('500 16px "Manrope UI"','0123456789'),textFragments:sampled.length,families:Object.fromEntries(families),numberRoles:unique(numbers).slice(0,65),surfaces:unique(surfaces).slice(0,40),findings:unique(findings).slice(0,50),contrastSkipped:unique(contrastSkipped).slice(0,20)};
}

const consistencyCritical=new Set(['welcome','samplePause','setupChoice','signin','phone','identityResult','accountReady','home','plan','balances','goals','goal','goalEdit','moneyStoryHome','chat','sendOptions','send','paymentReview','pause','authorize','paymentResult','txDetail','profile','security','accountInfo','myQr','campusPay','virtualCards','virtualCard','groupMoneyDetail','groupMoneyPayments','groupMoneyProposalDetail','groupMoneyMember']);
const consistencyVariants=new Map([
 ['home',new Set(['empty','multiple-boxes','long-values','long-values-hidden','budget-heavy-values','budget-heavy-values-hidden'])],
 ['plan',new Set(['expanded','long-values','seven-categories','empty'])],
 ['chat',new Set(['conversation','conversation-expanded'])],
 ['goal',new Set(['hack-active-history','hack-paused','hack-budget-skipped'])],
 ['groupMoneyProposalDetail',new Set(['payout-processing','payout-paid','payout-failed'])]
]);

function visualSummary(rows,mode,targets){
 const tests=rows.map(row=>({name:row.name,size:row.size,requested:row.setup?.requested,actual:row.setup?.actual,renderedView:row.setup?.renderedView,renderedViews:row.setup?.renderedViews,alias:row.setup?.alias,expectedDelegation:row.setup?.expectedDelegation,geometryFindings:count(row),visualFindings:row.consistency?.findings||[],setupErrors:row.error?[row.error]:row.setup?.errors||[],renderFallback:row.setup?.renderFallback,families:row.consistency?.families||{},manropeDigitsLoaded:row.consistency?.manropeDigitsLoaded}));
 const bad=rows.filter(row=>row.error||row.setup?.errors?.length||row.setup?.renderFallback||count(row)||row.consistency?.findings.length||row.consistency?.manropeDigitsLoaded===false);
 const fontFamilies={};for(const row of rows)for(const [family,n]of Object.entries(row.consistency?.families||{}))fontFamilies[family]=(fontFamilies[family]||0)+n;
 const routes=fixtures.filter(f=>f.variant==='standard').map(f=>f.route),tested=[...new Set(rows.map(row=>row.setup?.requested).filter(Boolean))];
 return {edition,mode,total:rows.length,totalCases:targets.length,registeredViews:routes.length,testedRequestedViews:tested.length,missingRegisteredViews:mode==='pages'?routes.filter(route=>!tested.includes(route)):null,withFindings:bad.length,setupErrors:rows.filter(row=>row.error||row.setup?.errors?.length||row.setup?.renderFallback).length,counts:{geometry:rows.filter(row=>count(row)).length,fontFamily:rows.filter(row=>row.consistency?.findings.some(f=>f.kind==='font-family')).length,solidContrast:rows.filter(row=>row.consistency?.findings.some(f=>f.kind==='low-solid-contrast')).length,fontNotLoaded:rows.filter(row=>row.consistency?.manropeDigitsLoaded===false).length},fontFamilies,aliases:tests.filter(row=>row.alias||row.renderedView&&row.renderedView!==row.requested).map(row=>({name:row.name,size:row.size,requested:row.requested,actual:row.actual,renderedView:row.renderedView,renderedViews:row.renderedViews,alias:row.alias,expectedDelegation:row.expectedDelegation})),tests,findings:bad,results:rows};
}

async function consistencySweep(mode){
 if(running||!consistencyReady)return;running=true;results=[];
 for(const button of consistencyRuns)button.disabled=true;
 const target=mode==='readiness'?fixtures.filter(f=>f.variant.startsWith('readiness-')):mode==='pages'?fixtures.filter(f=>f.variant==='standard'||f.variant==='tester-log'||f.route==='pauseDemo'&&f.variant==='pause-entry-low'):mode==='features'?fixtures.filter(f=>f.variant.startsWith('readiness-')||f.variant.startsWith('contribution-')||f.route==='chat'&&new Set(['expanded-tools','long-conversation','long-conversation-expanded']).has(f.variant)):fixtures.filter(f=>f.variant==='standard'&&consistencyCritical.has(f.route)||consistencyVariants.get(f.route)?.has(f.variant)||f.variant.startsWith('rail-payout-')||f.route==='pauseDemo'&&f.variant.startsWith('pause-entry-')||f.variant==='tester-log');
 const matrix=mode==='pages'?[[390,844,1]]:[[320,568,1],[375,667,1],[390,480,1],[568,320,1],[320,568,2],[390,844,2]];
 try{
  for(let i=0;i<target.length&&running;i++)for(const size of matrix){
   if(!running)break;const f=target[i];progress.textContent=(i+1)+' / '+target.length+' · '+size.join(' × ')+' · '+f.name;
   try{const row=await show(f,size);row.consistency=monoVisualFacts();results.push(row);}catch(error){results.push({name:f.name,size,error:String(error.stack||error)});}
   const summary=visualSummary(results,mode,target);window.auditSummary=summary;window.auditResults=results;status.textContent=results.length+' layouts · '+summary.withFindings+' with findings';
   // Avoid serialising the complete findings tree on every frame. The final
   // report includes all computed role facts and actual render destinations.
   report.textContent=JSON.stringify({...summary,results:undefined,findings:summary.findings.slice(-8)},null,2);
  }
 }finally{
  running=false;for(const button of consistencyRuns)button.disabled=false;
  const summary=visualSummary(results,mode,target);window.auditSummary=summary;status.textContent='Complete: '+results.length+' layouts · '+summary.withFindings+' with findings';report.textContent=JSON.stringify(summary,null,2);progress.textContent='Complete. Exact requested/rendered route coverage and computed typography/surface roles are in the report. Image/pseudo-element contrast requires visual review.';
 }
}

document.getElementById('run-consistency').onclick=()=>consistencySweep('pages');
document.getElementById('run-consistency-stress').onclick=()=>consistencySweep('stress');
document.getElementById('run-consistency-features').onclick=()=>consistencySweep('features');
document.getElementById('run-consistency-current').onclick=()=>{if(running||!consistencyReady)return;const row={...current,...geometry(),consistency:monoVisualFacts()};status.textContent=row.name+' · '+(count(row)+row.consistency.findings.length)+' findings';report.textContent=JSON.stringify(row,null,2);};

(async()=>{
 // The underlying bootstrap starts asynchronously before this add-on loads.
 // A disabled Run control prevents a premature sweep of an empty iframe.
 for(let i=0;i<600;i++){
  if(fixtures.length&&current&&frame.contentWindow.__overflowReady){consistencyReady=true;for(const button of consistencyRuns)button.disabled=false;return;}
  await tick();
 }
 status.textContent='Consistency audit could not initialise the isolated app.';
})();

document.getElementById('run-readiness')?.addEventListener('click',()=>consistencySweep('readiness'));
