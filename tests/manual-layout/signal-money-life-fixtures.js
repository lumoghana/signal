/* Signal QA only. Prepare real money-life branches while preserving the
   canonical registry and all unrelated native fixtures. Memory-only data. */
(()=>{
'use strict';
const previous=window.__overflowSeed;
const routes=new Set('iouHome iouForm iouReview iouDetail iouRecord iouRecordReview iouCorrect iouClose iouPayment iouRequestReview iouReceipt iouReceiptReview allMoney moneySource moneySourceReview moneySourceRemove recoveryStart recoveryAdjust recoveryReview recoveryPlan recoveryComplete'.split(' '));
const moneyCards=new Set('iouHome iouReview iouDetail iouRecordReview iouPayment iouRequestReview iouReceiptReview allMoney moneySourceReview moneySourceRemove recoveryStart recoveryReview recoveryPlan'.split(' '));
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const set=(id,value)=>{const el=document.getElementById(id);if(!el)throw Error('Missing populated money-life field '+id);el.value=String(value);};
window.__signalMoneyLifeFixtureRoutes=Object.freeze([...routes]);
window.__overflowSeed=function(c){
 if(c.variant!=='standard'||!routes.has(c.route))return previous(c);
 const result=previous({...c,route:'home',variant:'standard'});
 result.requested=c.route;result.variant=c.variant;delete result.alias;delete result.expectedDelegation;
 try{
  delete L.state.moneyLife;delete L.state.moneyLifeDrafts;L.state.paymentDraft=null;
  L.state.allowance={amount:1200,date:date(-2),source:'Family'};L.state.planHorizon={mode:'allowance',date:date(-2)};
  L.state.essentials=[{id:'food',name:'Food & groceries',amount:180,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport to lectures',amount:100,paid:0,externalPaid:0,coverageVersion:1},{id:'data',name:'Data for the week',amount:40,paid:0,externalPaid:0,coverageVersion:1}];
  L.state.balance=240;L.save();
  const G=L.moneyLife;
  const owedByUser=G.createDebt({direction:'owe',person:'Abena Asante',amount:80,dueDate:date(3),contactId:'abena',note:'Lunch and course printing'},'signal-fixture-owe');
  const owedToUser=G.createDebt({direction:'owed',person:'Kojo Owusu',amount:100,dueDate:date(2)},'signal-fixture-owed');
  G.manual(owedByUser.id,{amount:30,channel:'cash',date:date(-1),key:'signal-fixture-partial'},owedByUser.revision);
  G.saveSource({kind:'momo',name:'MTN',amount:300,asOf:date(0),distinct:true},null,null,'signal-fixture-wallet');
  G.saveSource({kind:'cash',name:'Cash in my wallet',amount:35,asOf:date(0),distinct:true},null,null,'signal-fixture-cash');
  const source=G.holdings().sources.find(x=>x.name==='MTN');
  if(!source)throw Error('Recorded MTN balance fixture was not created.');
  const incoming=L.addTx({type:'in',name:'Kojo Owusu',amount:20,fee:0,status:'success',category:'Transfers',method:'Lumo transfer'});
  const go=(route,params={})=>L.go(route,params);
  window.__auditViewCalls=[];
  if(c.route==='iouHome'||c.route==='allMoney')go(c.route);
  else if(['iouForm','iouReview'].includes(c.route)){
   L.lifeUI.startDebt();set('iou-person','Ama Boateng');set('iou-amount',120);set('iou-date',date(4));L.lifeUI.capture();if(c.route==='iouReview')L.lifeUI.reviewDebt();
  }else if(['iouDetail','iouPayment'].includes(c.route))go(c.route,{id:owedByUser.id});
  else if(c.route==='iouRequestReview'||c.route==='iouReceipt')go(c.route,{id:owedToUser.id});
  else if(['iouRecord','iouRecordReview'].includes(c.route)){
   L.lifeUI.startRecord(owedByUser.id);set('iou-repayment',20);L.lifeUI.capture();if(c.route==='iouRecordReview')L.lifeUI.reviewRecord();
  }else if(c.route==='iouCorrect'||c.route==='iouClose'){
   const repayment=G.get(owedByUser.id).events.find(event=>event.kind==='manual'&&!event.voidedAt);if(!repayment)throw Error('Repayment correction fixture is missing.');
   L.lifeUI.openCorrection(owedByUser.id,c.route==='iouCorrect'?repayment.id:undefined);
  }else if(c.route==='iouReceiptReview')L.lifeUI.chooseReceipt(owedToUser.id,incoming.id);
  else if(c.route.startsWith('moneySource')){
   L.lifeUI.startSource(source.id);
   if(c.route==='moneySourceReview'){document.getElementById('money-distinct').checked=true;L.lifeUI.reviewSource();}
   else if(c.route==='moneySourceRemove')go(c.route,{id:source.id});
  }else if(c.route.startsWith('recovery')){
   L.lifeUI.startRecovery();if(c.route!=='recoveryStart')L.lifeUI.recoveryNext();
   if(['recoveryReview','recoveryPlan','recoveryComplete'].includes(c.route))L.lifeUI.reviewRecovery();
   if(['recoveryPlan','recoveryComplete'].includes(c.route))L.lifeUI.saveRecovery();
   if(c.route==='recoveryComplete')go(c.route);
  }
  L.render();
  const page=document.getElementById('view'),heading=page?.querySelector('h1')?.textContent?.trim()||'';
  if(L.route!==c.route)throw Error('Populated money-life fixture requested '+c.route+' but opened '+L.route);
  if(!page?.querySelector('.ml-page')||/^(?:Record|Source) unavailable$/i.test(heading))throw Error('Populated money-life fixture reached an unavailable record: '+c.route);
  const cardCount=page.querySelectorAll('.ml-money').length;
  if(moneyCards.has(c.route)&&!cardCount)throw Error('Populated money-life financial card is missing on '+c.route);
  result.populatedMoneyLife={route:c.route,heading,cardCount,sourceName:source.name,sourceAmount:source.amount,owedRecord:owedByUser.id,expectedRecord:owedToUser.id};
  result.initialActual=L.route;result.actual=L.route;result.sheet=!!L.taskSheet?.active;result.fallback=false;
  result.renderedViews=[...window.__auditViewCalls];result.renderedView=result.renderedViews.at(-1)||L.route;
  result.seededMoney={operational:L.accountBalances().available,savings:L.accountBalances().savings,room:L.balances().room,essentials:L.balances().essentials};
 }catch(error){result.errors.push(String(error.stack||error));result.populatedMoneyLife={route:c.route,failed:true};}
 document.documentElement.dataset.auditReady='true';document.body.dataset.auditRoute=c.route;document.body.dataset.auditVariant=c.variant;
 return result;
};
})();
