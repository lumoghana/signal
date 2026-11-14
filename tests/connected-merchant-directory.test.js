import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction,migrateState,validStoredState} from '../dist/js/model.js';
import {renderPaymentsHub} from '../dist/js/payments-hub.js';
import {connectedMerchantMatches,connectedMerchants,merchantDistance,renderConnectedCampus,bindConnectedCampus} from '../dist/js/consumer-merchant-directory.js';
import {merchantReturnDestination,payMerchantAgain,openSharedMerchant,renderPayments,bindPayments} from '../dist/js/payments.js';
import {createApprovedService} from '../dist/js/approved-service.js';
import {prepareMutation} from '../backend/supabase/functions/lumo-approved/engine.mjs';

const SHOP='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',REQUEST='33333333-3333-4333-8333-333333333333';
const published={id:SHOP,businessId:'merchant-one',businessName:'Akua’s Kitchen',name:'Night Market counter',category:'Food',area:'Night Market',landmark:'Beside the library',code:'LUM400001',hours:'7 am–9 pm',lat:5.6509,lng:-.1878,published:true,accepting:true,open:true};
const quote=()=>({ok:true,merchant:{id:'merchant-one',name:published.businessName},shop:{...published}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function directoryHarness({read=async()=>({ok:true,shops:[published]})}={}){
 let epoch=1,refreshes=0;const events=new Map(),actions=[],opened=[];
 const container={isConnected:true,addEventListener(type,fn){events.set(type,fn);},removeEventListener(type,fn){if(events.get(type)===fn)events.delete(type);}};
 const root={querySelector:selector=>selector==='[data-connected-directory]'?container:null};
 const ctx={connected:true,state:createEmptyState(),draft:{},shared:{get authVersion(){return epoch;},merchantDirectory:read},refresh(){refreshes++;},act(type,payload){actions.push({type,payload});return applyAction(this.state,type,payload);},openQrMerchant(...args){opened.push(args);}};
 const dispose=bindConnectedCampus(ctx,root);
 return {ctx,actions,opened,container,dispose,html:()=>renderConnectedCampus(ctx),get refreshes(){return refreshes;},switchAccount(){epoch++;ctx.state=createEmptyState();},click(action,id){return events.get('click')?.({target:{closest:()=>({disabled:false,dataset:{mdAction:action,shopId:id}})}});},input(name,value){events.get('input')?.({target:{name,value}});},change(name,value){events.get('change')?.({target:{name,value}});}};
}
function paymentHarness(){
 const nodes=new Map(),state=createEmptyState();state.wallet=200000;state.buffer=0;let route={section:'pay',page:'home',hubTab:'campus'};
 const ctx={connected:true,state,draft:{},get route(){return route;},shared:{authVersion:1,quote:async()=>quote()},toast(){},saveDraft(){},setCapture(){},closeSheet(){},refresh(){},go(next){route=next;},sheet(){throw Error('No unfinished payment expected.');},auth(options){ctx.authorizations.push(options);},authorizations:[],act(){throw Error('Review cannot debit money.');},$(selector){if(selector==='#payment-error')return ctx.error;const action=selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];if(!action)return null;if(!nodes.has(action))nodes.set(action,{listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});return nodes.get(action);},$$(selector){const node=this.$(selector);return node?[node]:[];},error:{textContent:'',hidden:true}};
 return {ctx,nodes,get route(){return route;},bind(){return bindPayments(ctx,route);},click(action){return nodes.get(action)?.listeners.click?.();}};
}

test('connected Campus Pay uses the authoritative directory and never substitutes illustrative merchants',()=>{
 const state=createEmptyState(),connected=renderPaymentsHub({connected:true,state,draft:{},shared:{authVersion:1}},{hubTab:'campus'}),sample=renderPaymentsHub({state,draft:{}},{hubTab:'campus'});
 assert.match(connected,/data-connected-directory/);assert.match(connected,/Loading registered shops/);assert.doesNotMatch(connected,/gobe-spot|balme-prints|campus-shuttle|spots · demo/);assert.match(sample,/gobe-spot/);
});

test('published shops search all merchant fields, sort by proximity, and retain paused shops as visible unavailable choices',()=>{
 const paused={...published,id:OTHER,name:'Pentagon',accepting:false,lat:5.6535,lng:-.1845};
 for(const query of ['Akua kitchen','food','Night Market','library','LUM400001'])assert.equal(connectedMerchantMatches(published,query),true,query);
 const hidden={...published,id:'private',published:false},unintentional={...published,id:'unspecified'};delete unintentional.published;
 assert.deepEqual(connectedMerchants([paused,hidden,published,unintentional]).map(shop=>shop.id),[SHOP,OTHER]);
 assert.deepEqual(connectedMerchants([paused,published],{openOnly:true}).map(shop=>shop.id),[SHOP]);
 assert.equal(merchantDistance(null,[0,0]),Infinity);assert.equal(connectedMerchants([{...published,lat:null}])[0].distance,Infinity);
});

test('directory loading, details, saved shops, manual areas and unavailable favourite removal work without moving money',async()=>{
 const h=directoryHarness(),before=h.ctx.state.wallet;
 try{await flush();assert.match(h.html(),/Akua’s Kitchen/);h.input('connectedMerchantSearch','library');assert.match(h.html(),/1 shop/);h.input('connectedMerchantSearch','not a shop');assert.match(h.html(),/No matching shops/);h.input('connectedMerchantSearch','');h.change('merchantArea','Pentagon');assert.match(h.html(),/near Pentagon/);
 await h.click('favorite',SHOP);assert.equal(h.actions[0].type,'saveMerchantFavorite');assert.equal(h.ctx.state.merchantFavorites[0].shopId,SHOP);h.click('detail',SHOP);assert.match(h.html(),/Stated hours/);assert.match(h.html(),/7 am–9 pm/);assert.match(h.html(),/LUM400001/);h.click('pay',SHOP);assert.equal(h.opened[0][0],SHOP);h.click('back');h.click('favorites');assert.match(h.html(),/Your saved shops/);
 h.ctx.state.merchantFavorites.push({shopId:OTHER,savedAt:new Date().toISOString()});assert.match(h.html(),/Saved shop unavailable/);await h.click('remove',OTHER);assert.equal(h.ctx.state.merchantFavorites.some(item=>item.shopId===OTHER),false);assert.equal(h.ctx.state.wallet,before);assert.equal(h.ctx.state.transactions.length,0);
 }finally{h.dispose();}
});

test('permission denial leaves manual browsing usable and account switching drops location and saved-shop visibility',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition(success,failure){failure({code:1});}}}});
 const h=directoryHarness();try{await flush();await h.click('locate');assert.match(h.html(),/Location was not available/);assert.match(h.html(),/Choose campus area/);await h.click('favorite',SHOP);h.click('favorites');h.switchAccount();assert.doesNotMatch(h.html(),/Your saved shops|Remove from favourite|Location was not available/);assert.deepEqual(h.ctx.state.merchantFavorites,[]);}finally{h.dispose();if(prior)Object.defineProperty(globalThis,'navigator',prior);else delete globalThis.navigator;}
});

