/* Context before decoration. Original Ghanaian textile identity, task-specific
   actions and restrained insight accents. Presentation never moves money. */
(()=>{
'use strict';
const E=L.e;
const original=file=>'/assets/clarity/'+file;
const extension=file=>'/assets/clarity-context/'+file;
const task=file=>'/assets/clarity-tasks/'+file;
// Reuse the campus pilot's service atlas unchanged. Existing SVG viewBox crops
// select a complete prop; grayscale keeps the interface accent out of artwork.
const serviceAtlas='/assets/lumo-payment-atlas-v19.webp';
const serviceSprites=Object.freeze({transfer:[4,60,376,324],request:[8,392,356,312],airtime:[400,392,310,316],data:[736,426,330,256],electricity:[1114,390,308,314],water:[30,718,330,338],tv:[396,720,316,342],internet:[738,710,326,346]});
const scenes=Object.freeze({
 home:extension('home-clarity-mirror-v18.png'),chat:task('chat-conversation.png'),payment:extension('payment-phone.png'),decision:extension('decision-phone.png'),identity:extension('identity-check.png'),records:task('records-receipts.png'),
 student:original('student-expressive.png'),friends:original('friends-editorial.png'),merchant:original('campus-pay-editorial.png'),plan:task('planning-calendar.png'),goal:original('goal-study-4.16.png'),foodComplete:original('payment-complete-editorial.png'),
 funding:task('funding-wallet.png'),security:task('security-lock.png'),profile:task('profile-card.png'),privacy:task('privacy-curtain.png'),notifications:task('notifications-bell.png'),help:task('help-question.png'),bank:task('bank-details.png'),campus:task('campus-scan.png'),
 ...Object.fromEntries(Object.keys(serviceSprites).map(key=>[key,serviceAtlas]))
});
const backgrounds=Object.freeze({balme:'/assets/clarity-bold/legon-balme-clean.png',avenue:'/assets/clarity-bold/legon-avenue-clean.png'});
const groups=Object.freeze({
 home:['home'],
 friends:['welcome','ambassadorWelcome','ambassadorSample','sampleConfirm','campusInterest','campusInterestSaved','pilotUnavailable','accountReady'],
 transfer:['sendOptions'],request:['requests','requestCreate','requestDetail','requestConfirm'],
 chat:['chat','chatCalculation'],identity:['identity','livecheck','identityResult','recoveryOwnership','campus','campusStatus','merchantApply'],
 payment:['phone','otp','profilePhone'],
 security:['pin','confirmPin','signin','recovery','recoveryReplacement','recoveryStatus','changePin','devices','security','authorize'],
 privacy:['privacy','privacyNotice','closeAccount'],profile:['more','profile','profileEdit'],notifications:['notifications','notificationPrefs'],
 funding:['addMoney'],campus:['campusPay','merchant','merchantCollect','merchantCollection','merchantPayer'],bank:['merchantDestination'],
 decision:['pause','pauseDemo','actionConfirm','paymentCancel','planBenefit','samplePause'],
 plan:['planExplanation','planEdit','plan','planSetup','setupChoice','setupProgress','planPeriod','allowance','firstEssentials','firstGoal','firstPlanReview','essentials','essentialEdit','goals','goalEdit','goal','allocate','allocationReview','releaseGoal','releaseReview','paymentPlanLink','makeRoom','missions'],
 help:['help','supportCase','caseDetail','feedback','testing','ambassadorGuide'],
 records:['paymentReview','accountInfo','accountTerms','accountReview','applicationCorrection','applicationStatus','balances','activity','pending','txDetail','story','homeMoneyStory','storyTx','statements','settlements','settlementDetail','merchantSales','dataExport','ambassadorReset','resetConfirm','pauseLog']
});
const routeScenes=Object.freeze(Object.fromEntries(Object.entries(groups).flatMap(([scene,routes])=>routes.map(route=>[route,scene]))));
const resultTx=()=>L.clarityArt?.resultTx?.();
const isConfirmed=()=>!!L.clarityArt?.confirmed?.(resultTx());
const fundingTx=route=>{
 const id=route==='momoAdd'?L.state.fundingDraft?.txId:route==='bankAdd'?L.state.bankFunding?.txId:null;
 return id&&L.state.txs?.find(tx=>tx.id===id&&tx.type==='in');
};
const fundingConfirmed=(route=L.route)=>fundingTx(route)?.status==='success';
const campusFood=item=>['campus','Campus Pay'].includes(item?.paymentDraft?.method||item?.method)&&String(item?.category||item?.paymentDraft?.category||'').toLowerCase()==='food';
const selectedGoal=()=>L.state.goals?.find(goal=>goal.id===L.params?.id);
const laptopGoal=()=>/\blaptop\b/i.test(String(selectedGoal()?.name||''));
const sceneFor=route=>{
 if(route==='clarity')return 'home';
 if(route==='paymentResult'){
  const tx=resultTx();
  // A paid food order is not proof of physical delivery. The handover master
  // requires that additional explicit state, as well as confirmed payment.
  return isConfirmed()?campusFood(tx)&&tx.delivery==='delivered'?'foodComplete':'student':'decision';
 }
 if(route==='momoAdd'||route==='bankAdd'){
  const tx=fundingTx(route);
  return tx?.status==='success'?'student':tx?'decision':route==='bankAdd'?'bank':'funding';
 }
 if(route==='pay')return L.payTab?.()==='campus'?'campus':L.payTab?.()==='bills'?'records':'transfer';
 if(route==='bill'){
  const service=L.state.paymentDraft?.bill||L.params?.kind;
  return Object.hasOwn(serviceSprites,service)?service:'records';
 }
 if(route==='send'){
  const draft=L.state.paymentDraft;
  if(draft?.method==='campus')return String(draft.category||'').toLowerCase()==='food'?'merchant':(draft.merchantId==='CP02'||String(draft.category||'').toLowerCase()==='printing')?'records':'campus';
  return draft?.method==='bank'?'bank':draft?.method==='momo'?'funding':draft?.method==='lumo'?'transfer':draft?.method==='request'?'request':'payment';
 }
 if(route==='actionConfirm'){
  const context=L.nativeDecisionContext?.();
  if(context?.scene&&Object.hasOwn(scenes,context.scene))return context.scene;
  const origin=context?.route;
  return origin&&origin!=='actionConfirm'?sceneFor(origin):'decision';
 }
 if(['goal','goalEdit','allocate','allocationReview','releaseGoal','releaseReview'].includes(route))return laptopGoal()?'goal':'plan';
 if(route==='pause'){
  const draft=L.state.paymentDraft,impact=draft&&L.planImpactSummary?.(draft);
  return !impact?.essentialGap&&impact?.goalGap>0&&/\blaptop\b/i.test(String(impact.goalName||''))?'goal':'decision';
 }
 // Fixed onboarding/demo examples never borrow a different live draft's story.
 return routeScenes[route]||'records';
};
const compactRoutes=new Set(['send','bill','paymentReview','pause','pauseDemo','authorize','paymentPlanLink','allocationReview','releaseReview','firstPlanReview','actionConfirm','paymentCancel']);
const introRoutes=new Set(['welcome','ambassadorWelcome','identity','campus','accountReady']);
const draw=(scene,kind,compact=false,extra='',tag='figure')=>{
 const chosen=Object.hasOwn(scenes,scene)?scene:'records',campus=['home','friends','plan','goal','records','identity'].includes(chosen)?'balme':'avenue';
 const tier=compact||compactRoutes.has(kind)?'decision':introRoutes.has(kind)?'intro':'everyday';
 const sprite=serviceSprites[chosen];
 const master=chosen==='home'?'lumo-home-mirror-v18':sprite?'campus-pilot-v25':scenes[chosen].startsWith('/assets/clarity/')?'illustration-first-v11':scenes[chosen].startsWith('/assets/clarity-tasks/')?'lumo-task-v5':'lumo-context-v4';
 // A nested, tightly bounded SVG viewport clips the atlas cell even when the
 // outer viewport letterboxes. It uses no fragment IDs for the task host to
 // namespace, so the retained parent's crop stays intact behind an open sheet.
 const foreground=sprite?`<svg class="bold-figure-image service-prop" xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="${sprite.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden" aria-hidden="true"><svg class="service-cell" x="${sprite[0]}" y="${sprite[1]}" width="${sprite[2]}" height="${sprite[3]}" style="width:${sprite[2]}px;height:${sprite[3]}px" viewBox="${sprite.join(' ')}" preserveAspectRatio="none" overflow="hidden"><image href="${serviceAtlas}" width="1448" height="1086"/></svg></svg>`:`<img class="bold-figure-image" src="${scenes[chosen]}" width="1536" height="1024" alt="" draggable="false" decoding="async">`;
 return `<${tag} class="scene-art bold-scene bold-scene-${chosen} scene-size-${tier}${tier==='decision'?' scene-compact':''}${chosen==='home'?' home-complete-scene':''}${extra?' '+E(extra):''}" data-art="context-${chosen}-v5" data-art-source="lumo-context-v5" data-master-source="${master}" data-campus="${campus}" data-scene="${chosen}" aria-hidden="true"><span class="legon-backdrop"><img class="legon-backdrop-image" src="${backgrounds[campus]}" width="1536" height="1024" alt="" draggable="false" decoding="async"></span><span class="expressive-figure">${foreground}</span></${tag}>`;
};
L.boldArt=Object.freeze({scenes,backgrounds,serviceAtlas,serviceSprites,routeScenes,sceneFor,isConfirmed,fundingConfirmed,draw});
// Existing views sometimes ask for an old alias (Review asks for 'pay', My plan
// for 'goals', More for 'identity'). The actual mounted activity takes priority.
L.illustration=(kind='home',compact=false)=>{
 const route=Object.hasOwn(L.views,L.route)?L.route:kind;
 return draw(sceneFor(route),route,compact);
};
L.paymentArt=(kind,extra='')=>draw(Object.hasOwn(serviceSprites,kind)?kind:kind==='lumo'?'transfer':kind==='momo'?'funding':kind==='bank'?'bank':kind==='campus'?'campus':'records','payment-'+kind,true,'option-art '+extra,'span');
L.accountArt=kind=>draw(['security','devices'].includes(kind)?'security':kind==='privacy'?'privacy':kind==='profile'?'profile':kind==='notifications'?'notifications':['help','feedback','testing'].includes(kind)?'help':'records','account-'+kind);
L.contextualIllustration=route=>draw(sceneFor(route),route,compactRoutes.has(route));
// The approved wordmark carries its own ring. Standalone repeated ring icons
// are replaced by the conclusion's modest lime highlight, including live input.
L.clarityRing=()=>'';
const addClass=(html,pattern,classes)=>html.replace(pattern,(_,before,current,after)=>before+current+' '+classes+after);
const decorate=L.decorateView;
L.decorateView=(html,route)=>{
 html=decorate?decorate(html,route):html;
 if(route==='home'){
  html=addClass(html,/(class=")([^"]*\bhome-plan-summary\b[^"]*)(")/,'lumo-lens');
  html=html.replace('<strong id="overview-room">','<strong class="lumo-lens-value" id="overview-room">');
  html=html.replace('class="home-plan-math"','class="home-plan-math intelligence-note"');
  html=html.replace('Make room for what matters.','See your next move clearly.');
 }
 if(route==='pause'){
  html=html.replace('class="pause-comparison-after"','class="pause-comparison-after lumo-lens lumo-lens-compact"');
  html=html.replace(/(<div class="pause-comparison-after[^>]+>[\s\S]*?)<strong>/,'$1<strong class="lumo-lens-value">');
  html=html.replace('class="pause-comparison-note"','class="pause-comparison-note intelligence-note"');
 }
 if(route==='chat'){
  html=html.replace(/<div class="chat-bubble chat-reply"([^>]*\bdata-insight\b[^>]*id="chat-latest-reply"[^>]*)>/,'<div class="chat-bubble chat-reply lumo-lens"$1>');
  html=html.replace(/(class="chat-bubble chat-reply lumo-lens"[^>]*>[\s\S]*?)class="lead"/,'$1class="lead lumo-lens-value"');
  html=html.replace(/class="impact-secondary"/g,'class="impact-secondary intelligence-note"');
 }
 if(route==='welcome')html=html.replace('Your money.<br>Your next move.','See what<br>comes next.').replace('Enjoy today. See what comes next.','Pay for today. Know what it changes.');
 return html;
};
const entry=L.entryConsequence;
L.entryConsequence=impact=>entry(impact).replace('class="entry-consequence"','class="entry-consequence lumo-lens lumo-lens-small"').replace('class="entry-consequence-copy"','class="entry-consequence-copy lumo-lens-value"');
})();
