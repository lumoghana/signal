/* Short tasks run over one of Lumo's five retained primary destinations.
   The existing payment engine, draft, review checks and authorisation own money.
   This controller changes only where those existing screens are mounted. */
(()=>{
'use strict';
if(!window.L||L.taskSheet)return;
const families=Object.freeze({
 payment:Object.freeze(['sendOptions','campusPay','send','bill','paymentReview','pause','paymentPlanLink','authorize','paymentResult','paymentCancel']),
 funding:Object.freeze(['addMoney','momoAdd','bankAdd','budgetAfterFunding']),
 plan:Object.freeze(['planBenefit','planEdit','planSetup','firstEssentials','firstGoal','firstPlanReview','planPeriod','allowance','essentials','essentialEdit','goals','goal','goalEdit','allocate','allocationReview','releaseGoal','releaseReview','boxProtectionInvite','boxProtectionChange','boxProtectionSupport','makeRoom','missions']),
 records:Object.freeze(['balances','txDetail','pending','requests','requestCreate','requestDetail','requestConfirm','storyTx','chatCalculation','chatBankingActions','planExplanation','homeMoneyStory','categoryEdit','categorySort','categoryMatch']),
 account:Object.freeze(['profile','profileEdit','profilePhone','accountInfo','accountTerms','statements','security','changePin','devices','privacy','dataExport','notificationPrefs','notifications','closeAccount']),
 support:Object.freeze(['help','supportCase','caseDetail','feedback','actionConfirm'])
});
const routeFamily=new Map(Object.entries(families).flatMap(([kind,routes])=>routes.map(route=>[route,kind])));
const taskRoutes=new Set(routeFamily.keys()),paymentRoutes=new Set(families.payment);
const draftRoutes=new Set(families.payment.filter(route=>!['campusPay','sendOptions'].includes(route)));
const parents=new Set(['home','pay','plan','chat','more']);
const parentLabels={home:'Home',pay:'Pay',plan:'Plan',chat:'Chats',more:'You'};
const treatments=Object.freeze({
 selection:Object.freeze(['chatBankingActions','sendOptions','campusPay','addMoney','planEdit','essentials','goals','makeRoom','requests','pending','help']),
 edit:Object.freeze(['send','bill','planPeriod','allowance','essentialEdit','goalEdit','allocate','releaseGoal','storyTx','categoryEdit','categorySort','categoryMatch','profileEdit','privacy','notificationPrefs']),
 detail:Object.freeze(['bankAdd','budgetAfterFunding','planBenefit','goal','missions','balances','txDetail','requestDetail','profile','accountInfo','accountTerms','notifications','chatCalculation','planExplanation','homeMoneyStory']),
 pause:Object.freeze(['pause']),
 confirmation:Object.freeze(['paymentReview','authorize','paymentResult','paymentCancel','allocationReview','releaseReview','boxProtectionInvite','boxProtectionChange','firstPlanReview','requestConfirm','actionConfirm']),
 form:Object.freeze(['momoAdd','planSetup','firstEssentials','firstGoal','requestCreate','profilePhone','statements','security','changePin','devices','dataExport','closeAccount','supportCase','caseDetail','boxProtectionSupport','feedback'])
});
const customLabels=new Map();
const routeTreatment=new Map(Object.entries(treatments).flatMap(([treatment,routes])=>routes.map(route=>[route,treatment])));
const treatmentFor=route=>{
 if(route==='momoAdd')return L.state.fundingDraft?.txId||L.state.fundingDraft?.stage==='review'?'confirmation':'form';
 if(route==='requestCreate'&&L.state.requestDraft?.stage==='review')return 'confirmation';
 if(route==='send'&&!paymentDraft()?.name)return paymentDraft()?.method==='lumo'?'selection':'form';
 if(route==='bill'&&!paymentDraft()?.checked)return 'form';
 return routeTreatment.get(route)||'form';
};
const coverage=Object.freeze({get parents(){return Object.freeze([...parents]);},families,treatments,fullPages:Object.freeze(['activity','story','chat','welcome','samplePause','phone','otp','identity','livecheck','identityResult','campus','campusStatus','pilotUnavailable','campusInterest','campusInterestSaved','pin','confirmPin','accountReview','applicationStatus','applicationCorrection','accountReady','setupChoice','setupProgress','signin','recovery','recoveryReplacement','recoveryOwnership','recoveryStatus','privacyNotice','merchant','merchantApply','merchantDestination','merchantCollect','merchantCollection','merchantPayer','merchantSales','settlements','settlementDetail'])});
const original={go:L.go,render:L.render,back:L.back,openTab:L.openTab,syncBrowser:L.syncBrowser,openPayTab:L.openPayTab,finishPayment:L.finishPayment,clearFormDraft:L.clearFormDraft,fundingDone:L.fundingDone};
let active=null,closing=null,sequence=0,restoring=false;
const closed=new Map(),sessionForms=new Map();
let formAccount=L.state;
const checkFormAccount=()=>{if(formAccount!==L.state){sessionForms.clear();formAccount=L.state;}};
const clone=value=>{try{return JSON.parse(JSON.stringify(value));}catch{return value;}};
const accountMark=()=>{const s=L.state,p={...s.profile};delete p.pin;return JSON.stringify([s.balance,(s.txs||[]).map(t=>[t.id,t.status,t.delivery,t.amount,t.category]),s.essentials,s.goals,s.virtualCards,s.allowance,s.planHorizon,s.planSaved,s.planDraft,s.planPeriodDraft,s.firstBudgetPayoff,s.moneyBoxProtection,p,s.prefs,s.accountPrefs,s.devices,s.cases,s.closure,s.closed,s.locked,s.requests,s.feedback,s.paymentDraft?.id,s.paymentDraft?.amount,s.paymentDraft?.essentialId,s.paymentDraft?.submittedTxId,s.fundingDraft?.id,s.fundingDraft?.amount,s.fundingDraft?.txId,s.fundingDraft?.stage,s.bankFunding?.id,s.bankFunding?.txId]);};
const browserState=()=>({lumo:true,route:L.route,params:clone(L.params||{}),stack:clone(L.history||[])});
const canStart=()=>{
 const view=document.getElementById('view'),app=document.getElementById('app');
 // Sheets progressively enhance a mounted application tree. Environments that
 // expose only the existing string renderer retain the complete page journeys.
 return parents.has(L.route)&&L.state.onboarded&&!L.state.locked&&!L.state.closed&&!!view&&!!app&&view.parentElement===app&&typeof app.append==='function'&&typeof view.querySelectorAll==='function'&&typeof document.createElement==='function';
};
const paymentDraft=()=>L.state.paymentDraft||null;
const ownsDraft=task=>!!(task?.draftId&&paymentDraft()?.id===task.draftId);
const unsubmitted=task=>ownsDraft(task)&&!paymentDraft().submittedTxId;
const routeIsTask=route=>taskRoutes.has(route);
const ownsSubmittedPayment=task=>ownsDraft(task)&&!!paymentDraft()?.submittedTxId;
const formKey=(route=L.route,params=L.params)=>route+'|'+JSON.stringify([params?.id||'',params?.reference||'',params?.txId||'',params?.kind||'']);
// Existing plan/payment drafts remain authoritative. These additional forms did
// not previously have drafts; retain only ordinary text fields in this session.
const sessionFormRoutes=new Set(['profileEdit','profilePhone','supportCase','caseDetail','statements','dataExport','changePin','devices']);
const captureSessionForm=()=>{
 checkFormAccount();
 if(!active||L.skipFormCapture||!sessionFormRoutes.has(L.route))return;
 const key=formKey();
 if(active.renderMark!==undefined&&active.renderMark!==accountMark()){sessionForms.delete(key);return;}
 const fields=[...active.body.querySelectorAll('input,select,textarea')].filter(el=>el.id&&el.type!=='password'&&!/pin|otp|verification|password|code/i.test(el.id));
 if(fields.length)sessionForms.set(key,fields.map(el=>({id:el.id,value:el.value,checked:el.checked})));
};
const restoreSessionForm=()=>{checkFormAccount();for(const entry of sessionForms.get(formKey())||[]){const el=document.getElementById(entry.id);if(el){el.value=entry.value;if(typeof entry.checked==='boolean')el.checked=entry.checked;}}};
const captureTaskForm=()=>{
 // Capture the last focused ordinary field even if a change event has not yet
 // fired. The existing input handler owns allowed fields and excludes secrets.
 if(active&&['momoAdd','requestCreate'].includes(L.route))for(const field of active.body.querySelectorAll('input,select,textarea'))L.capturePaymentInput?.({target:field});
 L.savePaymentFields?.();L.captureFormDraft?.();captureSessionForm();
};
L.views.sendOptions=()=>L.header('Send money','Choose where your money is going.')+`<div class="destination-list">${L.row('To a Lumo user','Find a friend by name or handle','user',"L.startSend('lumo')")}${L.row('To mobile money','Check the wallet before you pay','phone',"L.startSend('momo')")}${L.row('To a bank account','Confirm the account name first','bank',"L.startSend('bank')")}</div><p class="preview-boundary">Sample money · No live transfers</p>`;
const focus=el=>{if(el?.isConnected!==false&&!el?.disabled)el?.focus?.({preventScroll:true});};
const rememberAttribute=(el,name)=>({present:el.hasAttribute?.(name)||false,value:el.getAttribute?.(name)});
const restoreAttribute=(el,name,snapshot)=>{if(snapshot?.present)el.setAttribute?.(name,snapshot.value??'');else el.removeAttribute?.(name);};
const frame=fn=>typeof requestAnimationFrame==='function'?requestAnimationFrame(fn):setTimeout(fn,0);
const writeBrowser=(state,mode='replace')=>{try{window.history?.[mode==='push'?'pushState':'replaceState']?.(state,'');L.browserReady=true;}catch{}};
const snapshotBackground=el=>({el,inert:!!el.inert,inertAttribute:rememberAttribute(el,'inert'),aria:rememberAttribute(el,'aria-hidden'),hidden:el.hidden});
const setBackgroundInert=snapshot=>{snapshot.el.inert=true;snapshot.el.setAttribute?.('inert','');snapshot.el.setAttribute?.('aria-hidden','true');};
const releaseBackground=snapshot=>{snapshot.el.inert=snapshot.inert;restoreAttribute(snapshot.el,'inert',snapshot.inertAttribute);restoreAttribute(snapshot.el,'aria-hidden',snapshot.aria);snapshot.el.hidden=snapshot.hidden;};
function measureContent(task){
 if(active!==task)return;
 const screen=task.body.querySelector('.screen'),headerHeight=task.header.getBoundingClientRect?.().height||task.header.offsetHeight||0;
 const contentHeight=screen?.scrollHeight||screen?.getBoundingClientRect?.().height||task.body.scrollHeight||0;
 const viewportHeight=window.visualViewport?.height||window.innerHeight||800;
 const computed=window.getComputedStyle?.(task.dialog),maxHeight=Number.parseFloat(computed?.maxHeight||computed?.getPropertyValue?.('max-height'));
 const available=Number.isFinite(maxHeight)&&maxHeight>0?Math.min(viewportHeight,maxHeight):viewportHeight;
 // CSS owns auto height and its viewport cap. These values are diagnostics,
 // never an imposed height, so a short choice remains a naturally short sheet.
 const values={'--task-content-height':Math.ceil(headerHeight+contentHeight)+'px','--task-body-content-height':Math.ceil(contentHeight)+'px','--task-available-height':Math.ceil(available)+'px'};
 for(const [name,value]of Object.entries(values))if(task.measureValues?.[name]!==value)task.layer.style?.setProperty?.(name,value);
 task.measureValues=values;
 const overflow=contentHeight>Math.max(0,available-headerHeight)+2||task.body.scrollHeight>(task.body.clientHeight||available-headerHeight)+2;
 const state=overflow?'true':'false';
 if(task.dialog.getAttribute('data-sheet-overflow')!==state){task.dialog.setAttribute('data-sheet-overflow',state);task.layer.setAttribute('data-sheet-overflow',state);}
}
function scheduleMeasure(task=active){
 if(!task||active!==task||task.measureQueued)return;
 task.measureQueued=true;frame(()=>{task.measureQueued=false;measureContent(task);});
}
function observeContent(task){
 if(active!==task)return;
 const screen=task.body.querySelector('.screen');
 if(typeof ResizeObserver==='function'){
  if(!task.contentObserver)task.contentObserver=new ResizeObserver(()=>scheduleMeasure(task));
  if(task.observedScreen!==screen){task.contentObserver.disconnect();task.contentObserver.observe(task.header);task.contentObserver.observe(task.body);if(screen)task.contentObserver.observe(screen);task.observedScreen=screen;}
 }
 scheduleMeasure(task);
}
const updateViewport=()=>{
 const task=active;if(!task)return;
 const viewport=window.visualViewport,rect=task.app.getBoundingClientRect?.();
 const height=viewport?.height||window.innerHeight||document.documentElement?.clientHeight||800;
 const top=viewport?.offsetTop||0;
 task.layer.style?.setProperty?.('--task-viewport-height',height+'px');
 task.layer.style?.setProperty?.('--task-viewport-top',top+'px');
 if(rect){task.layer.style?.setProperty?.('--task-app-left',rect.left+'px');task.layer.style?.setProperty?.('--task-app-width',rect.width+'px');}
 const editable=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');
 if(!editable)task.unobscuredHeight=Math.max(height,window.innerHeight||height);
 const keyboard=editable&&Math.max((window.innerHeight||height)-height,(task.unobscuredHeight||height)-height)>100;
 task.layer.classList?.toggle?.('task-keyboard-open',keyboard);
 if(keyboard)document.activeElement?.scrollIntoView?.({block:'nearest',behavior:'auto'});
 scheduleMeasure(task);
};
const chrome=()=>{
 if(!active)return;
 const route=L.route,kind=routeFamily.get(route)||active.kind;
 const labels={chatBankingActions:'Chat actions',sendOptions:'Send money',campusPay:'Campus Pay',send:paymentDraft()?.name?'Payment amount':'Send money',bill:paymentDraft()?.checked?'Payment amount':'Bills & top-ups',paymentReview:'Review payment',pause:'A Pause Moment',paymentPlanLink:'Link a budget item',authorize:'Authorise payment',paymentResult:'Payment result',paymentCancel:'Leave this payment?',budgetAfterFunding:'Your money is ready',addMoney:'Add money',momoAdd:'Mobile money top-up',bankAdd:'Bank receiving details',planBenefit:'How your budget works',planEdit:'Edit your budget',planSetup:'Expected money · optional',firstEssentials:'Budget costs',firstGoal:'Money Boxes',firstPlanReview:'Review your budget',planPeriod:'Budget period',allowance:'Expected allowance',essentials:'Your budget',essentialEdit:L.params.id?'Edit Budget item':'Add a Budget item',goals:'Your Money Boxes',goal:'Your Money Box',goalEdit:L.params.id?'Edit Money Box':'Add a Money Box',allocate:'Fund Money Box',allocationReview:'Review Money Box transfer',releaseGoal:'Transfer back',releaseReview:'Review transfer back',boxProtectionInvite:'Partner invitation',boxProtectionChange:'Change protection',boxProtectionSupport:'Money Box support',makeRoom:'Make room for your budget',missions:'Your milestones',balances:'Balance details',txDetail:'Payment record',pending:'Pending payments',requests:'Money requests',requestCreate:'Request money',requestDetail:'Money request',requestConfirm:'Review request choice',categoryEdit:'Payment category',categorySort:'Sort payments',categoryMatch:'Choose payment',storyTx:'Payment category',profile:'Your profile',profileEdit:'Edit profile',profilePhone:'Change phone number',accountInfo:'Your account',accountTerms:'Account terms',statements:'Statements',security:'Security',changePin:'Change your PIN',devices:'Your devices',privacy:'Privacy',dataExport:'Your data',notificationPrefs:'Notification preferences',notifications:'Your updates',closeAccount:'Account closure',help:'Help & support',supportCase:'Save a support report',caseDetail:'Your support report',feedback:'Your feedback',actionConfirm:'Confirm your choice'};
 const state={campusPay:'merchant',send:'entry',bill:'entry',paymentReview:'review',pause:'pause',paymentPlanLink:'plan-link',authorize:'authorize',paymentResult:'result',paymentCancel:'cancel',requestConfirm:'review',allocationReview:'review',releaseReview:'review',firstPlanReview:'review',actionConfirm:'review'}[route]||(['records','account'].includes(kind)?'record':kind==='funding'?'entry':kind==='support'?'form':'form');
 active.kind=kind;active.layer.setAttribute('data-task-kind',kind);active.dialog.setAttribute('data-task-kind',kind);
 active.treatment=treatmentFor(route);active.layer.setAttribute('data-sheet-treatment',active.treatment);active.dialog.setAttribute('data-sheet-treatment',active.treatment);
 active.layer.setAttribute('data-task-route',route);active.dialog.setAttribute('data-step',route);active.dialog.setAttribute('data-sheet-state',state);
 const transfer=paymentDraft()?.method==='box';
 const transferLabel=transfer?{send:'Transfer amount',paymentReview:'Review transfer',authorize:'Authorise transfer',paymentResult:'Transfer result',paymentCancel:'Leave this transfer?'}[route]:'';
 const registeredLabel=customLabels.get(route),customLabel=typeof registeredLabel==='function'?registeredLabel(L.params,L.state):registeredLabel;
 active.title.textContent=customLabel||transferLabel||(route==='homeMoneyStory'?'Your money story':route==='chatCalculation'?'See calculation':route==='planExplanation'?'Your budget, explained':labels[route]||'Your Lumo');
 active.backButton.setAttribute('aria-label',active.depth<=1?'Back to '+parentLabels[active.base.route]:'Previous step');
 const closeLabel='Close '+active.title.textContent;active.closeButton.setAttribute('aria-label',closeLabel);active.backdrop.setAttribute('aria-label',closeLabel);
 const draft=paymentDraft();if(draft&&draftRoutes.has(route))active.draftId=draft.id;
 // A previous result may leave its submitted draft available for its receipt.
 // The merchant picker does not own that draft. Submission belongs only to the
 // currently owned draft, and resets as soon as a new merchant creates one.
 active.submitted=ownsSubmittedPayment(active);
 active.helpButton.hidden=kind==='support'||route==='paymentCancel';
 updateViewport();
};
const makeButton=(className,label,icon,action)=>{
 const button=document.createElement('button');button.type='button';button.className=className+' icon-btn';button.setAttribute('aria-label',label);button.innerHTML=L.icon(icon,22);button.addEventListener('click',action);return button;
};
const attachDrag=(task,header)=>{
 let drag=null;
 const reset=()=>{drag=null;task.layer.classList?.remove('is-dragging');task.dialog.style?.setProperty?.('--task-drag-y','0px');};
 header.addEventListener('pointerdown',event=>{
  if(active!==task||event.isPrimary===false||event.button>0||!Number.isFinite(event.clientY)||event.target?.closest?.('button,input,select,textarea,a,summary,label,[role="button"],[contenteditable]'))return;
  drag={id:event.pointerId,start:event.clientY,distance:0};
  try{header.setPointerCapture?.(event.pointerId);}catch{}
 });
 header.addEventListener('pointermove',event=>{
  if(!drag||active!==task||drag.id!==event.pointerId)return;
  drag.distance=Math.max(0,Math.min(360,event.clientY-drag.start));
  if(drag.distance>3){event.preventDefault?.();task.layer.classList?.add('is-dragging');task.dialog.style?.setProperty?.('--task-drag-y',drag.distance+'px');}
 });
 header.addEventListener('pointerup',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dismiss=drag.distance>=72;
  try{header.releasePointerCapture?.(event.pointerId);}catch{}
  reset();if(dismiss&&active===task)requestClose();
 });
 header.addEventListener('pointercancel',reset);
 header.addEventListener('lostpointercapture',()=>{if(drag)reset();});
};
function begin(startRoute){
 checkFormAccount();
 if(active||!canStart())return false;
 const view=document.getElementById('view'),app=document.getElementById('app');if(!view||!app)return false;
 // The Chat composer is part of a primary page. Capture its unsent draft before
 // #view is handed to the task, in case a saved task later repaints the parent.
 L.captureFormDraft?.();
 const kind=routeFamily.get(startRoute)||'records';
 const task={id:'lumo-task-'+Date.now().toString(36)+'-'+(++sequence),kind,scope:kind,base:{route:L.route,params:clone(L.params||{}),stack:clone(L.history||[])},depth:0,view,app,trigger:document.activeElement,triggerAction:document.activeElement?.getAttribute?.('onclick')||null,scroll:{x:window.scrollX||0,y:window.scrollY||0,view:view.scrollTop||0},mark:accountMark(),refreshOnExit:startRoute!=='campusPay'&&kind==='payment',background:[],bodyOverflow:document.body?.style?.overflow||'',viewStyle:view.getAttribute?.('style'),appRoute:app.getAttribute?.('data-route'),draftId:null};
 const computed=window.getComputedStyle?.(view);
 // Retain the parent's layout when #view becomes the active task outlet.
 if(computed&&view.style){view.style.flex=computed.flex;view.style.minHeight=computed.minHeight;view.style.overflowY=computed.overflowY;view.style.height=computed.height;}
 view.id='task-parent-view';
 // Pay already contains a merchant-code field and an error outlet. Their nodes
 // stay mounted, but their IDs must not shadow the active sheet's same fields.
 task.parentIds=[...view.querySelectorAll('[id]')].map(el=>({el,id:el.id}));
 task.parentIds.forEach(({el,id})=>{el.id=task.id+'-parent-'+id;});
 const layer=document.createElement('div');layer.className='task-sheet-layer';layer.setAttribute('data-task-id',task.id);
 const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='task-sheet-backdrop';backdrop.tabIndex=-1;backdrop.setAttribute('aria-label','Close task');backdrop.addEventListener('click',requestClose);
 const dialog=document.createElement('section');dialog.className='task-sheet';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','task-sheet-title');dialog.tabIndex=-1;
 const header=document.createElement('header');header.className='task-sheet-chrome';
 const grab=document.createElement('span');grab.className='task-sheet-grab';grab.setAttribute('aria-hidden','true');
 const backButton=makeButton('task-sheet-back','Previous step','arrowLeft',()=>L.back());
 const title=document.createElement('h2');title.id='task-sheet-title';title.textContent='Your Lumo';
 const helpButton=makeButton('task-sheet-help','Get help','help',()=>L.go('help',{returnTo:L.route,returnParams:clone(L.params)}));
 const closeButton=makeButton('task-sheet-close','Close task','close',requestClose);
 header.append(grab,backButton,title,helpButton,closeButton);
 const body=document.createElement('div');body.className='task-sheet-body';body.id='view';
 body.addEventListener('input',event=>L.clearFieldError(event.target));
 body.addEventListener('toggle',()=>scheduleMeasure(task),true);body.addEventListener('load',()=>scheduleMeasure(task),true);body.addEventListener('input',()=>scheduleMeasure(task));
 dialog.append(header,body);layer.append(backdrop,dialog);
 task.layer=layer;task.dialog=dialog;task.header=header;task.title=title;task.body=body;task.backButton=backButton;task.helpButton=helpButton;task.closeButton=closeButton;task.backdrop=backdrop;task.unobscuredHeight=window.visualViewport?.height||window.innerHeight||800;
 attachDrag(task,header);
 task.background=[...app.children].map(snapshotBackground);const desktop=document.querySelector?.('.desktop-note');if(desktop)task.background.push(snapshotBackground(desktop));
 task.background.forEach(setBackgroundInert);app.append(layer);active=task;
 app.setAttribute('data-task-open','true');app.setAttribute('data-task-parent',task.base.route);document.body?.classList?.add('task-sheet-open');if(document.body?.style)document.body.style.overflow='hidden';
 frame(()=>{if(active===task){layer.classList?.add('is-ready');updateViewport();}});
 return true;
}
function release(task){
 if(!task)return;
 task.contentObserver?.disconnect();
 // No PIN, password or verification value survives a dismissed task.
 for(const field of task.body.querySelectorAll('input'))if(field.type==='password'||/pin|otp|verification|password/i.test(field.id||''))field.value='';
 task.layer.remove();task.view.id='view';
 task.parentIds.forEach(({el,id})=>{el.id=id;});
 if(task.viewStyle===null||task.viewStyle===undefined)task.view.removeAttribute?.('style');else task.view.setAttribute?.('style',task.viewStyle);
 task.background.forEach(releaseBackground);task.app.removeAttribute('data-task-open');task.app.removeAttribute('data-task-parent');
 if(task.appRoute===null||task.appRoute===undefined)task.app.removeAttribute('data-route');else task.app.setAttribute('data-route',task.appRoute);
 document.body?.classList?.remove('task-sheet-open');if(document.body?.style)document.body.style.overflow=task.bodyOverflow;
 task.view.scrollTop=task.scroll.view;window.scrollTo?.(task.scroll.x,task.scroll.y);
}
function completeHistoryClose(){
 if(!closing)return;
 const operation=closing;closing=null;
 // The base history entry remains intact. A genuinely different destination
 // receives one page entry after all of this task's steps have been removed.
 writeBrowser({lumo:true,...clone(operation.base)},'replace');
 if(operation.final.route!==operation.base.route||JSON.stringify(operation.final.params)!==JSON.stringify(operation.base.params))writeBrowser(operation.final,'push');
 else writeBrowser(operation.final,'replace');
 operation.next?.();
}
function finish(route,params={}){
 const task=active;if(!task)return;
 const finalRoute=route||task.base.route,finalParams=route?params:task.base.params,changed=task.refreshOnExit||accountMark()!==task.mark;
 const oldRoute=L.route;captureTaskForm();L.beforeNavigate?.(finalRoute,finalParams);
 active=null;closed.set(task.id,clone(task.base));release(task);
 if(task.base.route==='home')L.refreshPrivateMoney?.();
 L.route=finalRoute;L.params=clone(finalParams||{});L.history=clone(task.base.stack||[]);
 if(finalRoute!==task.base.route)L.history.push({route:task.base.route,params:clone(task.base.params)});
 // The retained parent needs repainting only after a real draft/status change,
 // or when the user deliberately leaves for another full-page destination.
 if(changed||finalRoute!==task.base.route||JSON.stringify(finalParams)!==JSON.stringify(task.base.params)){
  restoring=true;try{original.render();}finally{restoring=false;}
 }
 L.syncChatBanking?.();
 task.view.scrollTop=finalRoute===task.base.route?task.scroll.view:0;
 if(finalRoute===task.base.route){window.scrollTo?.(task.scroll.x,task.scroll.y);focus(task.trigger?.isConnected!==false?task.trigger:(task.triggerAction?[...task.view.querySelectorAll('button,a,input,summary')].find(el=>el.getAttribute('onclick')===task.triggerAction):null)||task.view.querySelector?.('h1'));}
 const final=browserState();closing={base:task.base,final};
 const distance=Math.min(task.depth,Math.max(0,(window.history?.length||1)-1));
 if(distance>0&&typeof window.history?.go==='function'){
  try{window.history.go(-distance);}catch{completeHistoryClose();}
 }else completeHistoryClose();
 // A route redirect during a guard or payment check is still a real page change.
 if(oldRoute==='authorize')task.body.querySelector?.('#payment-pin')?.setAttribute?.('value','');
}
function requestClose(){
 if(!active)return;
 captureTaskForm();
 // Leaving a top-up uses its existing return path. A pending incoming credit
 // remains pending, and funding started from payment review returns there.
 if(active.kind==='funding'){
  const returnTo=L.state.fundingReturn;
  if(returnTo&&taskRoutes.has(returnTo))return original.fundingDone?.();
  L.state.fundingReturn=null;L.save();finish();return;
 }
 if(unsubmitted(active)){
  if(L.route!=='paymentCancel')L.go('paymentCancel');else focus(active.body.querySelector?.('h1'));
  return;
 }
 finish();
}
L.syncBrowser=function(mode){
 if(restoring)return;
 if(active&&routeIsTask(L.route)){
  if(mode==='push')active.depth++;
  const state=browserState();state.taskSheet={id:active.id,depth:active.depth,kind:active.kind,scope:active.scope,base:clone(active.base)};writeBrowser(state,mode);return;
 }
 return original.syncBrowser?.(mode);
};
L.render=function(...args){
 checkFormAccount();
 if(!active)return original.render.apply(this,args);
 L.guard?.();
 if(!routeIsTask(L.route)){
  const route=L.route,params=L.params;finish(route,params);return;
 }
 const task=active,scrollTo=window.scrollTo;
 // Core's full-page renderer resets window scroll. Only the task body should
 // reset between its steps; the mounted page underneath must stay still.
 try{window.scrollTo=()=>{};}catch{}
 try{original.render.apply(this,args);}finally{try{window.scrollTo=scrollTo;}catch{}}
 if(active!==task)return;
 restoreSessionForm();
 const nav=task.background.find(s=>s.el.id==='nav');if(nav)nav.el.hidden=nav.hidden;
 chrome();observeContent(task);task.renderMark=accountMark();
};
L.go=function(route,params={}){
 // A native history traversal completes asynchronously. Keep a newly requested
 // task/page behind that traversal so its popstate cannot close the new task.
 if(closing){closing.next=()=>L.go(route,params);return;}
 if(!active&&canStart()&&taskRoutes.has(route))begin(route);
 if(active)captureSessionForm();
 if(active&&!routeIsTask(route)){
  // Keeping, discarding or deferring a draft returns to the page that launched
  // this task. Existing Done deliberately returns to Home.
  const returnToParent=route===active.base.route||route==='home'&&active.base.route==='chat'&&L.route==='paymentResult'||['home','pay'].includes(route)&&['paymentCancel','pause'].includes(L.route)||['home','plan'].includes(route)&&active.kind==='plan'||parents.has(route)&&active.kind==='funding';
  finish(returnToParent?null:route,returnToParent?{}:params);return;
 }
 return original.go.call(this,route,params);
};
L.openTab=function(route){
 if(closing){closing.next=()=>L.openTab(route);return;}
 if(active){captureTaskForm();if(unsubmitted(active)){requestClose();return;}finish(route,{});return;}
 return original.openTab.apply(this,arguments);
};
L.openPayTab=function(tab){
 if(tab==='campus'&&canStart())return L.go('campusPay');
 if(tab==='send'&&canStart())return L.go('sendOptions');
 return original.openPayTab?.apply(this,arguments);
};
L.back=function(){
 if(closing){closing.next=()=>L.back();return;}
 if(!active)return original.back.apply(this,arguments);
 captureTaskForm();
 if(paymentRoutes.has(L.route)&&ownsSubmittedPayment(active)){finish();return;}
 if(active.depth>1&&typeof window.history?.back==='function'&&window.history?.state?.taskSheet?.id===active.id){window.history.back();return;}
 if(active.depth>1){
  const previous=L.history.pop();if(previous&&taskRoutes.has(previous.route)){L.beforeNavigate?.(previous.route,previous.params||{});L.route=previous.route;L.params=previous.params||{};active.depth--;L.render();return;}
 }
 requestClose();
};
L.finishPayment=function(){
 if(!active)return original.finishPayment?.apply(this,arguments);
 // Keep the existing draft-cleanup action. Its existing L.go('home') is routed
 // by the task controller; no second debit or result is manufactured here.
 return original.finishPayment?.apply(this,arguments);
};
L.clearFormDraft=function(route=L.route,params=L.params){sessionForms.delete(formKey(route,params));return original.clearFormDraft?.apply(this,arguments);};
// Capture is intentional: core's page-only popstate handler would otherwise
// replace the retained parent. Browser Back and Forward use the same task steps.
window.addEventListener?.('popstate',event=>{
 const state=event.state;
 if(closing){event.stopImmediatePropagation?.();completeHistoryClose();return;}
 const sheet=state?.taskSheet;
 if(active){
  event.stopImmediatePropagation?.();captureTaskForm();
  if(paymentRoutes.has(L.route)&&ownsSubmittedPayment(active)){active.depth=sheet?.id===active.id?sheet.depth:0;finish();return;}
  if(sheet?.id===active.id&&taskRoutes.has(state.route)){
   L.beforeNavigate?.(state.route,state.params||{});active.depth=sheet.depth;L.route=state.route;L.params=state.params||{};L.history=state.stack||[];L.render();return;
  }
  // Browser Back at the first task step is a close request. Unsaved payment
  // choices remain explicit rather than silently throwing the draft away.
  active.depth=0;
  if(unsubmitted(active)){
   L.route=active.base.route;L.params=clone(active.base.params);L.history=clone(active.base.stack);L.go('paymentCancel');
  }else finish();
  return;
 }
 if(sheet&&closed.has(sheet.id)){
  event.stopImmediatePropagation?.();const base=closed.get(sheet.id);L.beforeNavigate?.(base.route,base.params||{});L.route=base.route;L.params=clone(base.params||{});L.history=clone(base.stack||[]);L.render();writeBrowser(browserState());
 }
},true);
const focusable=()=>active?[...active.dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')].filter(el=>{
 if(el.disabled||el.hidden||el.tabIndex<0||el.getAttribute?.('aria-hidden')==='true'||el.closest?.('[hidden],[inert]'))return false;
 // This excludes controls hidden by the sheet's compact header styling and
 // by closed native <details>, while retaining non-layout test environments.
 return typeof el.getClientRects!=='function'||el.getClientRects().length>0;
}):[];
document.addEventListener?.('keydown',event=>{
 if(!active)return;
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();requestClose();return;}
 if(event.key!=='Tab')return;
 const controls=focusable();if(!controls.length){event.preventDefault();focus(active.dialog);return;}
 const first=controls[0],last=controls[controls.length-1],current=document.activeElement;
 if(event.shiftKey&&(current===first||!active.dialog.contains(current))){event.preventDefault();focus(last);}
 else if(!event.shiftKey&&(current===last||!active.dialog.contains(current))){event.preventDefault();focus(first);}
},true);
document.addEventListener?.('focusin',event=>{if(active&&!active.dialog.contains(event.target)){focus(active.dialog.querySelector?.('h1')||active.backButton);}else if(active)frame(updateViewport);});
window.addEventListener?.('resize',updateViewport);window.visualViewport?.addEventListener?.('resize',updateViewport);window.visualViewport?.addEventListener?.('scroll',updateViewport);
L.closeCampusPay=requestClose;
L.closeTask=requestClose;
L.taskSheet={
 registerParent(route,label){
  if(typeof route!=='string'||!/^[A-Za-z][A-Za-z0-9]*$/.test(route)||typeof L.views[route]!=='function'||typeof label!=='string'||!label.trim())throw Error('Invalid task parent');
  if(parents.has(route))return false;
  parents.add(route);parentLabels[route]=label.trim();return true;
 },
 register(route,{family='records',treatment='detail',label='Your Lumo'}={}){
  if(typeof route!=='string'||!/^[A-Za-z][A-Za-z0-9]*$/.test(route)||!Object.hasOwn(families,family)||!Object.hasOwn(treatments,treatment))throw Error('Invalid task registration');
  if(routeFamily.has(route))return false;
  routeFamily.set(route,family);taskRoutes.add(route);routeTreatment.set(route,treatment);customLabels.set(route,label);
  if(['edit','form'].includes(treatment))sessionFormRoutes.add(route);
  return true;
 },
 get active(){return !!active;},get step(){return active?L.route:null;},get kind(){return active?.kind||null;},get treatment(){return active?.treatment||null;},get scope(){return active?.scope||null;},get parentRoute(){return active?.base.route||null;},get baseRoute(){return active?.base.route||null;},coverage,
 open(routeOrParams='campusPay',params={}){return typeof routeOrParams==='string'?L.go(routeOrParams,params):L.go('campusPay',routeOrParams);},close:requestClose,back(){return L.back();}
};
})();
