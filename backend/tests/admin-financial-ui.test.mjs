import test from 'node:test';
import assert from 'node:assert/strict';
import {amountInPesewas,financialDecision,createFinancialConsole} from '../../admin-portal/financial-ui.mjs';
test('refund amount uses exact integer pesewas and rejects rounding, signs and non-GHS notation',()=>{
 for(const [input,expected] of [['0.01',1],['4',400],['4.5',450],['12345.67',1234567]])assert.equal(amountInPesewas(input),expected);
 for(const invalid of ['0','-1','1.234','1e3','Infinity','NaN','+12','1,000','00.50','GHS 10','999999999'])assert.throws(()=>amountInPesewas(invalid));
 assert.equal(financialDecision('approve'),'approve');assert.throws(()=>financialDecision(undefined));
});
class Element{
 constructor(tag,attrs={}){this.tag=tag;Object.assign(this,attrs);this.children=[];this.handlers={};this.isConnected=true;}
 append(...children){this.children.push(...children.flat(Infinity).filter(x=>x!==undefined&&x!==null&&x!==false));}
 replaceChildren(...children){this.children=[];this.append(...children);}
 addEventListener(name,handler){this.handlers[name]=handler;}
 reportValidity(){return true;}
 querySelectorAll(){const out=[];const walk=n=>{if(!n||typeof n!=='object')return;if(['input','textarea','select'].includes(n.tag))out.push(n);for(const c of n.children||[])walk(c);};walk(this);return out;}
}
const el=(tag,attrs={},...children)=>{const n=new Element(tag,attrs);n.append(...children);return n;};
const button=(label,fn)=>el('button',{onclick:fn},label),field=(label,control)=>el('label',{},label,control);
const values=form=>Object.fromEntries(form.children.filter(x=>x?.tag==='label').map(x=>[x.children[0],x.children[1]]));
const actorA='10000000-0000-4000-8000-000000000001',actorB='10000000-0000-4000-8000-000000000002',payment='20000000-0000-4000-8000-000000000001',caseId='30000000-0000-4000-8000-000000000001';
test('an uncertain refund request retries its original amount and reference, even if the fields change',async()=>{
 const calls=[];let closed=0,reloaded=0;
 const financial=createFinancialConsole({rpc:async(command,payload)=>{calls.push({command,payload:structuredClone(payload)});if(calls.length===1)throw Object.assign(Error('Unknown connection outcome'),{code:'NETWORK_ERROR'});return {record:{status:'pending'}};},el,button,field,money:String,date:String,badge:String,openDialog(){},closeDialog(){closed++;},toast(){},reload(){reloaded++;},getStaff:()=>({id:actorA,role:'finance'})});
 const form=financial.refundForm({entityId:payment,caseId}),inputs=values(form);inputs['Refund amount in GHS'].value='4.00';inputs['Reason and evidence'].value='Original merchant receipt verified';
 await form.handlers.submit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0].payload.amount,400);assert.equal(closed,0);
 inputs['Refund amount in GHS'].value='9.00';await form.handlers.submit({preventDefault(){}});
 assert.deepEqual(calls[1],calls[0]);assert.equal(closed,1);assert.equal(reloaded,1);assert.equal(calls[0].command,'financial.refund.create');
});
test('a refund dialog cannot submit under a different staff account',async()=>{
 let staff={id:actorA,role:'finance'},calls=0;
 const financial=createFinancialConsole({rpc:async()=>{calls++;return {};},el,button,field,money:String,date:String,badge:String,openDialog(){},closeDialog(){},toast(){},reload(){},getStaff:()=>staff});
 const form=financial.refundForm({entityId:payment,caseId}),inputs=values(form);inputs['Refund amount in GHS'].value='4';inputs['Reason and evidence'].value='Receipt checked';staff={id:actorB,role:'finance'};
 await form.handlers.submit({preventDefault(){}});assert.equal(calls,0);
});
test('the owned queue can render before its generation-checked parent is attached',async()=>{
 const detachedEl=(tag,attrs={},...children)=>{const n=el(tag,attrs,...children);n.isConnected=false;return n;};
 const main=detachedEl('main'),financial=createFinancialConsole({rpc:async()=>({rows:[],refunds:[],total:0}),el:detachedEl,button,field,money:String,date:String,badge:String,openDialog(){},closeDialog(){},toast(){},reload(){},getStaff:()=>({id:actorA,role:'auditor'})});
 await financial.renderQueue(main);
 const strings=[];const walk=n=>{if(typeof n==='string')strings.push(n);else for(const c of n.children||[])walk(c);};walk(main);
 assert.ok(strings.some(s=>s.includes('No exceptions recorded')));assert.ok(!strings.includes('Loading accountable records…'));
});
