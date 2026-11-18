import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovalConsole} from '../../admin-portal/approval-ui.mjs';
class Element{
 constructor(tag,attrs={}){this.tag=tag;Object.assign(this,attrs);this.children=[];this.handlers={};}
 append(...children){this.children.push(...children.flat(Infinity).filter(x=>x!==undefined&&x!==null&&x!==false));}
 replaceChildren(...children){this.children=[];this.append(...children);}
 addEventListener(name,fn){this.handlers[name]=fn;}
 reportValidity(){return true;}
}
const el=(tag,attrs={},...children)=>{const x=new Element(tag,attrs);x.append(...children);return x;};
const field=(label,control)=>el('label',{},label,control),button=(label,fn)=>el('button',{onclick:fn},label);
const controls=form=>Object.fromEntries(form.children.filter(x=>x?.tag==='label').map(x=>[x.children[0],x.children[1]]));
function fixture(send,options={}){let staff={id:'staff-one',role:'super_admin'},closed=0,reloaded=0;const calls=[];
 const console=createApprovalConsole({rpc:async(command,payload)=>{calls.push({command,payload:structuredClone(payload)});return send?.(command,payload,calls.length);},el,button,field,input:value=>el('input',{value}),area:()=>el('textarea',{value:''}),select:(items,value)=>el('select',{value}),openDialog(){},closeDialog(){closed++;},toast(){},reload(){reloaded++;},getStaff:()=>staff,...options});
 return {console,calls,get closed(){return closed;},get reloaded(){return reloaded;},switchActor(){staff={id:'staff-two',role:'risk'};}};
}
function fill(form){const c=controls(form);c['Affected record ID'].value='10000000-0000-4000-8000-000000000001';c['Support case ID'].value='20000000-0000-4000-8000-000000000001';c['Reason and evidence'].value='Original independently checked evidence';return c;}
test('unknown approval creation retries its original actor-bound request and evidence',async()=>{
 const h=fixture((command,payload,n)=>{if(n===1)throw Error('Unknown outcome');return {id:'original'};}),form=h.console.requestForm(),c=fill(form);
 await form.handlers.submit({preventDefault(){}});assert.equal(h.closed,0);const original=structuredClone(h.calls[0]);c['Reason and evidence'].value='Changed after timeout';
 await form.handlers.submit({preventDefault(){}});assert.deepEqual(h.calls[1],original);assert.equal(h.closed,1);assert.equal(h.reloaded,1);assert.match(original.payload.requestId,/^[0-9a-f-]{36}$/);
});
test('reopening an unknown creation keeps its saved reference and disabled original fields',async()=>{
 const h=fixture(()=>{throw Error('Unknown outcome');}),first=h.console.requestForm();fill(first);await first.handlers.submit({preventDefault(){}});
 const second=h.console.requestForm(),c=controls(second);assert.equal(c['Reason and evidence'].disabled,true);assert.equal(c['Reason and evidence'].value,'Original independently checked evidence');await second.handlers.submit({preventDefault(){}});assert.deepEqual(h.calls[0],h.calls[1]);
});
test('an approval form cannot submit after another staff account signs in',async()=>{
 const h=fixture(),form=h.console.requestForm();fill(form);h.switchActor();await form.handlers.submit({preventDefault(){}});assert.equal(h.calls.length,0);
});
test('stale or expired approvals cannot open an executing decision form',()=>{
 for(const flags of [{stale:true},{expired:true}]){const h=fixture(),form=h.console.decisionForm({id:'approval',status:'pending',revision:1,...flags},'approve');assert.notEqual(form.tag,'form');assert.equal(h.calls.length,0);}
});
test('unknown decision retries keep its expected revision and immutable decision reference',async()=>{
 const h=fixture((command,payload,n)=>{if(n===1)throw Error('Unknown outcome');return {};}),form=h.console.decisionForm({id:'approval',status:'pending',revision:3,targetRevision:7,action:'account.restore',entityId:'customer'},'approve');controls(form)['Decision reason'].value='Current target reviewed';await form.handlers.submit({preventDefault(){}});await form.handlers.submit({preventDefault(){}});
 assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(h.calls[0].payload.expectedRevision,3);assert.equal(h.calls[0].payload.decision,'approve');
});
test('the existing portal approved alias remains an approve decision',async()=>{
 const h=fixture(),form=h.console.decisionForm({id:'approval',status:'pending',revision:1,targetRevision:0,action:'account.restore',entityId:'customer'},'approved');controls(form)['Decision reason'].value='Current record reviewed';await form.handlers.submit({preventDefault(){}});assert.equal(h.calls[0].payload.decision,'approve');
});
test('a reloaded console resumes the actor original request and clears its journal only after confirmation',async()=>{
 const records=new Map(),storage={getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
 const first=fixture(()=>{throw Error('Unknown outcome');},{storage}),one=first.console.requestForm();fill(one);await one.handlers.submit({preventDefault(){}});assert.equal(records.size,1);
 const resumed=fixture(()=>({id:'original'}),{storage}),two=resumed.console.requestForm();assert.equal(controls(two)['Reason and evidence'].disabled,true);await two.handlers.submit({preventDefault(){}});assert.deepEqual(resumed.calls[0],first.calls[0]);assert.equal(records.size,0);
});
test('a pending journal belongs to one verified actor and expires after the approval window',async()=>{
 const records=new Map(),storage={getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
 const first=fixture(()=>{throw Error('Unknown outcome');},{storage,now:()=>1000}),one=first.console.requestForm();fill(one);await one.handlers.submit({preventDefault(){}});
 const changed=fixture(null,{storage,now:()=>2000});changed.switchActor();const fresh=changed.console.requestForm();assert.equal(controls(fresh)['Reason and evidence'].disabled,undefined);assert.equal(controls(fresh)['Reason and evidence'].value,'');
 const later=fixture(null,{storage,now:()=>1000+27*60*60*1000});assert.equal(controls(later.console.requestForm())['Reason and evidence'].disabled,undefined);
});
test('unavailable task storage retains the in-memory request and tells the operator to keep the tab open',async()=>{
 const storage={getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');}},h=fixture(()=>{throw Error('Unknown outcome');},{storage}),form=h.console.requestForm();fill(form);await form.handlers.submit({preventDefault(){}});await form.handlers.submit({preventDefault(){}});assert.deepEqual(h.calls[0],h.calls[1]);assert.ok(JSON.stringify(form.children).includes('Keep this tab open'));
});
