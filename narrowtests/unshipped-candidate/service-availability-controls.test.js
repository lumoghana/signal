import test from 'node:test';
import assert from 'node:assert/strict';
import {availabilityMessage,bindAvailabilityControl,refreshAvailabilityControls,applyAvailabilityControls} from '../dist/js/service-availability.js';
import {bindAccountRecipient,renderAccountRecipient} from '../dist/js/payment-recipient.js';
import {validateRecipientLookup} from '../dist/js/recipient-lookup.js';

class Element extends EventTarget {
  constructor(value='') {
    super();this.value=value;this.disabled=false;this.isConnected=true;this.hidden=false;
    this.textContent='';this.innerHTML='';this.attributes=new Map();this.classes=new Set();this.children=[];
    this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
  }
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  removeAttribute(name){this.attributes.delete(name);}
  append(child){this.children.push(child);}
  focus(){this.focused=true;}
  click(){this.dispatchEvent(new Event('click'));}
}
const service=(serviceId,available,message='')=>({serviceId,available,message});
const context=(rows=[])=>({connected:true,shared:{capabilities:{externalTransferSandbox:true,serviceAvailability:rows}}});
const controlRoot=nodes=>({querySelectorAll:()=>nodes.filter(node=>node.attributes.has('data-service-availability'))});

test('a paused service without public copy still disables payment and gives a usable explanation',()=>{
  const ctx=context([service('bank_send',false)]),button=new Element(),notice=new Element();
  bindAvailabilityControl(ctx,button,{message:()=>availabilityMessage(ctx,'bank'),notice});
  assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-disabled'),'true');
  assert.equal(notice.hidden,false);assert.match(notice.textContent,/temporarily unavailable/);
  assert.equal(button.title,notice.textContent);
});

test('refresh disables and restores the existing control while retaining the input, focus and payment draft',()=>{
  const ctx=context(),button=new Element(),notice=new Element(),input=new Element('0241234567');
  const payment={rail:'momo',recipientForms:{momo:{number:input.value}},amount:2500,note:'Lunch'};
  ctx.draft={payment};input.focus();const before=structuredClone(payment);let busy=false;
  const update=bindAvailabilityControl(ctx,button,{message:()=>availabilityMessage(ctx,'momo','MTN MoMo'),disabled:()=>busy,notice});
  const root=controlRoot([button]);
  ctx.shared.capabilities.serviceAvailability=[service('momo_send_mtn',false,'MTN is taking a break.')];
  refreshAvailabilityControls(ctx,[root]);
  assert.equal(button.disabled,true);assert.equal(notice.textContent,'MTN is taking a break.');
  assert.equal(input.value,'0241234567');assert.equal(input.focused,true);assert.equal(ctx.draft.payment,payment);assert.deepEqual(payment,before);
  ctx.shared.capabilities.serviceAvailability=[service('momo_send_mtn',true)];
  refreshAvailabilityControls(ctx,[root]);
  assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-disabled'),'false');assert.equal(notice.hidden,true);assert.equal(button.title,'');
  busy=true;refreshAvailabilityControls(ctx,[root]);assert.equal(button.disabled,true,'recovery cannot override an in-flight action');
  busy=false;update.dispose();button.disabled=true;refreshAvailabilityControls(ctx,[root]);assert.equal(button.disabled,true,'disposed controls are not updated');
});

test('availability refresh cannot update a control bound to a different signed-in service instance',()=>{
  const ctx=context(),other=context(),button=new Element();
  bindAvailabilityControl(ctx,button,{message:()=>availabilityMessage(ctx,'bank')});
  ctx.shared.capabilities.serviceAvailability=[service('bank_send',false,'Bank payments are paused.')];
  refreshAvailabilityControls(other,[controlRoot([button])]);assert.equal(button.disabled,false);
  refreshAvailabilityControls(ctx,[controlRoot([button])]);assert.equal(button.disabled,true);
});

