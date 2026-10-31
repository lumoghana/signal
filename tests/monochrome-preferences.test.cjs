/* A student's accepted choice must survive the next page and saved export.
   These checks use the shipped controllers, forms and edition state path. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
const financial=L=>JSON.stringify({accounts:L.state.accounts,balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,virtualCards:L.state.virtualCards,groupMoney:L.state.groupMoney});
function fixture({sample=false,testing=false}={}){
 const h=createHarness({clock:true,deferHistory:true,testing});
 // This remains runnable while the coordinator integrates the script order.
 if(!h.L.monoPreferences)vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../dist/mono-preferences.js'),'utf8'),h.context,{filename:'mono-preferences.js'});
 if(sample)h.L.explore();else h.L.render();settle(h);return h;
}
function go(h,route){h.L.go(route);settle(h);}
function button(h,label){const found=view(h).querySelectorAll('button').find(node=>node.textContent.trim()===label);assert(found,'Visible '+label);found.click();settle(h);}
function choice(h,label){const found=view(h).querySelectorAll('[role="switch"]').find(node=>node.getAttribute('aria-label')===label);assert(found,'Visible '+label);return found;}
function readyReview(h){
 const {L}=h;
 Object.assign(L.state.setup,{phoneConfirmed:true,identityStatus:'approved',identityDetailsReviewed:true,campusStatus:'approved',securitySaved:true});
 Object.assign(L.state.profile,{phone:'0241230123',pin:'654321',email:'kwame@example.test'});
 go(h,'accountReview');
}
function agree(h,{marketing=false,terms=true}={}){
 h.document.getElementById('accountAgree').checked=terms;
 h.document.getElementById('productMessages').checked=marketing;
 h.L.onboarding.reviewChoices();
}
function both(h,value){
 assert.equal(h.L.state.accountPrefs.marketing,value);
 assert.equal(h.L.state.prefs.marketing,value);
 const saved=JSON.parse(h.store.get(require('../config/editions.json').editions[require('../config/editions.json').currentEdition].storageKey));
 assert.equal(saved.accountPrefs.marketing,value);assert.equal(saved.prefs.marketing,value);
}

test('new signup opt-in and opt-out persist through Privacy and Notifications',()=>{
 for(const marketing of [true,false]){
  const h=fixture();readyReview(h);
  // The submitted checkbox is the latest explicit choice, even if the user
  // visited account settings during setup or a previous draft had an opt-in.
  h.L.state.accountPrefs.marketing=!marketing;h.L.state.prefs.marketing=!marketing;
  agree(h,{marketing});button(h,'Create account');assert.equal(h.L.route,'accountReady');both(h,marketing);
  go(h,'privacy');assert.equal(choice(h,'Marketing messages').getAttribute('aria-checked'),String(marketing));
  go(h,'notificationPrefs');assert.equal(choice(h,'Marketing').getAttribute('aria-checked'),String(marketing));both(h,marketing);clean(h);
 }
});

test('a pending accepted application preserves its choice and a rejected submit does not change it',()=>{
 const h=fixture({testing:true});readyReview(h);agree(h,{marketing:true,terms:false});button(h,'Create account');
 assert.equal(h.L.route,'accountReview');assert.equal(h.L.state.setup.applicationRef,undefined);both(h,false);
 agree(h,{marketing:true});h.set('accountOutcome','pending');button(h,'Create account');
 assert.equal(h.L.route,'applicationStatus');assert.equal(h.L.state.onboarded,false);both(h,true);const reference=h.L.state.setup.applicationRef;
 // The existing reference is already accepted; a repeated callback is not
 // fresh consent and must not silently replace its saved choice.
 h.L.onboarding.createAccount();settle(h);assert.equal(h.L.state.setup.applicationRef,reference);both(h,true);clean(h);
});

test('legacy signup choices migrate only when the canonical choice is absent',()=>{
 for(const canonical of [undefined,false,true]){
  const h=fixture({sample:true}),{L}=h;L.state.prefs.marketing=true;
  L.state.accountPrefs={plan:false,chat:false,personalisation:true};
  if(canonical!==undefined)L.state.accountPrefs.marketing=canonical;
  const before=financial(L);go(h,'privacy');const expected=canonical===undefined?true:canonical;
  both(h,expected);assert.equal(choice(h,'Marketing messages').getAttribute('aria-checked'),String(expected));
  assert.equal(L.state.accountPrefs.plan,false);assert.equal(L.state.accountPrefs.chat,false);assert.equal(L.state.accountPrefs.personalisation,true);
  assert.equal(financial(L),before);go(h,'notificationPrefs');assert.equal(choice(h,'Marketing').getAttribute('aria-checked'),String(expected));clean(h);
 }
 const h=fixture({sample:true});delete h.L.state.accountPrefs;h.L.state.prefs.marketing=true;go(h,'privacy');both(h,true);clean(h);
});

test('an explicit later opt-out stays off and either page reflects subsequent toggles',()=>{
 const h=fixture({sample:true}),{L}=h;L.state.accountPrefs={marketing:false,plan:true,chat:true,personalisation:false};L.state.prefs.marketing=true;
 const before=financial(L);go(h,'privacy');both(h,false);choice(h,'Marketing messages').click();settle(h);both(h,true);
 go(h,'notificationPrefs');assert.equal(choice(h,'Marketing').getAttribute('aria-checked'),'true');choice(h,'Marketing').click();settle(h);both(h,false);
 go(h,'privacy');assert.equal(choice(h,'Marketing messages').getAttribute('aria-checked'),'false');both(h,false);assert.equal(financial(L),before);clean(h);
});

test('saved data export agrees with the accepted choice and retains fresh PIN approval',()=>{
 const h=fixture(),{L}=h;readyReview(h);agree(h,{marketing:true});button(h,'Create account');go(h,'dataExport');
 const files=[],before=financial(L);L.download=(name,content)=>files.push({name,data:JSON.parse(content)});
 h.set('authPin','000000');h.submit(view(h).querySelector('form'));settle(h);assert.equal(files.length,0);
 h.set('authPin','654321');h.submit(view(h).querySelector('form'));settle(h);assert.equal(files.length,1);
 assert.equal(files[0].data.preferences.marketing,true);assert.equal(files[0].data.profile.pin,undefined);assert.equal(L.value('authPin'),'');
 h.submit(view(h).querySelector('form'));settle(h);assert.equal(files.length,1);assert.equal(financial(L),before);clean(h);
});
