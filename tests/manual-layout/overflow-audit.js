/* TEMPORARY LOCAL QA. Setup and geometry mutation belong here, never browser evaluate. */
'use strict';
const frame=document.getElementById('screen'),picker=document.getElementById('fixtures'),sizes=document.getElementById('sizes'),status=document.getElementById('status'),report=document.getElementById('report'),progress=document.getElementById('progress');
let fixtures=[],results=[],running=false,current=null,fontScaleRecords=[],loadedCase=null,setup=null;
const edition=new URLSearchParams(location.search).get('edition')||'everyday',editionPrefix=edition==='minna'?'/__audit-minna':edition==='hibiscus'?'/__audit-hibiscus':'';
const selectedSize=()=>sizes.value.split(',').map(Number),tick=()=>new Promise(r=>setTimeout(r,20));
const restoreType=()=>{for(const {el,value,priority}of fontScaleRecords)if(el.isConnected){if(value)el.style.setProperty('font-size',value,priority);else el.style.removeProperty('font-size');}fontScaleRecords=[];};
function geometry(){
 const d=frame.contentDocument,w=frame.contentWindow,app=d.querySelector('#app'),view=d.querySelector('#view'),appRect=app.getBoundingClientRect();
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
function freezeFrames(d){for(const el of d.querySelectorAll('.task-sheet,.screen'))for(const [name,value]of [['transform','none'],['translate','none'],['opacity','1']])el.style.setProperty(name,value,'important');}
async function show(f,size){
 const [width,height,textScale]=size;frame.style.width=width+'px';frame.style.height=height+'px';const d=frame.contentDocument,w=frame.contentWindow;restoreType();d.documentElement.style.fontSize='16px';
 const caseKey=f.name;if(loadedCase!==caseKey){setup=w.__overflowSeed(f);loadedCase=caseKey;await tick();await d.fonts.ready;}
 freezeFrames(d);w.dispatchEvent(new Event('resize'));await tick();if(f.variant.endsWith('-hidden'))w.L.hidePrivateMoney?.();else w.L.showPrivateMoney?.();
 if(textScale!==1){const base=[...d.querySelectorAll('#app,#app *')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert],[aria-hidden="true"]')).map(el=>({el,size:Number.parseFloat(w.getComputedStyle(el).fontSize),value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')})).filter(x=>Number.isFinite(x.size));for(const x of base){fontScaleRecords.push(x);x.el.style.setProperty('font-size',(x.size*textScale)+'px','important');}}
 w.dispatchEvent(new Event('resize'));await tick();freezeFrames(d);const errors=[...(setup.errors||[]),...(w.__auditErrors||[])];current={edition,name:f.name,variant:f.variant,size,setup:{...setup,actual:w.L.route,errors:[...new Set(errors)],renderFallback:/Let’s try that again/.test(d.querySelector('#view')?.textContent||'')},...geometry()};return current;
}
function count(r){return(r.horizontal?.length||0)+(r.unreachable?.length||0)+(r.fixedClipped?.length||0)+(r.endOcclusion?.length||0)+(r.endUnreachable?.length||0)+(r.textClipping?.filter(x=>x.kind!=='ellipsis').length||0)+(r.contentClipping?.filter(x=>x.kind!=='ellipsis').length||0)+(r.collapsedScrollers?.length||0)+(r.homeArtworkOverlap?.length||0)+(r.planBoxesOverlap?.length||0)+(r.savingsHackPlacement?.length||0)+(r.guidanceStateIssues?.length||0);}
function privacyComparisonsFor(rows){
 const pairs=[{fixture:'long-values',shown:'home · long-values',hidden:'home · long-values-hidden'},{fixture:'budget-heavy-values',shown:'home · budget-heavy-values',hidden:'home · budget-heavy-values-hidden'}];
 const selectors=['.account-operational','.account-savings','.everyday-home-actions','#balance-eye'],fields=['left','top','right','bottom','width','height'];
 return pairs.flatMap(pair=>{const shown=rows.filter(r=>r.name===pair.shown),hidden=rows.filter(r=>r.name===pair.hidden);return shown.map(a=>{const b=hidden.find(r=>JSON.stringify(r.size)===JSON.stringify(a.size));if(!b)return{fixture:pair.fixture,size:a.size,tolerance:1,status:'missing-pair',passed:null};const metrics=[],issues=[];
  for(const selector of selectors){const ar=a.homeGeometry?.[selector],br=b.homeGeometry?.[selector];if(!ar||!br){issues.push({selector,reason:'Missing rectangle'});continue;}const differences=Object.fromEntries(fields.map(k=>[k,Math.abs(ar[k]-br[k])]));const maxDifference=Math.max(...Object.values(differences));metrics.push({selector,maxDifference,differences,shown:ar,hidden:br});if(maxDifference>1)issues.push({selector,maxDifference,differences});}
  const controlled=a.homeMoney?.eyePressed==='true'&&b.homeMoney?.eyePressed==='false'&&a.homeMoney?.masks===0&&b.homeMoney?.masks>0;
  if(!controlled)issues.push({reason:'Privacy fixture is not explicitly shown versus hidden',shown:a.homeMoney,hidden:b.homeMoney});
  return{fixture:pair.fixture,size:a.size,tolerance:1,status:issues.length?'changed':'stable',passed:issues.length===0,controlled,seededMoney:a.setup?.seededMoney,artworkClear:!a.homeArtworkOverlap?.length&&!b.homeArtworkOverlap?.length,artworkOverlap:{shown:a.homeArtworkOverlap||[],hidden:b.homeArtworkOverlap||[]},maxDifference:Math.max(0,...metrics.map(x=>x.maxDifference)),issues,metrics};
 });});
}


