/* Edition contract: original shared source, isolated data and real shipped flows.
   No automatic rebaselining and no CSS/markup snapshots. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/editions.json'), 'utf8'));
const edition = manifest.editions[manifest.currentEdition];
const clone = value => JSON.parse(JSON.stringify(value));
const source = (root, file) => fs.readFileSync(path.join(root, 'dist', file), 'utf8');
const {scripts,styles:shippedStyles}=require('../tests/helpers/shipped-entry.cjs');
const normalise = (file, text, key) => file === 'core.js'
  ? text.replace(`const key='${key}';`, "const key='__EDITION_STORAGE_KEY__';") : text;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const factory = root => require(path.join(root, 'tests/helpers/task-sheet-dom.cjs')).createHarness;
const clean = h => assert.deepEqual(h.errors, [], 'No shipped-runtime errors');

function checkSharedSource(root = ROOT, key = edition.storageKey, allowPresentation = true) {
  const shipped = scripts(root), baseline = manifest.baseline.scripts, features = manifest.featureScripts || [], finalShared=manifest.finalSharedScripts||[];
  const presentation = allowPresentation ? manifest.presentationScripts : (manifest.peerPresentationScripts || []);
  const finalPresentation = allowPresentation ? (manifest.finalPresentationScripts || []) : (manifest.peerFinalPresentationScripts || []);
  assert.deepEqual(shipped, [...baseline, ...presentation, ...features, ...finalPresentation, ...finalShared], 'Reviewed product, edition presentation and additive feature modules retain their exact load order');
  assert.deepEqual(shipped.filter(file => baseline.includes(file)), baseline, 'Original scripts retain their exact load order');
  const extras = shipped.filter(file => !baseline.includes(file));
  for (const file of extras) {
    if (features.includes(file)||finalShared.includes(file)) {
      assert.equal(hash(source(root,file)), manifest.featureSha256?.[file], file + ' matches the explicitly reviewed additive feature');
      assert(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(source(root,file)), 'Shared features use only the existing edition persistence path');
      continue;
    }
    const approved = [...presentation, ...finalPresentation];
    assert(approved.includes(file), 'Unexpected extra script: ' + file);
    if (!allowPresentation) assert.equal(hash(source(root,file)), manifest.peerPresentationSha256?.[file], file + ' matches the explicitly reviewed Everyday presentation adapter');
    assert(shipped.indexOf(file) > Math.max(...baseline.map(name => shipped.indexOf(name))), 'Presentation loads after product behavior');
    assert(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(source(root, file)), 'Presentation cannot introduce another persistence reader');
  }
  for (const file of baseline) {
    const text = source(root, file);
    const override=allowPresentation?manifest.presentationOverrides?.[file]:null;
    if(override)assert(override.reason&&override.sha256!==manifest.baseline.sha256[file],file+' has an explicit edition-only presentation review');
    assert.equal(hash(normalise(file, text, key)), override?.sha256||manifest.baseline.sha256[file], file + ' matches the approved baseline or reviewed edition presentation fix');
    if (file === 'core.js') assert(text.includes(`const key='${key}';`), 'Correct edition storage key');
  }
  const styles = shippedStyles(root);
  if(!allowPresentation&&manifest.peerPauseStyleReview){
    const review=manifest.peerPauseStyleReview;
    assert.equal(styles.filter(file=>file===review.file).length,1,'Peer avatar Pause style loads once');
    assert.equal(hash(source(root,review.file)),review.sha256,'Peer avatar Pause style matches its review');
  }
  for (const file of manifest.featureStyles || []) {
    assert.equal(styles.filter(name=>name===file).length,1,file+' is loaded exactly once');
    assert.equal(hash(source(root,file)),manifest.featureSha256?.[file],file+' matches the reviewed shared feature style');
  }
  if(allowPresentation&&manifest.monochromeConsistencyReview){
    const review=manifest.monochromeConsistencyReview;
    assert(review.scope&&review.reason,'Monochrome consistency has an explicit edition-only review');
    for(const [file,sha256] of Object.entries(review.stylesSha256||{})){
      assert.equal(styles.filter(name=>name===file).length,1,file+' is loaded once as an edition-owned consistency layer');
      assert(styles.indexOf(file)>styles.indexOf('mono-pause.css'),file+' follows shared features and final Pause styling');
      assert.equal(hash(source(root,file)),sha256,file+' matches the reviewed Monochrome consistency source');
    }
    for(const [file,sha256] of Object.entries(review.scriptsSha256||{}))assert.equal(hash(source(root,file)),sha256,file+' matches its edition-only task wording review');
  }
  if(allowPresentation&&manifest.moneyLifeReview){
    const review=manifest.moneyLifeReview;
    assert(review.scope&&review.reason,'The new money journeys have an explicit Monochrome-only feature review');
    for(const [file,approved]of Object.entries(review.sha256)){
      assert.equal(hash(source(root,file)),approved,file+' matches the reviewed money journeys');
      assert.equal((file.endsWith('.css')?styles:shipped).filter(name=>name===file).length,1,file+' loads exactly once');
    }
  }
  if(manifest.platformReview){for(const [file,approved]of Object.entries(manifest.platformReview.sha256))assert.equal(hash(source(root,file)),approved,file+' matches the reviewed recovery/offline shell');require(path.join(root,'scripts/build-platform-assets.cjs')).buildPlatformAssets({root,check:true});}
  return baseline.length + features.length + finalShared.length;
}

function checkIdentity() {
  const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, '.openai/hosting.json'), 'utf8'));
  assert.equal(hosting.project_id, edition.projectId, 'Publishing target is this new project');
  assert.notEqual(edition.projectId, manifest.editions.everyday.projectId);
  assert.notEqual(edition.url, manifest.editions.everyday.url);
  assert.notEqual(edition.storageKey, manifest.editions.everyday.storageKey);
  if(manifest.currentEdition==='signal'){
    assert.notEqual(edition.projectId,manifest.editions.minna.projectId,'Signal has its own Site');
    assert.notEqual(edition.url,manifest.editions.minna.url,'Monochrome keeps its original link');
    assert.notEqual(edition.storageKey,manifest.editions.minna.storageKey,'Signal never imports Monochrome records');
  }
  assert.equal(hosting.static.directory, 'dist');
}

function checkStorageIsolation() {
  const foreignKeys = [...new Set([
    ...Object.values(manifest.editions).map(item => item.storageKey),
    'lumo-campus-v1', 'lumo-clarity-edition-v1', 'lumo-v1', 'lumo-illustration-first-v1'
  ])].filter(key => key !== edition.storageKey);
  const sentinels = new Map(foreignKeys.map((key, i) => [key, JSON.stringify({version:1,balance:987654+i,profile:{name:'Foreign saved person'},txs:[{id:'foreign'}]})]));
  const store = new Map(sentinels), reads = [], writes = [];
  const boot = () => {
    const context = {console, URLSearchParams, Date, Math, document:{getElementById:()=>null}, location:{search:''},
      localStorage:{getItem(key){reads.push(key);return store.get(key)||null;},setItem(key,value){writes.push(key);store.set(key,value);}},
      addEventListener(){},setTimeout:()=>0,clearTimeout(){}};
    context.window=context;vm.createContext(context);vm.runInContext(source(ROOT,'core.js'),context);
    context.L.render=()=>context.L.save();return context.L;
  };
  let L=boot();assert.equal(L.state.balance,0);assert.equal(L.state.onboarded,false);assert.equal(L.state.txs.length,0);
  L.state.profile.name='My independent demo';L.state.balance=42;L.save();
  L=boot();assert.equal(L.state.profile.name,'My independent demo');assert.equal(L.state.balance,42);
  L.explore();assert.equal(L.state.balance,920);assert.equal(L.state.txs.length,3);
  L.reset();assert.equal(L.state.balance,0);assert.equal(L.state.txs.length,0);
  assert(reads.length>0 && writes.length>0);
  assert(reads.every(key=>key===edition.storageKey));assert(writes.every(key=>key===edition.storageKey));
  for(const [key,value] of sentinels) assert.equal(store.get(key),value,'Foreign data stays unchanged: '+key);
}

function fixture(root = ROOT, options = {}) {
  const h=factory(root)({clock:true,testing:true,...options}), {L}=h;L.explore();L.ensureAccounts();
  Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,chats:[],categoryRules:[],
    essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],
    goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:0,date:''}});
  delete L.state.moneyBoxProtection;delete L.state.moneyBoxProtectionFlow;
  L.route='home';L.params={};L.history=[];L.render();h.flush();
  assert.equal(L.balances().available,500);assert.equal(L.accountBalances().savings,100);assert.equal(L.balances().room,150);clean(h);return h;
}
function snapshot(L) {
  const a=L.accountBalances(),b=L.balances();
  return clone({balance:L.state.balance,available:b.available,savings:a.savings,budget:b.essentials,room:b.room,gap:b.gap,transactions:L.state.txs.length});
}
function begin(h, amount, linked = false) {
  h.L.pickMerchant('AK01');h.set('payment-amount',amount);h.set('payment-essential',linked?'food':'');h.flush();
  return h.L.planImpactSummary(h.L.state.paymentDraft);
}
function toAuthorisation(h) {
  const {L}=h;
  if(L.route==='pause') {h.advance(3900);const hold=h.document.getElementById('view').querySelector('[data-pause-hold]');assert(hold);hold.click();h.advance(90);h.flush();}
  else L.continuePayment();
  assert.equal(L.route,'authorize','Pause/review leads to separate authentication');
}
function confirm(h, outcome='Completed') {
  h.set('payment-pin','123456');h.set('payment-outcome',outcome);h.L.authorizePayment();h.flush();
  assert.equal(h.L.route,'paymentResult');clean(h);
}

function financialScenarios(root = ROOT) {
  const results=[];
  for(const [amount,linked,after,room,gap,budget] of [[80,false,420,70,0,350],[140,false,360,10,0,350],[280,false,220,0,130,350],[80,true,420,150,0,270]]) {
    const h=fixture(root),{L}=h,before=snapshot(L),p=begin(h,amount,linked);
    assert.equal(p.after,after);assert.equal(p.room,room);assert.equal(p.essentialGap,gap);assert.equal(p.goalGap,0);
    if(!linked) {
      const answer=L.chatAnswer('Can I spend GH₵'+amount+'?');
      assert.deepEqual(clone({after:answer.planImpact.after,room:answer.planImpact.room,gap:answer.planImpact.totalGap}),{after,room,gap});
      assert.equal(answer.planImpact.headline,p.headline,'Chat and payment share their conclusion');
    }
    L.preparePayment();h.flush();assert.equal(L.route,amount===280?'pause':'paymentReview');
    assert.deepEqual(snapshot(L),before,'A projection cannot move money');toAuthorisation(h);
    assert.deepEqual(snapshot(L),before,'Entering authentication cannot move money');confirm(h);
    const expected={balance:after,available:after,savings:100,budget,room,gap,transactions:1};
    assert.deepEqual(snapshot(L),expected);L.authorizePayment();h.flush();assert.deepEqual(snapshot(L),expected,'Repeated taps do not debit twice');
    if(linked) {assert.equal(L.state.essentials[0].paid,80);assert.equal(L.state.txs[0].essentialId,'food');assert.equal(L.state.txs[0].category,'Food');}
    clean(h);results.push({amount,linked,...expected});
  }
  return results;
}

function checkPendingAndFailure() {
  for(const outcome of ['Pending','Failed']) {
    const h=fixture(),{L}=h;begin(h,80);L.preparePayment();toAuthorisation(h);confirm(h,outcome);
    const expected=outcome==='Pending'?{balance:500,available:420,savings:100,budget:350,room:70,gap:0,transactions:1}:{balance:500,available:500,savings:100,budget:350,room:150,gap:0,transactions:1};
    assert.deepEqual(snapshot(L),expected);L.authorizePayment();assert.deepEqual(snapshot(L),expected);
    if(outcome==='Pending') {L.resolveTx(L.state.txs[0].id,'success');L.resolveTx(L.state.txs[0].id,'success');assert.equal(L.state.balance,420);assert.equal(L.state.txs.length,1);}
    clean(h);
  }
}

function checkQrAndBiometrics() {
  const h=fixture(),{L}=h,before=snapshot(L);L.go('campusPay');L.qr.open();h.flush();
  assert.equal(L.qr.consume('https://example.com/pay'),false);assert.deepEqual(snapshot(L),before);
  assert.equal(L.qr.consume('LUMO1:MERCHANT:AK01'),true);h.flush();assert.equal(L.route,'send');
  assert.equal(L.state.paymentDraft.destination,'AK01');assert.equal(L.state.paymentDraft.amount,'');assert.deepEqual(snapshot(L),before,'Scanning only selects a recipient');
  h.set('payment-amount',80);h.set('payment-essential','');L.preparePayment();toAuthorisation(h);
  assert.equal(L.biometricPayment.open(),true);assert.deepEqual(snapshot(L),before);
  assert.equal(L.biometricPayment.approve(),true);h.flush();assert.equal(L.route,'paymentResult');
  assert.equal(L.state.balance,420);assert.equal(L.state.txs.length,1);assert.equal(L.biometricPayment.approve(),false);assert.equal(L.state.txs.length,1);clean(h);
}

function checkProtectedWithdrawal() {
  const h=fixture(),{L}=h,before=snapshot(L),p=L.boxProtection;
  const invitation=p.beginInvite('laptop',{phone:'0241112222'});p.acceptInvitation(invitation.id,invitation.code);
  L.startMoneyBoxTransfer('laptop','out');h.flush();h.set('release',80);L.reviewRelease();h.flush();
  const challenge=p.getChallenge(L.state.paymentDraft.boxApprovalId);assert(challenge);
  L.continuePayment();assert.equal(L.route,'paymentReview');assert.deepEqual(snapshot(L),before,'Customer authentication cannot bypass partner approval');
  h.set('partner-verification-code',challenge.code);L.continuePayment();assert.equal(L.route,'authorize');
  assert.deepEqual(snapshot(L),before);assert.equal(L.biometricPayment.open(),true);assert.equal(L.biometricPayment.approve(),true);h.flush();
  assert.equal(L.accountBalances().operational,580);assert.equal(L.accountBalances().savings,20);assert.equal(p.getChallenge(challenge.id).status,'consumed');assert.equal(L.state.txs.length,1);clean(h);
}

function checkRoutes() {
  const h=fixture();
  const names=Object.keys(h.L.views);
  for(const name of [...manifest.baseline.requiredViews,...manifest.featureRequiredViews||[]]) assert(names.includes(name),'Missing reviewed destination: '+name);
  // Test visible, working destinations rather than Everyday's old CSS palette.
  for(const [parent,task] of [['home','addMoney'],['plan','planPeriod'],['chat','balances'],['pay','campusPay'],['more','profile'],['moneyStoryHome','balances'],['cardsHome','virtualCards']]) {
    h.L.openTab(parent);h.flush();
    const nav=h.document.getElementById('nav'),items=nav.querySelectorAll('.nav-item');
    assert.equal(items.length,3);assert.equal(!!nav.hidden,false,'Ordinary Home, Chat and grouped destinations retain three primary controls');
    for(const item of items) {assert(item.querySelector('svg'));assert(item.querySelector('span')?.textContent);assert.equal(item.hidden,false);assert.equal(item.disabled,false);}
    const primaryActions=["L.openTab('home')",'L.openBankingChat()','L.openMonoMenu()'];
    assert.deepEqual(items.map(item=>item.getAttribute('onclick')),primaryActions);
    assert.equal(items.filter(item=>item.getAttribute('aria-current')==='page').length,1);
    assert.equal(items.find(item=>item.getAttribute('aria-current')==='page').getAttribute('onclick'),parent==='home'?primaryActions[0]:parent==='chat'?primaryActions[1]:primaryActions[2]);
    const before=nav.innerHTML;h.L.go(task);h.flush();
    assert.equal(h.L.taskSheet.parentRoute,parent);assert.equal(nav.innerHTML,before);assert.equal(nav.inert,true);
    h.document.querySelector('.task-sheet-close').click();h.flushHistory();h.flush();assert.equal(h.L.route,parent);assert(!nav.inert);
  }
  clean(h);return manifest.baseline.requiredViews.length;
}
function peerRoot() {
  const flag=process.argv.indexOf('--peer');
  if(flag>=0) {assert(process.argv[flag+1],'--peer requires a checkout path');return path.resolve(process.argv[flag+1]);}
  if(process.env.LUMO_PEER_ROOT) return path.resolve(process.env.LUMO_PEER_ROOT);
  const sibling=path.resolve(ROOT,'../lumo-everyday-edition');
  return fs.existsSync(path.join(sibling,'dist/index.html'))?sibling:null;
}
function checkPeer() {
  const peer=peerRoot();if(!peer)return {skipped:true,reason:'No peer checkout; local pinned baseline and scenarios still checked.'};
  const hosting=JSON.parse(fs.readFileSync(path.join(peer,'.openai/hosting.json'),'utf8'));
  assert.equal(hosting.project_id,manifest.editions.everyday.projectId,'Peer is Everyday Edition');
  checkSharedSource(peer,manifest.editions.everyday.storageKey,false);
  assert.deepEqual(financialScenarios(ROOT),financialScenarios(peer),'Numerical outcomes match both shipped editions');
  return {skipped:false,peer};
}

const checks=[
  ['new project identity and independent namespace',checkIdentity],
  ['shared scripts match the approved feature baseline and load order',checkSharedSource],
  ['foreign saved records are never imported, overwritten or reset',checkStorageIsolation],
  ['all existing destinations remain registered',checkRoutes],
  ['four actual-index financial journeys agree with Chat and confirmed ledger',financialScenarios],
  ['pending, failure and repeated submissions keep their existing rules',checkPendingAndFailure],
  ['QR selects only a recipient; simulated biometrics authorise only once',checkQrAndBiometrics],
  ['Money Box withdrawal needs partner approval and separate authorisation',checkProtectedWithdrawal],
  ['peer source and financial outcomes remain in parity',checkPeer]
];
module.exports={checks,checkSharedSource,financialScenarios,manifest};
if(require.main===module) {
  try {
    for(const [name,check] of checks) {const result=check();console.log((result?.skipped?'SKIP ':'PASS ')+name+(result?.reason?' — '+result.reason:''));}
    console.log('Edition contract checked against the reviewed shared feature baseline.');
    if(process.argv.includes('--regression')) {
      const sequential=process.argv.includes('--sequential')||process.env.LUMO_TEST_CONCURRENCY==='1';
      const result=spawnSync(process.execPath,['--test',...(sequential?['--test-concurrency=1']:[]),...manifest.verification.regressionTests],{cwd:ROOT,stdio:'inherit'});
      if(result.error)throw result.error;
      assert.equal(result.status,0,'The current feature regression suite must pass');
    }
  }
  catch(error){console.error(error.stack);process.exitCode=1;}
}