test('connection errors show a retry and a delayed old-account directory response cannot overwrite the new view',async()=>{
 let finish;const h=directoryHarness({read:()=>new Promise(resolve=>{finish=resolve;})});try{await flush();h.switchAccount();finish({ok:true,shops:[published]});await flush();assert.doesNotMatch(h.html(),/Akua’s Kitchen/);}finally{h.dispose();}
 const unavailable=directoryHarness({read:async()=>({ok:false,message:'Directory connection lost.'})});try{await flush();assert.match(unavailable.html(),/Directory connection lost/);assert.match(unavailable.html(),/Try again/);assert.doesNotMatch(unavailable.html(),/Gɔbɛ|Gobe/);}finally{unavailable.dispose();}
});

test('favourite records are validated, bounded, deduplicated and contain no payment request or credentials',()=>{
 const state=createEmptyState(),before=state.wallet;assert.equal(applyAction(state,'saveMerchantFavorite',{shopId:SHOP}).ok,true);assert.equal(applyAction(state,'saveMerchantFavorite',{shopId:SHOP}).duplicate,true);assert.deepEqual(Object.keys(state.merchantFavorites[0]).sort(),['savedAt','shopId']);assert.equal(applyAction(state,'saveMerchantFavorite',{shopId:'invented'}).ok,false);assert.equal(state.wallet,before);assert.equal(validStoredState(state),true);
 state.merchantFavorites.push({...state.merchantFavorites[0]},{shopId:OTHER,savedAt:'invalid'},{shopId:OTHER,savedAt:new Date().toISOString(),requestId:REQUEST});migrateState(state);assert.equal(state.merchantFavorites.length,1);
 for(let n=2;n<=30;n++)assert.equal(applyAction(state,'saveMerchantFavorite',{shopId:`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`}).ok,true);assert.equal(applyAction(state,'saveMerchantFavorite',{shopId:OTHER}).ok,false);
});

