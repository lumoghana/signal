/* Clarity Edition: untouched textile masters recovered from illustration-first v11.
   Financial copy stays in the interface. Artwork never changes account state. */
(()=>{
'use strict';
const scenes={
 student:['student-expressive.png','A student checks his phone on a campus bench.'],
 friends:['friends-editorial.png','Two students walk and talk on campus.'],
 merchant:['campus-pay-editorial.png','A student considers a payment at a campus food counter.'],
 review:['money-review-refined-4.13.png','A student reviews his plan in a notebook.'],
 goal:['goal-study-4.16.png','A student considers a laptop goal.'],
 essentials:['essentials-pause-editorial.png','A student considers an everyday food cost.'],
 complete:['payment-complete-editorial.png','A student receives lunch after a confirmed payment.'],
 thoughtful:['thoughtful-refined-4.13.png','A student thinks through his next choice.']
};
const aliases={welcome:'student',home:'student',phone:'student',identity:'student',secure:'student',campus:'student',pay:'friends',funding:'student',clarity:'thoughtful',goals:'goal',plan:'review',story:'review',bills:'student',chat:'thoughtful',help:'thoughtful',merchant:'merchant',success:'student',receipt:'review',privacy:'student',settings:'student'};
const accountRoutes={profile:'profile',profileEdit:'profile',profilePhone:'devices',accountInfo:'account',accountTerms:'account',security:'security',changePin:'security',devices:'devices',privacy:'privacy',privacyNotice:'privacy',dataExport:'account',notificationPrefs:'notifications',notifications:'notifications',help:'help',supportCase:'feedback',caseDetail:'help',testing:'testing',feedback:'feedback',closeAccount:'privacy',recovery:'security',recoveryOwnership:'profile',recoveryReplacement:'devices',recoveryStatus:'security',authorize:'security'};
const serviceRoutes={requests:'request',requestCreate:'lumo',requestDetail:'activity',requestConfirm:'request',activity:'activity',txDetail:'activity',bankAdd:'bank',momoAdd:'momo',story:'activity',allowance:'momo',essentials:'campus',statements:'activity'};
const resultTx=()=>{
 const id=L.params?.id||L.state?.paymentDraft?.submittedTxId;
 return L.state?.txs?.find(tx=>tx.id===id);
};
const confirmed=tx=>tx?.status==='success'&&(!tx.delivery||tx.delivery==='delivered');
const isCampusFood=tx=>(tx?.paymentDraft?.method==='campus'||tx?.method==='campus')&&String(tx?.category||tx?.paymentDraft?.category||'').toLowerCase()==='food';
const goalScene=()=>{
 const goals=L.state?.goals||[],goal=goals.find(item=>item.id===L.params?.id)||(goals.length===1?goals[0]:null);
 return /laptop/i.test(String(goal?.name||''))?'goal':'review';
};
const decisionScene=()=>{
 const draft=L.state?.paymentDraft;
 const impact=draft&&L.planImpactSummary?.(draft);
 // An unrelated essential must not acquire a food or laptop story from the art.
 if(impact?.essentialGap>0){
  const food=(impact.essentials||[]).some(item=>Number(item.after)>0&&/\bfood\b|meals?|lunch/i.test(String(item.name||'')));
  return food?'essentials':'thoughtful';
 }
 if(impact?.goalGap>0&&/laptop/i.test(String(impact.goalName||'')))return 'goal';
 return 'thoughtful';
};
const routeScene=route=>{
 if(route==='paymentResult'){
  const tx=resultTx();
  return confirmed(tx)?isCampusFood(tx)?'complete':'student':'thoughtful';
 }
 if(/pause|decision|tradeoff/i.test(route))return decisionScene();
 if(/goal|allocate|allocation|releaseGoal|releaseReview/i.test(route))return goalScene();
 if(/plan|essential|allowance|story/i.test(route))return 'review';
 if(/chat|help|support|feedback|case/i.test(route))return 'thoughtful';
 if(/merchant|campusPay/i.test(route))return 'merchant';
 if(/pay|send|request/i.test(route))return 'friends';
 return 'student';
};
const figure=(scene,kind,compact=false,extra='',tag='figure')=>{
 const [file,label]=scenes[scene]||scenes.student;
 const decision=compact||/pause|decision|tradeoff|authorize|paymentReview/.test(kind);
 const size=decision?'decision':/welcome|clarity|funding/.test(kind)?'intro':'everyday';
 const safeKind=String(kind).replace(/[^a-z0-9-]/gi,'-');
 const safeExtra=String(extra).replace(/[^a-z0-9 _-]/gi,'');
 return `<${tag} class="scene-art scene-editorial clarity-art scene-${safeKind} clarity-scene-${scene} scene-size-${size}${decision?' scene-compact':''}${safeExtra?' '+safeExtra:''}" data-art="clarity-${scene}" data-art-source="illustration-first-v11" data-scene="${scene}" aria-hidden="true"><img class="clarity-art-image" src="/assets/clarity/${file}" width="1536" height="1024" alt="" draggable="false" decoding="async"></${tag}>`;
};
L.clarityArt={scenes:Object.freeze({...scenes}),confirmed,resultTx};
L.illustration=(kind='home',compact=false)=>{
 let scene;
 // Decoration's existing route classifier requests 'success' after checking status.
 // Recheck actual transaction state here so an unconfirmed result cannot celebrate.
 if(kind==='paymentResult'||L.route==='paymentResult'&&kind==='success')scene=routeScene('paymentResult');
 else if(/^(pause|decision|tradeoff)$/.test(kind))scene=decisionScene();
 else if(kind==='goals')scene=goalScene();
 else scene=aliases[kind]||routeScene(kind);
 return figure(scene,kind,compact);
};
L.paymentArt=(kind,extra='')=>{
 const scene=kind==='campus'?'merchant':['lumo','request'].includes(kind)?'friends':kind==='activity'?'review':'student';
 return figure(scene,'payment-'+kind,true,'option-art '+extra,'span');
};
L.accountArt=kind=>figure(['help','feedback','testing'].includes(kind)?'thoughtful':kind==='account'?'review':'student','account-'+kind);
L.contextualIllustration=route=>{
 const draft=L.state?.paymentDraft;
 if(Object.hasOwn(accountRoutes,route))return L.accountArt(accountRoutes[route]);
 if(route==='chat')return L.illustration('chat');
 if(route==='pay')return L.illustration(L.payTab?.()==='campus'?'merchant':'pay');
 if(route==='send'&&!draft?.submittedTxId)return L.paymentArt(draft?.method==='campus'?'campus':draft?.method==='request'?'request':draft?.method==='bank'?'bank':draft?.method==='momo'?'momo':'lumo');
 if(route==='bill'&&!draft?.submittedTxId)return L.paymentArt(draft?.bill||L.params?.kind||'airtime');
 if(route==='campusPay')return L.illustration('merchant');
 if(route==='more')return L.illustration('identity');
 if(route==='paymentReview')return L.illustration('pay',true);
 if(route==='paymentResult')return figure(routeScene(route),route,true);
 if(Object.hasOwn(serviceRoutes,route))return L.paymentArt(serviceRoutes[route]);
 return null;
};
})();
