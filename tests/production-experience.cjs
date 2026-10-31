// Baseline journey and ledger regression. task-sheet.test.cjs exercises the mounted task interface.
/* Customer-facing integration checks. This VM harness verifies behavior and markup;
   it does not measure layout, run a browser, or claim real provider integrations. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const dir = path.join(__dirname, '../dist');
const errors = [], store = new Map(), elements = new Map(), focusEvents = [];
const decode = value => String(value || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attributes = source => Object.fromEntries([...source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m => [m[1], decode(m[2] ?? m[3] ?? m[4] ?? '')]));
class Element {
  constructor(id = '', tag = 'div', attrs = {}) {
    this.id = id; this.tagName = tag.toUpperCase(); this.attributes = {...attrs};
    this.type = attrs.type || (tag === 'input' ? 'text' : ''); this.name = attrs.name || '';
    this.value = attrs.value || ''; this.checked = 'checked' in attrs; this.disabled = 'disabled' in attrs;
    this.hidden = 'hidden' in attrs; this.textContent = ''; this.dataset = {}; this.style = {};
    this.clientHeight = 0; this.scrollHeight = 0; this.scrollTop = 0;
    this.classList = {add(){}, remove(){}, toggle(){}, contains: name => (attrs.class || '').split(/\s+/).includes(name)};
  }
  set innerHTML(value) {
    this._html = value;
    if (this.id !== 'view') return;
    for (const id of [...elements.keys()]) if (!['view','app','nav','toast'].includes(id)) elements.delete(id);
    for (const match of value.matchAll(/<(input|select|textarea|button|div|form|h1)\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)(?=<\/\1>|$)/g)) {
      const attrs = attributes(match[2]), element = new Element(match[3], match[1], attrs);
      if (match[1] === 'textarea') element.value = decode(match[4]);
      elements.set(element.id, element);
    }
    // Parse void inputs and selects separately so nested markup cannot hide fields.
    for (const match of value.matchAll(/<(div|button|h1|form)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
      if(!elements.has(match[3]))elements.set(match[3],new Element(match[3],match[1],attributes(match[2])));
    }
    for (const match of value.matchAll(/<input\b([^>]*\bid="([^"]+)"[^>]*)>/g)) elements.set(match[2], new Element(match[2], 'input', attributes(match[1])));
    for (const match of value.matchAll(/<select\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/select>/g)) {
      const element = new Element(match[2], 'select', attributes(match[1]));
      const options = [...match[3].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)];
      const option = options.find(m => /\bselected\b/.test(m[1])) || options[0];
      element.value = option ? attributes(option[1]).value ?? decode(option[2]) : '';
      elements.set(element.id, element);
    }
  }
  get innerHTML() { return this._html || ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'tabindex') this.tabIndex = Number(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return name in this.attributes; }
  querySelectorAll(selector) {
    if (this.id !== 'view') return [];
    return [...elements.values()].filter(el => ['INPUT','SELECT','TEXTAREA'].includes(el.tagName) && selector.split(',').some(part => {
      const tag = part.trim().match(/^(input|select|textarea)/)?.[1];
      if (!tag || el.tagName !== tag.toUpperCase()) return false;
      if (part.includes('[id]') && !el.id) return false;
      if (part.includes(':not([type=password])') && el.type === 'password') return false;
      if (part.includes(':not([type="password"])') && el.type === 'password') return false;
      return true;
    }));
  }
  querySelector(selector) {
    if (selector === 'h1' && /<h1\b/.test(this._html || '')) return new Element('route-heading', 'h1');
    return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null;
  }
  matches(selector) { return selector.split(',').some(part => this.tagName.toLowerCase() === part.trim()); }
  closest() { return null; }
  focus() { focusEvents.push(this.id); document.activeElement = this; }
  blur() { document.activeElement = null; }
  scrollIntoView() {} scrollTo() {} addEventListener() {} dispatchEvent() {} appendChild() {} click() {} remove() {} select() {}
}
for (const id of ['view','app','nav','toast']) elements.set(id, new Element(id));
const documentListeners = new Map();
const document = {
  hidden: true, activeElement: null, documentElement: new Element('html'), body: new Element('body'),
  getElementById: id => elements.get(id) || null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(type, listener) { documentListeners.set(type, [...documentListeners.get(type)||[], listener]); }, createElement: tag => new Element('', tag)
};
const listeners = new Map(), browserEntries = [];
let browserIndex = -1;
const browserHistory = {
  get state() { return browserEntries[browserIndex] || null; },
  get length() { return browserEntries.length; },
  replaceState(value) {
    if (browserIndex < 0) browserIndex = 0;
    browserEntries[browserIndex] = JSON.parse(JSON.stringify(value));
  },
  pushState(value) {
    browserEntries.splice(browserIndex + 1); browserEntries.push(JSON.parse(JSON.stringify(value))); browserIndex++;
  },
  back() {
    if (browserIndex < 1) return;
    browserIndex--;
    for (const listener of listeners.get('popstate') || []) listener({state:JSON.parse(JSON.stringify(this.state))});
  }
};
const context = {
  window: null, document, localStorage: {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)},
  navigator: {clipboard: {writeText: async () => {}}},
  location: {origin: 'https://test.example', pathname: '/', hash: '', search: ''},
  history: browserHistory,
  confirm: () => true, console: {error: error => errors.push(String(error)), log: console.log},
  setTimeout: () => 0, clearTimeout() {}, URLSearchParams,
  URL: {createObjectURL: () => '', revokeObjectURL() {}}, Blob, Event: class {}, Date, Math,
  matchMedia: () => ({matches: true, addEventListener(){}}), scrollTo() {},
  addEventListener: (type, listener) => listeners.set(type, [...listeners.get(type) || [], listener])
};
context.window = context;
vm.createContext(context);
for (const file of ['core.js','onboarding.js','pause-engine.js','plan-impact.js','mobile-network.js','payments.js','account.js','plan-setup.js','pause.js','motion.js','illustrations.js','app.js','compact.js','focus.js','chat-coach.js','plan-benefit.js','decision-system.js','clarity-art.js','clarity-pause.js','expressive-art.js','bold-system.js','campus-art.js','pause-hero.js','payment-balance.js','pause-interaction.js','ambassador.js']) vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context, {filename: file});
const L = context.L;
const html = () => elements.get('view').innerHTML;
const set = (id, value, checked) => {
  const element = elements.get(id); assert(element, 'Missing field ' + id + ' on ' + L.route);
  element.value = String(value); if (checked !== undefined) element.checked = checked;
};
const render = (route, params = {}) => { L.route = route; L.params = params; L.render(); };
const check = text => console.log('PASS ' + text);
const ordinaryMarkup = label => {
  assert(!/Tester controls|Test another outcome|Try another test outcome|Try sample QR/.test(html()), 'Testing controls on ' + label);
  assert(!/id="(?:identityOutcome|identityResolve|campusOutcome|campusResolve|accountOutcome|payment-outcome|delivery-outcome|bank-test-amount)"/.test(html()), 'Testing selector on ' + label);
  assert.equal((html().match(/data-art=/g) || []).length, html().includes('payment-result-compact')||['chatCalculation','planExplanation','planEdit','samplePause'].includes(L.route)?0:1, 'Task-appropriate illustration count on ' + label);
  if(html().includes('payment-result-compact')){assert.equal((html().match(/class="result-mark success-mark"/g)||[]).length,1,'A confirmed or pending result has one status symbol');}
};
const clone = value => JSON.parse(JSON.stringify(value));

assert.equal(Boolean(L.testMode), false, 'Ordinary URL must default to customer experience');
ordinaryMarkup('welcome');
L.reset(); L.onboarding.start(); ordinaryMarkup('phone');
set('phoneNumber', '0241230123'); L.onboarding.sendCode('signup'); ordinaryMarkup('otp');
set('verificationCode', '123456'); L.onboarding.verifyCode(); assert.equal(L.route, 'identity'); ordinaryMarkup('identity');
set('identityPrivacy', '', true); L.onboarding.beginIdentity(); ordinaryMarkup('livecheck');
L.onboarding.identityCheck(); L.onboarding.next(); ordinaryMarkup('campus');
set('campusName', 'University of Ghana'); set('campusEmail', 'kwame@example.com'); L.onboarding.checkCampus(); ordinaryMarkup('pin');
set('newPin', '123456'); L.onboarding.pinNext(); set('confirmPin', '123456'); L.onboarding.pinConfirm(); ordinaryMarkup('accountReview');
set('accountAgree', '', true); set('productMessages', '', false); L.onboarding.createAccount();
assert.equal(L.route, 'home'); assert.equal(L.state.balance, 0); ordinaryMarkup('home after signup');
assert(!/pause-home|pauseDemo|Test guide|Sample account|Explore a sample/i.test(html()), 'Home must not offer testing shortcuts');
check('normal sign-up completes without result selectors; Home has no Pause shortcut');

L.openFunding('home'); L.startMomoFunding(); ordinaryMarkup('mobile money top-up');
set('funding-amount', 1000); set('funding-owned', '', true);
L.reviewMomoFunding(); ordinaryMarkup('top-up review'); L.requestMomoFunding(); ordinaryMarkup('top-up result');
assert.equal(L.state.balance, 1000); assert.equal(L.state.txs.filter(tx => tx.type === 'in').length, 1);
L.requestMomoFunding(); assert.equal(L.state.balance, 1000, 'Repeated funding action must not credit twice');
L.fundingDone();
L.startSend('lumo'); L.pickPerson('abena'); set('payment-amount', 50); L.preparePayment(); ordinaryMarkup('payment review');
L.continuePayment(); assert.equal(L.route, 'authorize'); ordinaryMarkup('authorise');
assert(!elements.has('payment-outcome'), 'Normal payment has no provider outcome field');
set('payment-pin', '123456'); L.authorizePayment(); ordinaryMarkup('payment result');
assert.equal(L.state.balance, 950); const paymentCount = L.state.txs.length;
L.authorizePayment(); assert.equal(L.state.balance, 950); assert.equal(L.state.txs.length, paymentCount);
check('normal funding and payment finish with one credit and one debit, without tester controls');

L.openFunding('home'); L.startBankFunding(); ordinaryMarkup('bank receiving details');
assert(html().includes(L.state.profile.account), 'Bank transfer must show receiving account details');
assert(!html().includes('L.testBankCredit()'), 'Ordinary bank transfer must not offer artificial credit confirmation');
assert.equal(L.state.balance, 950, 'Viewing bank details must never add money');
L.fundingDone();
check('bank transfer presents receiving details and never invents incoming money');

L.startSend('lumo'); L.pickPerson('abena'); set('payment-amount', 700); L.preparePayment(); L.continuePayment();
assert.equal(L.route, 'pause'); assert.equal(L.state.balance, 950); ordinaryMarkup('triggered Pause');
L.pauseAction('edit_amount'); assert.equal(L.route, 'send');
assert.equal(L.state.paymentDraft.name, 'Abena Asante');
check('Pause appears within a qualifying payment and editing preserves the recipient');

assert.equal(typeof L.openTab, 'function', 'A dedicated primary navigation action is required');
L.openTab('home'); L.openTab('pay'); L.openTab('pay'); L.openTab('more'); L.openTab('pay');
assert.equal(L.route, 'pay');
assert.equal(L.history.filter(item => ['home','pay','plan','chat','more'].includes(item.route)).length, 0, 'Primary tab switches must not build a Back stack');
L.go('campusPay'); L.back(); assert.equal(L.route, 'pay');
L.openTab('more'); ordinaryMarkup('You');
assert(!/L\.go\('(?:testing|pauseDemo|sampleConfirm)'\)|Test guide|Merchant counter/.test(html()), 'You must not offer testing shortcuts');
for (const route of ['testing','pauseDemo','pauseLog','sampleConfirm','resetConfirm']) {
  render(route); assert.equal(L.route, 'home', 'Ordinary access must not open testing route ' + route);
}
check('primary tabs do not duplicate history and task Back returns to the current tab');

L.openTab('plan'); L.go('allowance'); set('allowanceAmount', 777); set('allowanceSource', 'Weekend work');
L.go('help', {returnTo:'allowance', returnParams:{}}); L.back();
assert.equal(L.route, 'allowance'); assert.equal(L.value('allowanceAmount'), '777'); assert.equal(L.value('allowanceSource'), 'Weekend work');
L.saveAllowance(); assert.equal(L.state.allowance.amount, 777);
L.go('allowance'); assert.equal(L.value('allowanceAmount'), '777', 'Saved values must not be replaced by stale form snapshots');
L.go('essentialEdit'); set('essName', 'Lecture transport'); set('essAmount', 12.34); L.saveEssential();
L.go('essentialEdit'); assert.equal(L.value('essName'), '', 'A new essential must not restore the previous saved item');
assert.equal(L.value('essAmount'), '', 'A new essential amount must start empty');
check('Help preserves an unfinished plan form and saving clears stale drafts');

L.explore();
L.go('allocate', {id:'goal-laptop'}); set('allocation', 50); L.reviewAllocation();
const allocationReview = clone(L.params); L.confirmAllocation(); const onceAllocated = L.state.goals[0].allocated;
render('allocationReview', allocationReview); L.confirmAllocation();
assert.equal(L.state.goals[0].allocated, onceAllocated, 'A consumed allocation review cannot commit twice');
L.go('releaseGoal', {id:'goal-laptop'}); set('release', 25); L.reviewRelease();
const releaseReview = clone(L.params); L.confirmRelease(); const onceReleased = L.state.goals[0].allocated;
render('releaseReview', releaseReview); L.confirmRelease();
assert.equal(L.state.goals[0].allocated, onceReleased, 'A consumed release review cannot commit twice');
check('allocation and release reviews each commit at most once');

// Render normal customer destinations with ordinary data, including absent-record states.
const excluded = new Set(['testing','feedback','resetConfirm','sampleConfirm','pauseDemo','pauseLog','settlements','settlementDetail']);
let routes = 0;
for (const route of Object.keys(L.views)) {
  if (excluded.has(route) || route.startsWith('merchant')) continue;
  render(route, {id:'unavailable', kind:route === 'bill' ? 'airtime' : undefined});
  ordinaryMarkup(route); routes++;
}
assert.equal(errors.length, 0, errors.join('\n'));
check(routes + ' normal customer destinations render task-appropriate art or compact detail/status without result selectors');
console.log('ALL CUSTOMER EXPERIENCE CHECKS PASS');


// Overview privacy hides exactly the two balance summaries; other details stay visible.
L.explore();L.state.balance=1234.56;L.state.paymentDraft={id:'privacy-draft',method:'lumo',name:'Ama',amount:87.65,fee:0};
L.state.txs=[{id:'privacy-latest',type:'out',status:'success',amount:43.21,name:'Campus shop',date:new Date().toISOString()}];
render('home');const privateSnapshot=JSON.stringify(L.state);
assert(L.views.home().includes('1,234'),'Fresh account Home shows balances');assert(L.views.home().includes('<span>Hide balances</span>'));for(const listener of listeners.get('pageshow')||[])listener({persisted:false});assert(L.views.home().includes('1,234'),'Initial pageshow must not conceal a fresh Home');L.toggleBalancePrivacy();let hiddenHome=L.views.home();
for(const amount of ['1,234','714.56'])assert(!hiddenHome.includes(amount),'Home leaks '+amount);
assert(hiddenHome.includes('aria-label="Show balances"'));assert(hiddenHome.includes('aria-pressed="false"'));
assert.equal((hiddenHome.match(/Amount hidden/g)||[]).length,2);assert.equal(L.state.paymentDraft.amount,87.65);assert(!hiddenHome.includes('Continue saved payment'));assert(hiddenHome.replace(/<[^>]*>/g,'').includes('GH₵43.21'));assert(!hiddenHome.includes('data-revealed-only'));assert(!hiddenHome.includes('Balance details'));assert(!hiddenHome.includes('data-privacy-hint'));
const eyeButton=elements.get('balance-eye');eyeButton.focus();elements.get('view').scrollTop=37;
L.toggleBalancePrivacy();assert.equal(document.activeElement,eyeButton);assert.equal(elements.get('view').scrollTop,37);
assert.equal(eyeButton.getAttribute('aria-label'),'Hide balances');assert.equal(eyeButton.getAttribute('aria-pressed'),'true');
assert(L.views.home().includes('1,234'));assert.equal(L.state.paymentDraft.amount,87.65);assert(L.views.home().includes('43.21'));
assert.equal(JSON.stringify(L.state),privateSnapshot,'Privacy toggle cannot change account or payments');
L.toggleBalancePrivacy();assert(!L.views.home().includes('1,234'));
L.toggleBalancePrivacy();document.hidden=true;for(const listener of documentListeners.get('visibilitychange')||[])listener();assert(!L.views.home().includes('1,234'));
L.toggleBalancePrivacy();for(const listener of listeners.get('pagehide')||[])listener();assert(!L.views.home().includes('1,234'));
L.toggleBalancePrivacy();for(const listener of listeners.get('pageshow')||[])listener({persisted:true});assert(!L.views.home().includes('1,234'));
L.toggleBalancePrivacy();L.state.locked=true;render('home');L.state.locked=false;render('home');assert(!L.views.home().includes('1,234'));
L.toggleBalancePrivacy();vm.runInContext(fs.readFileSync(path.join(dir,'focus.js'),'utf8'),context,{filename:'focus.js'});vm.runInContext(fs.readFileSync(path.join(dir,'clarity-pause.js'),'utf8'),context,{filename:'clarity-pause.js'});assert(L.views.home().includes('1,234'),'Fresh load shows balances while unlocked');L.hidePrivateMoney();L.state.locked=true;render('signin');set('signPhone',L.state.profile.phone);set('signPin','000000');L.onboarding.signin();assert(!L.views.home().includes('1,234'),'Failed sign-in cannot reveal balances');set('signPin','123456');L.onboarding.signin();assert.equal(L.route,'home');assert(!L.views.home().includes('1,234'),'Successful sign-in keeps balances hidden');assert(L.views.home().includes('<span>Show balances</span>'));
check('Home starts visible with a labelled toggle; hide/show preserves focus, background and lock hide, and successful sign-in opens Home with balances hidden');
L.explore();L.startSend('momo');assert.equal(elements.get('recipient-number').value,'');L.startSend('bank');assert.equal(elements.get('recipient-number').value,'');
L.openPayTab('campus');assert.equal(L.route,'pay');assert.equal(L.payTab(),'campus');assert.equal(L.history.length,0);
// A Help round trip must not change Pause Back into a route back to Help.
L.startSend('lumo');L.pickPerson('abena');set('payment-amount','600');L.preparePayment();L.continuePayment();assert.equal(L.route,'pause');
L.go('help',{returnTo:'pause'});L.acct.returnTask();assert.equal(L.route,'pause');
assert(html().includes('aria-label="Go back"'));assert(html().includes(`onclick="L.go('paymentReview')"`));
assert.equal(errors.length,0,errors.join('\n'));
check('Fresh destinations start blank, Campus Pay has one entry, and Pause Back explicitly returns to review');


// A new account has a distinct funding-first Home, with planning invited rather than implied.
L.explore();L.state.balance=0;L.state.txs=[];L.state.essentials=[];L.state.goals=[];L.state.allowance={amount:0,date:''};render('home');
assert(html().includes('Add money'));assert(html().includes('Request money'));assert(html().includes('What must this money cover?'));assert(!html().includes('LEFT AFTER YOUR PLAN'));assert(!html().includes('Send money'));
assert.equal((html().match(/Amount hidden/g)||[]).length,0);assert(html().includes('aria-label="Hide balances"'));ordinaryMarkup('fresh Home');
L.addTx({type:'in',name:'First sample funding',amount:100,status:'success'});render('home');assert(!html().includes('Send money'));assert(!html().includes('Campus Pay'));assert(html().includes('Add money'));assert(html().includes('Request money'));assert(!html().includes('Add your first money'));assert(html().includes('Your money story'));assert(html().replace(/<[^>]*>/g,'').includes('No completed payments: GH₵0.00 paid out.'));assert(html().includes('Your money story · last 7 days'));assert(!html().includes('+GH₵100.00'));assert.equal(L.spendingSummary({days:7}).total,0);
L.state.balance=0;render('home');assert(!html().includes('Add your first money'));assert(html().includes('Add money'));
// No plan value is implied by opening My plan before saving one.
render('plan');assert(!html().includes('class="plan-room"'));assert(html().includes('Build my first plan'));
check('Fresh, funded and returning-empty Homes select the right action and never imply a saved plan');

// Saved-plan consequences can intervene below the behavioral threshold, and edits invalidate approval.
L.explore();L.state.balance=200;L.state.txs=[];L.state.essentials=[{id:'transport',name:'Transport',amount:150,paid:0,date:'2026-10-20'}];L.state.goals=[];
L.startSend('lumo');L.pickPerson('abena');set('payment-amount','70');L.preparePayment();L.continuePayment();assert.equal(L.route,'pause');
let decision=L.pauseEngine.evaluate(L.state.paymentDraft);assert.equal(decision.behavioralTriggered,false);assert(decision.signals.every(signal=>signal.code==='late_night'));assert.equal(decision.planImpact.gapAfter,20);assert(html().includes('Transport would be GH₵20.00 short.'));assert(html().includes('data-pause-comparison'));assert(html().includes(L.balanceNumber(130)));assert(html().includes('of GH₵150.00 planned'));
L.resumeFromPause();L.state.essentials[0].name='Transport to lectures';set('payment-pin','123456');L.authorizePayment();assert.equal(L.route,'paymentReview');assert.equal(L.state.balance,200);
check('Plan-aware Pause shows a real consequence and changed plan details require fresh approval');

// Money Story carries the actual selected period and category into Chat and back.
L.explore();L.state.txs=[
 {id:'recent-food',name:'Lunch',type:'out',status:'success',amount:40,fee:2,category:'Food',date:new Date(Date.now()-86400000).toISOString()},
 {id:'recent-data',name:'Data',type:'out',status:'success',amount:20,fee:0,category:'Data',date:new Date(Date.now()-86400000).toISOString()},
 {id:'old-food',name:'Earlier food',type:'out',status:'success',amount:100,fee:0,category:'Food',date:new Date(Date.now()-20*86400000).toISOString()}
];
render('story',{days:7,category:'Food'});assert(html().includes('GH₵42.00'));assert(!html().includes('GH₵142.00'));assert(html().includes('All spending'));
const talkAction=[...html().matchAll(/onclick="([^"]*)"/g)].map(m=>decode(m[1])).find(js=>js.startsWith("L.go('chat'"));assert(talkAction);vm.runInContext(talkAction,context);
assert.equal(L.route,'chat');let reply=L.state.chats.at(-1);assert.equal(reply.context.days,7);assert.equal(reply.context.category,'Food');assert(reply.text.includes('GH₵42.00'));assert(reply.text.includes('last 7 days'));
L.setChatPeriod(90);L.chatOpenAnswer(L.state.chats.length-1);assert.equal(L.route,'story');assert.equal(L.params.days,7);assert.equal(L.params.category,'Food');assert(html().includes('GH₵42.00'));
// Affordability intent wins over category keywords and asks for missing amount.
render('chat',{days:7});set('chatText','Can I afford food tonight?');const beforeChat=JSON.stringify({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs});L.askChat();
reply=L.state.chats.at(-1);assert.equal(reply.intent,'affordability');assert(reply.pendingAffordability);assert(reply.text.includes('total in Ghana cedis'));
set('chatText','70');L.askChat();reply=L.state.chats.at(-1);assert.equal(reply.intent,'affordability');assert.equal(reply.planImpact.amount,70);assert(reply.calculation.rows.some(([label,value])=>label==='Payment total, including any fee'&&value==='GH₵70.00'));assert.equal(reply.context.days,7);assert(!reply.pendingAffordability);
assert.equal(JSON.stringify({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs}),beforeChat);
assert.equal(errors.length,0,errors.join('\n'));
check('Money Story and Chat share period/category, reply actions preserve their own context, and affordability asks for the amount');

L.explore();L.state.balance=100;L.state.goals=[];L.state.essentials=[{id:'gap',name:'Printing',amount:167.89,paid:0}];L.hidePrivateMoney();render('home');
assert.equal((html().match(/Amount hidden/g)||[]).length,2);assert(html().includes('GH₵67.89 still uncovered'));assert(html().replace(/<[^>]*>/g,'').includes('Data took GH₵45.00 of GH₵80.00 paid out.'));assert(!html().includes('data-private-value="gap"'));
check('The eye hides only the two requested summaries; shortfalls and payment details remain visible');

// The reported account and purchase must tell one story across the actual routes.
L.explore();Object.assign(L.state,{balance:600,txs:[],chats:[],allowance:{amount:0,date:''},essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',target:2500,allocated:100}]});
L.hidePrivateMoney();render('home');assert.equal((html().match(/Amount hidden/g)||[]).length,2);
assert(html().includes('aria-controls="overview-balance overview-room"'));assert(html().includes('After <b>GH₵350.00</b> for essentials and <b>GH₵100.00</b> for goals.'));
assert(html().indexOf('overview-balance')<html().indexOf('overview-room'));assert(html().indexOf('home-stage')<html().indexOf('overview-balance'));
assert(!html().includes('aria-label="Review your plan"'),'The summary must expose its visible amount and explanation to assistive technology');
L.toggleBalancePrivacy();const visibleHome=L.views.home();assert.match(visibleHome,/data-private-value="available"[^>]*>[\s\S]*?600/);assert.match(visibleHome,/data-private-value="room"[^>]*>[\s\S]*?150/);
assert.equal(L.balances().room,150);
L.startSend('lumo');L.pickPerson('abena');set('payment-amount','280');L.preparePayment();const moneyBefore=JSON.stringify({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals});
L.continuePayment();assert.equal(L.route,'pause');const consequence=L.planImpactSummary(L.state.paymentDraft),pauseHtml=html();
assert(pauseHtml.includes('Food and transport would be GH₵30.00 short.'));assert(pauseHtml.includes('data-pause-comparison'));assert(pauseHtml.includes('Essentials covered'));assert(pauseHtml.includes(L.balanceNumber(350)));assert(pauseHtml.includes(L.balanceNumber(320)));assert(pauseHtml.includes('of GH₵350.00 planned'));assert(!pauseHtml.includes('would remain for'));assert(pauseHtml.includes('Money set aside for Laptop: GH₵100.00 uncovered after essentials.'));
assert(pauseHtml.indexOf('GH₵30.00 short')<pauseHtml.indexOf('Money set aside for Laptop'));assert(pauseHtml.indexOf('Money set aside for Laptop')<pauseHtml.indexOf('<summary>See calculation'));assert(pauseHtml.includes('<dt>Total plan shortfall</dt><dd>GH₵130.00</dd>'));assert(!/<details class="pause-calculation"[^>]*open/.test(pauseHtml));
const equalChoices=[...pauseHtml.matchAll(/<button[^>]*class="([^"]*pause-equal-choice[^"]*)"[^>]*>([^<]+)<\/button>/g)];
assert.deepEqual(equalChoices.map(m=>m[2]),['Edit amount','Continue to PIN']);assert.equal(equalChoices[0][1],equalChoices[1][1]);
L.pauseAction('edit_amount');assert.equal(L.route,'send');assert.equal(Number(L.state.paymentDraft.amount),280);assert.equal(L.state.paymentDraft.name,'Abena Asante');
L.openTab('chat');set('chatText','Can I afford GH₵280.00?');elements.get('chatText').focus();focusEvents.length=0;L.askChat();
const consistentReply=L.state.chats.at(-1);assert.equal(consistentReply.headline,consequence.headline);assert.equal(consistentReply.support,consequence.goalExplanation);assert.equal(consistentReply.planImpact.totalGap,130);
assert(html().includes('chat-has-conversation'));assert.match(html(),/class="text-btn chat-calculation-link"[^>]*onclick="L.openChatCalculation\(0\)"/);assert(!html().includes('Total plan shortfall'));
assert(!/<details class="chat-prompts"[^>]*\bopen\b/.test(html()));assert(!focusEvents.includes('route-heading'));assert.equal(document.activeElement.id,'chatText');
assert.equal(JSON.stringify({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals}),moneyBefore);ordinaryMarkup('active conversation');
assert.equal(errors.length,0,errors.join('\n'));
check('The GH₵600.00 example pairs GH₵150.00 room on Home and identical essentials-first consequences in Pause and Chat, without moving money');

// Connected Campus Pay sequence: quotation and explanation never authorize payment.
const decisionFixture=()=>{
 L.explore();Object.assign(L.state,{balance:600,txs:[],chats:[],allowance:{amount:1200,date:'2099-11-01'},planHorizon:{mode:'unspecified',date:''},essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',target:2500,allocated:100}]});
 L.hidePrivateMoney();render('home');
};
const financialSnapshot=()=>JSON.stringify({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals});
const enterCampus=amount=>{L.openPayTab('campus');set('merchant-code','AK01');L.findMerchant();assert.equal(L.route,'send');assert(html().includes('data-payment-entry'));assert(html().includes('payment-amount-row'));assert(html().includes('payment-currency'));const next=html().indexOf('<button type="submit" class="primary">Review payment');assert(html().indexOf('payment-projection')<next);assert(next<html().indexOf('Add a note'));assert(html().indexOf('payment-essential')<next);set('payment-amount',amount);set('payment-essential','');};
for(const [amount,spare] of [[80,70],[140,10],[280,0]]){
 decisionFixture();assert.equal(L.balances().room,150);assert(!html().includes('How long should this money last?'));assert(!html().includes("L.go('planPeriod')"));assert(!html().includes('Plan period not set'));assert(!html().includes('Available minus saved essentials'));
 enterCampus(amount);const untouched=financialSnapshot(),draftBefore=JSON.stringify(L.state.paymentDraft);L.refreshPaymentProjection();
 const live=elements.get('payment-projection').innerHTML,p=L.paymentProjection();assert.equal(p.room,spare);assert(live.includes(L.entryConsequenceText(p)));assert(live.includes('If you pay this'));assert(!live.includes('insight-support'));assert(!live.includes('Projected account balance'));assert.equal(financialSnapshot(),untouched);assert.equal(JSON.stringify(L.state.paymentDraft),draftBefore);
 const answer=L.chatAnswer('Can I afford GH₵'+amount+'?');assert.equal(answer.headline,p.headline);assert.equal(financialSnapshot(),untouched);
 L.preparePayment();assert.equal(L.route,'paymentReview');assert(!html().includes(p.headline));assert(!html().includes('Projected balance'));assert(!html().includes('entry-consequence'));assert(!html().includes('decision-insight'));for(const fact of ['Amount','Fee','Total to pay',"Akua’s Kitchen"])assert(html().includes(fact));assert.equal(financialSnapshot(),untouched);
 L.continuePayment();assert.equal(L.route,amount===280?'pause':'authorize');assert.equal(financialSnapshot(),untouched);
 if(amount===280){assert(html().includes('Food and transport would be GH₵30.00 short.'));L.resumeFromPause();assert.equal(L.route,'authorize');}
 set('payment-pin','123456');L.authorizePayment();assert.equal(L.route,'paymentResult');assert.equal(L.state.balance,600-amount);assert.equal(L.state.txs.length,1);assert(html().includes('data-payment-state="confirmed"'));assert(html().includes('Payment confirmed.'));assert(!html().includes('Projected balance'));
 L.authorizePayment();assert.equal(L.state.txs.length,1);ordinaryMarkup('Campus Pay confirmed '+amount);
}
check('Campus Pay stages show compact live impact, factual Review and distinct Pause choices, with matching Chat calculation and one confirmed debit');

decisionFixture();enterCampus(280);L.preparePayment();L.continuePayment();L.pauseAction('edit_amount');assert.equal(L.route,'send');set('payment-amount','140');L.refreshPaymentProjection();assert(elements.get('payment-projection').innerHTML.includes('GH₵10.00 left after your plan'));L.preparePayment();L.continuePayment();assert.equal(L.route,'authorize');assert.equal(L.state.balance,600);
decisionFixture();enterCampus(280);L.preparePayment();L.continuePayment();L.pauseAction('cancel_payment');assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);assert.equal(L.state.paymentDraft,null);
decisionFixture();enterCampus(80);set('payment-essential','food');L.refreshPaymentProjection();assert.equal(L.paymentProjection().room,150);L.preparePayment();assert.equal(L.paymentImpact(L.state.paymentDraft).room,150);L.continuePayment();assert.equal(L.route,'authorize');set('payment-pin','123456');L.authorizePayment();assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().room,150);
check('Editing re-evaluates the amount, cancelling leaves money untouched and linked Food fulfils the plan without being counted twice');

for(const invalid of ['6000','12.345','-1','']){
 decisionFixture();enterCampus(invalid);L.capturePaymentInput({target:elements.get('payment-amount')});L.refreshPaymentProjection();assert.equal(L.paymentProjection(),null);assert(elements.get('payment-projection').innerHTML.includes('Enter an amount'));
 const d=JSON.stringify(L.state.paymentDraft);render('send');assert.equal(JSON.stringify(L.state.paymentDraft),d);assert(elements.get('payment-projection').innerHTML.includes('Enter an amount'));
}
decisionFixture();enterCampus(80);L.refreshPaymentProjection();set('payment-amount','140');for(const listener of listeners.get('pageshow')||[])listener();assert(elements.get('payment-projection').innerHTML.includes('GH₵10.00 left after your plan'));assert.equal(L.state.balance,600);
check('Initial, edited and browser-restored input projections apply the same amount validity and stay read-only');

for(const [outcome,status,available] of [['Pending','pending',520],['Failed','failed',600]]){
 decisionFixture();enterCampus(80);L.preparePayment();L.continuePayment();L.testMode=true;render('authorize');set('payment-outcome',outcome);set('payment-pin','123456');L.authorizePayment();L.testMode=false;
 assert.equal(L.state.balance,600);assert.equal(L.balances().available,available);assert(html().includes(`data-payment-state="${status}"`));assert(!html().includes('Payment confirmed.'));assert.equal(L.state.txs[0].status,status);
}
assert.equal(L.money(600),'GH₵600.00');assert.equal(L.money(1234567.89),'GH₵1,234,567.89');assert.equal(L.money(-30),'−GH₵30.00');assert.equal(L.money(-.001),'GH₵0.00');
assert.equal(errors.length,0,errors.join('\n'));
check('Pending and failed outcomes keep their own status, reserve or release funds correctly, and all money uses one cedi format');

decisionFixture();L.state.balance=1234567.89;L.state.profile.name='Kwaku Nii Adjei Mensah';L.hidePrivateMoney();render('home');assert(!html().includes('1,234,567'));L.toggleBalancePrivacy();assert(L.views.home().includes('1,234,567'));assert(L.views.home().includes('1,234,117'));
enterCampus(140);L.state.paymentDraft.name='Akua’s Kitchen at the University of Ghana Student Night Market';L.preparePayment();assert(html().includes('Akua’s Kitchen at the University of Ghana Student Night Market'));assert(!html().includes('NaN'));assert(!html().includes('undefined'));ordinaryMarkup('long name and large balance');
check('Long names and grouped large balances render complete escaped text, retain privacy and produce finite projections');
