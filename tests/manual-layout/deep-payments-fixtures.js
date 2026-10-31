/* Memory-only finishing scenarios. Registration never reads the application. */
(()=>{
'use strict';
function cardWithHistory(){
 const api=L.virtualCards;
 let card=api.list().find(c=>c.status==='active');
 if(!card){card=api.issue({name:'Online study card',draftId:'QA-finish-card'});api.fund({cardId:card.id,amount:100,draftId:'QA-finish-fund'});}
 const count=L.state.txs.filter(t=>t.cardId===card.id).length;
 for(let i=count;i<8;i++)api.purchase({cardId:card.id,name:'Study purchase '+i,amount:1,draftId:'QA-finish-buy-'+i,status:i===7?'pending':i===6?'failed':'success',category:'Study'});
 return card;
}
function result(status,delivery){
 const id='QA-finish-result',draft={id:'QA-finish-draft',method:'campus',merchantId:'AK01',destination:'AK01',provider:'Campus Pay',name:'Akua’s Kitchen',amount:80,fee:0,checked:true,note:'Lunch on campus',essentialId:''};
 L.state.txs=L.state.txs.filter(t=>t.id!==id);
 L.state.txs.unshift({id,date:new Date().toISOString(),name:draft.name,type:'out',amount:80,fee:0,status,delivery,method:'Campus Pay',destination:'AK01',category:'Food',paymentDraft:draft,draftId:draft.id,simulated:true});
 L.state.paymentDraft={...draft,submittedTxId:id};L.go('paymentResult',{id});
}
window.__deepScenarioGroups=window.__deepScenarioGroups||{};
window.__deepScenarioGroups.payments=[
 {id:'qr-retained-draft',route:'everydayRepeatChoice',name:'QR: keep or replace an unfinished payment',prepare(){
  L.state.paymentDraft={id:'QA-keep-draft',method:'campus',merchantId:'AK01',destination:'AK01',provider:'Campus Pay',name:'Akua’s Kitchen',amount:80,fee:0,note:'Lunch',checked:true,essentialId:''};
  const id=L.state.profile.personalQrId==='b'.repeat(32)?'c'.repeat(32):'b'.repeat(32);
  L.personalQr.consume('LUMO1:USER:'+id+':Ama%20Boateng:ama.b');
 }},
 {id:'card-history-eight',route:'virtualCard',name:'Card: eight records with pending and failed states',prepare(){const card=cardWithHistory();L.go('virtualCard',{id:card.id});document.querySelector('.vc-history')?.setAttribute('open','');}},
 {id:'card-scoped-history',route:'activity',name:'Card: complete scoped activity',prepare(){const card=cardWithHistory();L.go('activity',{cardId:card.id});}},
 {id:'failed-result-retry',route:'paymentResult',name:'Failure: review a fresh guarded attempt',prepare(){result('failed');}},
 {id:'pending-result-status',route:'paymentResult',name:'Pending: one status path and no retry',prepare(){result('pending');}},
 {id:'paid-delivery-help',route:'paymentResult',name:'Paid: delivery help without another charge',prepare(){result('success','failed');}},
 {id:'card-freeze-approval',route:'virtualCardAuthorize',name:'Card: explicit Freeze card approval',prepare(){const card=L.virtualCards.list().find(c=>c.status==='active')||cardWithHistory();L.virtualCardUI.requestFreeze(card.id);}},
 {id:'incoming-pending-result',route:'paymentResult',name:'Incoming money: wait for confirmed receipt',prepare(){result('pending');const t=L.state.txs.find(t=>t.id==='QA-finish-result');t.type='in';t.name='Mobile money top-up';delete t.paymentDraft;L.render();}}
];
})();
