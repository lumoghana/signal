/* LOCAL QA ONLY. Generate inert, static snapshots from the shipped views for
   real-browser geometry inspection. The JSON is temporary and must not ship.
   This does not establish live navigation, keyboard or payment correctness. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist');
const output=path.join(root,'layout-fixtures.json');
const epoch=Date.now(),future=new Date(epoch+14*86400000).toISOString(),day=future.slice(0,10);
const baseName='Kwame Mensah';
const longName='Kwame Ofori Boadu Mensah Asante Boateng';
const longCost='Food, groceries and transport between residence and university lectures';
const longBox='Laptop, books and equipment for my final university research project';
const longRef='LUMO-SAMPLE-20261022-REFERENCE-WITH-A-LONG-UNBROKEN-COMPONENT-1234567890';
const parents=new Set(['home','pay','plan','chat','more']);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function serialize(node){
 if(node.nodeType===3)return node.text;
 const attrs={...node.attributes};
 for(const key of ['hidden','inert','disabled']){if(node[key])attrs[key]='';else delete attrs[key];}
 if(node.localName==='input'){attrs.value=node.value;if(node.checked)attrs.checked='';else delete attrs.checked;}
 if(node.localName==='option'&&node.parentElement?.localName==='select'){if(node.value===node.parentElement.value)attrs.selected='';else delete attrs.selected;}
 const dynamic=Object.entries(node.style||{}).filter(([k,v])=>typeof v==='string'&&!['setProperty','removeProperty'].includes(k)).map(([k,v])=>`${k.startsWith('--')?k:k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${v}`).join(';');
 if(dynamic)attrs.style=(attrs.style?attrs.style+';':'')+dynamic;
 const start='<'+node.localName+Object.entries(attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('')+'>';
 if(voids.has(node.localName))return start;
 const children=node.localName==='textarea'?esc(node.value):(node.childNodes||[]).map(serialize).join('');
 return start+children+'</'+node.localName+'>';
}
function fixture(){
 const h=createHarness({clock:true,testing:true,reducedMotion:true,viewportWidth:360,viewportHeight:640}),{L}=h;
 h.context.setInterval=()=>0;h.context.clearInterval=()=>{};
 L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'qa-food',name:'Food and groceries',amount:250,paid:0},{id:'qa-transport',name:'Transport',amount:100,paid:0}],goals:[{id:'qa-box',name:'Laptop',target:3500,date:day,allocated:100,boxVersion:2}],planSaved:true,planHorizon:{mode:'date',date:day},allowance:{amount:600,date:day,source:'Family'},chats:[],requests:[],cases:[]});
 Object.assign(L.state.profile,{name:baseName,displayName:baseName,phone:'0241230123',pin:'123456',campus:'University of Ghana',email:'kwame@example.test',address:'Hall 2, Legon'});
 Object.assign(L.state.setup,{phoneConfirmed:true,phone:'0241230123',otpPhone:'0241230123',otpPurpose:'signup',otpExpires:epoch+300000,otpWait:epoch+30000,identityStatus:'approved',identityAcknowledged:true,identityDetailsReviewed:true,campusStatus:'approved',securitySaved:true,verifiedName:baseName,verifiedIdentity:{name:baseName,dateOfBirth:'2004-03-12',ghanaCard:'GHA-000000000-0'},applicationRef:'APP-SAMPLE-20261022-001',applicationStatus:'pending',interest:{campus:'Ashesi University',email:'student@example.test'},recovery:{status:'pending',kind:'pin',reference:'REC-SAMPLE-001'}});
 L.state.merchant={approved:true,name:'Akua’s Kitchen',application:{id:'BIZ-SAMPLE-001',status:'Demo approved'},destination:{institution:'Sample bank',name:'Akua’s Kitchen',number:'•••• 4721',verified:true},roleTerms:true,collections:[{id:'QA-SALE',amount:80,fee:0,status:'Waiting for customer',created:'22 Oct 2026, 12:00',createdAt:epoch,expires:epoch+900000,payer:'Sample customer'}],settlements:[{id:'QA-SET',gross:80,fees:0,adjustments:0,net:80,status:'Queued',created:'22 Oct 2026, 12:00',destination:{institution:'Sample bank',name:'Akua’s Kitchen',number:'•••• 4721'},sales:['QA-SALE'],attempts:1}],adjustments:[]};
 L.state.txs=[{id:'QA-TX',draftId:'QA-DRAFT-SUBMITTED',date:new Date(epoch).toISOString(),type:'out',name:'Akua’s Kitchen',destination:'AK01',amount:80,fee:0,status:'success',category:'Food',method:'Campus Pay',note:'Lunch on campus'}];
 L.state.requests=[{id:'QA-REQUEST',from:'abena',name:'Abena Asante',handle:'@abena.a',to:'self',amount:45,note:'Our lunch at Akua’s',status:'waiting',created:new Date(epoch).toISOString(),expires:future,demoReceived:true}];
 L.state.cases=[{id:'QA-CASE',type:'Payment support',description:'Please help me understand this payment and its current status.',status:'Saved on device',created:'22 Oct 2026, 12:00',context:{reference:'QA-TX',returnRoute:'txDetail',returnParams:{id:'QA-TX'}},messages:[{from:'You',text:'The amount is still pending. Please check this same reference.',date:'22 Oct 2026, 12:05'}],next:'Not sent to support',demo:true}];
 L.state.paymentDraft={id:'QA-DRAFT',method:'campus',name:'Akua’s Kitchen',provider:'Campus Pay',destination:'AK01',merchantId:'AK01',amount:80,fee:0,essentialId:'',note:'Lunch',checked:true,pinAttempts:0};
 L.state.statement={id:'STMT-SAMPLE-001',from:'2026-10-01',to:'2026-10-22',status:'Ready',created:'22 Oct 2026, 12:00'};
 L.state.dataExport={id:'DATA-SAMPLE-001',status:'Ready',created:'22 Oct 2026, 12:00'};
 L.state.requestDraft={id:'QA-NEW-REQUEST',amount:45,note:'Our share of lunch',to:'Abena Asante',stage:'form'};
 L.state.bankFunding={id:'QA-BANK-FUNDING',amount:'600',stage:'entry',returnTo:'home'};
 L.state.fundingDraft={id:'QA-FUNDING',amount:'600',stage:'entry',provider:'MTN',owned:true};
 const boundary=h.document.createElement('div');boundary.className='prototype-boundary';boundary.textContent='Sample money · No live payments';h.document.getElementById('app').insertBefore(boundary,h.document.getElementById('nav'));
 // Geometry fixtures deliberately show each requested view template. The real
 // product guard remains tested by journey suites; it is not shipped here.
 L.guard=()=>{};
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
function contextFor(route){
 const values={goal:{id:'qa-box'},goalEdit:{id:'qa-box'},allocate:{id:'qa-box'},allocationReview:{id:'qa-box'},releaseGoal:{id:'qa-box'},releaseReview:{id:'qa-box'},essentialEdit:{id:'qa-food'},storyTx:{id:'QA-TX'},txDetail:{id:'QA-TX'},paymentResult:{id:'QA-TX'},requestDetail:{id:'QA-REQUEST'},requestConfirm:{id:'QA-REQUEST',action:'declined'},caseDetail:{id:'QA-CASE'},merchantCollection:{id:'QA-SALE'},merchantPayer:{id:'QA-SALE'},settlementDetail:{id:'QA-SET'},bill:{kind:'airtime'},categoryEdit:{id:'QA-TX'},chatCalculation:{index:0},supportCase:{reference:'QA-TX',txId:'QA-TX',returnRoute:'txDetail',returnParams:{id:'QA-TX'}},boxProtectionInvite:{id:'qa-box'},boxProtectionChange:{id:'qa-box'},boxProtectionSupport:{id:'qa-box'}};return values[route]||{};
}
function protect(h){const {L}=h;const i=L.boxProtection.beginInvite('qa-box',{phone:'0551234567'});L.boxProtection.acceptInvitation(i.id,i.code);}
function boxDraft(h,amount=80,direction='out'){const{L}=h;L.state.paymentDraft={id:'QA-BOX-DRAFT',method:'box',boxId:'qa-box',boxDirection:direction,name:L.state.goals[0].name,provider:direction==='out'?'Lumo operational account':'Lumo Savings',destination:direction==='out'?L.accountBalances().operationalNumber:L.accountBalances().savingsNumber,amount,fee:0,checked:true,essentialId:'',note:'',pinAttempts:0};}
function chat(h){const{L}=h;L.route='chat';L.params={};L.render();h.set('chatText','Can I spend GH₵280?');L.askChat();h.flush();}
function prepareRoute(h,route){const{L}=h;
 if(['allocationReview','releaseReview','allocate','releaseGoal'].includes(route))boxDraft(h,80,route.startsWith('alloc')?'in':'out');
 if(route==='pause'){L.state.paymentDraft.amount=280;L.state.balance=400;L.pauseEngine.present(L.state.paymentDraft);}
 if(route==='bill')Object.assign(L.state.paymentDraft,{method:'bill',bill:'airtime',provider:'MTN',destination:'0241230123',amount:20,checked:true,name:'Airtime'});
 if(route==='paymentResult')L.state.paymentDraft.submittedTxId='QA-TX';
 if(route==='chatCalculation')chat(h);
 if(route==='boxProtectionInvite'){const i=L.boxProtection.beginInvite('qa-box',{phone:'0551234567'});L.state.moneyBoxProtectionFlow={boxId:'qa-box'};}
 if(route==='boxProtectionChange'){protect(h);const c=L.boxProtection.requestApproval({boxId:'qa-box',kind:'change',newPhone:'0201234567'});L.state.moneyBoxProtectionFlow={boxId:'qa-box',challengeId:c.id};}
 if(route==='boxProtectionSupport'){protect(h);boxDraft(h);const c=L.boxProtection.requestApproval({boxId:'qa-box',kind:'withdrawal',draftId:L.state.paymentDraft.id,amount:80}),s=L.boxProtection.requestSupport(c.id);L.state.paymentDraft.boxApprovalId=c.id;L.state.moneyBoxProtectionFlow={boxId:'qa-box',challengeId:c.id,supportId:s.id,returnRoute:'paymentReview',returnParams:{}};}
 if(route==='actionConfirm'){L.state.paymentDraft=null;L.route='home';L.params={};L.render();L.acct.signout();}
}
function openAllDetails(h){for(const el of h.document.querySelectorAll('details'))el.setAttribute('open','');}
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cssFiles=[...index.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
const probe=fixture(),routes=Object.keys(probe.L.views).sort(),families=probe.L.taskSheet.coverage.families;
const familyFor=route=>Object.keys(families).find(k=>families[k].includes(route))||(parents.has(route)?'primary':'full-page');
const entryFor={payment:'sendOptions',funding:'addMoney',plan:'planEdit',records:'balances',account:'profile',support:'help'};
const fixtures=[];
function capture(route,variant='standard',configure,options={}){
 const h=fixture(),{L}=h;let error=null,mode='mounted',params=contextFor(route);prepareRoute(h,route);if(configure)configure(h,params);
 const family=familyFor(route);
 try{
  // Mount the native surface first, then select the requested template without
  // decision-routing aliases redirecting this visual inventory to another view.
  if(entryFor[family]){L.route='home';L.params={};L.history=[];L.render();L.go(entryFor[family]);}
  if(route==='actionConfirm'){
   // Opening its real action dialog also seeds the private choice callback.
   if(!h.document.getElementById('view').textContent.includes('Sign out')){L.route='home';L.params={};L.render();L.acct.signout();}
  }else{L.route=route;L.params=params;L.render();}
  h.flush();h.advance(4000);h.flush();
  if(L.route!==route||h.errors.length){
   mode='decorated-fallback';L.route=route;L.params=params;
   const markup=L.views[route]();if(typeof markup!=='string')throw Error('View returned '+typeof markup);
   const html=L.decorateView?L.decorateView(markup,route):markup;
   h.document.getElementById('view').innerHTML=`<div class="screen screen-${route}" data-density="comfortable">${html}</div>`;
  }
  if(options.openDetails)openAllDetails(h);
  if(options.error){const e=h.document.getElementById('error');if(e)e.textContent=options.error;}
 }catch(e){error=String(e.stack||e);}
 const app=h.document.getElementById('app');
 // Static audit frames use their own exact geometry, not the miniature DOM's
 // placeholder measurement of a 390px app at x=0.
 for(const layer of app.querySelectorAll('.task-sheet-layer')){layer.style.setProperty('--task-app-left','0px');layer.style.setProperty('--task-app-width','100%');layer.style.setProperty('--task-viewport-height','100dvh');layer.style.setProperty('--task-viewport-top','0px');}
 fixtures.push({id:route+'--'+variant,name:route+' · '+variant,route,variant,family,mode,renderedRoute:L.route,sheet:!!L.taskSheet.active,openDetails:!!options.openDetails,error,renderErrors:[...h.errors],html:serialize(app)});
}
for(const route of routes)capture(route);
const longValues=h=>{const s=h.L.state;s.profile.name=longName;s.profile.displayName=longName;s.profile.campus='Kwame Nkrumah University of Science and Technology, College of Engineering';s.profile.email='kwame.ofori.boadu.mensah.asante.boateng@example.university.test';s.profile.address='Room 108, University Residence, Greater Accra, Ghana';s.essentials[0].name=longCost;s.goals[0].name=longBox;s.balance=999999.99;s.goals[0].allocated=999999.99;s.goals[0].target=1000000;s.txs[0].name=longName;s.txs[0].id=longRef;s.txs[0].amount=5000;s.paymentDraft.name=longName;s.paymentDraft.destination='123456789012345678901234567890';s.paymentDraft.amount=5000;s.paymentDraft.note='Payment for university field research materials and transport across campus';s.requests[0].name=longName;s.requests[0].note='A long explanation of our shared transport and research equipment costs';s.merchant.name='Akua’s Kitchen and Student Food Delivery at the University of Ghana';s.merchant.destination.name=s.merchant.name;};
for(const route of ['home','plan','pay','more','balances','accountInfo','profile','accountReview','identityResult','campus','goal','goals','essentialEdit','essentials','send','paymentReview','authorize','paymentResult','txDetail','requestDetail','merchant','merchantCollection','merchantPayer','settlementDetail','caseDetail'])capture(route,'long-values',(h,p)=>{longValues(h);if(['txDetail','paymentResult'].includes(route))p.id=longRef;},{openDetails:true});
for(const route of ['home','plan','goals','essentials','activity','pending','story','requests','notifications','merchantSales','settlements'])capture(route,'empty',h=>{const s=h.L.state;s.balance=0;s.essentials=[];s.goals=[];s.txs=[];s.requests=[];s.cases=[];s.planSaved=false;s.paymentDraft=null;s.merchant.collections=[];s.merchant.settlements=[];});
for(const status of ['pending','failed','success','reversed'])for(const route of ['paymentResult','txDetail'])capture(route,status,h=>{h.L.state.txs[0].status=status;h.L.state.paymentDraft.submittedTxId='QA-TX';},{openDetails:true});
for(const status of ['pending','attention','linked','refused'])capture('identityResult',status,h=>{h.L.state.setup.identityStatus=status;},{openDetails:true});
for(const status of ['pending','more','refused'])capture('applicationStatus',status,h=>{h.L.state.setup.applicationStatus=status;},{openDetails:true});
for(const status of ['Processing','Unknown','Confirmed','Failed','Expired','Cancelled','Reversed'])capture('merchantCollection',status.toLowerCase(),h=>{h.L.state.merchant.collections[0].status=status;},{openDetails:true});
for(const status of ['Processing','Unknown','Failed','Settled'])capture('settlementDetail',status.toLowerCase(),h=>{h.L.state.merchant.settlements[0].status=status;},{openDetails:true});
for(const status of ['In review','More information needed','Not approved'])capture('merchantApply',status.toLowerCase().replaceAll(' ','-'),h=>{h.L.state.merchant.approved=false;h.L.state.merchant.application.status=status;},{openDetails:true});
capture('chat','conversation',h=>chat(h));capture('chat','long-conversation',h=>{for(let i=0;i<6;i++)chat(h);},{openDetails:true});
capture('chat','opening-expanded',null,{openDetails:true});capture('chatCalculation','expanded',null,{openDetails:true});
for(const status of ['entry','review','pending','failed','success'])capture('momoAdd',status,h=>{const d=h.L.state.fundingDraft;d.stage=status==='entry'||status==='review'?status:'result';if(!['entry','review'].includes(status)){const t={id:'QA-FUNDING-TX',draftId:d.id,date:new Date(epoch).toISOString(),type:'in',name:'Sample mobile money',amount:600,fee:0,status,category:'Funding',method:'Mobile money top-up'};h.L.state.txs.unshift(t);d.txId=t.id;}},{openDetails:true});
capture('bankAdd','expanded',null,{openDetails:true});
capture('paymentReview','protected',(h)=>{protect(h);boxDraft(h);},{openDetails:true});
capture('boxProtectionInvite','expanded',null,{openDetails:true});capture('boxProtectionChange','expanded',null,{openDetails:true});capture('boxProtectionSupport','expanded',null,{openDetails:true});
for(const decision of ['approved','rejected'])capture('boxProtectionSupport',decision,h=>{h.L.boxProtection.simulateSupportDecision(h.L.state.moneyBoxProtectionFlow.supportId,decision,true);},{openDetails:true});
capture('send','validation-error',null,{error:'Choose a valid amount within your available balance before continuing.'});capture('authorize','wrong-pin',null,{error:'That PIN does not match. Please try again.'});
capture('caseDetail','long-thread',h=>{const c=h.L.state.cases[0];c.description='Please help with this sample transaction. '+('A detailed explanation of what happened. '.repeat(45));c.context.reference=longRef;c.messages=Array.from({length:4},(_,i)=>({from:'You',text:'Additional sample context '+i+'. '+('LongUnbrokenReference'.repeat(8)),date:'22 Oct 2026, 12:05'}));},{openDetails:true});
const failures=fixtures.filter(f=>f.error||f.renderErrors.length);
const data={generatedAt:new Date().toISOString(),localOnly:true,notice:'Inert static view snapshots for real-browser geometry auditing. No live payment or interaction claim. Remove this file before packaging.',source:'Actual shipped index modules through tests/helpers/task-sheet-dom.cjs. Guards are disabled only within this local generator to expose every view template; all source calculations and renderers remain unchanged.',viewport:{width:360,height:640},cssFiles,totalRoutes:routes.length,totalFixtures:fixtures.length,failures:failures.map(({id,error,renderErrors})=>({id,error,renderErrors})),fixtures};
fs.writeFileSync(output,JSON.stringify(data));
console.log(JSON.stringify({output,totalRoutes:routes.length,totalFixtures:fixtures.length,fallbacks:fixtures.filter(f=>f.mode!=='mounted').map(f=>f.id),failures:data.failures,size:fs.statSync(output).size},null,2));
if(failures.some(f=>f.error))process.exitCode=1;
