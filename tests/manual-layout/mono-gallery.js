function monoGeometry(d,w){
 const app=d.getElementById('persistence-recovery')||d.querySelector('#app'),view=d.querySelector('#view'),appRect=app.getBoundingClientRect();
 const styleCache=new WeakMap(),style=e=>{if(!styleCache.has(e))styleCache.set(e,w.getComputedStyle(e));return styleCache.get(e);};
 const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
 const visuallyHidden=e=>{const s=style(e),r=e.getBoundingClientRect();return s.clipPath!=='none'||s.clip!=='auto'||(r.width<=2&&r.height<=2&&['absolute','fixed'].includes(s.position)&&['hidden','clip'].includes(s.overflow));};
 const closedDetails=e=>{for(let p=e;p;p=p.parentElement)if(p.localName==='details'&&!p.open){const summary=[...p.children].find(x=>x.localName==='summary');if(!summary||!summary.contains(e))return true;}return false;};
 const contentHidden=e=>{for(let p=e;p;p=p.parentElement)if(style(p).contentVisibility==='hidden')return true;return false;};
 const visible=e=>e.getClientRects().length&&!e.closest('svg,[hidden],[aria-hidden="true"],[inert],.sr-only,.desktop-note')&&style(e).visibility!=='hidden'&&style(e).display!=='none'&&!visuallyHidden(e)&&!closedDetails(e)&&!contentHidden(e);
 const scrollable=e=>{const s=style(e);return /(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+2};
 const ancestors=e=>{const a=[];for(let p=e.parentElement;p;p=p.parentElement)a.push(p);return a};
 const label=e=>(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,95);
 const info=e=>({tag:e.tagName.toLowerCase(),id:e.id,cls:typeof e.className==='string'?e.className:'',label:label(e),rect:rect(e)});
 const content=[...app.querySelectorAll('*')].filter(visible),controls=content.filter(e=>!e.classList.contains('task-sheet-backdrop')&&e.matches('button,input,select,textarea,a,[role="button"],summary,label[for]'));
 const h=[],clipped=[],unreachable=[],text=[],contentClipping=[],homeArtworkOverlap=[],planBoxesOverlap=[],savingsHackPlacement=[],guidanceStateIssues=[],endOcclusion=[],endUnreachable=[];
 for(const e of content){const r=rect(e),s=style(e);if(r.width<1||r.height<1||e.matches('video,canvas,img,path,svg,i'))continue;
  if((r.left<appRect.left-1||r.right>appRect.right+1)&&!ancestors(e).some(p=>{const ps=style(p);return /(auto|scroll)/.test(ps.overflowX)&&p.scrollWidth>p.clientWidth+2;}))h.push(info(e));
  if(e.children.length===0&&!e.matches('input,select,textarea')&&Number.parseFloat(s.fontSize)>.5&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+2){if(s.textOverflow==='ellipsis')text.push({...info(e),kind:'ellipsis'});else if(!/(auto|scroll)/.test(s.overflowX))text.push({...info(e),kind:'text-width',client:e.clientWidth,scroll:e.scrollWidth});}
  if(controls.includes(e)){
   for(const p of ancestors(e)){if(p===d.body||p===d.documentElement)break;const ps=style(p),pr=rect(p);if(!/(hidden|clip)/.test(ps.overflowY)||r.bottom<=pr.bottom+1&&r.top>=pr.top-1)continue;
    const path=ancestors(e).slice(0,ancestors(e).indexOf(p));if(path.some(scrollable)||scrollable(p))continue;
    if(ps.position==='fixed'||p===app||p.id==='view'||p.classList.contains('task-sheet')||p.classList.contains('screen')){unreachable.push({...info(e),clippedBy:p.id||p.className,clipRect:pr});break;}
   }
   if(['fixed','sticky'].includes(s.position)&&(r.bottom>appRect.bottom+1||r.top<appRect.top-1))clipped.push(info(e));
  }
 }
 // Inline financial spans often have clientWidth=0. Measure each painted
 // text fragment with a Range so clipping by its card is visible even when
 // the fragment still fits inside the overall phone. Closed disclosures,
 // visually hidden labels and native input scrolling are excluded above.
 const primaryMoney=app.querySelector('.everyday-primary-money>strong'),homeArt=app.querySelector('.everyday-home-art'),artRect=homeArt?rect(homeArt):null;
 const checkHomeArt=d.body.dataset.auditRoute==='home'&&primaryMoney&&!primaryMoney.querySelector('.money-mask')&&artRect?.width>2&&artRect?.height>2;
 // The reported Hibiscus issue can stay inside the phone while its Money
 // Boxes heading and amount paint over one another inside their own card.
 const planBoxes=d.body.classList.contains('hibiscus-edition')&&d.body.dataset.auditRoute==='plan'?app.querySelector('.screen-plan .plan-boxes-section'):null;
 const planBoxRect=planBoxes?rect(planBoxes):null,planHeading=planBoxes?.querySelector('.plan-section-heading'),planSummary=planBoxes?.querySelector('.plan-boxes-summary'),headingFragments=[],summaryFragments=[];
 const textWalker=d.createTreeWalker(app,w.NodeFilter.SHOW_TEXT);
 for(let node=textWalker.nextNode();node;node=textWalker.nextNode()){
  const el=node.parentElement;if(!el||!node.textContent.trim()||!visible(el)||el.closest('input,select,textarea,script,style,noscript')||Number.parseFloat(style(el).fontSize)<=.5)continue;
  const range=d.createRange();range.selectNodeContents(node);const fragments=[...range.getClientRects()].filter(r=>r.width>.5&&r.height>.5);
  for(const fragment of fragments){
   if(planBoxes?.contains(el)){
    const part={...info(el),label:node.textContent.trim().replace(/\s+/g,' ').slice(0,95),rect:{left:fragment.left,right:fragment.right,top:fragment.top,bottom:fragment.bottom,width:fragment.width,height:fragment.height}};
    if(fragment.left<planBoxRect.left-2||fragment.right>planBoxRect.right+2)planBoxesOverlap.push({...part,kind:'card-text-overflow',sectionRect:planBoxRect});
    if(planHeading?.contains(el))headingFragments.push(part);
    if(planSummary?.contains(el))summaryFragments.push(part);
   }
   // The primary amount must not paint over its own illustration, even when
   // both fit inside the card. Ignore up to two pixels of font ink extension
   // at adjacent row boundaries and skip all masked amounts.
   if(checkHomeArt&&primaryMoney.contains(el)){const overlapWidth=Math.min(fragment.right,artRect.right)-Math.max(fragment.left,artRect.left),overlapHeight=Math.min(fragment.bottom,artRect.bottom)-Math.max(fragment.top,artRect.top);if(overlapWidth>2&&overlapHeight>2)homeArtworkOverlap.push({...info(el),label:node.textContent.trim().replace(/\s+/g,' ').slice(0,95),rect:{left:fragment.left,right:fragment.right,top:fragment.top,bottom:fragment.bottom,width:fragment.width,height:fragment.height},artRect,overlapWidth,overlapHeight});}
   const chain=[el,...ancestors(el)];for(let i=0;i<chain.length;i++){const clipper=chain[i],cs=style(clipper);if(!/(hidden|clip)/.test(cs.overflowX))continue;
    // A deliberately scrolling horizontal list makes the text reachable.
    if(chain.slice(0,i).some(p=>/(auto|scroll)/.test(style(p).overflowX)&&p.scrollWidth>p.clientWidth+2))continue;
    const cr=rect(clipper);if(fragment.left>=cr.left-2&&fragment.right<=cr.right+2)continue;
    contentClipping.push({...info(el),label:node.textContent.trim().replace(/\s+/g,' ').slice(0,95),rect:{left:fragment.left,right:fragment.right,top:fragment.top,bottom:fragment.bottom,width:fragment.width,height:fragment.height},kind:cs.textOverflow==='ellipsis'?'ellipsis':'text-fragment',clippedBy:clipper.id||clipper.className,clipRect:cr,axis:'horizontal'});break;
  }}range.detach();
 }
 for(const heading of headingFragments)for(const summary of summaryFragments){const a=heading.rect,b=summary.rect,overlapWidth=Math.min(a.right,b.right)-Math.max(a.left,b.left),overlapHeight=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(overlapWidth>2&&overlapHeight>2)planBoxesOverlap.push({...heading,kind:'heading-amount-overlap',summary,overlapWidth,overlapHeight,sectionRect:planBoxRect});}
 // The Savings hack must remain a money action, while explanations stay lower.
 const hackControl=app.querySelector('.sh-priority-control'),boxActions=hackControl?.parentElement,hackDetails=app.querySelector('.savings-hack-details');
 const boxButtons=boxActions?[...boxActions.querySelectorAll('button')]:[],fund=boxButtons.find(b=>b.textContent.trim()==='Fund this box'),back=boxButtons.find(b=>b.textContent.trim()==='Transfer back'),metadata=boxButtons.find(b=>b.textContent.trim()==='Edit Money Box');
 const savingsHackGeometry=hackControl?{control:rect(hackControl),fund:fund?rect(fund):null,transferBack:back?rect(back):null,metadata:metadata?rect(metadata):null,details:hackDetails?rect(hackDetails):null}:null;
 if(hackControl){
  if(!boxActions?.classList.contains('actions')||fund&&fund.parentElement!==boxActions||back&&back.parentElement!==boxActions)savingsHackPlacement.push({kind:'separate-action-group',...info(hackControl)});
  const previous=back||fund;if(previous&&rect(hackControl).top<rect(previous).bottom-1)savingsHackPlacement.push({kind:'money-action-overlap',...info(hackControl),previous:info(previous)});
  if(metadata&&rect(hackControl).bottom>rect(metadata).top+1)savingsHackPlacement.push({kind:'metadata-action-overlap',...info(hackControl),metadata:info(metadata)});
  if(hackDetails&&rect(hackDetails).top<rect(boxActions).bottom-1)savingsHackPlacement.push({kind:'explanation-before-actions',...info(hackDetails),actions:info(boxActions)});
 }
 const guides=[...app.querySelectorAll('#view details.page-guidance')],variant=d.body.dataset.auditVariant||'',guideMode=variant==='guidance-first'?'first':variant==='guidance-returning'?'returning':'';
 if(guideMode){for(const g of guides){const open=g.open||g.hasAttribute('open');if(guideMode==='first'&&!open||guideMode==='returning'&&open)guidanceStateIssues.push({kind:'unexpected-guidance-state',mode:guideMode,open,...info(g)});if(g.querySelector('input,select,textarea'))guidanceStateIssues.push({kind:'form-control-inside-guidance',...info(g)});}}
 const criticalRoute=['paymentReview','authorize','essentialEdit'].includes(d.body.dataset.auditRoute),viewTextNodes=[];
 const copyWalker=d.createTreeWalker(view||app,w.NodeFilter.SHOW_TEXT);for(let n=copyWalker.nextNode();n;n=copyWalker.nextNode())if(n.textContent.trim()&&!n.parentElement?.closest('.page-guidance,script,style,noscript'))viewTextNodes.push(n.textContent.trim());
 const outsideCopy=viewTextNodes.join(' ').replace(/\s+/g,' '),pin=d.getElementById('payment-pin'),essentialAmount=d.getElementById('essAmount'),totalHelp=d.getElementById('essential-total-help');
 const pageGuidance={mode:guideMode,route:d.body.dataset.auditRoute,guideCount:guides.length,expanded:guides.filter(g=>g.open||g.hasAttribute('open')).length,outsideCopy,critical:criticalRoute,essentialHelpOutside:totalHelp?!totalHelp.closest('.page-guidance'):null,essentialAmountOutside:essentialAmount?!essentialAmount.closest('.page-guidance'):null,pinOutside:pin?!pin.closest('.page-guidance'):null,controlIds:[...(view||app).querySelectorAll('input[id],select[id],textarea[id]')].filter(e=>!e.closest('.page-guidance')).map(e=>e.id).sort(),actionLabels:[...(view||app).querySelectorAll('button')].filter(e=>!e.closest('.page-guidance')).map(e=>(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\s+/g,' ')).filter(Boolean)};
 if(guideMode&&criticalRoute){
  if(['paymentReview','authorize'].includes(pageGuidance.route)&&guides.length)guidanceStateIssues.push({kind:'guidance-on-critical-payment',route:pageGuidance.route});
  if(pageGuidance.route==='paymentReview'&&(!outsideCopy.includes('Akua')||!outsideCopy.includes('GH₵80.00')||!outsideCopy.includes('GH₵0.00')||!/total/i.test(outsideCopy)))guidanceStateIssues.push({kind:'missing-payment-review-facts',outsideCopy});
  if(pageGuidance.route==='authorize'&&(!pageGuidance.pinOutside||!outsideCopy.includes('Akua')||!outsideCopy.includes('GH₵80.00')))guidanceStateIssues.push({kind:'missing-authorisation-facts',outsideCopy});
  if(pageGuidance.route==='essentialEdit'&&(!pageGuidance.essentialHelpOutside||!pageGuidance.essentialAmountOutside||!/not per day/i.test(totalHelp?.textContent||'')))guidanceStateIssues.push({kind:'missing-budget-amount-meaning',outsideCopy});
 }
 const scrollNodes=content.filter(scrollable),scrollers=scrollNodes.map(e=>({id:e.id,cls:e.className,client:e.clientHeight,scroll:e.scrollHeight,rect:rect(e)}));
 // A scroll outlet can exist yet be unusable when fixed chrome consumes all
 // its height. Required body copy or controls cannot live in a zero-height
 // viewport merely because the footer still fits inside the phone.
 const collapsedScrollers=scrollNodes.filter(e=>e.clientHeight<8&&e.scrollHeight>8).flatMap(e=>{const required=[...e.querySelectorAll('button,input,select,textarea,h1,h2,p,dl,ol,ul')].filter(visible).filter(x=>x.textContent.trim()||x.matches('input,select,textarea'));return required.length?[{...info(e),client:e.clientHeight,scroll:e.scrollHeight,requiredContent:required.slice(0,6).map(x=>({tag:x.localName,label:label(x)}))}]:[];});
 // Inspect the end, then prove a suspect control cannot be reached at an
 // alternate scroll position. Being clipped at the end alone is not a failure.
 const scrollRecords=scrollNodes.map(e=>({e,top:e.scrollTop,value:e.style.getPropertyValue('scroll-behavior'),priority:e.style.getPropertyPriority('scroll-behavior')}));
 for(const {e}of scrollRecords){e.style.setProperty('scroll-behavior','auto','important');e.scrollTop=e.scrollHeight-e.clientHeight;}
 const endPositions=scrollRecords.map(({e})=>({e,top:e.scrollTop})),verifiedReachable=[];
 const region=e=>{const clip={left:Math.max(0,appRect.left),right:Math.min(w.innerWidth,appRect.right),top:Math.max(0,appRect.top),bottom:Math.min(w.innerHeight,appRect.bottom)};for(const p of ancestors(e)){const ps=style(p),pr=rect(p);if(/(hidden|clip|auto|scroll)/.test(ps.overflowY)){clip.top=Math.max(clip.top,pr.top);clip.bottom=Math.min(clip.bottom,pr.bottom);}if(/(hidden|clip|auto|scroll)/.test(ps.overflowX)){clip.left=Math.max(clip.left,pr.left);clip.right=Math.min(clip.right,pr.right);}}return clip;};
 const hitTest=e=>{const r=rect(e),clip=region(e),left=Math.max(r.left,clip.left),right=Math.min(r.right,clip.right),top=Math.max(r.top,clip.top),bottom=Math.min(r.bottom,clip.bottom);if(right-left<8||bottom-top<8)return false;const points=[[(left+right)/2,(top+bottom)/2],[(left+right)/2,top+Math.min(5,(bottom-top)/2)],[(left+right)/2,bottom-Math.min(5,(bottom-top)/2)]];return points.some(([x,y])=>{const hit=d.elementFromPoint(x,y);return hit&&(hit===e||e.contains(hit)||hit.contains(e));});};
 const reachAtSomePosition=e=>{const scrollers=ancestors(e).filter(scrollable);if(!scrollers.length)return hitTest(e);let reached=false;
  for(const align of [.5,0,1]){for(const {e:node,top}of endPositions)node.scrollTop=top;for(const node of scrollers){const r=rect(e),nr=rect(node),desired=nr.top+align*Math.max(0,node.clientHeight-r.height);node.scrollTop+=r.top-desired;}if(hitTest(e)){reached=true;break;}}
  for(const {e:node,top}of endPositions)node.scrollTop=top;return reached;
 };
 for(const e of controls){const r=rect(e);if(r.width<4||r.height<4)continue;const clip=region(e),scrolling=ancestors(e).find(scrollable);let candidate=null;
  if(scrolling&&r.bottom>clip.bottom+2&&r.top<clip.bottom&&scrolling.scrollTop>=scrolling.scrollHeight-scrolling.clientHeight-2)candidate={kind:'unreachable',...info(e),scrollRoot:scrolling.id||scrolling.className,clip};
  const left=Math.max(r.left,clip.left),right=Math.min(r.right,clip.right),top=Math.max(r.top,clip.top),bottom=Math.min(r.bottom,clip.bottom);
  if(right-left>=8&&bottom-top>=8){const x=(left+right)/2,y=bottom-Math.min(5,(bottom-top)/2),hit=d.elementFromPoint(x,y);if(hit&&hit!==e&&!e.contains(hit)&&!hit.contains(e)&&!hit.closest('#toast')){const overlay=[hit,...ancestors(hit)].find(p=>['fixed','sticky'].includes(style(p).position));if(overlay&&!e.contains(overlay))candidate={kind:'occlusion',...info(e),coveredBy:overlay.id||overlay.className,hit:hit.id||hit.className,point:[x,y]};}}
  if(candidate){if(reachAtSomePosition(e))verifiedReachable.push({label:label(e),kind:candidate.kind});else if(candidate.kind==='occlusion')endOcclusion.push(candidate);else endUnreachable.push(candidate);}
 }
 for(const {e,top,value,priority}of scrollRecords){e.scrollTop=top;if(value)e.style.setProperty('scroll-behavior',value,priority);else e.style.removeProperty('scroll-behavior');}
 const compact=a=>a.filter((x,i)=>!a.slice(0,i).some(y=>x.rect.left>=y.rect.left-1&&x.rect.right<=y.rect.right+1&&x.rect.top>=y.rect.top-1&&x.rect.bottom<=y.rect.bottom+1)).slice(0,16);
 const homeGeometry={};for(const sel of ['.account-operational','.account-savings','.everyday-home-actions','#overview-room','#overview-balance','#overview-savings','.everyday-budget-link','#balance-eye']){const el=app.querySelector(sel);if(el)homeGeometry[sel]=rect(el);}
 return{width:w.innerWidth,height:w.innerHeight,app:rect(app),documentWidth:d.documentElement.scrollWidth,appScrollWidth:app.scrollWidth,viewScroll:view?{client:view.clientHeight,scroll:view.scrollHeight}:null,route:d.body.dataset.auditRoute,actualRoute:d.getElementById('app')?.dataset.route,horizontal:compact(h),unreachable:compact(unreachable),fixedClipped:compact(clipped),textClipping:compact(text),contentClipping:compact(contentClipping),homeArtworkOverlap:compact(homeArtworkOverlap),planBoxesOverlap:planBoxesOverlap.slice(0,16),savingsHackPlacement,savingsHackGeometry,pageGuidance,guidanceStateIssues,endOcclusion:compact(endOcclusion),endUnreachable:compact(endUnreachable),scrollers,collapsedScrollers,verifiedReachable,homeGeometry,homeMoney:{eyePressed:d.getElementById('balance-eye')?.getAttribute('aria-pressed'),room:d.getElementById('overview-room')?.textContent,balance:d.getElementById('overview-balance')?.textContent,savings:d.getElementById('overview-savings')?.textContent,masks:app.querySelectorAll('.money-mask').length}};
}

/* Computed palette audit: neutral channels or acid-lime hue only. */
function monoPalette(d,w){
 const findings=[],images=[];const style=e=>w.getComputedStyle(e);
 const visible=e=>{if(!e.getClientRects().length||e.closest('[hidden],[inert],.sr-only')||style(e).visibility==='hidden'||style(e).display==='none')return false;for(let p=e;p;p=p.parentElement)if(Number(style(p).opacity)===0)return false;return true;};
 const label=e=>(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\s+/g,' ').slice(0,70);
 const grayscale=e=>{for(let p=e;p;p=p.parentElement)if(/grayscale\(\s*(?:1|100%)\s*\)|saturate\(\s*0\s*\)/.test(style(p).filter))return true;return false;};
 const allowed=value=>{const c=value.match(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/);if(!c)return true;const [r,g,b]=c.slice(1,4).map(Number),a=c[4]===undefined?1:Number(c[4]);return a<=.01||r===g&&g===b||r===215&&g===255&&b===63;};
 const add=(e,property,value,pseudo)=>{const colors=value.match(/rgba?\([^)]*\)/g)||[];for(const c of colors)if(!allowed(c))findings.push({tag:e.localName,id:e.id,cls:typeof e.className==='string'?e.className:'',label:label(e),property,value:c,pseudo:pseudo||null});};
 for(const e of d.querySelectorAll('body,body *')){if(!visible(e)||grayscale(e))continue;const s=style(e);for(const prop of ['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','boxShadow','backgroundImage','textDecorationColor','accentColor','caretColor','fill','stroke']){if(prop.startsWith('border')&&(s.borderStyle==='none'||s.borderWidth==='0px'))continue;if(prop==='outlineColor'&&s.outlineStyle==='none')continue;add(e,prop,s[prop]||'');}for(const pseudo of ['::before','::after']){const p=w.getComputedStyle(e,pseudo);if(p.content&&p.content!=='none'&&p.content!=='normal'){add(e,'color',p.color,pseudo);add(e,'backgroundColor',p.backgroundColor,pseudo);add(e,'backgroundImage',p.backgroundImage,pseudo);}}if(e.localName==='img')images.push({src:e.getAttribute('src'),filter:s.filter,monochromeByAncestor:false});}
 const dedupe=[...new Map(findings.map(x=>[[x.id,x.cls,x.property,x.value,x.pseudo].join('|'),x])).values()];
 return{count:dedupe.length,findings:dedupe.slice(0,50),unfilteredImages:images};
}