function guidanceComparisonsFor(rows){
 return rows.filter(r=>r.variant==='guidance-first').map(first=>{
  const route=first.setup?.requested,returning=rows.find(r=>r.variant==='guidance-returning'&&r.setup?.requested===route&&JSON.stringify(r.size)===JSON.stringify(first.size));
  if(!returning)return{route,size:first.size,status:'missing-pair',passed:false,issues:[{reason:'Returning fixture missing'}]};
  const a=first.pageGuidance,b=returning.pageGuidance,issues=[];
  if(!a||!b)issues.push({reason:'Guidance facts missing'});
  else{
   if(a.guideCount!==b.guideCount)issues.push({reason:'Guide availability differs',first:a.guideCount,returning:b.guideCount});
   if(a.expanded!==a.guideCount||b.expanded!==0)issues.push({reason:'First/returning disclosure state is incorrect',first:a.expanded,returning:b.expanded,guides:a.guideCount});
   for(const key of ['outsideCopy','controlIds','actionLabels','essentialHelpOutside','essentialAmountOutside','pinOutside'])if(JSON.stringify(a[key])!==JSON.stringify(b[key]))issues.push({reason:'Required task content differs',field:key,first:a[key],returning:b[key]});
  }
  if(JSON.stringify(first.setup?.seededMoney)!==JSON.stringify(returning.setup?.seededMoney))issues.push({reason:'Sample account balances changed'});
  return{route,size:first.size,status:issues.length?'changed':'stable',passed:issues.length===0,guideCount:a?.guideCount,firstExpanded:a?.expanded,returningExpanded:b?.expanded,critical:!!a?.critical,requiredContentStable:!issues.some(x=>x.reason==='Required task content differs'),issues};
 });
}

