'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/platform-runtime.js'),'utf8');
function fixture({online=true,offlineShell=false,serviceWorker}={}){
 const h=createHarness({modules:['core.js']});h.context.navigator.onLine=online;h.context.isSecureContext=true;h.context.location.reload=()=>h.reloads++;h.reloads=0;
 h.context.fetch=async()=>({ok:true,json:async()=>({name:'Lumo',start_url:'/'})});
 if(serviceWorker)h.context.navigator.serviceWorker=serviceWorker;
 h.L.state.onboarded=true;h.L.route='home';h.L.views.home=()=>'<h1>Home</h1><input id="kept-draft" value="42"><button id="pay" type="button" onclick="L.authorizePayment()">Pay</button><button id="record" type="button" onclick="L.go(\'record\')">View record</button>';
 h.L.views.record=()=>'<h1>Payment reference LM1</h1>';h.L.render();h.flush();
 if(offlineShell){const meta=h.document.createElement('meta');meta.setAttribute('name','lumo-shell-offline');meta.setAttribute('content','true');h.document.body.append(meta);}
 vm.runInContext(source,h.context,{filename:'platform-runtime.js'});return h;
}
test('offline keeps draft node and record access, disables registered money control and blocks API without mutation',()=>{
 const h=fixture(),field=h.document.getElementById('kept-draft'),before=JSON.stringify(h.L.state);field.value='57';field.focus();h.context.navigator.onLine=false;h.emit('offline');assert.equal(h.document.getElementById('kept-draft'),field);assert.equal(field.value,'57');assert.equal(h.document.activeElement,field);assert.equal(h.L.platform.requireOnline('Payment'),false);assert.equal(h.L.platform.canMoveMoney(),false);assert.equal(h.document.getElementById('pay').disabled,true);assert.equal(h.document.getElementById('record').disabled,false);assert.match(h.document.getElementById('platform-connection-status').textContent,/offline/);assert.equal(JSON.stringify(h.L.state),before);
});
test('cached offline navigation marker blocks money even when browser reports online',()=>{const h=fixture({offlineShell:true});assert.equal(h.L.platform.connection().online,false);assert.equal(h.document.getElementById('pay').disabled,true);});
test('cached offline marker remains on failed probe and retires only after verified origin reconnection',async()=>{
 const h=fixture({offlineShell:true});h.context.fetch=async()=>({ok:false});assert.equal(await h.L.platform.checkConnection(),false);assert(h.document.querySelector('meta[name="lumo-shell-offline"]'));assert.throws(()=>h.L.persistence.transaction(()=>42,{financial:true}),/Reconnect/);h.context.fetch=async()=>({ok:true,json:async()=>({name:'Lumo',start_url:'/'})});assert.equal(await h.L.platform.checkConnection(),true);assert.equal(h.document.querySelector('meta[name="lumo-shell-offline"]'),null);assert.equal(h.L.platform.connection().online,true);assert.equal(h.L.persistence.transaction(()=>42,{financial:true}),42);
});
test('reconnection reaches uncached manifest, never retries money, restores controls and reads core saved status',async()=>{
 const h=fixture({online:false});let requests=0;h.context.fetch=async(url,options)=>{requests++;assert.match(url,/lumo-connection-check/);assert.equal(options.cache,'no-store');return {ok:true,json:async()=>({name:'Lumo',start_url:'/'})};};h.L.persistence={status:()=>({blocked:false,lastSavedAt:'2026-10-29T17:45:00.000Z'})};h.context.navigator.onLine=true;assert.equal(await h.L.platform.checkConnection(),true);assert.equal(requests,1);assert.equal(h.document.getElementById('pay').disabled,false);assert.equal(h.L.platform.connection().lastSavedAt,'2026-10-29T17:45:00.000Z');assert.match(h.document.getElementById('platform-connection-status').textContent,/Nothing was sent automatically/);assert.equal(h.L.state.txs.length,0);h.L.persistence.status=()=>({blocked:true});assert.equal(h.L.platform.canMoveMoney(),false);
});
test('failed or stale connection checks cannot unblock a now-offline client',async()=>{
 const h=fixture({online:false});h.context.navigator.onLine=true;h.context.fetch=async()=>({ok:false});assert.equal(await h.L.platform.checkConnection(),false);let resolve;h.context.fetch=()=>new Promise(r=>{resolve=r;});const checking=h.L.platform.checkConnection();h.context.navigator.onLine=false;h.emit('offline');resolve({ok:true,json:async()=>({name:'Lumo',start_url:'/'})});assert.equal(await checking,false);assert.equal(h.L.platform.connection().online,false);assert.equal(h.L.platform.connection().reconnecting,false);
});
test('updates never reload unfinished work and activate only after explicit request',async()=>{
 const events={},messages=[];const registration={waiting:{postMessage:message=>messages.push(message)},addEventListener(){}};const serviceWorker={controller:{},register:async(url,options)=>{assert.equal(url,'/sw.js');assert.equal(options.updateViaCache,'none');return registration;},addEventListener:(type,fn)=>{events[type]=fn;}};
 const h=fixture({serviceWorker});await h.L.platform.registerShell();h.L.state.paymentDraft={id:'unfinished'};assert.equal(h.L.platform.applyUpdate(),false);assert.equal(messages.length,0);assert.equal(h.reloads,0);h.L.state.paymentDraft=null;assert.equal(h.L.platform.applyUpdate(),true);assert.equal(JSON.stringify(messages),JSON.stringify([{type:'LUMO_ACTIVATE_UPDATE'}]));assert.equal(h.reloads,0);events.controllerchange();assert.equal(h.reloads,1);
});
test('activation in another client never silently reloads this client',async()=>{
 const events={},registration={waiting:null,addEventListener(){}};const h=fixture({serviceWorker:{controller:{},register:async()=>registration,addEventListener:(type,fn)=>{events[type]=fn;}}});await h.L.platform.registerShell();events.controllerchange();assert.equal(h.reloads,0);assert.equal(h.L.platform.connection().updateReady,true);h.L.state.paymentDraft={id:'keep'};assert.equal(h.L.platform.applyUpdate(),false);assert.equal(h.reloads,0);h.L.state.paymentDraft=null;assert.equal(h.L.platform.applyUpdate(),true);assert.equal(h.reloads,1);
});
test('an update preserves an unsent Chat question until the customer finishes it',async()=>{
 const messages=[],registration={waiting:{postMessage:message=>messages.push(message)},addEventListener(){}};
 const h=fixture({serviceWorker:{controller:{},register:async()=>registration,addEventListener(){}}});await h.L.platform.registerShell();
 const field=h.document.createElement('textarea');field.id='chatText';field.value='Can I meet my laptop target?';h.document.getElementById('view').append(field);field.focus();
 assert.equal(h.L.platform.applyUpdate(),false);assert.equal(messages.length,0);assert.equal(h.reloads,0);assert.equal(field.value,'Can I meet my laptop target?');assert.equal(h.document.activeElement,field);
 field.value='';assert.equal(h.L.platform.applyUpdate(),true);assert.equal(messages.length,1);
});