/* Source-only review gallery. All app state mutation is isolated in this fixture. */
'use strict';
const editionPicker=document.getElementById('edition'),domainPicker=document.getElementById('domain'),experiencePicker=document.getElementById('experience'),statePicker=document.getElementById('state'),pagePicker=document.getElementById('page'),textPicker=document.getElementById('text-size'),capturePicker=document.getElementById('capture'),sectionPicker=document.getElementById('section'),detailsPicker=document.getElementById('details'),status=document.getElementById('status'),range=document.getElementById('range'),report=document.getElementById('report'),phones=document.getElementById('phones');
const query=new URLSearchParams(location.search),edition=query.get('edition')||'minna';editionPicker.value=edition;
const prefix='';
let allRoutes=[],filtered=[],page=0,busy=false,cells=[],generation=0,sweepRunning=false,sourceDocument="";
const scenarioFiles=['/__readiness-fix-fixtures.js','/__deep-onboarding-fixtures.js','/__deep-payments-fixtures.js','/__deep-planning-fixtures.js'];
const finishMode=()=>domainPicker.value.endsWith('-finish');
const routeOf=entry=>typeof entry==='string'?entry:entry.route;
const labelOf=entry=>typeof entry==='string'?entry:entry.name;
const groups=route=>{
 if(/^(?:account|application|ambassador|campus(?!Pay)|phone$|otp$|identity|livecheck|pin$|confirmPin|signin|recovery|setup|pilotUnavailable|privacy|security|changePin|devices|notificationPrefs|statements|dataExport|closeAccount|help$|supportCase|caseDetail|feedback|profile)/.test(route))return 'onboarding';
 if(/^(?:authorize$|everydayPayments$|everydayRepeatChoice$|payment|send|bill|addMoney|momo|bank|campusPay|myQr|request|txDetail|pending|virtualCard|cardsHome|merchant|settlement)/.test(route))return 'payments';
 if(/^(?:plan|budget|first|essential|allowance|goal|allocat|release|makeRoom|saving|boxProtection|groupMoney|shared|pause|samplePause|incomePlan|spendingOutlook)/.test(route))return 'planning';
 return 'primary';
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,60));
const bootstrap='<script>(()=>{const memory=new Map();let failReads=false,failWrites=false;const store={getItem:k=>{if(failReads)throw Error("Isolated QA storage read failure");return memory.has(k)?memory.get(k):null},setItem:(k,v)=>{if(failWrites)throw Error("Isolated QA storage quota failure");memory.set(k,String(v))},removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]||null,get length(){return memory.size}};Object.defineProperty(window,"localStorage",{value:store});Object.defineProperty(window,"sessionStorage",{value:store});window.__readinessStorage=Object.freeze({kind:"isolated-memory",failWrites:value=>{failWrites=value===true},failReads:value=>{failReads=value===true},makeStale(){const entry=[...memory.entries()].find(([key])=>/^lumo-.*-v1$/.test(key));if(!entry)throw Error("No isolated sample saved");const next=JSON.parse(entry[1]);next._fixtureOtherTab="newer-readiness-progress";memory.set(entry[0],JSON.stringify(next));}});try{Object.defineProperty(navigator,"locks",{value:undefined,configurable:true})}catch{}try{Object.defineProperty(document,"hidden",{get:()=>false});Object.defineProperty(document,"visibilityState",{get:()=>"visible"})}catch{}document.addEventListener("visibilitychange",event=>event.stopImmediatePropagation(),true);window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),0);window.cancelAnimationFrame=id=>clearTimeout(id);const entries=[];let position=-1;const history={get state(){return entries[position]||null},get length(){return entries.length},replaceState(state){if(position<0)position=0;entries[position]=JSON.parse(JSON.stringify(state))},pushState(state){entries.splice(position+1);entries.push(JSON.parse(JSON.stringify(state)));position++},go(delta){const next=position+delta;if(next<0||next>=entries.length)return;position=next;window.dispatchEvent(new PopStateEvent("popstate",{state:JSON.parse(JSON.stringify(entries[position]))}))},back(){this.go(-1)},forward(){this.go(1)}};Object.defineProperty(window,"history",{value:history});try{Object.defineProperty(navigator,"mediaDevices",{value:{getUserMedia:()=>Promise.reject(new Error("Camera stubbed for isolated local layout QA"))}})}catch{}window.__auditErrors=[];window.addEventListener("error",e=>window.__auditErrors.push(e.message));const original=console.error;console.error=(...args)=>{window.__auditErrors.push(args.map(x=>String(x.stack||x)).join(" "));original.apply(console,args)};})();<\/script>';
const freeze='<style>*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}#app .task-sheet,#app #view .screen,#app #view .screen[data-density]{animation:none!important;transition:none!important;transform:none!important;translate:none!important;opacity:1!important}</style>';
async function source(){let html=await fetch(prefix?prefix+'/index.html':'/').then(r=>{if(!r.ok)throw Error('Edition source unavailable: '+r.status);return r.text();});if(prefix)html=html.replace(/(<script\b[^>]*src=")\//g,'$1'+prefix+'/').replace(/(<link\b[^>]*href=")\/(?!brand\/|manifest)/g,'$1'+prefix+'/');return html.replace('<head>','<head><base href="/">').replace('</head>',freeze+'</head>').replace(/<script\b/,bootstrap+'<script').replace('</body>','<script src="/__overflow-seed.js"><\/script>'+scenarioFiles.map(file=>'<script src="'+file+'"><\/script>').join('')+'</body>');}
function pageOptions(){filtered=finishMode()?(window.__deepScenarioGroups?.[domainPicker.value.replace('-finish','')]||[]):allRoutes.filter(r=>domainPicker.value==='all'||groups(r)===domainPicker.value);page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(filtered.length/4)-1)));pagePicker.innerHTML=Array.from({length:Math.ceil(filtered.length/4)},(_,i)=>'<option value="'+i+'">'+(i*4+1)+'–'+Math.min(filtered.length,i*4+4)+' · '+labelOf(filtered[i*4])+'</option>').join('');pagePicker.value=String(page);}
function facts(cell,result){const d=cell.frame.contentDocument,w=cell.frame.contentWindow,view=d.getElementById('persistence-recovery')||d.getElementById('view'),text=(view?.textContent||'').replace(/\s+/g,' ').trim();const labels=Array.from(view?.querySelectorAll('button,input,select,textarea,a,summary')||[]).filter(e=>!e.closest('[hidden],[inert],[aria-hidden="true"]')).map(e=>({tag:e.localName,id:e.id,type:e.getAttribute('type')||'',label:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').replace(/\s+/g,' ').trim().slice(0,100)}));return{...result,actual:w.L.route,renderedViews:[...(w.__auditViewCalls||result.renderedViews||[])],renderedView:w.__auditViewCalls?.at(-1)||result.renderedView||w.L.route,errors:[...new Set([...(result.errors||[]),...(w.__auditErrors||[])])],renderFallback:/Let’s try that again/.test(text),heading:Array.from(view?.querySelectorAll('h1,h2')||[]).map(e=>e.textContent.trim()),guides:Array.from(view?.querySelectorAll('details.page-guidance')||[]).map(e=>({route:e.dataset.guidanceRoute,open:e.open,label:e.querySelector('summary')?.textContent||''})),controls:labels,bodyText:text,palette:monoPalette(d,w),layout:monoGeometry(d,w),activeAccount:{available:w.L.accountBalances?.().available,savings:w.L.accountBalances?.().savings,room:w.L.balances?.().room}};}
const controls=()=>[document.getElementById('viewport'),document.getElementById('run-routes'),editionPicker,domainPicker,experiencePicker,statePicker,pagePicker,sectionPicker,detailsPicker,textPicker,capturePicker,document.getElementById('previous'),document.getElementById('next')];
function lock(value){for(const el of controls())el.disabled=value||sweepRunning;if(!value&&finishMode()){experiencePicker.disabled=true;statePicker.disabled=true;}}
async function settle(w,d){await d.fonts.ready;await new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));await tick();}
async function show(){
 if(cells.length!==4)return;
 const stamp=++generation,request={edition,page,experience:experiencePicker.value,state:statePicker.value,section:sectionPicker.value,details:detailsPicker.value,textScale:Number(textPicker.value),domain:domainPicker.value,domainLabel:domainPicker.options[domainPicker.selectedIndex].text,experienceLabel:experiencePicker.options[experiencePicker.selectedIndex].text},batch=filtered.slice(page*4,page*4+4);
 if(finishMode()){request.experience='prepared-scenario';request.experienceLabel='Prepared finishing scenario';request.state='scenario';}
 busy=true;lock(true);status.textContent='Rendering · g'+stamp+' · page '+(request.page+1)+' · '+request.experience;
 const records=[];
 for(let i=0;i<4;i++){
  if(stamp!==generation)return;
  const cell=cells[i],entry=batch[i],route=entry&&routeOf(entry);cell.wrap.hidden=!route;if(!route)continue;
  const c={route,variant:finishMode()?'deep-first':request.state==='standard'?request.experience:request.state,name:labelOf(entry)+' · '+request.experience};
  try{
   if(cell.frame.contentWindow.__readinessRequiresReload)await new Promise(resolve=>{cell.frame.onload=resolve;cell.frame.srcdoc=sourceDocument;});const w=cell.frame.contentWindow,d=cell.frame.contentDocument;
   for(const x of cell.typeRecords||[])if(x.el.isConnected){if(x.value)x.el.style.setProperty('font-size',x.value,x.priority);else x.el.style.removeProperty('font-size');}
   cell.typeRecords=[];
   const result=w.__overflowSeed(c);if(finishMode()){const group=request.domain.replace('-finish',''),scenario=w.__deepScenarioGroups?.[group]?.find(x=>x.id===entry.id);if(!scenario)throw Error('Finishing scenario not loaded: '+group+'/'+entry.id);await scenario.prepare();result.scenario={group,id:entry.id,name:entry.name};result.seededMoney={operational:w.L.accountBalances().available,savings:w.L.accountBalances().savings,room:w.L.balances().room,essentials:w.L.balances().essentials};}
   await settle(w,d);if(stamp!==generation)return;
   for(const el of d.querySelectorAll('.task-sheet,.screen')){el.style.setProperty('transform','none','important');el.style.setProperty('translate','none','important');el.style.setProperty('opacity','1','important');}
   if(request.textScale!==1){
    const base=[...d.querySelectorAll('#app,#app *,#persistence-recovery,#persistence-recovery *')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert],[aria-hidden="true"]')).map(el=>({el,size:Number.parseFloat(w.getComputedStyle(el).fontSize),value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')})).filter(x=>Number.isFinite(x.size));
    for(const x of base){cell.typeRecords.push(x);x.el.style.setProperty('font-size',(x.size*request.textScale)+'px','important');}
   }
   if(request.details==='expanded')for(const node of d.querySelectorAll('#view details'))node.open=true;
   await settle(w,d);if(stamp!==generation)return;
   const fraction=request.section==='bottom'?1:request.section==='middle'?.5:0,scrollers=[...new Set([d.scrollingElement,d.getElementById('view'),...d.querySelectorAll('#view .chat-thread,#view .chat-workspace')])].filter(Boolean);
   for(const node of scrollers)node.scrollTop=Math.max(0,node.scrollHeight-node.clientHeight)*fraction;
   await settle(w,d);if(stamp!==generation)return;
   const record={...facts(cell,result),generation:stamp,requestedExperience:request.experience,textScale:request.textScale,section:request.section};records.push(record);
   cell.title.textContent=(request.page*4+i+1)+'. '+labelOf(entry);
   const error=record.errors?.length||record.renderFallback;
   cell.details.className=error?'bad':'';
   cell.details.textContent='g'+stamp+' · '+(record.actual===route?'Mounted '+route:'Native destination: '+record.actual)+(record.renderedView&&record.renderedView!==route?' · renderer '+record.renderedView:record.alias?' · alias/entry redirect':'')+(record.errors?.length?' · SETUP ERROR':'')+(record.renderFallback?' · RENDER FALLBACK':'')+' · '+request.experienceLabel+' · '+(request.textScale*100)+'% text';
  }catch(error){records.push({requested:route,generation:stamp,error:String(error.stack||error)});cell.title.textContent=route;cell.details.className='bad';cell.details.textContent='g'+stamp+' · SETUP ERROR · '+error.message;}
 }
 if(stamp!==generation)return;
 range.textContent=request.edition+' · '+request.domainLabel+' · pages '+(request.page*4+1)+'–'+Math.min(filtered.length,request.page*4+4)+' of '+filtered.length+' · generation '+stamp;
 report.textContent=JSON.stringify({...request,generation:stamp,totalRoutes:allRoutes.length,records},null,2);
 status.dataset.generation=String(stamp);status.dataset.page=String(request.page);status.dataset.experience=request.experience;
 status.textContent=(records.some(r=>r.error||r.errors?.length||r.renderFallback)?'Ready with fixture errors':'Four pages ready')+' · g'+stamp+' · page '+(request.page+1)+' · '+request.experience+' · '+(request.textScale*100)+'% text';
 busy=false;lock(false);document.getElementById('previous').disabled=request.page===0;document.getElementById('next').disabled=(request.page+1)*4>=filtered.length;
}
lock(true);
(async()=>{const html=await source();sourceDocument=html;for(let i=0;i<4;i++){const wrap=document.createElement('section');wrap.className='phone';const head=document.createElement('header'),title=document.createElement('h2'),details=document.createElement('p');head.append(title,details);const frame=document.createElement('iframe');frame.setAttribute('title','Lumo review screen '+(i+1));frame.width='375';frame.height='667';wrap.append(head,frame);phones.append(wrap);cells.push({wrap,title,details,frame});await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=html;});if(!frame.contentWindow.__overflowReady)throw Error('Isolated fixture did not initialise');}allRoutes=cells[0].frame.contentWindow.__overflowCases.filter(c=>c.variant==='standard').map(c=>c.route);domainPicker.value=query.get('domain')||'all';experiencePicker.value=query.get('experience')||'deep-first';page=Number(query.get('page')||0);pageOptions();await show();})().catch(error=>{status.textContent='Gallery failed';report.textContent=String(error.stack||error);});
domainPicker.addEventListener('change',()=>{page=0;pageOptions();show();});experiencePicker.addEventListener('change',show);statePicker.addEventListener('change',show);textPicker.addEventListener('change',show);capturePicker.addEventListener('change',()=>phones.classList.toggle('four-across',capturePicker.value==='wide'));sectionPicker.addEventListener('change',show);detailsPicker.addEventListener('change',show);pagePicker.addEventListener('change',()=>{page=Number(pagePicker.value);show();});document.getElementById('previous').onclick=()=>{if(!busy&&page>0){page--;pagePicker.value=String(page);show();}};document.getElementById('next').onclick=()=>{if(!busy&&(page+1)*4<filtered.length){page++;pagePicker.value=String(page);show();}};editionPicker.addEventListener('change',()=>{const p=new URLSearchParams({edition:editionPicker.value,domain:domainPicker.value,experience:experiencePicker.value,page:String(page)});location.href='/__mono-gallery.html?'+p;});

