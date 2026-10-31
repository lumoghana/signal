/* Signal review uses the native prepared-route audit with memory-only state.
   This stages local QA files only. Never ship dist/__* assets. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
execFileSync(process.execPath,[path.join(__dirname,'mono-stage.cjs'),...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
const moneyLifeFixture=path.join(root,'dist/__signal-money-life-fixtures.js');
if(process.argv.includes('--clean'))fs.rmSync(moneyLifeFixture,{force:true});
if(!process.argv.includes('--clean')){
 fs.copyFileSync(path.join(__dirname,'signal-money-life-fixtures.js'),moneyLifeFixture);
 const html=path.join(root,'dist/__mono-audit.html');
 const compact='<style>header{height:48px;position:relative;flex-wrap:nowrap;gap:6px;padding:6px 8px;box-sizing:border-box}header strong{max-width:125px;font-size:12px;line-height:1.2}header select,header button{font-size:12px;padding:6px}#fixtures{max-width:230px}#sizes{max-width:210px}#edition,header>button,#status{display:none}#run-consistency,#run-consistency-stress,#run-current,#stop{display:inline-block}#progress{font-size:12px;height:28px;box-sizing:border-box;overflow:hidden;white-space:nowrap}main{padding:8px;gap:12px}main>pre{max-height:844px;overflow:auto;width:620px}iframe{border-width:1px}</style>';
 fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace(/monochrome/gi,'Signal').replace('<option value="minna">Minna</option>','<option value="signal">Signal</option>').replace('<option value="390,844,1">','<option value="390,844,1" selected>').replace('<pre id="report">','<pre id="report" aria-hidden="true">').replace('</style>','</style>'+compact));
 const js=path.join(root,'dist/__mono-audit.js');
 let auditSource=fs.readFileSync(js,'utf8').replace("const edition='minna',editionPrefix='';","const edition='signal',editionPrefix='';").replace("if(!d.body.classList.contains('minna-edition'))", "if(d.body.classList.contains('signal-edition'))return{count:0,findings:[],unfilteredImages:[],note:'Strict neutral-RGB palette rule is not applicable to Signal ivory, ink and pale green. Contrast is checked separately.'};if(!d.body.classList.contains('minna-edition'))").replace('&&!visuallyHidden(e)&&!closedDetails(e)','&&!visuallyHidden(e)&&!ancestors(e).some(visuallyHidden)&&!closedDetails(e)');
 const lifeAnchor='<script src="/__readiness-fix-fixtures.js"><\\/script>';
 if(!auditSource.includes(lifeAnchor))throw Error('Signal money-life fixture load anchor is missing.');
 auditSource=auditSource.replace(lifeAnchor,lifeAnchor+'<script src="/__signal-money-life-fixtures.js"><\\/script>');
 fs.writeFileSync(js,auditSource);
 const facts=path.join(root,'dist/__mono-consistency.js');
 const navigationFacts=String.raw`function signalNavigationFacts(d,w,hidden){
 const L=w.L,policy=L?.signalNavigation,taskActive=!!L?.taskSheet?.active,layer=taskActive?d.querySelector('.task-sheet-layer'):null;
 const dialog=layer?.querySelector('.task-sheet'),surface=taskActive?(layer?.getAttribute('data-signal-surface')||'unknown'):'page';
 const route=L?.taskSheet?.step||L?.route||'',findings=[];
 let eligible=false,policyAvailable=typeof policy?.hasGlobalNavigation==='function';
 if(policyAvailable){try{eligible=!!policy.hasGlobalNavigation();}catch(error){findings.push({kind:'navigation-policy-error',route,message:String(error)});}}
 else findings.push({kind:'navigation-policy-unavailable',route});
 if(taskActive&&!layer)findings.push({kind:'navigation-task-layer-missing',route});
 const expected=eligible&&(!taskActive||surface==='page'),labels=['Home','Ask Lumo','Menu'];
 const navs=[...d.querySelectorAll('#nav,.signal-page-nav,[aria-label="Main navigation"]')].map(nav=>{
  const controls=[...nav.querySelectorAll('button,a[href],[role="button"]')];
  return {tag:nav.localName,id:nav.id,cls:nav.className,label:nav.getAttribute('aria-label'),visible:!hidden(nav),inertAncestor:!!nav.closest('[inert]'),hiddenAncestor:!!nav.closest('[hidden],[aria-hidden="true"]'),insidePage:!!dialog?.contains(nav),pageFooter:nav.classList.contains('signal-page-nav'),controls:controls.map(button=>({label:(button.querySelector('span')?.textContent||button.getAttribute('aria-label')||button.textContent).trim().replace(/\s+/g,' '),visible:!hidden(button),inertAncestor:!!button.closest('[inert]'),hiddenAncestor:!!button.closest('[hidden],[aria-hidden="true"]'),disabled:!!button.disabled}))};
 });
 const visible=navs.filter(nav=>nav.visible),named=visible.filter(nav=>nav.label==='Main navigation');
 if(expected){
  if(visible.length!==1||named.length!==1)findings.push({kind:'navigation-count',route,surface,expected:1,visible:visible.length,named:named.length});
  for(const nav of visible){
   if(nav.label!=='Main navigation')findings.push({kind:'navigation-label',route,label:nav.label});
   if(nav.id!=='nav'&&!nav.pageFooter)findings.push({kind:'navigation-unsupported-surface',route,id:nav.id,cls:nav.cls});
   if(nav.controls.length!==3||nav.controls.some((button,index)=>button.label!==labels[index]||!button.visible||button.inertAncestor||button.hiddenAncestor))findings.push({kind:'navigation-controls',route,controls:nav.controls});
   if(layer&&!nav.insidePage)findings.push({kind:'navigation-outside-page',route,surface,id:nav.id,cls:nav.cls});
  }
 }else if(visible.length)findings.push({kind:'navigation-exposed-outside-page',route,surface,eligible,visible:visible.map(nav=>({id:nav.id,cls:nav.cls,label:nav.label}))});
 return {route,surface,taskActive,policyAvailable,eligible,expected,account:{onboarded:!!L?.state?.onboarded,locked:!!L?.state?.locked,closed:!!L?.state?.closed},visibleCount:visible.length,mainNavigationCount:named.length,navs,findings};
}

`;
 const avatarFacts=String.raw`function signalAvatarFacts(d,w,style){
 const route=w.L?.taskSheet?.step||w.L?.route||'',findings=[],backgrounds=[];
 const original=url=>/\/brand\/lumo-avatar(?:-icon(?:-\d+)?)?\.(?:png|webp|svg)(?:[?#]|$)/i.test(url);
 const legacy=url=>/\/assets\/signal\/lux[^/?#\s]*\.(?:webp|png|svg)(?:[?#]|$)/i.test(url);
 const safeSource=value=>/^(?:data|blob):/i.test(value||'')?'[embedded image omitted]':value||'';
 const identity=e=>({tag:e.localName,id:e.id||'',cls:typeof e.className==='string'?e.className:e.className?.baseVal||''});
 // Decorative aria-hidden artwork is still rendered. Unlike the text audit,
 // this check must not discard it or a retained parent's image references.
 const rendered=e=>{
  if(!e.getClientRects().length)return false;
  for(let p=e;p;p=p.parentElement){const s=style(p);if(p.hidden||s.display==='none'||s.visibility==='hidden'||s.contentVisibility==='hidden'||Number(s.opacity)===0)return false;}
  return true;
 };
 const images=[...d.querySelectorAll('img')].map(e=>{
  const src=e.getAttribute('src')||'',srcset=e.getAttribute('srcset')||'',currentSrc=e.currentSrc||'',shown=rendered(e);
  const references=[['src',src],['currentSrc',currentSrc],...(/^(?:data|blob):/i.test(srcset)?[]:srcset.split(',').filter(Boolean).map(part=>['srcset',part.trim().split(/\s+/)[0]]))];
  const unique=[...new Map(references.filter(([,url])=>url).map(([source,url])=>[source+' '+url,{source,url:safeSource(url),original2d:original(url),legacy3d:legacy(url)}])).values()];
  const row={...identity(e),src:safeSource(src),srcset:safeSource(srcset),currentSrc:safeSource(currentSrc),rendered:shown,original2d:unique.some(ref=>ref.original2d),legacy3d:unique.some(ref=>ref.legacy3d),references:unique};
  for(const ref of unique.filter(ref=>ref.legacy3d))findings.push({kind:'avatar-legacy-3d',route,...identity(e),source:ref.source,url:ref.url,rendered:shown});
  return row;
 });
 for(const e of d.querySelectorAll('body,body *'))for(const pseudo of [null,'::before','::after']){
  const s=pseudo?w.getComputedStyle(e,pseudo):style(e),value=s.backgroundImage||'';
  for(const match of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)){
   const url=match[2];if(!original(url)&&!legacy(url))continue;
   const generated=!pseudo||!!s.content&&s.content!=='none'&&s.content!=='normal';
   const row={...identity(e),pseudo,url:safeSource(url),rendered:rendered(e)&&generated&&s.display!=='none'&&s.visibility!=='hidden',original2d:original(url),legacy3d:legacy(url)};
   backgrounds.push(row);
   if(row.legacy3d)findings.push({kind:'avatar-legacy-3d',route,...identity(e),source:pseudo?'background'+pseudo:'background',url:row.url,rendered:row.rendered});
  }
 }
 const instances=[...images,...backgrounds];
 return {route,images,backgrounds,original2dInstances:instances.filter(row=>row.original2d).length,renderedOriginal2dInstances:instances.filter(row=>row.original2d&&row.rendered).length,legacy3dInstances:instances.filter(row=>row.legacy3d).length,findings};
}

`;
 let source=fs.readFileSync(facts,'utf8');
 const replace=(from,to)=>{if(!source.includes(from))throw Error('Signal navigation audit anchor is missing: '+from);source=source.replace(from,to);};
 replace('function monoVisualFacts(){',navigationFacts+avatarFacts+'function monoVisualFacts(){');
 replace(' const unique=rows=>',' const navigation=signalNavigationFacts(d,w,hidden);findings.push(...navigation.findings);\n const avatars=signalAvatarFacts(d,w,style);findings.push(...avatars.findings);\n const unique=rows=>');
 replace(' return {fontsLoaded:',' return {navigation,avatars,fontsLoaded:');
 replace('geometryFindings:count(row),visualFindings:','geometryFindings:count(row),navigation:row.consistency?.navigation,avatars:row.consistency?.avatars,visualFindings:');
 replace('requested:row.setup?.requested,actual:','requested:row.setup?.requested,populatedMoneyLife:row.setup?.populatedMoneyLife,actual:');
 replace('counts:{geometry:','counts:{avatar:rows.filter(row=>row.consistency?.avatars?.findings.length).length,navigation:rows.filter(row=>row.consistency?.navigation?.findings.length).length,geometry:');
 replace('JSON.stringify(summary,null,2)',"JSON.stringify({...summary,results:undefined,findings:summary.findings.map(row=>({name:row.name,size:row.size,setup:row.setup,navigation:row.consistency?.navigation,avatars:row.consistency?.avatars,horizontal:row.horizontal,unreachable:row.unreachable,textClipping:row.textClipping,contentClipping:row.contentClipping,consistency:row.consistency?{findings:row.consistency.findings}:undefined}))},null,2)");
 fs.writeFileSync(facts,source);
 console.log('Staged current Signal: /__mono-audit.html');
}
