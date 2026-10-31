/* Original editorial illustration atlas for Lumo. No external runtime or artwork requests. */
(()=>{
const tiles={welcome:[0,0],home:[0,0],phone:[0,0],identity:[1,0],secure:[0,0],campus:[0,0],pay:[2,0],funding:[2,0],pause:[0,1],tradeoff:[0,1],goals:[1,1],plan:[2,1],story:[2,1],bills:[2,1],chat:[0,2],help:[0,2],merchant:[1,2],success:[2,2],receipt:[1,0],privacy:[1,0],settings:[0,0]};
// Three editorial sizes. The consequence, not a large picture, leads compact decisions.
const illustrationSize=(kind,compact)=>compact||['pause','decision','tradeoff'].includes(kind)?'scene-size-decision':['welcome','clarity','funding'].includes(kind)?'scene-size-intro':'scene-size-everyday';
// Generated atlas rows vary slightly by column; select each whole subject before fitting it.
const editorialRowCuts=[[0,369,695,1024],[0,366,672,1024],[0,368,668,1024]];
L.atlasScene=(asset,source,destination,id,size)=>{
 const [sx,sy,sw,sh]=source,[dx,dy,dw,dh]=destination,scale=Math.min(dw/sw,dh/sh),tx=dx+(dw-sw*scale)/2-sx*scale,ty=dy+(dh-sh*scale)/2-sy*scale;
 return `<g class="atlas-foreground" transform="translate(${tx} ${ty}) scale(${scale})"><defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}"/></clipPath></defs><g clip-path="url(#${id})"><image href="${asset}" width="${size[0]}" height="${size[1]}"/></g></g>`;
};
// Campus scenery stays inside the illustration; the original drawing remains the foreground.
const campusScenes={welcome:'balme',home:'balme',phone:'balme',identity:'balme',secure:'balme',bank:'balme',receipt:'balme',profile:'balme',account:'balme',security:'balme',privacy:'balme',testing:'balme',devices:'balme',clarity:'hill',pause:'hill',decision:'hill',tradeoff:'hill',goals:'hill',plan:'hill',story:'hill',success:'hill',settings:'hill',notifications:'hill',activity:'hill'};
L.legonCampusFor=kind=>campusScenes[kind]||'avenue';
L.legonBackdrop=(kind,box)=>{
 const [x,y,width,height]=box,campus=L.legonCampusFor(kind),neutral='lumo-legon-neutral-'+String(kind).replace(/[^a-z0-9-]/gi,'-');
 return `<defs><filter id="${neutral}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter></defs><g class="legon-backdrop" opacity=".4" filter="url(#${neutral})"><image href="/assets/legon-${campus}-v21.webp" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMax meet"/></g>`;
};
const category=route=>{
 if(route==='paymentResult'){
  const id=L.params?.id||L.state?.paymentDraft?.submittedTxId,t=L.state?.txs?.find(x=>x.id===id);
  return t?.status==='success'&&(!t.delivery||t.delivery==='delivered')?'success':t?.status==='failed'?'help':'pause';
 }
 if(route==='pending')return 'phone';
 if(/pause/.test(route))return 'pause';if(/merchant|settlement/i.test(route))return 'merchant';
 if(/identity|livecheck|accountReview|application/.test(route))return L.state?.setup?.identityStatus==='approved'?'identity':'phone';
 if(/campus/i.test(route)&&route!=='campusPay')return 'campus';
 if(/pin|signin|recovery|security|devices|setupProgress/i.test(route))return 'secure';if(/phone|otp/.test(route))return 'phone';
 if(/goal|allocate|allocation|releaseGoal|releaseReview/i.test(route))return 'goals';if(/story/.test(route))return 'story';if(/chat/.test(route))return 'chat';
 if(/allowance|essential|firstPlan|firstGoal|plan|makeRoom/i.test(route))return 'plan';if(/addMoney|momoAdd|bankAdd|funding/i.test(route))return 'funding';
 if(/bill/.test(route))return 'bills';if(/help|support|case|feedback/.test(route))return 'help';if(/privacy|dataExport|closeAccount/.test(route))return 'privacy';
 if(/accountReady/.test(route))return 'success';if(/activity|txDetail|statement/.test(route))return 'receipt';
 if(/pay|send|request|campusPay|authorize/i.test(route))return 'pay';if(route==='home')return 'home';return 'settings';
};
L.illustration=(kind='home',compact=false)=>{
 kind=Object.hasOwn(tiles,kind)||['funding','clarity','decision'].includes(kind)?kind:category(kind);
 const size=illustrationSize(kind,compact);
 if(kind==='funding')return `<figure class="scene-art scene-editorial scene-funding scene-legon ${size} ${compact?'scene-compact':''}" data-art="funding-top-up" data-campus="${L.legonCampusFor(kind)}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid meet" overflow="hidden">${L.legonBackdrop(kind,[0,0,1536,1024])}<image href="/assets/lumo-add-money-v22.webp" width="1536" height="1024"/></svg></figure>`;
 if(kind==='clarity')return `<figure class="scene-art scene-editorial scene-clarity scene-legon ${size} ${compact?'scene-compact':''}" data-art="clarity-illumination" data-campus="${L.legonCampusFor(kind)}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid meet" overflow="hidden">${L.legonBackdrop(kind,[0,0,1536,1024])}<image href="/assets/lumo-clarity-v22.webp" width="1536" height="1024"/></svg></figure>`;
 if(kind==='pause'||kind==='decision'){
  // Same recurring seated student as the original trade-off. This path follows only
  // transparent gaps around the subject, omitting the unrelated thought objects.
  const subject='M0 369 H210 V448 H240 V478 H270 V512 H300 V525 H340 V540 H380 V560 H512 V695 H0Z';
  return `<figure class="scene-art scene-editorial scene-decision scene-legon scene-size-decision scene-compact" data-art="decision-neutral" data-campus="hill" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 341.333" preserveAspectRatio="xMidYMid meet" overflow="hidden">${L.legonBackdrop('pause',[0,0,512,341.333])}<defs><clipPath id="lumo-decision-subject" clipPathUnits="userSpaceOnUse"><path d="${subject}"/></clipPath></defs><g class="atlas-foreground" transform="translate(0 -369)"><g clip-path="url(#lumo-decision-subject)"><image href="/assets/lumo-editorial-atlas-v22.webp" width="1536" height="1024"/></g></g></svg></figure>`;
 }
 const k=Object.hasOwn(tiles,kind)?kind:category(kind),[column,row]=tiles[k]||tiles.home;
 const cuts=editorialRowCuts[column],source=k==='success'?[1060,668,476,356]:[column*512,cuts[row],512,cuts[row+1]-cuts[row]],clip='lumo-art-'+k;const viewX=k==='pay'?-16:0,viewWidth=k==='merchant'||k==='pay'?544:512,clipX=k==='success'?26:0,clipWidth=k==='success'?486:512;
 return `<figure class="scene-art scene-editorial scene-legon ${size} ${compact?'scene-compact':''} scene-${k}" data-art="editorial-${column}-${row}" data-campus="${L.legonCampusFor(k)}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} 0 ${viewWidth} 341.333" role="presentation" preserveAspectRatio="xMidYMid meet" overflow="hidden"><defs><clipPath id="${clip}"><rect x="${clipX}" y="5" width="${clipWidth}" height="331"/></clipPath></defs><g clip-path="url(#${clip})">${L.legonBackdrop(k,[viewX,0,viewWidth,341.333])}${L.atlasScene('/assets/lumo-editorial-atlas-v22.webp',source,[clipX,5,clipWidth,331],'lumo-editorial-subject-'+k,[1536,1024])}</g></svg></figure>`;
};
const shortSub={
 balances:'Your account and your plan.',plan:'Plan a little. Live a little.',allowance:'An estimate is enough.',essentials:'Keep the basics covered.',essentialEdit:'The full cost, including what’s covered.',goals:'Something worth aiming for.',goal:'Your money, with a purpose.',goalEdit:'Make it personal.',allocate:'Choose an amount.',allocationReview:'Check your new allocation.',releaseGoal:'Your plan can change.',releaseReview:'Review, then confirm.',makeRoom:'Adjust the plan. Keep the choice.',story:'Your confirmed spending.',storyTx:'The detail behind the number.',chat:'What’s on your mind?',missions:'Small steps count.',notifications:'The things to know.',feedback:'Honest is useful.',profile:'Make yourself at home.',profileEdit:'Your public details.',profilePhone:'Confirm your new number.',security:'Keep your account yours.',devices:'Review your devices.',privacy:'Your information. Your choice.',notificationPrefs:'Choose your nudges.',accountInfo:'Your Lumo details.',statements:'Choose a period.',dataExport:'Download your information.',help:'Find the next step.',supportCase:'Tell us what happened.',caseDetail:'Keep the same reference.',merchant:'Your counter, ready.',merchantCollect:'One bill. One payment.',merchantApply:'Set up your business.',settlements:'Track collections and payouts.',testing:'Your testing guide.',pauseDemo:'Explore sample payment decisions.'
};
// A screen owns its copy and disclosures. Add a fallback only if it omits a subtitle.
const originalHeader=L.header;L.header=(title,sub)=>originalHeader(title,sub===undefined?(shortSub[L.route]||''):sub);
L.decorateView=(html,route)=>{
 if(route==='welcome')return html.replace(/<div class="illustration welcome-illustration"[^>]*>[\s\S]*?<\/svg><\/div>/,`<div class="illustration welcome-illustration">${L.illustration('welcome')}</div>`);
 if(/\bclass=(['"])[^'"]*\bscene-art\b[^'"]*\1/.test(html)||/\bdata-art=/.test(html)||html.includes('data-illustrated-screen'))return html;
 const art=L.contextualIllustration?.(route)||L.illustration(category(route),['paymentReview','authorize','pause','txDetail'].includes(route));
 const point=html.indexOf('<h1');
 if(point>=0)return html.slice(0,point)+art+html.slice(point);
 const subpoint=html.indexOf('<h2');if(subpoint>=0)return html.slice(0,subpoint)+art+html.slice(subpoint);
 return art+html;
};
})();
