/* Source-only final-review cases. The gallery already isolates storage/history.
   These sample states never run in the customer bundle or geometry matrix. */
(()=>{
'use strict';
const clearBudgetDrafts=()=>{L.state.planDraft=null;L.state.budgetCycleDraft=null;L.state.budgetHistoryDraft=null;};
const render=(route,params={})=>{L.save();L.go(route,params);L.render();};
const historyMissing=()=>{clearBudgetDrafts();render('budgetHistory');};
const newCollection=accepted=>{
 const G=L.groupMoney;L.state.groupMoney=undefined;G.list();
 const r=G.createCollection({title:'Class field trip',target:'1200',deadline:new Date(Date.now()+14*86400000).toISOString().slice(0,10),members:[{id:'abena',name:'Abena Asante'},{id:'kojo',name:'Kojo Mensah'}],mandateApproval:'majority',acceptMandate:true,idempotencyKey:'finish-visual-collection'});if(!r.ok)throw Error(r.error);
 if(accepted)for(const p of r.item.people.filter(p=>!p.isOwner)){const a=G.acceptMandate({itemId:r.item.id,personId:p.id,version:r.item.mandate.version,sample:true});if(!a.ok)throw Error(a.error);}
 return r.item;
};
const memberEmpty=role=>{
 const G=L.groupMoney;L.state.groupMoney=undefined;G.list();const r=G.createSampleInvitation({scenario:role,idempotencyKey:'finish-visual-'+role});if(!r.ok)throw Error(r.error);const s=G.invitationSummary(r.invitation.id),joined=G.acceptInvitation({invitationId:s.id,version:s.mandate.version,fingerprint:s.fingerprint});if(!joined.ok)throw Error(joined.error);
 // Joined examples normally include one sample proposal. This explicit empty
 // variant retains the accepted role and separate contributed balance only.
 joined.item.proposals=[];joined.item.disbursements=[];joined.item.activity=joined.item.activity.filter(a=>!a.proposalId);render('groupMoneyPayments',{id:joined.item.id});
};
const hack=(kind,value,paused=false)=>{
 const r=L.savingsHacks.configure({boxId:'qa-box',kind,value,cadence:'weekly',startDate:new Date(Date.now()+86400000).toISOString().slice(0,10),monthlyCap:100,minBalance:50,consent:true});if(!r.ok)throw Error(r.message);if(paused)L.savingsHacks.pause('qa-box');render('goal',{id:'qa-box'});
};
window.__deepScenarioGroups=window.__deepScenarioGroups||{};
window.__deepScenarioGroups.planning=[
 {id:'history-missing',route:'budgetHistory',name:'Suggestion · no saved draft',prepare:historyMissing},
 {id:'history-setup',route:'budgetHistory',name:'Suggestion · saved setup',prepare(){clearBudgetDrafts();L.state.planDraft={step:'firstEssentials',allowance:{amount:0,date:''},essentials:[{id:'finish-food',name:'Food',amount:30,paid:0,externalPaid:0,coverageVersion:1}],goals:[],planHorizon:{mode:'unspecified',date:''},essentialFields:{name:'',amount:''}};L.capturePlanDraftBaseline?.(L.state.planDraft,{createdFromSaved:true});render('budgetHistory');}},
 {id:'history-cycle',route:'budgetHistory',name:'Suggestion · saved next period',prepare(){clearBudgetDrafts();L.openBudgetCycle();render('budgetHistory');}},
 {id:'history-pending',route:'budgetHistory',name:'Suggestion · pending Budget payment',prepare(){clearBudgetDrafts();L.state.txs.push({id:'FINISH-PENDING',draftId:'FINISH-PENDING-DRAFT',type:'out',status:'pending',essentialId:'qa-food',amount:10,fee:0,name:'Lunch',date:new Date().toISOString(),method:'Sample mobile money'});render('budgetHistory');}},
 {id:'payments-acceptance',route:'groupMoneyPayments',name:'Organiser · mandate acceptance pending',prepare(){const item=newCollection(false);render('groupMoneyPayments',{id:item.id});}},
 {id:'payments-unfunded',route:'groupMoneyPayments',name:'Organiser · no available contributions',prepare(){const item=newCollection(true);render('groupMoneyPayments',{id:item.id});}},
 {id:'payments-contributor',route:'groupMoneyPayments',name:'Contributor · funded pot without proposals',prepare(){memberEmpty('contributor');}},
 {id:'payments-approver',route:'groupMoneyPayments',name:'Approver · funded pot without proposals',prepare(){memberEmpty('approver');}},
 {id:'hack-income',route:'goal',name:'Active hack · income 10%',prepare(){hack('income',10);}},
 {id:'hack-paused',route:'goal',name:'Paused hack · spending 5%',prepare(){hack('spend',5,true);}},
 {id:'cycle-footer',route:'budgetCycle',name:'Fresh Budget · standard action spacing',prepare(){L.openBudgetCycle();}},
 {id:'approver-contrast',route:'groupMoneyApprovers',name:'Named approvers · selected names readable',prepare(){}}
];
})();
