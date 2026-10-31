/* Local layout QA only. Runs in the existing memory-isolated fixture frame. */
(()=>{
'use strict';
const previous=window.__overflowSeed;
const routes=['home','pay','monoMenu','iouHome','iouForm','iouReview','iouDetail','iouRecord','iouRecordReview','iouPayment','iouRequestReview','iouReceipt','iouReceiptReview','allMoney','moneySource','moneySourceReview','moneySourceRemove','recoveryStart','recoveryAdjust','recoveryReview','recoveryPlan','recoveryComplete','paymentReview','pause','authorize'];
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const set=(id,v)=>{const el=document.getElementById(id);if(!el)throw Error('Missing fixture field '+id);el.value=String(v);};
window.__overflowCases=routes.map(route=>({route,variant:route==='pause'?'pause-simple-money-life':'money-life',name:'Money journeys · '+route}));
window.__overflowCases.push(
 {route:'iouDetail',variant:'expected-iou',name:'Expected repayment, never available'},
 {route:'iouHome',variant:'scoped-iou',name:'Named-person IOU records'},
 ...['partial','covered','reopened'].map(state=>({route:'recoveryPlan',variant:'recovery-'+state,name:'Recovery · '+state}))
);
window.__overflowSeed=function(c){
 const result=previous({route:'home',variant:'standard',name:c.name});
 try{
  delete L.state.moneyLife;delete L.state.moneyLifeDrafts;L.state.paymentDraft=null;
  L.state.allowance={amount:1200,date:date(-2),source:'Family'};L.state.planHorizon={mode:'allowance',date:date(-2)};
  L.state.essentials=[{id:'food',name:'Food & groceries',amount:180,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport to lectures',amount:100,paid:0,externalPaid:0,coverageVersion:1},{id:'data',name:'Data for the week',amount:40,paid:0,externalPaid:0,coverageVersion:1}];L.state.balance=240;L.save();
  const G=L.moneyLife,a=G.createDebt({direction:'owe',person:'Abena Asante',amount:80,dueDate:date(3),contactId:'abena',note:'Lunch and course printing'},'fixture-owe'),b=G.createDebt({direction:'owed',person:'Kojo Owusu',amount:100,dueDate:date(2)},'fixture-owed');
  G.manual(a.id,{amount:30,channel:'cash',date:date(-1),key:'fixture-partial'},a.revision);
  G.saveSource({kind:'momo',name:'MTN wallet',amount:280,asOf:date(-2),distinct:true},null,null,'fixture-wallet');G.saveSource({kind:'cash',name:'Cash in my wallet',amount:35,asOf:date(0),distinct:true},null,null,'fixture-cash');
  const source=G.holdings().sources[0],incoming=L.addTx({type:'in',name:'Kojo Owusu',amount:20,fee:0,status:'success',category:'Transfers',method:'Lumo transfer'});
  const go=(route,params={})=>{L.go(route,params);L.render();};
  if(c.variant==='expected-iou')go('iouDetail',{id:b.id});
  else if(c.variant==='scoped-iou'){const reply=L.chatAnswer('How much do I owe Abena?');L.state.chats=[{q:'How much do I owe Abena?',...reply}];L.chatOpenAnswer(0);}
  else if(c.variant.startsWith('recovery-')){
   const input={reviewDate:date(7),adjustments:{},pauseSavings:false},quote=G.recoveryQuote(input),plan=G.applyRecovery(input,quote.signature,'fixture-audit-recovery');
   const amount=c.variant==='recovery-partial'?1:quote.gap+10,t=L.addTx({type:'in',name:'Confirmed sample support',amount,status:'success'});G.finishRecovery(plan.id,t.id);
   if(c.variant==='recovery-reopened')L.addTx({type:'out',name:'Sample expense',amount:11,status:'success'});
   go('recoveryPlan');
  }
  else if(['home','pay'].includes(c.route))L.openTab(c.route);
  else if(c.route==='monoMenu'){L.openTab('home');L.openMonoMenu();}
  else if(c.route==='iouHome')go(c.route);
  else if(['iouForm','iouReview'].includes(c.route)){L.lifeUI.startDebt();set('iou-person','Ama Boateng');set('iou-amount',120);set('iou-date',date(4));L.lifeUI.capture();if(c.route==='iouReview')L.lifeUI.reviewDebt();}
  else if(c.route==='iouDetail'||c.route==='iouPayment')go(c.route,{id:a.id});
  else if(c.route==='iouRequestReview')go(c.route,{id:b.id});
  else if(['iouRecord','iouRecordReview'].includes(c.route)){L.lifeUI.startRecord(a.id);set('iou-repayment',20);L.lifeUI.capture();if(c.route==='iouRecordReview')L.lifeUI.reviewRecord();}
  else if(c.route==='iouReceipt')go(c.route,{id:b.id});
  else if(c.route==='iouReceiptReview')L.lifeUI.chooseReceipt(b.id,incoming.id);
  else if(c.route==='allMoney')go(c.route);
  else if(c.route.startsWith('moneySource')){L.lifeUI.startSource(source.id);if(c.route==='moneySourceReview'){document.getElementById('money-distinct').checked=true;L.lifeUI.reviewSource();}if(c.route==='moneySourceRemove')go(c.route,{id:source.id});}
  else if(c.route.startsWith('recovery')){L.lifeUI.startRecovery();if(c.route!=='recoveryStart')L.lifeUI.recoveryNext();if(['recoveryReview','recoveryPlan','recoveryComplete'].includes(c.route))L.lifeUI.reviewRecovery();if(['recoveryPlan','recoveryComplete'].includes(c.route))L.lifeUI.saveRecovery();if(c.route==='recoveryComplete')go(c.route);}
  else if(['paymentReview','pause','authorize'].includes(c.route)){L.state.balance=500;const large=G.createDebt({direction:'owe',person:'Abena Asante',amount:280,contactId:'abena'},'fixture-native-payment');L.lifeUI.beginPayment(large.id,'lumo');set('payment-amount',c.route==='pause'?280:30);L.reviewTransactionDetails();if(c.route==='authorize')L.continuePayment();}
  L.render();result.actual=L.route;result.renderedView=L.route;result.fallback=L.route!==c.route;result.sheet=L.taskSheet.active;result.errors=[];
 }catch(error){result.errors.push(String(error.stack||error));}
 document.body.dataset.auditRoute=c.route;document.body.dataset.auditVariant=c.variant;return result;
};
})();