function setViewport(value){
 const [width,height]=value.split(',').map(Number);for(const cell of cells){cell.frame.width=String(width);cell.frame.height=String(height);cell.frame.style.width=width+'px';cell.frame.style.height=height+'px';cell.wrap.style.width=(width+2)+'px';}
 const wide=capturePicker.value==='wide';phones.style.gridTemplateColumns='repeat('+(wide?4:2)+','+((width+2)*(wide?.8:1))+'px)';
}
function monoCount(r){return(r.horizontal?.length||0)+(r.unreachable?.length||0)+(r.fixedClipped?.length||0)+(r.endOcclusion?.length||0)+(r.endUnreachable?.length||0)+(r.textClipping?.filter(x=>x.kind!=='ellipsis').length||0)+(r.contentClipping?.filter(x=>x.kind!=='ellipsis').length||0)+(r.collapsedScrollers?.length||0)+(r.homeArtworkOverlap?.length||0)+(r.planBoxesOverlap?.length||0)+(r.savingsHackPlacement?.length||0)+(r.guidanceStateIssues?.length||0);}
async function sweepRoutes(){
 if(sweepRunning||busy)return;sweepRunning=true;window.monoSweepResults=[];const started=Date.now();domainPicker.value='all';statePicker.value='standard';detailsPicker.value='native';sectionPicker.value='top';page=0;pageOptions();
 const matrix=[{viewport:'320,568',text:'1'},{viewport:'390,844',text:'1'},{viewport:'320,568',text:'2'}];
 for(const experience of ['deep-first','deep-returning'])for(const size of matrix){
  if(!sweepRunning)break;experiencePicker.value=experience;textPicker.value=size.text;document.getElementById('viewport').value=size.viewport;setViewport(size.viewport);
  for(page=0;page*4<filtered.length&&sweepRunning;page++){
   pagePicker.value=String(page);await show();const data=JSON.parse(report.textContent);for(const record of data.records){const layout=record.layout||{},layoutCount=monoCount(layout);const row={requested:record.requested,actual:record.actual,renderedView:record.renderedView,experience,viewport:size.viewport,textScale:Number(size.text),errors:record.errors||[],renderFallback:record.renderFallback,palette:record.palette,layoutCount};if(layoutCount)row.layout=layout;if(record.error)row.error=record.error;window.monoSweepResults.push(row);}
   status.textContent='Route sweep: '+window.monoSweepResults.length+' / '+(allRoutes.length*6)+' · '+experience+' · '+size.viewport+' · '+(Number(size.text)*100)+'% text';
  }
 }
 sweepRunning=false;lock(false);const rows=window.monoSweepResults,findings=rows.filter(r=>r.error||r.errors.length||r.renderFallback||r.palette?.count||r.layoutCount),summary={total:rows.length,routes:allRoutes.length,experiences:['first','returning'],matrix,elapsedSeconds:Math.round((Date.now()-started)/1000),setupErrors:rows.filter(r=>r.error||r.errors.length||r.renderFallback).length,paletteFailures:rows.filter(r=>r.palette?.count).length,layoutFailures:rows.filter(r=>r.layoutCount).length,findings};window.monoSweepSummary=summary;status.textContent='Complete: '+rows.length+' route layouts · '+findings.length+' with findings';report.textContent=JSON.stringify(summary,null,2);
}
document.getElementById('viewport').addEventListener('change',()=>{setViewport(document.getElementById('viewport').value);show();});capturePicker.addEventListener('change',()=>setViewport(document.getElementById('viewport').value));document.getElementById('run-routes').onclick=sweepRoutes;document.getElementById('stop-routes').onclick=()=>sweepRunning=false;