test('the shared engine validates a favourite against a fresh shop quote and never creates a ledger intent',async()=>{
 const snapshot={account:{id:'wallet',userId:'actor',displayName:'Ama',balance:10000},groups:[],boxes:[],receipts:[],requests:[],partners:[],state:createEmptyState()},calls=[];
 const repo={quote:async values=>{calls.push(values);return quote();}};
 const saved=await prepareMutation(snapshot,'saveMerchantFavorite',{shopId:SHOP},'favorite-attempt',repo);assert.equal(saved.ok,true);assert.deepEqual(calls,[{shopId:SHOP}]);assert.equal(saved.requiresAuth,false);assert.deepEqual(saved.intents,[]);assert.equal(saved.durableState.merchantFavorites[0].shopId,SHOP);assert.equal(saved.state.wallet,10000);assert.deepEqual(snapshot.state.merchantFavorites,[]);
 await assert.rejects(prepareMutation(snapshot,'saveMerchantFavorite',{shopId:SHOP,requestId:REQUEST},'badfavorite',repo),{code:'INVALID_INPUT'});
 await assert.rejects(prepareMutation(snapshot,'saveMerchantFavorite',{shopId:SHOP},'privatefavorite',{quote:async()=>({ok:false})}),{code:'REQUEST_UNAVAILABLE'});
});

test('Pay again discards the old fixed request, amount, transaction reference and approval, then requires a new review and PIN',async()=>{
 const h=paymentHarness(),old={id:'old-transaction',reference:'LM-OLD',type:'payment',direction:'out',status:'success',shopId:SHOP,requestId:REQUEST,amount:2500,approved:true};
 assert.deepEqual(merchantReturnDestination(old),{shopId:SHOP});assert.equal(merchantReturnDestination({...old,status:'pending'}),null);
 const calls=[];h.ctx.shared.quote=async values=>{calls.push(values);return quote();};
 await payMerchantAgain(h.ctx,old);assert.deepEqual(calls,[{shopId:SHOP}]);assert.equal(h.route.page,'amount');assert.equal(h.ctx.draft.payment.amount,0);assert.equal(h.ctx.draft.payment.requestId,undefined);assert.equal(h.ctx.draft.payment.reference,undefined);assert.equal(h.ctx.draft.payment.approved,undefined);assert.notEqual(h.ctx.draft.payment.idempotencyKey,old.id);
 h.ctx.draft.payment.amount=2500;h.ctx.go({section:'pay',page:'review'});h.bind();assert.equal(h.ctx.authorizations.length,0);await h.click('pay-review-next');assert.equal(calls.length,2);assert.equal(h.ctx.authorizations.length,1);assert.equal(h.ctx.state.wallet,200000);
});

test('a fresh changed or unavailable merchant quote cannot reach authentication or silently replace reviewed details',async()=>{
 for(const changed of [{ok:false,message:'Shop paused.'},{...quote(),shop:{...published,name:'New receiving counter'}}]){const h=paymentHarness();await openSharedMerchant(h.ctx,{shopId:SHOP});h.ctx.draft.payment.amount=2500;h.ctx.go({section:'pay',page:'review'});h.ctx.shared.quote=async()=>changed;h.bind();await h.click('pay-review-next');assert.equal(h.ctx.authorizations.length,0);assert.equal(h.ctx.state.wallet,200000);assert.match(h.ctx.error.textContent,/paused|changed/);}
});

test('merchant directory transport is public, scoped to the current auth epoch, and does not upload local money records',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},calls=[];
 const service=createApprovedService({storage,modeStorage:storage,fetch:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>({ok:true,shops:[published]})};}});
 const result=await service.merchantDirectory();assert.equal(result.shops[0].id,SHOP);assert.deepEqual(calls[0].body,{action:'merchant',path:'/api/directory',method:'GET'});assert.equal(calls[0].options.headers.Authorization,undefined);assert.equal(values.size,0);
});

test('existing native merchant reviews remain compatible while new clients verify business and shop details',async()=>{
 const snapshot={account:{id:'wallet',userId:'actor',displayName:'Ama',balance:10000},groups:[],boxes:[],receipts:[],requests:[],partners:[],state:createEmptyState()};
 const base={rail:'merchant',shopId:SHOP,amount:500,merchant:published.name,category:'Food'};
 const legacy=await prepareMutation(snapshot,'payment',base,'legacy-native-review',{quote:async()=>quote()});
 assert.equal(legacy.ok,true);assert.equal(legacy.intents[0].metadata.merchantName,published.businessName);assert.equal(legacy.intents[0].shopId,SHOP);
 await assert.rejects(prepareMutation(snapshot,'payment',{...base,shopName:published.name},'modern-wrong-business',{quote:async()=>quote()}),{code:'MERCHANT_DETAILS_CHANGED'});
 await assert.rejects(prepareMutation(snapshot,'payment',{...base,merchant:'A different merchant'},'wrong-legacy-name',{quote:async()=>quote()}),{code:'MERCHANT_DETAILS_CHANGED'});
});

test('merchant directory load, search and filter notifications never remount the consumer page',async()=>{
 const h=directoryHarness();await flush();await flush();assert.equal(h.refreshes,0);
 h.input('connectedMerchantSearch','library');h.change('merchantCategory','Food');h.change('merchantArea','Pentagon');await h.click('favorites');
 assert.equal(h.refreshes,0);assert.match(h.html(),/value="library"/);h.dispose();
});