function render(r){status.textContent=r.name+' · '+count(r)+' findings';report.textContent=JSON.stringify(r,null,2);}
async function choose(){if(running)return;render(await show(fixtures[Number(picker.value)||0],selectedSize()));}
const priority=new Set(['welcome','setupChoice','samplePause','phone','otp','identity','livecheck','identityResult','campus','pin','confirmPin','accountReview','accountReady','setupProgress','signin','home','plan','pay','more','chat','spendingOutlook','firstEssentials','firstPlanReview','planEdit','planPeriod','budgetAfterFunding','sendOptions','send','paymentReview','pause','authorize','paymentResult','txDetail','addMoney','momoAdd','bankAdd','goals','goal','allocate','releaseGoal','profile','accountInfo','balances','myQr','campusPay','virtualCards','virtualCardCreate','virtualCard','virtualCardManage','virtualCardDemo']);
async function sweep(focused){if(running)return;running=true;results=[];for(const id of ['run','run-focus','run-targeted','run-group','run-privacy','run-savings','run-guidance','run-type200'])document.getElementById(id).disabled=true;const target=focused==='type200'?fixtures.filter(f=>f.variant==='standard'||f.variant==='long-values'):focused==='guidance'?fixtures.filter(f=>f.variant.startsWith('guidance-')):focused==='savings'?fixtures.filter(f=>!f.variant.startsWith('guidance-')&&(new Set(['plan','goalEdit','goal','goals','boxProtectionInvite']).has(f.route)||f.variant.startsWith('hack-'))):focused==='privacy'?fixtures.filter(f=>f.route==='home'):focused==='group'?fixtures.filter(f=>f.route.startsWith('groupMoney')):focused==='targeted'?fixtures.filter(f=>new Set(['accountTerms','budgetCycleReview','budgetReviewDates','budgetReviewNext','home','plan','pay','more','chat','groupMoneyReview','groupMoneyInvitation']).has(f.route)):focused?fixtures.filter(f=>priority.has(f.route)||f.route.startsWith('groupMoney')):fixtures;const matrix=focused==='type200'?[[320,568,2],[390,844,2]]:focused==='privacy'?[[320,568,1],[375,667,1],[390,844,1],[390,480,1],[320,568,1.5],[568,320,1],[768,1024,1],[1100,900,1],[320,568,2],[390,844,2]]:focused==='guidance'||focused==='savings'||focused==='group'?[[320,568,1],[375,667,1],[390,844,1],[390,480,1],[320,568,1.5],[568,320,1],[768,1024,1],[1100,900,1]]:focused==='targeted'?[[320,568,1],[320,568,1.5],[568,320,1],[1100,900,1]]:focused?[[320,568,1],[375,667,1],[390,844,1],[320,568,1.5],[1100,900,1]]:[[320,568,1],[375,667,1],[390,844,1],[390,480,1],[320,568,1.5],[568,320,1],[768,1024,1],[1100,900,1]];
 for(let i=0;i<target.length&&running;i++)for(const size of matrix){if(!running)break;const f=target[i];progress.textContent=(i+1)+' / '+target.length+' · '+size.join(' × ')+' · '+f.name;try{const r=await show(f,size);results.push(r);}catch(e){results.push({name:f.name,size,error:String(e)});}window.auditResults=results;}
 running=false;for(const id of ['run','run-focus','run-targeted','run-group','run-privacy','run-savings','run-guidance','run-type200'])document.getElementById(id).disabled=false;const bad=results.filter(r=>r.error||r.setup?.errors?.length||r.setup?.renderFallback||count(r)),privacyComparisons=privacyComparisonsFor(results),privacyFindings=privacyComparisons.filter(r=>r.passed===false).map(r=>({name:'Home eye geometry',kind:'privacy-layout-shift',...r})),guidanceComparisons=guidanceComparisonsFor(results),guidanceFindings=guidanceComparisons.filter(r=>r.passed===false).map(r=>({name:'First and returning guidance',kind:'guidance-content-change',...r}));const summary={edition,total:results.length,totalCases:target.length,withFindings:bad.length+privacyFindings.length+guidanceFindings.length,privacyComparisons,privacyFindings,guidanceComparisons,guidanceFindings,aliases:results.filter(r=>r.setup?.alias).map(r=>({name:r.name,size:r.size,alias:r.setup.alias})),setupErrors:results.filter(r=>r.error||r.setup?.errors?.length||r.setup?.renderFallback).length,counts:{horizontal:results.filter(r=>r.horizontal?.length).length,unreachable:results.filter(r=>r.unreachable?.length).length,textClipping:results.filter(r=>r.textClipping?.some(x=>x.kind!=='ellipsis')).length,contentClipping:results.filter(r=>r.contentClipping?.some(x=>x.kind!=='ellipsis')).length,collapsedScrollers:results.filter(r=>r.collapsedScrollers?.length).length,homeArtworkOverlap:results.filter(r=>r.homeArtworkOverlap?.length).length,planBoxesOverlap:results.filter(r=>r.planBoxesOverlap?.length).length,savingsHackPlacement:results.filter(r=>r.savingsHackPlacement?.length).length,guidanceState:results.filter(r=>r.guidanceStateIssues?.length).length,guidanceContentChanges:guidanceFindings.length,privacyLayoutShifts:privacyFindings.length,endOcclusion:results.filter(r=>r.endOcclusion?.length).length,endUnreachable:results.filter(r=>r.endUnreachable?.length).length},findings:[...bad,...privacyFindings,...guidanceFindings]};window.auditSummary=summary;status.textContent='Complete: '+results.length+' layouts · '+summary.withFindings+' with findings';report.textContent=JSON.stringify(summary,null,2);progress.textContent='Complete. Every case uses isolated synchronous memory history; 150% scales actual computed px type. Full results in report DOM.';
}
(async()=>{document.getElementById('edition').value=edition;let html=await fetch(editionPrefix?editionPrefix+'/index.html':'/').then(r=>r.text());if(editionPrefix){html=html.replace(/(<script\b[^>]*src=")\//g,'$1'+editionPrefix+'/').replace(/(<link\b[^>]*href=")\/(?!brand\/|manifest)/g,'$1'+editionPrefix+'/');}
 const bootstrap='<script>(()=>{const memory=new Map();const store={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]||null,get length(){return memory.size}};Object.defineProperty(window,"localStorage",{value:store});Object.defineProperty(window,"sessionStorage",{value:store});try{Object.defineProperty(document,"hidden",{get:()=>false});Object.defineProperty(document,"visibilityState",{get:()=>"visible"})}catch{}document.addEventListener("visibilitychange",event=>event.stopImmediatePropagation(),true);window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),0);window.cancelAnimationFrame=id=>clearTimeout(id);const entries=[];let position=-1;const history={get state(){return entries[position]||null},get length(){return entries.length},replaceState(state){if(position<0)position=0;entries[position]=JSON.parse(JSON.stringify(state))},pushState(state){entries.splice(position+1);entries.push(JSON.parse(JSON.stringify(state)));position++},go(delta){const next=position+delta;if(next<0||next>=entries.length)return;position=next;window.dispatchEvent(new PopStateEvent("popstate",{state:JSON.parse(JSON.stringify(entries[position]))}))},back(){this.go(-1)},forward(){this.go(1)}};Object.defineProperty(window,"history",{value:history});try{Object.defineProperty(navigator,"mediaDevices",{value:{getUserMedia:()=>Promise.reject(new Error("Camera stubbed for isolated local layout QA"))}})}catch{}window.__auditErrors=[];window.addEventListener("error",e=>window.__auditErrors.push(e.message));const original=console.error;console.error=(...args)=>{window.__auditErrors.push(args.map(x=>String(x.stack||x)).join(" "));original.apply(console,args)};})();<\/script>';
 const freeze='<style>*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}#app .task-sheet,#app #view .screen,#app #view .screen[data-density]{animation:none!important;transition:none!important;transform:none!important;translate:none!important;opacity:1!important}</style>';
 html=html.replace('<head>','<head><base href="/">').replace('</head>',freeze+'</head>').replace(/<script\b/,bootstrap+'<script').replace('</body>','<script src="/__overflow-seed.js"><\/script></body>');
 await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=html;});if(!frame.contentWindow.__overflowReady)throw Error('Audit seed script not ready');fixtures=frame.contentWindow.__overflowCases;picker.innerHTML=fixtures.map((f,i)=>'<option value="'+i+'">'+f.name+'</option>').join('');status.textContent=fixtures.length+' isolated scenarios ready';await choose();
})().catch(e=>{status.textContent='Audit load failed: '+e.message;report.textContent=String(e.stack||e);});
picker.addEventListener('change',choose);sizes.addEventListener('change',choose);document.getElementById('run').onclick=()=>sweep(false);document.getElementById('run-focus').onclick=()=>sweep(true);document.getElementById('run-targeted').onclick=()=>sweep('targeted');document.getElementById('run-group').onclick=()=>sweep('group');document.getElementById('run-privacy').onclick=()=>sweep('privacy');document.getElementById('run-savings').onclick=()=>sweep('savings');document.getElementById('run-guidance').onclick=()=>sweep('guidance');document.getElementById('run-type200').onclick=()=>sweep('type200');document.getElementById('run-current').onclick=()=>{if(current)render({...current,...geometry()})};document.getElementById('stop').onclick=()=>running=false;

document.getElementById('edition').addEventListener('change',e=>{location.href='/__overflow-audit.html?edition='+e.target.value;});
