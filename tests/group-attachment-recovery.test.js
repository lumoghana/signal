import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction } from '../dist/js/model.js';
import { openGroupFinancial } from '../dist/js/group-actions.js';

class Element {
  constructor(attrs='') {
    this.attrs=attrs;this.listeners=new Map();this.isConnected=true;this.value=attrs.match(/value="([^"]*)"/)?.[1]||'';
    this.name=attrs.match(/name="([^"]+)"/)?.[1];this.hidden=/\shidden(?:\s|$)/.test(attrs);this.disabled=false;this.textContent='';this.dataset={};
    this.style={setProperty(){},removeProperty(){}};
    for(const match of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))this.dataset[match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=match[2];
  }
  addEventListener(event,fn){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(fn);}
  emit(event,extra={}){const e={target:this,preventDefault(){},...extra};const results=[];if(this[`on${event}`])results.push(this[`on${event}`](e));for(const fn of this.listeners.get(event)||[])results.push(fn(e));return Promise.all(results);}
  click(){if(!this.disabled)return this.emit('click');}
}
class Sheet extends Element {
  constructor(html){super();this.html=html;this.form=new Element();this.error=new Element();this.controls=[];
    for(const m of html.matchAll(/<(button|input|textarea|select)\b([^>]*)(?:>([\s\S]*?)<\/\1>)?/g)){
      const el=new Element(m[2]);el.tag=m[1];if(el.tag==='select')el.value=m[3]?.match(/<option[^>]*value="([^"]+)"[^>]*selected/)?.[1]||m[3]?.match(/<option[^>]*value="([^"]+)"/)?.[1]||'';this.controls.push(el);
    }
    const recovery=html.match(/<p\b([^>]*data-group-evidence-recovery[^>]*)>/);
    if(recovery){this.recovery=new Element(recovery[1]);this.details={open:/<details class="group-history-disclosure" open>/.test(html)};this.recovery.closest=()=>this.details;}
  }
  querySelector(sel){if(sel==='form')return this.form;if(sel==='.group-action-error')return this.error;if(sel==='[data-group-evidence-recovery]')return this.recovery||null;return this.querySelectorAll(sel)[0]||null;}
  querySelectorAll(sel){if(sel==='input,select')return this.controls.filter(x=>['input','select'].includes(x.tag));const match=sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(!match)return[];return this.controls.filter(x=>match[2]===undefined?new RegExp(`(?:^|\\s)${match[1]}(?:\\s|=|$)`).test(x.attrs):x.attrs.includes(`${match[1]}="${match[2]}"`));}
  detach(){this.isConnected=false;this.form.isConnected=false;this.controls.forEach(x=>x.isConnected=false);}
}
function fixture(){
  const state=createDemoState(),created=applyAction(state,'ensureProjectPrintingDemo',{});assert.equal(created.ok,true);const g=created.group;
  const ctx={state,draft:{},route:{section:'life',page:'group-detail',id:g.id},calls:[],authCalls:0,saved:'',current:null,sheetOptions:null,
    act(type,payload){this.calls.push(type);return applyAction(this.state,type,payload);},
    sheet(html,bind,options={}){this.current?.detach();this.current=new Sheet(html);this.sheetOptions=options;bind?.(this.current);},
    closeSheet(){this.current?.detach();},userClose(){const callback=this.sheetOptions.onClose;this.closeSheet();callback?.();},
    saveDraft(){this.saved=JSON.stringify(this.draft);},auth(options){this.authCalls++;this.authPending=options;},toast(){},refresh(){},
  };
  const open=payout=>openGroupFinancial(ctx,g,payout?'edit':'request',payout?.id);
  const field=async(name,value)=>{const x=ctx.current.querySelector(`[name="${name}"]`);assert.ok(x,name);x.value=value;await x.emit('input');return x;};
  const financial=()=>JSON.stringify({wallet:state.wallet,transactions:state.transactions,group:g});
  return {ctx,state,g,open,field,financial,picker:()=>ctx.current.querySelector('[name="groupPayoutEvidence"]')};
}
const evidence={name:'sample-quote.pdf',type:'application/pdf',size:8,dataUrl:'data:application/pdf;base64,JVBERi0xLjc='};
function readers(t){const active=[],previous=globalThis.FileReader;globalThis.FileReader=class {constructor(){active.push(this);}readAsDataURL(file){this.file=file;}abort(){this.aborted=true;this.onabort?.();}finish(value=evidence.dataUrl){this.result=value;this.onload?.();}};t.after(()=>{globalThis.FileReader=previous;});return active;}
// Node does not provide a FileReader. Install a test-only browser API before mocking.
if(!globalThis.FileReader)globalThis.FileReader=class {};

