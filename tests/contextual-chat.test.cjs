/* Context explanations use the shipped task/history/payment authorities. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!scripts.includes('contextual-chat.js'))scripts.push('contextual-chat.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function fixture(patch={},options={}){
 const h=createHarness({clock:true,modules:scripts,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],txs:[],chats:[],paymentDraft:null,planDraft:null,budgetGuideSession:null,planSaved:true,planHorizon:{mode:'unspecified',date:''},allowance:{amount:0,date:'',source:'Family'},...patch});
 L.openTab('home');L.balances();L.save();L.render();h.flush();return h;
}
const clean=h=>assert.deepEqual(h.errors,[]);
const facts=L=>JSON.stringify([L.state.balance,L.state.essentials,L.state.goals,L.state.txs,L.state.paymentDraft,L.state.moneyBoxProtection]);
const click=(h,label)=>{const b=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);b.click();h.flush();return b;};
function pause(h){const {L}=h;L.pickMerchant('AK01');h.flush();h.set('payment-amount','280');h.set('payment-essential','');L.preparePayment();h.flush();assert.equal(L.route,'pause');return L.state.paymentDraft;}
function help(h){click(h,'Help me understand this');h.flushHistory();h.flush();assert.equal(h.L.route,'chat');assert.equal(h.L.taskSheet.active,false);}
check('Pause help carries the exact projected consequence without changing funds, source or confirmation',()=>{
 const h=fixture(),d=pause(h),before=facts(h.L);help(h);const r=h.L.state.chats.at(-1);assert.equal(r.intent,'contextualHelp');assert.match(r.headline,/Food and transport would be GH₵130.00 short/);assert.match(r.support,/GH₵280.00 to Akua/);assert.equal(r.calculation.rows.find(x=>x[0]==='Projected Everyday balance')[1],'GH₵220.00');assert.equal(facts(h.L),before);assert.equal(d.submittedTxId,undefined);assert.equal(view(h).querySelectorAll('[data-context-return]').length,1);assert.match(view(h).querySelector('[data-context-return]').textContent,/Return to payment/);clean(h);
});
check('returning from help restores the same Pause and requires its remaining visible reading time',()=>{
 const h=fixture(),d=pause(h);h.advance(900);h.advance(500);const before=facts(h.L);help(h);h.advance(10000);h.L.contextualChat.returnToTask();h.flush();assert.equal(h.L.route,'pause');assert.equal(h.L.state.paymentDraft,d);assert.equal(facts(h.L),before);let b=view(h).querySelector('[data-pause-hold]');assert.equal(b.getAttribute('aria-disabled'),'true');h.advance(2500);assert.equal(b.getAttribute('aria-disabled'),'false');assert.equal(h.L.route,'pause');assert.equal(h.L.state.txs.length,0);clean(h);
});
check('the same handoff survives deferred native task history without cancellation or duplicate turns',()=>{
 const h=fixture({}, {deferHistory:true}),d=pause(h),before=facts(h.L);click(h,'Help me understand this');h.flushHistory();h.flush();assert.equal(h.L.route,'chat');assert.equal(h.L.state.chats.filter(r=>r.intent==='contextualHelp').length,1);assert.equal(h.L.state.paymentDraft,d);assert.equal(facts(h.L),before);assert.equal(h.L.taskSheet.active,false);h.L.contextualChat.returnToTask();h.flush();assert.equal(h.L.route,'pause');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);clean(h);
});
check('a changed payment or account projection returns to review and retires its old consent',()=>{
 const h=fixture(),d=pause(h);help(h);d.amount=140;d.pauseAcceptedSignature='old';d.reviewFingerprint='old';h.L.contextualChat.returnToTask();h.flush();assert.equal(h.L.route,'paymentReview');assert.equal(d.amount,140);assert.equal(d.pauseAcceptedSignature,undefined);assert.equal(d.reviewFingerprint,undefined);assert.equal(h.L.state.balance,500);assert.equal(h.L.state.txs.length,0);clean(h);
 const changed=fixture(),original=pause(changed);help(changed);changed.L.state.balance=600;changed.L.contextualChat.returnToTask();changed.flush();assert.equal(changed.L.route,'pause');assert.match(view(changed).textContent,/GH₵30.00 short/);assert.equal(view(changed).querySelector('[data-pause-hold]').getAttribute('aria-disabled'),'true');assert.equal(changed.L.state.paymentDraft,original);assert.equal(changed.L.state.balance,600);clean(changed);
});
check('a replacement draft cannot be resurrected from the explanation',()=>{
 const h=fixture(),old=pause(h);help(h);h.L.state.paymentDraft={id:'new-one',method:'lumo',name:'Ama',amount:'20'};const before=facts(h.L);assert.equal(h.L.contextualChat.returnToTask(),false);assert.equal(h.L.state.paymentDraft.id,'new-one');assert.equal(facts(h.L),before);assert.equal(h.L.contextualChat.current(),null);assert.notEqual(h.L.state.paymentDraft,old);clean(h);
});
check('a submitted payment returns only to its existing result',()=>{
 const h=fixture(),d=pause(h);help(h);d.submittedTxId='existing-result';h.L.state.txs.push({id:'existing-result',type:'out',status:'pending',name:d.name,amount:280,fee:0,draftId:d.id,date:new Date().toISOString()});const before=facts(h.L);h.L.contextualChat.returnToTask();h.flush();assert.equal(h.L.route,'paymentResult');assert.equal(h.L.params.id,'existing-result');assert.equal(h.L.state.txs.length,1);assert.equal(facts(h.L),before);assert.match(view(h).textContent,/pending/);clean(h);
});
check('balance help explains saved costs and separate savings with an expandable calculation',()=>{
 const h=fixture(),{L}=h;L.go('balances');h.flush();const before=facts(L);help(h);const r=L.state.chats.at(-1);assert.match(r.headline,/GH₵150.00 is left/);assert.match(r.support,/GH₵500.00 available minus GH₵350.00/);assert.match(r.support,/Money Boxes are already in savings/);assert(r.calculation);assert.equal(facts(L),before);click(h,'See calculation');assert.equal(L.route,'chatCalculation');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);L.back();h.flushHistory();h.flush();assert.equal(L.route,'chat');L.contextualChat.returnToTask();h.flush();assert.equal(L.route,'balances');assert.equal(facts(L),before);clean(h);
});
check('ordinary follow-up questions stay available while the return action remains reachable',()=>{
 const h=fixture(),{L}=h;L.go('planExplanation');h.flush();help(h);h.set('chatText','Can I spend GH₵80?');L.askChat();h.flush();assert.equal(L.state.chats.at(-1).intent,'affordability');assert.match(L.state.chats.at(-1).headline,/GH₵70.00 spare/);assert(view(h).querySelector('[data-context-return]'));assert.equal(L.state.paymentDraft,null);L.contextualChat.dismiss();h.flush();assert.equal(L.contextualChat.current(),null);assert.equal(view(h).querySelector('[data-context-return]'),null);assert(view(h).querySelector('[aria-label="Back to Home"]'));clean(h);
});
check('protected-box help excludes partner phone numbers and approval secrets and cannot approve a transfer',()=>{
 const h=fixture(),{L}=h,invitation=L.boxProtection.beginInvite('laptop',{phone:'0241112222'});L.boxProtection.acceptInvitation(invitation.id,invitation.code);L.startMoneyBoxTransfer('laptop','out');h.flush();h.set('release','50');L.reviewRelease();h.flush();const d=L.state.paymentDraft,challenge=L.boxProtection.getChallenge(d.boxApprovalId),before=facts(L);assert(challenge);help(h);const r=L.state.chats.at(-1),json=JSON.stringify(r);assert.match(r.headline,/partner helps protect/);assert.match(r.support,/own PIN or biometric/);assert(!json.includes('0241112222'));assert(!json.includes(String(challenge.code)));assert(!json.includes(String(invitation.code)));assert(!json.includes('123456'));assert.equal(facts(L),before);L.contextualChat.returnToTask();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft,d);assert.equal(L.boxProtection.validWithdrawal(d),false);assert.equal(L.state.txs.length,0);clean(h);
});
check('unsaved transfer amounts return to their original field without exposing approval fields',()=>{
 const h=fixture(),{L}=h,i=L.boxProtection.beginInvite('laptop',{phone:'0241112222'});L.boxProtection.acceptInvitation(i.id,i.code);L.startMoneyBoxTransfer('laptop','out');h.flush();h.set('release','42.50');help(h);L.contextualChat.returnToTask();h.flush();assert.equal(L.route,'releaseGoal');assert.equal(h.document.getElementById('release').value,'42.50');assert.equal(L.state.txs.length,0);clean(h);
});
check('closed, locked, unsigned and switched accounts cannot use an earlier task return',()=>{
 for(const patch of [{locked:true},{closed:true},{onboarded:false}]){const h=fixture();pause(h);help(h);Object.assign(h.L.state,patch);const before=facts(h.L);assert.equal(h.L.contextualChat.returnToTask(),false);assert.equal(facts(h.L),before);clean(h);}
 const h=fixture();pause(h);help(h);const old=h.L.state;h.L.explore();const now=facts(h.L);assert.notEqual(h.L.state,old);assert.equal(h.L.contextualChat.current(),null);assert.equal(h.L.contextualChat.returnToTask(),false);assert.equal(facts(h.L),now);clean(h);
});
check('dismissal retires stored return controls, preserves the original payment and keeps the conversation',()=>{
 const h=fixture();pause(h);const d=h.L.state.paymentDraft;help(h);const r=h.L.state.chats.at(-1);h.L.contextualChat.dismiss();h.flush();assert.equal(h.L.state.paymentDraft,d);assert.equal(r.action,undefined);assert.equal(r.route,undefined);assert.equal(h.L.state.chats.length,1);assert.equal(h.L.route,'chat');assert.equal(h.L.state.txs.length,0);clean(h);
});
check('returning to an originating Pay task preserves that parent instead of nesting the payment over Chat',()=>{
 const h=fixture(),{L}=h;L.openTab('pay');h.flush();const d=pause(h);assert.equal(L.taskSheet.parentRoute,'pay');help(h);assert.equal(L.contextualChat.current().parentRoute,'pay');L.contextualChat.returnToTask();h.flush();assert.equal(L.taskSheet.parentRoute,'pay');assert.equal(L.route,'pause');assert.equal(L.state.paymentDraft,d);assert.equal(L.state.txs.length,0);clean(h);
});
check('breakdown and protected-box returns restore their original primary destination',()=>{
 const h=fixture(),{L}=h;L.go('balances');h.flush();assert.equal(L.taskSheet.parentRoute,'home');help(h);L.contextualChat.returnToTask();h.flush();assert.equal(L.taskSheet.parentRoute,'home');L.closeTask();h.flushHistory();h.flush();assert.equal(L.route,'home');clean(h);
 const b=fixture(),i=b.L.boxProtection.beginInvite('laptop',{phone:'0241112222'});b.L.boxProtection.acceptInvitation(i.id,i.code);b.L.openTab('plan');b.L.go('goal',{id:'laptop'});b.flush();help(b);b.L.contextualChat.returnToTask();b.flush();assert.equal(b.L.route,'goal');assert.equal(b.L.taskSheet.parentRoute,'plan');clean(b);
});
check('the contextual snapshot wrapper preserves another feature’s existing stale-answer wording',()=>{
 const h=fixture(),{L}=h;const r={intent:'budgetGuide',guideFinancialMark:'old',guideDraftId:'finished',guideRevision:0};assert.equal(L.chatSnapshotStatusExtra(r),'Earlier Budget draft projection. Review the current draft before saving.');clean(h);
});
check('a native close that briefly repaints the old parent still settles on exactly one help conversation',()=>{
 const h=fixture({}, {deferHistory:true}),{L}=h;L.openTab('pay');h.flush();const d=pause(h),before=facts(L);click(h,'Help me understand this');
 // Browsers can dispatch the older page popstate listener before the task
 // controller finishes its queued navigation acknowledgement.
 L.route='pay';L.params={};L.render();h.flushHistory();h.flush();assert.equal(L.route,'chat');assert.equal(h.history.state.route,'chat');assert.equal(L.taskSheet.active,false);assert.equal(L.state.chats.filter(r=>r.intent==='contextualHelp').length,1);assert.equal(L.state.paymentDraft,d);assert.equal(facts(L),before);clean(h);
});
check('payments originating in Chat retain Chat as the parent after their help detour',()=>{
 const h=fixture(),{L}=h;L.openTab('chat');h.flush();const d=pause(h);assert.equal(L.taskSheet.parentRoute,'chat');help(h);L.contextualChat.returnToTask();h.flush();assert.equal(L.route,'pause');assert.equal(L.taskSheet.parentRoute,'chat');assert.equal(L.state.paymentDraft,d);assert.equal(L.state.txs.length,0);clean(h);
});
check('a partner approval code entered before help is cleared rather than carried into Chat or restored',()=>{
 const h=fixture(),{L}=h,i=L.boxProtection.beginInvite('laptop',{phone:'0241112222'});L.boxProtection.acceptInvitation(i.id,i.code);L.startMoneyBoxTransfer('laptop','out');h.flush();h.set('release','50');L.reviewRelease();h.flush();h.set('partner-verification-code','654321');help(h);assert(!JSON.stringify(L.state.chats).includes('654321'));L.contextualChat.returnToTask();h.flush();assert.equal(h.document.getElementById('partner-verification-code').value,'');assert.equal(L.boxProtection.validWithdrawal(L.state.paymentDraft),false);clean(h);
});
check('an invitation explains its own Money Box rather than an unrelated retained transfer draft',()=>{
 const h=fixture(),{L}=h;L.state.goals.push({id:'books',name:'Books',allocated:50,target:300,boxVersion:2});const invite=L.boxProtection.beginInvite('books',{phone:'0241112222'});
 L.state.paymentDraft={id:'unrelated-box',method:'box',boxId:'laptop',boxDirection:'out',amount:20,name:'Laptop'};L.state.moneyBoxProtectionFlow={boxId:'books',returnRoute:'goal',returnParams:{id:'books'}};L.go('boxProtectionInvite');h.flush();const before=facts(L);help(h);const r=L.state.chats.at(-1);assert.equal(r.calculation.rows.find(x=>x[0]==='Money Box')[1],'Books');assert.equal(r.calculation.rows.find(x=>x[0]==='Money in this box')[1],'GH₵50.00');assert.equal(facts(L),before);L.contextualChat.returnToTask();h.flush();assert.equal(L.route,'boxProtectionInvite');assert.equal(L.state.paymentDraft.id,'unrelated-box');assert.equal(L.boxProtection.get('books').invitation.id,invite.id);clean(h);
});
check('Pause groups optional calculation and contextual help and reveals both after arrival',()=>{
 const h=fixture(),{L}=h;pause(h);const simple=!!L.monoPause,tools=view(h).querySelector(simple?'.mono-pause-why':'.contextual-pause-tools'),before=facts(L);
 assert(tools);assert(tools.querySelector(simple?'.pause-calculation-body':'.pause-calculation'));assert.equal(tools.querySelectorAll('.contextual-chat-entry').length,1);assert.equal(view(h).querySelectorAll('.contextual-chat-entry').length,1);assert.equal(tools.getAttribute('aria-hidden'),'true');assert.equal(tools.inert,true);
 if(simple){assert.equal(tools.querySelector('summary').textContent,'See why');assert(!tools.hasAttribute('open'));}
 h.advance(900);assert.equal(tools.getAttribute('aria-hidden'),'false');assert.equal(tools.inert,false);tools.querySelector('summary').click();h.flush();assert((simple?tools:tools.querySelector('.pause-calculation')).hasAttribute('open'));assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert(view(h).querySelector('[data-pause-hold]'));assert.equal(view(h).querySelector('[data-pause-hold]').getAttribute('aria-disabled'),'true');assert.equal(L.state.txs.length,0);assert.equal(facts(L),before);clean(h);
});
console.log(count+' contextual Chat handoff checks passed.');
