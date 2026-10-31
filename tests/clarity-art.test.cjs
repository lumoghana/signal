/* Original-byte and route-semantics checks, not browser layout verification. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'../dist');
const hashes={
 'student-expressive.png':'cfd4d16e8132be91c6c1decb2c3dd4a92f7e9fc006ca27116a4ba8c7469400c6',
 'friends-editorial.png':'4a3ad9646adaddc24c0d1a2dfd16e0379b137cc003ccf7c2ea2f1a22894aaa6c',
 'campus-pay-editorial.png':'b4208efb1b9bc187a8dc166febbb0ec3fa6283ebc9d05735a96f450a110104b2',
 'money-review-refined-4.13.png':'d066e3e22cf681a5d449136f997f764e38f67111576db3ec76dc91881a4fff74',
 'goal-study-4.16.png':'9062fb49de0df31df6c948b75a46ebfd1e580315261b89afb459c1150344f855',
 'essentials-pause-editorial.png':'42f2d7631cd3cb5e0c7f3663a610b90281bc973233be65698a684f8104bbcbe7',
 'payment-complete-editorial.png':'50229e6c7d4dae4a2cb67675866f739f3a179b6a9bc1f569b3c5f53b9d5d66d6',
 'thoughtful-refined-4.13.png':'a0eff30b70e883816453d2a798b480c7130cc095d62114065d2238e1e68eeb3c'
};
for(const [name,hash] of Object.entries(hashes)){
 const bytes=fs.readFileSync(path.join(root,'assets/clarity',name));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash,`${name} preserves original bytes`);
 assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
 assert.equal(bytes.readUInt32BE(16),1536);assert.equal(bytes.readUInt32BE(20),1024);
}
let impact=null;
const L={state:{txs:[]},params:{},route:'home',planImpactSummary:()=>impact,payTab:()=>L.params.tab};
vm.runInNewContext(fs.readFileSync(path.join(root,'clarity-art.js'),'utf8'),{L});
const scene=html=>html.match(/data-scene="([^"]+)"/)?.[1];
const one=html=>{
 assert.equal((html.match(/data-art=/g)||[]).length,1);
 assert.equal((html.match(/<img\b/g)||[]).length,1,'Use one complete master, not duplicate actor layers');
 assert.match(html,/data-art-source="illustration-first-v11"/);
 assert.doesNotMatch(html,/<svg\b|<text\b|clip-path|<canvas\b/);
 const file=html.match(/src="([^"]+)"/)[1];assert(fs.existsSync(path.join(root,file)));
};
for(const kind of ['welcome','home','phone','identity','secure','campus','pay','funding','clarity','goals','plan','story','bills','chat','help','merchant','success','receipt','privacy','settings','pause','decision','tradeoff'])one(L.illustration(kind));
for(const kind of ['lumo','momo','bank','campus','request','airtime','data','electricity','water','tv','internet','activity'])one(L.paymentArt(kind));
for(const kind of ['profile','account','security','privacy','notifications','help','testing','feedback','devices'])one(L.accountArt(kind));
for(const route of ['profile','profileEdit','profilePhone','accountInfo','accountTerms','security','changePin','devices','privacy','privacyNotice','dataExport','notificationPrefs','notifications','help','supportCase','caseDetail','testing','feedback','closeAccount','recovery','recoveryOwnership','recoveryReplacement','recoveryStatus','authorize','chat','pay','campusPay','more','paymentReview','paymentResult','requests','requestCreate','requestDetail','requestConfirm','activity','txDetail','bankAdd','momoAdd','story','allowance','essentials','statements'])one(L.contextualIllustration(route));
assert.equal(scene(L.illustration('home')),'student');
assert.equal(scene(L.illustration('chat')),'thoughtful');
assert.match(L.illustration('welcome'),/scene-size-intro/);
assert.match(L.illustration('pay',true),/scene-size-decision/);
L.state.goals=[{id:'goal',name:'Laptop'}];assert.equal(scene(L.illustration('goals')),'goal');
L.state.goals=[{id:'goal',name:'Trip home'}];assert.equal(scene(L.illustration('goals')),'review');
L.state.paymentDraft={id:'draft'};
impact={essentialGap:30,goalGap:100,essentials:[{name:'Food',after:200},{name:'Transport',after:150}]};
assert.equal(scene(L.illustration('pause')),'essentials');
impact={essentialGap:30,goalGap:100,essentials:[{name:'Tuition',after:200},{name:'Transport',after:150}]};
assert.equal(scene(L.illustration('pause')),'thoughtful');
impact={essentialGap:30,goalGap:100,essentials:[{name:'Food',after:0},{name:'Transport',after:150}]};
assert.equal(scene(L.illustration('pause')),'thoughtful','A fulfilled food cost does not label a transport shortage');
impact={essentialGap:0,goalGap:100,goalName:'Laptop'};
assert.equal(scene(L.illustration('pause')),'goal');
impact={essentialGap:0,goalGap:100,goalName:'Trip home'};
assert.equal(scene(L.illustration('pause')),'thoughtful');
const result=(status,delivery,category='Food',method='campus')=>{
 L.params={id:'result'};L.route='paymentResult';L.state.txs=[{id:'result',status,delivery,category,paymentDraft:{method}}];
 return L.illustration('paymentResult');
};
for(const status of ['pending','failed','cancelled','reversed',undefined])assert.equal(scene(result(status)),'thoughtful');
for(const delivery of ['pending','failed'])assert.equal(scene(result('success',delivery)),'thoughtful');
assert.equal(scene(result('success','delivered')),'complete');
assert.equal(scene(result('success',undefined)),'complete');
assert.equal(scene(result('success','delivered','Printing')),'student');
assert.equal(scene(result('success','delivered','Food','lumo')),'student');
result('pending');assert.equal(scene(L.illustration('success')),'thoughtful');
assert.doesNotMatch(L.paymentArt('unknown','bad\" onclick=\"alert(1)'),/onclick=/);
console.log('PASS 8 unchanged original textile masters, complete-image composition, 40+ contextual routes, decision relevance and confirmed-result gating.');