test('an interrupted chooser restores plain draft details and an explicit choose-again fallback',async()=>{
  const h=fixture();h.open();const before=h.financial();
  await h.field('groupPayoutRecipient','Campus printer');await h.field('groupPayoutDestination','@campusprinter');await h.field('groupPayoutAmount','47.50');await h.field('groupPayoutNote','Print our final project');await h.field('groupPayoutEvidenceReference','PRINT-42');
  await h.picker().click();const saved=JSON.parse(h.ctx.saved),operation=saved.groupPayout.operationId;
  assert.equal(saved.groupPayout.evidencePick,'choosing');assert.equal(saved.groupPayout.amountText,'47.50');assert.equal(saved.groupPayout.note,'Print our final project');assert.equal(saved.groupPayout.evidenceReference,'PRINT-42');assert.deepEqual(saved.groupPayout.evidence,[]);
  h.ctx.draft=saved;h.open();assert.equal(h.ctx.draft.groupPayout.evidencePick,'retry');assert.equal(h.ctx.draft.groupPayout.operationId,operation);
  assert.equal(h.ctx.current.recovery.hidden,false);assert.equal(h.ctx.current.details.open,true);assert.match(h.ctx.current.html,/Choose the file again, or continue without it/);
  assert.equal(h.ctx.current.querySelector('[name="groupPayoutAmount"]').value,'47.50');assert.equal(h.ctx.current.querySelector('[name="groupPayoutEvidenceReference"]').value,'PRINT-42');
  assert.equal(h.financial(),before);assert.equal(h.ctx.calls.length,0);assert.equal(h.ctx.authCalls,0);
});

test('cancelled or cleared selection is optional and preserves completed evidence',async()=>{
  const h=fixture();h.open();h.ctx.draft.groupPayout.evidence=[{...evidence}];h.open();const before=h.financial();
  await h.picker().click();await h.picker().emit('cancel');assert.equal(h.ctx.draft.groupPayout.evidencePick,'');assert.equal(h.ctx.current.recovery.hidden,true);assert.deepEqual(h.ctx.draft.groupPayout.evidence,[evidence]);
  await h.picker().click();h.picker().files=[];await h.picker().emit('change');assert.equal(h.ctx.draft.groupPayout.evidencePick,'');
  await h.ctx.current.form.emit('submit');assert.match(h.ctx.current.html,/All looking right/);assert.match(h.ctx.current.html,/sample-quote.pdf/);assert.equal(h.ctx.authCalls,0);assert.equal(h.financial(),before);
});

test('pending reads block review; validated completion preserves details without requesting or approving money',async t=>{
  const active=readers(t),h=fixture();h.open();const before=h.financial();await h.field('groupPayoutNote','The final binding quote');
  const input=h.picker();await input.click();input.files=[{name:evidence.name,type:evidence.type,size:evidence.size}];const reading=input.emit('change');
  assert.equal(h.ctx.draft.groupPayout.evidencePick,'reading');await h.ctx.current.form.emit('submit');assert.match(h.ctx.current.error.textContent,/Let the file finish/);assert.equal(h.ctx.authCalls,0);
  active[0].finish();await reading;assert.equal(h.ctx.draft.groupPayout.evidencePick,'');assert.deepEqual(h.ctx.draft.groupPayout.evidence,[evidence]);assert.equal(h.ctx.draft.groupPayout.note,'The final binding quote');
  await h.ctx.current.form.emit('submit');assert.match(h.ctx.current.html,/sample-quote.pdf/);assert.equal(h.ctx.calls.length,0);assert.equal(h.ctx.authCalls,0);assert.equal(h.financial(),before);
});

test('close or replacement ignores late FileReader success and offers selection recovery',async t=>{
  const active=readers(t),h=fixture();h.open();const before=h.financial();const input=h.picker();await input.click();input.files=[{...evidence}];const reading=input.emit('change');
  h.ctx.userClose();active[0].finish();await reading;assert.deepEqual(h.ctx.draft.groupPayout.evidence,[]);assert.equal(h.ctx.draft.groupPayout.evidencePick,'retry');
  h.open();assert.equal(h.ctx.current.recovery.hidden,false);assert.deepEqual(h.ctx.draft.groupPayout.evidence,[]);assert.equal(h.financial(),before);assert.equal(h.ctx.calls.length,0);assert.equal(h.ctx.authCalls,0);
});

test('file read failures permit a clear retry or continuing without an optional file',async t=>{
  const active=readers(t),h=fixture();h.open();const before=h.financial(),input=h.picker();input.files=[{...evidence}];const reading=input.emit('change');active[0].onerror();await reading;
  assert.equal(h.ctx.draft.groupPayout.evidencePick,'retry');assert.equal(h.ctx.current.recovery.hidden,false);assert.match(h.ctx.current.error.textContent,/could not be read/);
  await h.ctx.current.form.emit('submit');assert.match(h.ctx.current.html,/All looking right/);assert.equal(h.ctx.draft.groupPayout.evidencePick,'');assert.equal(h.financial(),before);assert.equal(h.ctx.authCalls,0);
});

test('removing evidence from an edit draft never mutates the approved payout or its mandate',async()=>{
  const h=fixture(),created=applyAction(h.state,'requestPayout',{groupId:h.g.id,amount:3000,recipient:'Campus printer',rail:'Lumo',destination:'@campusprinter',note:'Our print quote',evidence:[evidence]});assert.equal(created.ok,true,created.message);const payout=created.payout;
  assert.equal(applyAction(h.state,'reviewPayout',{groupId:h.g.id,payoutId:payout.id}).ok,true);assert.equal(applyAction(h.state,'approvePayout',{groupId:h.g.id,payoutId:payout.id}).ok,true);
  const before=h.financial();h.open(payout);const remove=h.ctx.current.querySelector('[data-group-evidence-remove="0"]');assert.ok(remove);await remove.click();
  assert.deepEqual(h.ctx.draft.groupPayout.evidence,[]);assert.deepEqual(payout.evidence,[evidence]);assert.equal(h.financial(),before);assert.equal(h.ctx.authCalls,0);assert.equal(h.ctx.calls.length,0);
});