test('payment hub recovery restores an available rail but preserves a separately disabled action',()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try {
    const ctx=context([service('momo_send',false,'MoMo is paused.')]);
    const momo=new Element(),bank=new Element(),merchant=new Element();
    for(const [node,action] of [[momo,'momo'],[bank,'bank'],[merchant,'merchant-code']]){node.dataset={hubAction:action};node.querySelector=()=>node;}
    bank.disabled=true;
    const nodes=[momo,bank,merchant],root={querySelectorAll:selector=>selector==='[data-hub-action]'?nodes:nodes.filter(node=>node.attributes.has('data-service-availability'))};
    applyAvailabilityControls(ctx,root);assert.equal(momo.disabled,true);assert.equal(bank.disabled,true);assert.equal(merchant.disabled,false);
    ctx.shared.capabilities.serviceAvailability=[service('momo_send',true),service('merchant_payment',false,'Campus Pay is paused.')];
    refreshAvailabilityControls(ctx,[root]);
    assert.equal(momo.disabled,false);assert.equal(momo.children[0].hidden,true);assert.equal(bank.disabled,true);assert.equal(merchant.disabled,true);
    assert.equal(merchant.children[0].textContent,'Campus Pay is paused.');
  } finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

function recipientHarness({rail='momo',number='0555550124',bank='',confirm=false,rows=[]}={}) {
  const ctx=context(rows),root=new Element(),nodes=new Map();
  const selectors=['#recipient-lookup-form','[name="recipientNumber"]','[data-recipient-find]','#recipient-error','[data-recipient-status]','.recipient-loading-dots','[data-recipient-availability]','[data-recipient-confirm]','[data-recipient-edit]'];
  for(const selector of selectors)nodes.set(selector,new Element());
  const input=nodes.get('[name="recipientNumber"]');input.value=number;
  if(rail==='bank')nodes.set('[name="recipientBank"]',new Element(bank));
  root.querySelector=selector=>nodes.get(selector)||null;
  root.querySelectorAll=()=>[...nodes.values()].filter(node=>node.attributes.has('data-service-availability'));
  ctx.route={section:'pay',page:confirm?'recipient-confirm':'recipient'};
  const payment={rail,recipientForms:{[rail]:{number,...(rail==='bank'?{bank}:{})}},amount:2500,note:'Lunch'};
  if(confirm){const checked=validateRecipientLookup(rail,payment.recipientForms[rail],{sandbox:true});assert.equal(checked.ok,true);payment.recipientLookup={key:checked.key,request:checked.request,recipient:{...checked.request,lookupSource:'sandbox'},confirmed:false,simulation:true,providerMode:'sandbox'};}
  ctx.draft={payment};ctx.shared.user={id:'synthetic-owner'};ctx.shared.authVersion=1;
  ctx.$=()=>root;ctx.saveDraft=()=>{};ctx.go=()=>{};let calls=0,confirmations=0;
  ctx.confirmAccountRecipient=()=>{confirmations++;};
  const dispose=bindAccountRecipient(ctx,ctx.route,{createLookup:()=>({run(){calls++;return new Promise(()=>{});},cancel(){},dispose(){}})});
  return{ctx,root,nodes,payment,input,dispose,get calls(){return calls;},get confirmations(){return confirmations;},submit(){nodes.get('#recipient-lookup-form').dispatchEvent(new Event('submit',{cancelable:true}));},changeNumber(value){input.value=value;nodes.get('#recipient-lookup-form').dispatchEvent(new Event('input'));}};
}

test('recipient lookup gates the detected MoMo network and changing destination updates the same form',()=>{
  const h=recipientHarness({rows:[service('momo_send_mtn',false,'MTN is paused.'),service('momo_send_telecel',true)]});
  try {
    const button=h.nodes.get('[data-recipient-find]'),note=h.nodes.get('[data-recipient-availability]');h.input.focus();
    assert.equal(button.disabled,false,'ported 055 sample is Telecel, not the prefix network');
    h.changeNumber('0245550182');assert.equal(button.disabled,true);assert.equal(note.textContent,'MTN is paused.');h.submit();assert.equal(h.calls,0);
    assert.equal(h.input.focused,true);assert.equal(h.payment.recipientForms.momo.number,'0245550182');assert.equal(h.payment.amount,2500);
    h.ctx.shared.capabilities.serviceAvailability=[service('momo_send_mtn',true),service('momo_send_telecel',true)];
    refreshAvailabilityControls(h.ctx,[h.root]);assert.equal(button.disabled,false);assert.equal(note.hidden,true);h.submit();assert.equal(h.calls,1);
  } finally {h.dispose();}
});

test('recipient confirmation remains blocked through an outage and recovers without discarding the selected person',()=>{
  for(const scenario of [{rail:'momo',number:'0555550124',id:'momo_send_telecel'},{rail:'bank',number:'0123456789',bank:'Ecobank Ghana',id:'bank_send'}]){
    const h=recipientHarness({...scenario,confirm:true,rows:[service(scenario.id,false)]});
    try {
      const button=h.nodes.get('[data-recipient-confirm]'),person=h.payment.recipientLookup,before=structuredClone(h.payment);
      assert.equal(button.disabled,true);assert.match(renderAccountRecipient(h.ctx,h.ctx.route),/data-recipient-confirm disabled/);button.click();assert.equal(h.confirmations,0);
      h.ctx.shared.capabilities.serviceAvailability=[service(scenario.id,true)];refreshAvailabilityControls(h.ctx,[h.root]);
      assert.equal(button.disabled,false);assert.equal(h.payment.recipientLookup,person);assert.deepEqual(h.payment,before);button.click();assert.equal(h.confirmations,1);button.click();assert.equal(h.confirmations,1);
    } finally {h.dispose();}
  }
});
