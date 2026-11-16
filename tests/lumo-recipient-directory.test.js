import test from 'node:test';
import assert from 'node:assert/strict';
import {lumoDirectoryPeople,renderLumoRecipientDirectory,bindLumoRecipientDirectory} from '../dist/js/lumo-recipient-directory.js';

const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const person={id,userId:id,handle:'sample.friend',name:'Synthetic Friend',rail:'lumo'};
const another={id:other,userId:other,handle:'second.friend',name:'Second Friend',rail:'lumo'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const timer=()=>new Promise(resolve=>setTimeout(resolve,5));
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
function node(){
 const events=new Map(),attributes=new Map();
 return{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,isConnected:true,addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener(name,fn){events.get(name)?.delete(fn);},setAttribute(name,value){attributes.set(name,value);},getAttribute(name){return attributes.get(name);},emit(name,event={}){return Promise.all([...events.get(name)||[]].map(fn=>fn(event)));}};
}
function harness(options={}){
 let nodes;const searches=[],resolutions=[],routes=[];
 const shared={user:{id:owner},authVersion:0,signedIn:true,async searchPeople(query){searches.push(query);return options.searchPeople?options.searchPeople(query):{ok:true,people:[person],hasMore:false};},async resolve(query){resolutions.push(query);return options.resolve?options.resolve(query):{ok:true,recipient:person};}};
 const ctx={connected:true,shared,route:{section:'pay',page:'recipient'},draft:{payment:{rail:'lumo',recipientSearch:'',amount:1500,idempotencyKey:'unchanged-payment-reference'}},saveDraft(){},$(selector){return nodes.get(selector);}};
 const makeNodes=()=>new Map(['.pay-recipient','#recipient-search','#lumo-people','#lumo-people-status','#lumo-friends-picker','#lumo-people-retry','#payment-error','[data-action="pay-recipient-next"]'].map(selector=>[selector,node()]));
 nodes=makeNodes();let dispose=bindLumoRecipientDirectory(ctx,ctx.route,{delay:0,onContinue:recipient=>routes.push(recipient)});
 return{ctx,shared,searches,resolutions,routes,get nodes(){return nodes;},dispose(){dispose();},replace(){nodes.get('.pay-recipient').isConnected=false;dispose();nodes=makeNodes();dispose=bindLumoRecipientDirectory(ctx,ctx.route,{delay:0,onContinue:recipient=>routes.push(recipient)});},async type(value){nodes.get('#recipient-search').value=value;await nodes.get('#recipient-search').emit('input');},choose(value=id){return nodes.get('#lumo-people').emit('click',{target:{closest:()=>({dataset:{lumoPerson:value}})}});},proceed(){return nodes.get('[data-action="pay-recipient-next"]').emit('click');}};
}

test('the people contract keeps only verified immutable recipient identity fields',()=>{
 assert.deepEqual(lumoDirectoryPeople({ok:true,people:[{...person,phone:'private',wallet:99999,pin:'secret'}]},owner),[person]);
});
test('directory responses must be successful bounded arrays',()=>{
 for(const reply of [{ok:false,message:'Service unavailable'},{ok:true},{ok:true,people:{}},{ok:true,people:Array(21).fill(person)}])assert.throws(()=>lumoDirectoryPeople(reply,owner));
});
test('duplicate and own-account recipients cannot enter the directory',()=>{
 assert.throws(()=>lumoDirectoryPeople({ok:true,people:[person,person]},owner));assert.throws(()=>lumoDirectoryPeople({ok:true,people:[{...person,id:owner,userId:owner}]},owner));assert.throws(()=>lumoDirectoryPeople({ok:true,people:[{...person,userId:other}]},owner));
});
test('recipient identities reject malformed handles, IDs, names and rails',()=>{
 for(const patch of [{id:'local-1',userId:'local-1'},{handle:'@sample.friend'},{handle:'xx'},{handle:'Sample'},{name:''},{name:'a'.repeat(81)},{name:'Bad\nname'},{rail:'momo'}])assert.throws(()=>lumoDirectoryPeople({ok:true,people:[{...person,...patch}]},owner));
});
test('recipient UI escapes draft text and exposes the saved-friends entry',()=>{
 const html=renderLumoRecipientDirectory({recipientSearch:'"><img src=x onerror=alert(1)>'});assert.ok(html.includes('&lt;img'));assert.equal(html.includes('<img'),false);assert.ok(html.includes('id="lumo-friends-picker"'));assert.ok(html.includes('Select from friends list or @username.'));assert.ok(html.includes('aria-live="polite"'));
});
test('the recipient page loads registered users through the authenticated search service',async()=>{
 const f=harness();await tick();assert.deepEqual(f.searches,['']);assert.ok(f.nodes.get('#lumo-people').innerHTML.includes('@sample.friend'));assert.ok(f.nodes.get('#lumo-people-status').textContent.includes('1 person'));assert.equal(f.routes.length,0);f.dispose();
});
test('one-character searches give guidance without making a lookup',async()=>{
 const f=harness();await tick();await f.type('@s');await timer();assert.deepEqual(f.searches,['']);assert.equal(f.nodes.get('[data-action="pay-recipient-next"]').disabled,true);assert.ok(f.nodes.get('#lumo-people-status').textContent.includes('at least two'));f.dispose();
});
test('debouncing searches sends only the latest typed query and retains the draft text',async()=>{
 const f=harness();await tick();await f.type('sa');await f.type('@sample');await timer();assert.deepEqual(f.searches,['','@sample']);assert.equal(f.ctx.draft.payment.recipientSearch,'@sample');f.dispose();
});
test('a late search response cannot overwrite newer matching people',async()=>{
 const old=deferred(),fresh=deferred();const f=harness({searchPeople:query=>query==='older'?old.promise:query==='newer'?fresh.promise:{ok:true,people:[person]}});await tick();await f.type('older');await timer();await f.type('newer');await timer();fresh.resolve({ok:true,people:[another]});await tick();old.resolve({ok:true,people:[person]});await tick();assert.ok(f.nodes.get('#lumo-people').innerHTML.includes('Second Friend'));assert.equal(f.nodes.get('#lumo-people').innerHTML.includes('Synthetic Friend'),false);f.dispose();
});
test('rerendering the same recipient page reuses in-flight searches and verified results',async()=>{
 const pending=deferred(),f=harness({searchPeople:()=>pending.promise});assert.equal(f.searches.length,1);f.replace();assert.equal(f.searches.length,1);pending.resolve({ok:true,people:[person]});await tick();assert.ok(f.nodes.get('#lumo-people').innerHTML.includes('Synthetic Friend'));f.replace();assert.equal(f.searches.length,1);assert.ok(f.nodes.get('#lumo-people').innerHTML.includes('Synthetic Friend'));f.dispose();
});
test('search failure displays a reachable retry and a successful retry removes the error',async()=>{
 let attempts=0;const f=harness({searchPeople:async()=>++attempts===1?{ok:false,message:'Reconnect to find people'}:{ok:true,people:[person]}});await tick();assert.equal(f.nodes.get('#lumo-people-retry').hidden,false);assert.ok(f.nodes.get('#payment-error').textContent.includes('Reconnect'));await f.nodes.get('#lumo-people-retry').emit('click');await tick();assert.equal(f.nodes.get('#lumo-people-retry').hidden,true);assert.equal(f.nodes.get('#payment-error').hidden,true);assert.ok(f.nodes.get('#lumo-people').innerHTML.includes('Synthetic Friend'));f.dispose();
});
test('choosing a person resolves their identity once despite repeated taps',async()=>{
 const pending=deferred(),f=harness({resolve:()=>pending.promise});await tick();const first=f.choose(),second=f.choose();assert.equal(f.resolutions.length,1);assert.equal(f.routes.length,0);assert.equal(f.nodes.get('[data-action="pay-recipient-next"]').disabled,true);pending.resolve({ok:true,recipient:person});await Promise.all([first,second]);assert.equal(f.routes.length,1);assert.equal(f.routes[0].userId,id);assert.equal(f.ctx.draft.payment.amount,1500);assert.equal(f.ctx.draft.payment.idempotencyKey,'unchanged-payment-reference');f.dispose();
});
test('a reassigned selected username is rejected before any amount navigation',async()=>{
 const f=harness({resolve:async()=>({ok:true,recipient:{...person,id:other,userId:other}})});await tick();await f.choose();assert.equal(f.routes.length,0);assert.ok(f.nodes.get('#payment-error').textContent.includes('username changed'));f.dispose();
});
test('an exact typed @username can resolve through the same authoritative path',async()=>{
 const f=harness();await tick();await f.type('@sample.friend');await f.proceed();assert.deepEqual(f.resolutions,['@sample.friend']);assert.equal(f.routes.length,1);assert.equal(f.routes[0].number,'@sample.friend');f.dispose();
});
test('disposing a page while recipient resolution is pending prevents navigation',async()=>{
 const pending=deferred(),f=harness({resolve:()=>pending.promise});await tick();const result=f.choose();f.dispose();pending.resolve({ok:true,recipient:person});await result;assert.equal(f.routes.length,0);
});
test('changing the visible route while recipient resolution is pending prevents navigation',async()=>{
 const pending=deferred(),f=harness({resolve:()=>pending.promise});await tick();const result=f.choose();f.ctx.route={section:'boxes',page:'home'};pending.resolve({ok:true,recipient:person});await result;assert.equal(f.routes.length,0);f.dispose();
});
test('switching accounts during lookup discards the previous recipient',async()=>{
 const pending=deferred(),f=harness({resolve:()=>pending.promise});await tick();const result=f.choose();f.shared.user={id:other};f.shared.authVersion++;pending.resolve({ok:true,recipient:person});await result;assert.equal(f.routes.length,0);f.dispose();
});
test('replacing the payment draft while a lookup is pending prevents stale navigation',async()=>{
 const pending=deferred(),f=harness({resolve:()=>pending.promise});await tick();const result=f.choose();f.ctx.draft.payment={rail:'lumo',amount:2500,idempotencyKey:'new-reference'};pending.resolve({ok:true,recipient:person});await result;assert.equal(f.routes.length,0);assert.equal(f.ctx.draft.payment.idempotencyKey,'new-reference');f.dispose();
});
test('a new authentication epoch reloads the directory and blocks a former lookup',async()=>{
 const pending=deferred(),f=harness({resolve:()=>pending.promise});await tick();const result=f.choose();f.shared.authVersion++;f.replace();await tick();assert.equal(f.searches.length,2);pending.resolve({ok:true,recipient:person});await result;assert.equal(f.routes.length,0);f.dispose();
});
test('a saved friend uses the same authoritative identity check and preserves the existing payment draft',async()=>{
 const f=harness();let choose;f.ctx.openFriends=options=>{choose=options.onSelect;};await tick();await f.nodes.get('#lumo-friends-picker').emit('click');assert.equal(typeof choose,'function');choose({...person,listName:'Circle',available:true,revision:1});await tick();assert.equal(f.routes.length,1);assert.equal(f.routes[0].userId,id);assert.equal(f.ctx.draft.payment.amount,1500);assert.equal(f.ctx.draft.payment.idempotencyKey,'unchanged-payment-reference');f.dispose();
});
test('a saved friend whose handle has changed owner cannot bypass recipient verification',async()=>{
 const f=harness({resolve:async()=>({ok:true,recipient:{...person,id:other,userId:other}})});let choose;f.ctx.openFriends=options=>{choose=options.onSelect;};await tick();await f.nodes.get('#lumo-friends-picker').emit('click');choose({...person,listName:'Circle',available:true,revision:1});await tick();assert.equal(f.routes.length,0);assert.ok(f.nodes.get('#payment-error').textContent.includes('username changed'));f.dispose();
});
test('unavailable saved friends and callbacks from an abandoned page cannot navigate',async()=>{
 const f=harness();let choose;f.ctx.openFriends=options=>{choose=options.onSelect;};await tick();await f.nodes.get('#lumo-friends-picker').emit('click');choose({...person,listName:'Circle',available:false,revision:1});await tick();assert.equal(f.routes.length,0);assert.ok(f.nodes.get('#payment-error').textContent.includes('unavailable'));f.ctx.route={section:'boxes',page:'home'};choose({...person,listName:'Circle',available:true,revision:1});await tick();assert.equal(f.routes.length,0);assert.equal(f.resolutions.length,0);f.dispose();
});
