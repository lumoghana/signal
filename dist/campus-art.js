/* Everyday Edition, Campus Pilot artwork.
   The recovered v25 masters remain untouched. Only presentation is replaced;
   the existing financial engine, navigation and task controllers stay owners.
   Atlas cells use nested SVG viewports rather than fragment IDs, so retaining
   a page behind a sheet cannot invalidate a clip/filter reference. */
(()=>{
'use strict';
const E=L.e;
const editorial='/assets/lumo-editorial-atlas-v22.webp';
const serviceAtlas='/assets/lumo-payment-atlas-v19.webp';
const accountAtlas='/assets/lumo-you-atlas-v22.webp';
const backgrounds=Object.freeze({balme:'/assets/legon-balme-v21.webp',avenue:'/assets/legon-avenue-v21.webp',hill:'/assets/legon-hill-v21.webp'});
const freezeCells=value=>Object.freeze(Object.fromEntries(Object.entries(value).map(([key,cell])=>[key,Object.freeze(cell)])));
const serviceSprites=freezeCells({transfer:[4,60,376,324],momo:[394,60,330,320],bank:[754,92,300,272],campus:[1084,108,354,262],request:[8,392,356,312],airtime:[400,392,310,316],data:[736,426,330,256],electricity:[1114,390,308,314],water:[30,718,330,338],tv:[396,720,316,342],internet:[738,710,326,346],activity:[1082,716,356,346]});
const accountSources=freezeCells({profile:[0,0,418,440],account:[418,0,418,438],security:[836,0,418,438],privacy:[0,440,418,413],notifications:[426,438,396,420],help:[836,438,418,416],testing:[0,853,418,401],feedback:[418,858,418,396],devices:[836,854,418,400]});
const atlas=(asset,crop,size)=>Object.freeze({asset,crop:Object.freeze(crop),size:Object.freeze(size)});
const editorialScene=crop=>atlas(editorial,crop,[1536,1024]);
// These cuts follow the complete subjects in Campus v25, including its
// column-specific row boundaries. No textile, gesture or face is redrawn.
const scenes=Object.freeze({
 home:editorialScene([0,0,512,369]),friends:editorialScene([0,0,512,369]),phone:editorialScene([0,0,512,369]),payment:editorialScene([0,0,512,369]),student:editorialScene([0,0,512,369]),
 identity:editorialScene([512,0,512,366]),pay:editorialScene([1024,0,512,368]),
 goal:editorialScene([512,366,512,306]),plan:editorialScene([1024,368,512,300]),
 chat:editorialScene([0,695,512,329]),merchant:editorialScene([512,672,512,352]),
 success:editorialScene([1060,668,476,356]),
 clarity:Object.freeze({asset:'/assets/lumo-clarity-v22.webp',size:Object.freeze([1100,1024])}),
 funding:Object.freeze({asset:'/assets/lumo-add-money-v22.webp',size:Object.freeze([1100,1024])}),
 decision:Object.freeze({asset:editorial,size:Object.freeze([1536,1024]),crop:Object.freeze([0,369,512,326]),subjectPath:'M0 369 H210 V448 H240 V478 H270 V512 H300 V525 H340 V540 H380 V560 H512 V695 H0Z'}),
 ...Object.fromEntries(Object.entries(serviceSprites).map(([key,crop])=>[key,atlas(serviceAtlas,crop,[1448,1086])])),
 food:atlas(serviceAtlas,serviceSprites.campus,[1448,1086]),
 ...Object.fromEntries(Object.entries(accountSources).map(([key,crop])=>[key,atlas(accountAtlas,crop,[1254,1254])]))
});
const compactRoutes=new Set(['send','bill','paymentReview','pause','pauseDemo','authorize','paymentPlanLink','allocationReview','releaseReview','firstPlanReview','actionConfirm','paymentCancel']);
const introRoutes=new Set(['welcome','ambassadorWelcome','identity','campus','accountReady']);
const resultTx=()=>{
 const id=L.params?.id||L.state?.paymentDraft?.submittedTxId;
 return L.state?.txs?.find(tx=>tx.id===id);
};
const confirmed=tx=>!!(tx&&tx.status==='success'&&(!tx.delivery||tx.delivery==='delivered'));
const fundingTx=route=>{
 const id=route==='momoAdd'?L.state?.fundingDraft?.txId:route==='bankAdd'?L.state?.bankFunding?.txId:null;
 return id&&L.state?.txs?.find(tx=>tx.id===id&&tx.type==='in');
};
const fundingConfirmed=(route=L.route)=>fundingTx(route)?.status==='success';
const identityApproved=()=>L.state?.setup?.identityStatus==='approved';
const fundedHome=()=>Number(L.balances?.().available||0)>0;
const oldSceneFor=L.boldArt?.sceneFor;
const accountRoutes=Object.freeze({profile:'profile',profileEdit:'profile',profilePhone:'devices',accountInfo:'account',accountTerms:'account',security:'security',changePin:'security',devices:'devices',privacy:'privacy',privacyNotice:'privacy',dataExport:'account',notificationPrefs:'notifications',notifications:'notifications',help:'help',supportCase:'feedback',caseDetail:'help',testing:'testing',feedback:'feedback',closeAccount:'privacy',recovery:'security',recoveryReplacement:'devices',recoveryStatus:'security',authorize:'security'});
const semanticScene=(scene,route)=>{
 if(Object.hasOwn(accountRoutes,route))return accountRoutes[route];
 if(scene==='identity')return identityApproved()?'identity':'phone';
 if(scene==='campus')return 'pay';
 if(scene==='foodComplete')return 'success';
 if(scene==='records')return ['paymentReview','accountInfo','accountTerms','accountReview','applicationStatus','applicationCorrection','dataExport'].includes(route)?'account':'activity';
 return Object.hasOwn(scenes,scene)?scene:'activity';
};
const sceneFor=route=>{
 if(route==='home')return fundedHome()?'home':'clarity';
 if(route==='clarity')return 'clarity';
 if(route==='paymentResult'){
  const tx=resultTx();
  return confirmed(tx)?'success':tx?.status==='failed'?'help':'decision';
 }
 if(route==='momoAdd'||route==='bankAdd'){
  const tx=fundingTx(route);
  return tx?.status==='success'?'success':tx?.status==='failed'?'help':tx?'decision':route==='bankAdd'?'bank':'funding';
 }
 if(route==='actionConfirm'){
  const context=L.nativeDecisionContext?.();
  // Native decisions retain the selected task/goal while their own params
  // intentionally contain no private form fields or original selection IDs.
  if(context?.scene)return semanticScene(context.scene,context.route);
  return context?.route&&context.route!=='actionConfirm'?sceneFor(context.route):'decision';
 }
 if(['identity','livecheck','identityResult','recoveryOwnership'].includes(route))return identityApproved()?'identity':'phone';
 if(['campus','campusStatus'].includes(route))return L.state?.setup?.campusStatus==='approved'?'identity':'phone';
 if(route==='merchantApply')return 'profile';
 if(route==='accountReady')return 'success';
 if(route==='planBenefit')return 'plan';
 if(Object.hasOwn(accountRoutes,route))return accountRoutes[route];
 // The established classifier keeps bill, selected merchant, plan and
 // laptop-only trade-off context. It has no access to illustration mutations.
 if(oldSceneFor)return semanticScene(oldSceneFor(route),route);
 return Object.hasOwn(scenes,route)?route:'activity';
};
const campusFor=scene=>['clarity','decision','goal','plan','success','activity','notifications'].includes(scene)?'hill':['home','friends','phone','payment','identity','profile','account','security','privacy','devices','testing'].includes(scene)?'balme':'avenue';
const svgCell=scene=>{
 const {asset,crop,size}=scenes[scene],[x,y,width,height]=crop;
 return `<svg class="bold-figure-image campus-foreground campus-atlas-image" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${crop.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden" aria-hidden="true"><svg class="campus-atlas-cell" x="${x}" y="${y}" width="${width}" height="${height}" style="width:${width}px;height:${height}px" viewBox="${crop.join(' ')}" preserveAspectRatio="none" overflow="hidden"><image href="${asset}" width="${size[0]}" height="${size[1]}"/></svg></svg>`;
};
const decisionSubject=()=>{
 const {asset,size,subjectPath}=scenes.decision;
 // Campus's exact subject silhouette removes the sneakers/laptop thought
 // objects. A CSS path uses the source user coordinates with no URL or ID.
 return `<svg class="bold-figure-image campus-foreground campus-neutral-decision" xmlns="http://www.w3.org/2000/svg" width="512" height="341.333" viewBox="0 0 512 341.333" preserveAspectRatio="xMidYMid meet" overflow="hidden" aria-hidden="true"><svg class="campus-atlas-cell" x="0" y="0" width="512" height="341.333" viewBox="0 0 512 341.333" overflow="hidden"><g transform="translate(0 -369)"><g style="clip-path:path('${subjectPath}')"><image href="${asset}" width="${size[0]}" height="${size[1]}"/></g></g></svg></svg>`;
};
const draw=(scene,kind,compact=false,extra='',tag='figure')=>{
 const chosen=Object.hasOwn(scenes,scene)?scene:'activity',spec=scenes[chosen],campus=campusFor(chosen);
 const tier=compact||compactRoutes.has(kind)?'decision':introRoutes.has(kind)?'intro':'everyday';
 const foreground=chosen==='decision'?decisionSubject():spec.crop?svgCell(chosen):`<img class="bold-figure-image campus-foreground" src="${spec.asset}" width="${spec.size[0]}" height="${spec.size[1]}" alt="" draggable="false" decoding="async">`;
 const safeExtra=String(extra).replace(/[^a-z0-9 _-]/gi,'');
 return `<${tag} class="scene-art scene-editorial scene-legon bold-scene campus-scene bold-scene-${chosen} scene-size-${tier}${tier==='decision'?' scene-compact':''}${safeExtra?' '+E(safeExtra):''}" data-art="campus-${chosen}-v25" data-art-source="campus-pilot-v25" data-master-source="campus-pilot-v25" data-campus="${campus}" data-scene="${chosen}" aria-hidden="true"><span class="legon-backdrop" style="filter:grayscale(1)"><img class="legon-backdrop-image" src="${backgrounds[campus]}" width="1100" height="733" alt="" draggable="false" decoding="async"></span><span class="expressive-figure">${foreground}</span></${tag}>`;
};
const aliases={welcome:'friends',secure:'security',campus:'phone',goals:'plan',story:'plan',bills:'activity',receipt:'account',settings:'phone',pause:'decision',tradeoff:'decision'};
L.campusArt=Object.freeze({source:'campus-pilot-v25',scenes,backgrounds,editorial,serviceAtlas,accountAtlas,serviceSprites,accountSources,sceneFor,draw,resultTx,confirmed,fundingTx,fundingConfirmed,identityApproved});
L.illustration=(kind='home',compact=false)=>{
 const route=Object.hasOwn(L.views||{},L.route)?L.route:kind;
 const scene=route===kind||Object.hasOwn(L.views||{},L.route)?sceneFor(route):aliases[kind]||sceneFor(kind);
 return draw(scene,route,compact);
};
L.contextualIllustration=route=>draw(sceneFor(route),route,compactRoutes.has(route));
L.paymentArt=(kind,extra='')=>{
 const food=String(L.state?.paymentDraft?.category||'').toLowerCase()==='food';
 const key=kind==='campus'?(food?'food':'pay'):kind==='food'?'food':kind==='lumo'?'transfer':Object.hasOwn(serviceSprites,kind)?kind:'activity';
 return draw(key,'payment-'+kind,true,'option-art '+extra,'span');
};
L.accountArt=kind=>draw(Object.hasOwn(accountSources,kind)?kind:'profile','account-'+kind);
})();
