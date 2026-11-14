import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createEmptyState} from '../dist/js/model.js';
import {bindLumoRecipientDirectory} from '../dist/js/lumo-recipient-directory.js';
import {consumerViewSnapshot,canRenderConsumerBackground} from '../dist/js/quiet-sync.js';
const app=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
const refreshSource=app.slice(app.indexOf('async function refreshShared('),app.indexOf('\nvoid refreshShared('));
class Node{constructor(){this.value='';this.isConnected=true;this.hidden=false;this.disabled=false;this.attrs={};this.handlers={};this.innerHTML='';}addEventListener(t,f){(this.handlers[t]||=[]).push(f)}removeEventListener(t,f){this.handlers[t]=(this.handlers[t]||[]).filter(x=>x!==f)}setAttribute(k,v){this.attrs[k]=v}emit(t,event={}){return Promise.all((this.handlers[t]||[]).map(f=>f({target:this,...event})))}}
const tick=()=>new Promise(r=>setImmediate(r));
test('actual app refresh plus recipient binder survive eight changed snapshots and a delayed lookup',async()=>{
 const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',person={id,userId:id,name:'Ama Test',handle:'ama.test',rail:'lumo'};
 let release,requests=0,remounts=0,continued=0;const delayed=new Promise(resolve=>release=resolve);
 const state=createEmptyState(),draft={payment:{rail:'lumo',idempotencyKey:'same-reference',amount:1000}},nodes=new Map(['.pay-recipient','#recipient-search','#lumo-people','#lumo-people-status','#lumo-people-retry','#payment-error','[data-action="pay-recipient-next"]'].map(selector=>[selector,new Node()]));
 const shared={connected:true,signedIn:true,user:{id:owner},authVersion:1,partnerRequests:[],searchPeople(){requests++;return delayed},async resolve(){return{ok:true,recipient:person}},async snapshot(){state.wallet+=100;return{ok:true}}};
 const ctx={connected:true,state,draft,shared,$:selector=>nodes.get(selector),saveDraft(){}};
 let cleanup=bindLumoRecipientDirectory(ctx,{page:'recipient'},{onContinue(){continued++}});
 const scope=vm.createContext({state,draft,shared,route:{section:'pay',page:'recipient'},refreshingShared:false,sharedHydrated:true,sharedConnectionError:'',overlayMeta:null,captureCurrent:null,consumerViewSnapshot,canRenderConsumerBackground,view:{querySelector:selector=>selector.includes('#lumo-people')?nodes.get('#lumo-people'):null},persistence:{release(){}},render(){remounts++;cleanup();cleanup=bindLumoRecipientDirectory(ctx,{page:'recipient'},{onContinue(){continued++}})},closeSheet(){},persistSession(){},JSON});
 vm.runInContext('let pendingSharedRender=false;const sharedViewSignature=()=>consumerViewSnapshot(state,shared.partnerRequests);'+refreshSource+';this.refresh=refreshShared;',scope);
 for(let i=0;i<8;i++)await scope.refresh();assert.equal(remounts,0);assert.equal(requests,1);
 release({ok:true,people:[person]});await tick();assert.match(nodes.get('#lumo-people').innerHTML,/@ama.test/);
 await nodes.get('#lumo-people').emit('click',{target:{closest:()=>({dataset:{lumoPerson:id}})}});await nodes.get('[data-action="pay-recipient-next"]').emit('click');assert.equal(continued,1);assert.equal(draft.payment.idempotencyKey,'same-reference');assert.equal(draft.payment.amount,1000);
 cleanup();
});
