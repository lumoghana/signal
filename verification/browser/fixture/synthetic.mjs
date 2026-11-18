import {createEmptyState} from '/js/model.js';

export const OWNER='11111111-1111-4111-8111-111111111111';
export const SHOP='22222222-2222-4222-8222-222222222222';
export const BUSINESS='33333333-3333-4333-8333-333333333333';
export const shop={id:SHOP,businessId:BUSINESS,businessName:'Synthetic Campus Kitchen',name:'Night Market counter',category:'Food',area:'Night Market',landmark:'Synthetic test location',code:'LUM900001',hours:'7 am–9 pm',lat:5.6509,lng:-.1878,published:true,accepting:true,open:true};
export function programme(){return {merchantId:BUSINESS,merchantName:shop.businessName,programme:{id:'synthetic-programme',name:'Kitchen Regulars',status:'active',colour:'#d4f65a'},rules:{version:1,earning:'visits',target:5,minimumSpend:2000,onePerDay:false,reward:{type:'discount',name:'Five cedis off',value:500,minimumSpend:2000,expiryDays:30}},terms:'Five qualifying visits earns five cedis off.',ruleVersion:1,consentVersion:'synthetic-browser-consent-v1',shops:[{id:SHOP,name:shop.name,accepting:true,published:true}],canJoin:true};}
export function fixtureState(now=new Date()){
 const state=createEmptyState({name:'Synthetic Student'}),today=now.toISOString().slice(0,10),tomorrow=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
 state.onboardingDone=true;state.wallet=100000;state.buffer=0;state.budget={created:true,items:[],endDate:tomorrow};state.income={amount:99999,nextDate:tomorrow};
 state.ious=[{id:'incoming-today',name:'Synthetic Esi',type:'owedToMe',amount:5000,paid:500,status:'open',due:today},{id:'incoming-tomorrow',name:'Synthetic Sena',type:'owedToMe',amount:8000,paid:0,status:'open',due:tomorrow},{id:'outgoing-today',name:'Synthetic Akos',type:'owedByMe',amount:2000,paid:500,status:'open',due:today}];return state;
}
