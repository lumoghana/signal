/* Shared number lookup. Bundled responses simulate an API, never a prefix guess.
   This service identifies a network, not wallet ownership or recipient identity. */
(()=>{
'use strict';
const E=L.e;
const operators=Object.freeze({mtn:{wallet:'MTN MoMo',service:'MTN'},telecel:{wallet:'Telecel Cash',service:'Telecel'},at:{wallet:'AT Money',service:'AT'}});
const fixtures=Object.freeze({'0241234567':'mtn','0241230123':'mtn','0201234567':'telecel','0271234567':'at','0241230002':'telecel'});
const normalize=raw=>String(raw||'').replace(/[\s()-]/g,'').replace(/^\+233/,'0').replace(/^233(?=[235]\d{8}$)/,'0');
const valid=raw=>/^0[235]\d{8}$/.test(normalize(raw));
let adapter=null,records=new WeakMap(),account=L.state;
const resetAccount=()=>{if(account!==L.state){records=new WeakMap();account=L.state;}};
const sampleLookup=number=>{
 // A newly signed-up demo also needs a fictional registered-wallet response.
 // It is explicitly sample data, regardless of that number's actual carrier.
 const operator=fixtures[number]||(number===normalize(L.state.profile.phone)?'mtn':'');
 return operator?{number,operator,source:'sample'}:null;
};
const current=record=>record===L.state.paymentDraft||record===L.state.fundingDraft;
const specFor=record=>record===L.state.fundingDraft?{field:'funding-number',key:'network',kind:'wallet'}:record?.bill?{field:'bill-account',key:'provider',kind:'service'}:{field:'recipient-number',key:'provider',kind:'wallet'};
function markup(record){
 resetAccount();const entry=records.get(record);
 if(!entry||entry.status==='empty')return '';
 if(entry.status==='pending')return '<span>Checking network…</span>';
 if(entry.status==='resolved')return `<span class="network-found">${L.icon('check',15)} ${E(entry.label)}</span><small>${entry.source==='sample'?'Sample lookup':'Network checked'}</small>`;
 if(entry.status==='invalid')return '';
 return `<span>Couldn’t check this network.</span>${L.btn('Try again','L.retryMobileNetwork()','text-btn')}`;
}
function refresh(record){
 const root=document.getElementById('view'),status=root?.querySelector?.('[data-mobile-network-status]');
 if(!status||!current(record))return;
 const entry=records.get(record);status.innerHTML=markup(record);status.setAttribute('aria-busy',entry?.status==='pending'?'true':'false');
 const form=status.closest?.('form'),button=form?.querySelector?.('button[type="submit"]');
 if(button)button.setAttribute('aria-busy',entry?.status==='pending'&&!!entry.next?'true':'false');
}
function check(record,raw,force=false){
 resetAccount();if(!record||!current(record)||record.submittedTxId||record.txId)return null;
 const number=normalize(raw),spec=specFor(record),previous=records.get(record);
 if(!force&&previous?.number===number){if(previous.status==='resolved')record[spec.key]=previous.label;refresh(record);return previous;}
 const entry={number,status:!number?'empty':valid(number)?'pending':'invalid',next:null,account:L.state};records.set(record,entry);
 // An old number's provider and verification must not survive a new number.
 delete record[spec.key];if(record!==L.state.fundingDraft)record.checked=false;
 delete record.reviewFingerprint;delete record.pauseAcceptedSignature;
 if(entry.status!=='pending'){L.save();refresh(record);return entry;}
 const finish=response=>{
  if(records.get(record)!==entry||L.state!==entry.account||!current(record)||record.submittedTxId||record.txId)return;
  const operator=response&&operators[response.operator];
  if(!operator||normalize(response.number)!==number){entry.status='unavailable';entry.next=null;L.save();refresh(record);return;}
  entry.status='resolved';entry.operator=response.operator;entry.label=operator[spec.kind];entry.source=response.source==='sample'?'sample':'lookup';record[spec.key]=entry.label;L.save();refresh(record);
  const next=entry.next;entry.next=null;next?.();
 };
 const fail=()=>{if(records.get(record)!==entry||L.state!==entry.account||!current(record))return;entry.status='unavailable';entry.next=null;L.save();refresh(record);};
 try{const response=(adapter||sampleLookup)(number);if(response&&typeof response.then==='function')response.then(finish,fail);else finish(response);}catch{fail();}
 refresh(record);return entry;
}
function requireNetwork(record,raw,onReady){
 const entry=check(record,raw);if(entry?.status==='resolved')return true;
 const spec=specFor(record),number=normalize(raw),route=L.route,field=document.getElementById(spec.field);
 if(entry?.status==='pending'){
  entry.next=()=>{const rawNow=field?.value??(spec.field==='funding-number'?record.number:record.bill?record.destination:record.inputNumber);if(L.route===route&&current(record)&&document.getElementById(spec.field)===field&&normalize(rawNow)===number)onReady?.();};refresh(record);return false;
 }
 L.error(entry?.status==='invalid'||entry?.status==='empty'?'Enter a valid Ghana mobile number.':'Network lookup unavailable. Try again or use the sample number shown.',spec.field);return false;
}
const status=record=>`<div class="mobile-network-status" data-mobile-network-status role="status" aria-live="polite" aria-atomic="true">${markup(record)}</div>`;
function mounted(){
 const field=document.getElementById('recipient-number'),bill=document.getElementById('bill-account'),funding=document.getElementById('funding-number');
 if(L.route==='send'&&L.state.paymentDraft?.method==='momo'&&field)check(L.state.paymentDraft,field.value);
 if(L.route==='bill'&&['airtime','data'].includes(L.state.paymentDraft?.bill)&&bill)check(L.state.paymentDraft,bill.value);
 if(L.route==='momoAdd'&&L.state.fundingDraft&&!L.state.fundingDraft.txId)check(L.state.fundingDraft,funding?.value??L.state.fundingDraft.number);
}
L.retryMobileNetwork=()=>{
 const record=L.route==='momoAdd'?L.state.fundingDraft:L.state.paymentDraft;if(!record||!current(record))return;
 const spec=specFor(record),field=document.getElementById(spec.field);if(field)check(record,field.value,true);
};
L.mobileNetwork=Object.freeze({normalize,valid,check,require:requireNetwork,status,operators,
 inspect:record=>{const entry=records.get(record);return entry?{number:entry.number,status:entry.status,operator:entry.operator,label:entry.label}:null;},
 // A production adapter must call an authenticated server endpoint. No keys or
 // arbitrary external requests belong in this buildless browser prototype.
 useAdapter:fn=>{adapter=typeof fn==='function'?fn:null;records=new WeakMap();}
});
document.addEventListener('input',event=>{
 const field=event.target;if(!field?.id||document.getElementById(field.id)!==field)return;
 const d=L.state.paymentDraft;
 if(L.route==='send'&&d?.method==='momo'&&field.id==='recipient-number')check(d,field.value);
 if(L.route==='bill'&&['airtime','data'].includes(d?.bill)&&field.id==='bill-account')check(d,field.value);
});
const render=L.render;L.render=function(...args){const result=render.apply(this,args);mounted();return result;};
})();
