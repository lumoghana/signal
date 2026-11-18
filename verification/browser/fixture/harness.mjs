import {createApprovedService} from '/js/approved-service.js';
import {renderPayments,bindPayments} from '/js/payments.js';
import {renderChat,bindChat} from '/js/chat.js';
import {rememberMainTab,mainTabDestination} from '/js/main-tab-state.js';
import {resetConsumerRewards} from '/js/consumer-rewards.js';
import {fixtureState,OWNER,SHOP} from './synthetic.mjs';

const view=document.querySelector('#fixture-view'),notice=document.querySelector('#fixture-notice'),scenario=new URL(location.href).searchParams.get('scenario')||'normal',run=crypto.randomUUID(),requests=[];
const seed={access_token:'a.b.c',refresh_token:'synthetic-refresh-only',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:OWNER},lumoAuthGeneration:'synthetic-browser-session'};
localStorage.setItem('lumo-approved-session-v1',JSON.stringify(seed));sessionStorage.removeItem('lumo-approved-sample-v1');
let state=fixtureState(),route={section:'pay',page:'home',hubTab:'campus'},cleanup=null,authRequests=0;
const draft={};
if(scenario==='pending')draft.payment={rail:'merchant',recipient:{id:SHOP,name:'Original synthetic merchant'},shopId:SHOP,shopName:'Original counter',amount:5000,amountText:'50',category:'Other',idempotencyKey:'original-reviewed-browser-request',submissionState:'unknown',submissionOwnerId:OWNER,submissionAttemptId:'original-reviewed-browser-request',submittedPayload:{rail:'merchant',shopId:SHOP,amount:5000,merchant:'Original synthetic merchant',category:'Other'}};
function audit(){document.querySelector('#fixture-audit').textContent=JSON.stringify({route,wallet:state.wallet,transactions:state.transactions.length,authRequests,paymentReference:draft.payment?.idempotencyKey||null,requests},null,2);}
const service=createApprovedService({config:{url:location.origin,publishableKey:'synthetic-public-key',luxUrl:location.origin+'/__fixture/lux'},storage:localStorage,modeStorage:sessionStorage,fetch:async(url,options)=>{
 const target=new URL(url);if(target.origin!==location.origin)throw Error('Verification cannot contact external services');
 target.searchParams.set('scenario',scenario);const input=JSON.parse(options.body||'{}'),copy=structuredClone(input);if(copy.payload?.claimCode)copy.payload.claimCode='[private linking code]';
 requests.push({path:target.pathname,body:copy});audit();
 const response=await fetch(target,{...options,headers:{...options.headers,'x-lumo-fixture-run':run}});audit();return response;
},onSnapshot(next){state=next;}});
const ctx={connected:true,get state(){return state;},draft,get route(){return route;},shared:service,$:selector=>view.querySelector(selector),$$:selector=>[...view.querySelectorAll(selector)],go(next){cleanup?.();cleanup=null;route=next;render();},refresh:()=>render(),saveDraft:audit,setCapture(){},toast(message){notice.textContent=message;audit();},auth(){authRequests++;notice.textContent='Approval requested. This fixture never enters a PIN or authorises money.';audit();},sheet(){throw Error('Unexpected sheet: the acceptance journey must choose its original request explicitly.');},closeSheet(){},act(){throw Error('This fixture does not execute financial actions.');},actAsync(){throw Error('This fixture does not execute financial actions.');}};
function render(){cleanup?.();cleanup=null;if(route.section==='pay'){view.innerHTML=renderPayments(ctx,route);cleanup=bindPayments(ctx,route)||null;}else if(route.section==='chat'){view.innerHTML=renderChat(ctx,route);cleanup=bindChat(ctx,route);}else{view.innerHTML='<section><h1>Fixture Home</h1><p>Your synthetic wallet is unchanged. Use Pay to return to the actual saved payment or reward destination.</p></section>';}audit();}
document.querySelector('#fixture-home').onclick=()=>{rememberMainTab(draft,route,view.scrollTop,undefined,Date.now());ctx.go({section:'home',page:'home'});};
document.querySelector('#fixture-pay').onclick=()=>{const target=mainTabDestination('pay',state,draft,{now:Date.now(),currentRoute:route});ctx.go(target.route);view.scrollTop=target.scroll;};
document.querySelector('#fixture-chat').onclick=()=>ctx.go({section:'chat',page:'home',returnTo:route});
document.querySelector('#fixture-end-session').onclick=async()=>{await service.signOut();resetConsumerRewards(ctx);state=fixtureState();delete draft.mainTabs;ctx.go({section:'home',page:'home'});notice.textContent='Synthetic session ended; stale replies must be ignored.';};
render();
