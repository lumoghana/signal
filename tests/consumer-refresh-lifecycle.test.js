import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createEmptyState} from '../dist/js/model.js';
import {bindLumoRecipientDirectory} from '../dist/js/lumo-recipient-directory.js';
import {consumerViewSnapshot,canRenderConsumerBackground} from '../dist/js/quiet-sync.js';
import {availabilityMessage,bindAvailabilityControl,refreshAvailabilityControls} from '../dist/js/service-availability.js';
const app=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
const refreshSource=app.slice(app.indexOf('async function refreshShared('),app.indexOf('\nvoid refreshShared('));
class Node{constructor(){this.value='';this.isConnected=true;this.hidden=false;this.disabled=false;this.attrs={};this.handlers={};this.innerHTML='';}addEventListener(t,f){(this.handlers[t]||=[]).push(f)}removeEventListener(t,f){this.handlers[t]=(this.handlers[t]||[]).filter(x=>x!==f)}setAttribute(k,v){this.attrs[k]=v}emit(t,event={}){return Promise.all((this.handlers[t]||[]).map(f=>f({target:this,...event})))}}
const tick=()=>new Promise(r=>setImmediate(r));
test('actual app refresh keeps one directory read and one automatic identity check through changed snapshots',async()=>{
 const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',person={id,userId:id,name:'Ama Test',handle:'ama.test',rail:'lumo'};
 let release,releaseIdentity,requests=0,identityChecks=0,remounts=0,continued=0;const delayed=new Promise(resolve=>release=resolve),identity=new Promise(resolve=>releaseIdentity=resolve);
 const state=createEmptyState(),draft={payment:{rail:'lumo',idempotencyKey:'same-reference',amount:1000}},nodes=new Map(['.pay-recipient','#recipient-search','#lumo-people','#lumo-people-status','#lumo-people-retry','#payment-error','[data-action="pay-recipient-next"]'].map(selector=>[selector,new Node()]));
 const shared={connected:true,signedIn:true,user:{id:owner},authVersion:1,partnerRequests:[],searchPeople(){requests++;return delayed},resolve(){identityChecks++;return identity},async snapshot(){state.wallet+=100;return{ok:true}}};
 const ctx={route:{section:'pay',page:'recipient'},connected:true,state,draft,shared,$:selector=>nodes.get(selector),saveDraft(){}};
 const accepted=()=>{continued++;ctx.route={section:'pay',page:'amount'};scope.route=ctx.route;};
 let cleanup=bindLumoRecipientDirectory(ctx,ctx.route,{onContinue:accepted});
 const scope=vm.createContext({state,draft,shared,ctx,route:{section:'pay',page:'recipient'},refreshingShared:false,sharedHydrated:true,sharedConnectionError:'',overlayMeta:null,captureCurrent:null,consumerViewSnapshot,canRenderConsumerBackground,refreshAvailabilityControls,overlays:{querySelectorAll(){return[];}},view:{querySelector:selector=>selector.includes('#lumo-people')?nodes.get('#lumo-people'):null},persistence:{release(){}},render(){remounts++;cleanup();cleanup=bindLumoRecipientDirectory(ctx,ctx.route,{onContinue:accepted})},closeSheet(){},persistSession(){},JSON});
 vm.runInContext('let pendingSharedRender=false;const sharedViewSignature=()=>consumerViewSnapshot(state,shared.partnerRequests);'+refreshSource+';this.refresh=refreshShared;',scope);
 for(let i=0;i<8;i++)await scope.refresh();assert.equal(remounts,0);assert.equal(requests,1);
 release({ok:true,people:[person]});await tick();assert.match(nodes.get('#lumo-people').innerHTML,/@ama.test/);
 const selection=nodes.get('#lumo-people').emit('click',{target:{closest:()=>({dataset:{lumoPerson:id}})}});
 assert.equal(identityChecks,1);assert.equal(continued,0);assert.equal(nodes.get('#lumo-people').hidden,true);assert.equal(nodes.get('#lumo-people').innerHTML,'');
 for(let i=0;i<8;i++)await scope.refresh();
 assert.equal(remounts,0);assert.equal(requests,1);assert.equal(identityChecks,1);
 await nodes.get('[data-action="pay-recipient-next"]').emit('click');assert.equal(identityChecks,1);
 releaseIdentity({ok:true,recipient:person});await selection;
 assert.equal(continued,1);assert.equal(ctx.route.page,'amount');assert.equal(draft.payment.idempotencyKey,'same-reference');assert.equal(draft.payment.amount,1000);
 cleanup();
});

test('actual background snapshot refreshes service controls on a protected payment form without remounting it',async()=>{
 const state=createEmptyState(),draft={payment:{rail:'momo',amount:2500,recipientForms:{momo:{number:'0241234567'}}}},button=new Node(),notice=new Node(),input=new Node();input.value='0241234567';
 let remounts=0,paused=false;
 const shared={connected:true,signedIn:true,user:{id:'synthetic-owner'},authVersion:1,partnerRequests:[],capabilities:{serviceAvailability:[]},async snapshot(){shared.capabilities.serviceAvailability=[{serviceId:'momo_send_mtn',available:!paused,message:paused?'MTN is paused.':''}];return{ok:true};}};
 const ctx={connected:true,state,draft,shared},payment=draft.payment,before=JSON.stringify(payment);
 const dispose=bindAvailabilityControl(ctx,button,{message:()=>availabilityMessage(ctx,'momo','MTN MoMo'),notice});
 const view={querySelector:()=>input,querySelectorAll:()=>[button]},overlays={querySelectorAll:()=>[]};
 const scope=vm.createContext({state,draft,shared,ctx,route:{section:'pay',page:'recipient'},refreshingShared:false,sharedHydrated:true,sharedConnectionError:'',overlayMeta:null,captureCurrent:null,consumerViewSnapshot,canRenderConsumerBackground,refreshAvailabilityControls,view,overlays,persistence:{release(){}},render(){remounts++;},closeSheet(){},persistSession(){},JSON});
 vm.runInContext('let pendingSharedRender=false;const sharedViewSignature=()=>consumerViewSnapshot(state,shared.partnerRequests);'+refreshSource+';this.refresh=refreshShared;',scope);
 paused=true;await scope.refresh();assert.equal(button.disabled,true);assert.equal(notice.textContent,'MTN is paused.');
 paused=false;await scope.refresh();assert.equal(button.disabled,false);assert.equal(notice.hidden,true);
 assert.equal(remounts,0);assert.equal(input.value,'0241234567');assert.equal(draft.payment,payment);assert.equal(JSON.stringify(payment),before);dispose.dispose();
});
