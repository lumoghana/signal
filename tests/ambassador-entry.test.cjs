/* Shareable ambassador entry checks use the real modules in their deployed order.
   This harness verifies routes, sample money and feedback; it does not measure phone layout. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
function makeHarness(search=''){
const dir = path.join(__dirname, '../dist');
const errors = [], store = new Map(), elements = new Map(), paints = [];
const decode = value => String(value || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attributes = source => Object.fromEntries([...source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m => [m[1], decode(m[2] ?? m[3] ?? m[4] ?? '')]));
class Element {
  constructor(id = '', tag = 'div', attrs = {}) {
    this.id = id; this.tagName = tag.toUpperCase(); this.attributes = {...attrs};
    this.type = attrs.type || (tag === 'input' ? 'text' : ''); this.name = attrs.name || '';
    this.value = attrs.value || ''; this.checked = 'checked' in attrs; this.disabled = 'disabled' in attrs;
    this.hidden = 'hidden' in attrs; this.textContent = ''; this.dataset = {}; this.style = {};
    this.clientHeight = 0; this.scrollHeight = 0; this.scrollTop = 0; this.children=[];
    this.classList = {add(){}, remove(){}, toggle(){}, contains: name => (attrs.class || '').split(/\s+/).includes(name)};
  }
  set innerHTML(value) {
    this._html = value;
    if(this.id==='nav'){
      this.children=[...value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match=>{
        const node=new Element('','button',attributes(match[1]));node.textContent=decode(match[2].replace(/<[^>]+>/g,'')).trim();return node;
      });
    }
    if (this.id !== 'view') return;
    paints.push(value);
    for (const id of [...elements.keys()]) if (!['view','app','nav','toast'].includes(id)) elements.delete(id);
    for (const match of value.matchAll(/<(input|select|textarea|button|div|form|h1)\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)(?=<\/\1>|$)/g)) {
      const attrs = attributes(match[2]), element = new Element(match[3], match[1], attrs);
      if (match[1] === 'textarea') element.value = decode(match[4]);
      elements.set(element.id, element);
    }
    // Parse void inputs and selects separately so nested markup cannot hide fields.
    for (const match of value.matchAll(/<input\b([^>]*\bid="([^"]+)"[^>]*)>/g)) elements.set(match[2], new Element(match[2], 'input', attributes(match[1])));
    for (const match of value.matchAll(/<textarea\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/textarea>/g)) {
      const element = new Element(match[2], 'textarea', attributes(match[1]));
      element.value = decode(match[3]); elements.set(element.id, element);
    }
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
    if(this.id==='nav'&&['.nav-item','button'].includes(selector))return this.children.filter(node=>selector==='button'||node.classList.contains('nav-item'));
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
  querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; }
  matches(selector) { return selector.split(',').some(part => this.tagName.toLowerCase() === part.trim()); }
  closest() { return null; }
  focus() { document.activeElement = this; }
  blur() { document.activeElement = null; }
  replaceChildren(...nodes){this.children=[...nodes];}
  scrollIntoView() {} scrollTo() {} addEventListener() {} dispatchEvent() {} appendChild() {} insertBefore() {} click() {} remove() {} select() {}
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
  location: {origin: 'https://test.example', pathname: '/', hash: '', search},
  history: browserHistory,
  confirm: () => true, console: {error: error => errors.push(String(error)), log: console.log},
  setTimeout: () => 0, clearTimeout() {}, URLSearchParams,
  URL: {createObjectURL: () => '', revokeObjectURL() {}}, Blob, Event: class {}, Date, Math,
  matchMedia: () => ({matches: true, addEventListener(){}}), scrollTo() {},
  addEventListener: (type, listener) => listeners.set(type, [...listeners.get(type) || [], listener])
};
context.window = context;
vm.createContext(context);
const source=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
// The entry selector follows the established customer foundations. Optional
// scanner and biometric adapters then extend the already-selected entry.
for(const [before,after]of [['plan-hub.js','ambassador.js'],['ambassador.js','qr-payments.js'],['vendor/jsqr.js','qr-payments.js'],['vendor/qrcode-generator.js','qr-payments.js'],['qr-payments.js','biometric-auth.js']])assert(scripts.indexOf(before)>=0&&scripts.indexOf(after)>scripts.indexOf(before),before+' must load before '+after);
assert(scripts.indexOf('decision-system.js') < scripts.indexOf('clarity-pause.js'),'Shared financial presentation must load before the Clarity comparison');
assert(scripts.indexOf('task-sheet.js')>=0&&scripts.indexOf('task-sheet.js')<scripts.indexOf('ambassador.js'),'Task presentation must load before the single entry render');
assert(scripts.indexOf('clarity-pause.js')<scripts.indexOf('expressive-art.js'));
assert(scripts.indexOf('expressive-art.js')<scripts.indexOf('bold-system.js')&&scripts.indexOf('native-decisions.js')<scripts.indexOf('task-sheet.js'));
for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context,{filename:file});
const L=context.L;
const html=()=>elements.get('view').innerHTML;
const set=(id,value,checked)=>{const field=elements.get(id);assert(field,'Missing field '+id+' on '+L.route);field.value=String(value);if(checked!==undefined)field.checked=checked;};
const route=(name,params={})=>{L.route=name;L.params=params;L.render();};
const click=label=>{
 const button=[...html().matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match=>decode(match[2].replace(/<[^>]+>/g,'')).trim()===label);
 assert(button,'Missing button '+label+' on '+L.route);
 const attrs=attributes(button[1]);let action=attrs.onclick;
 if(!action&&attrs.type==='submit'){
  const form=[...html().slice(0,button.index).matchAll(/<form\b([^>]*)>/g)].at(-1);
  action=form&&attributes(form[1]).onsubmit;context.event={preventDefault(){}};
 }
 assert(action,'Button has no action '+label);vm.runInContext(action,context);
};
const clickMenu=destination=>{
 const button=[...html().matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match=>attributes(match[1])['data-menu-route']===destination);
 assert(button,'Missing Menu destination '+destination+' on '+L.route);
 click(decode(button[2].replace(/<[^>]+>/g,'')).trim());
};
return {L,context,html,set,route,click,clickMenu,errors,paints};
}
const check=message=>console.log('PASS '+message);

// The deployed query selects its entry before the first application paint.
const ordinary=makeHarness();
assert.equal(ordinary.L.ambassadorMode,false);assert.equal(ordinary.L.route,'welcome');
assert.equal(ordinary.paints.length,1,'Ordinary first paint must wait for all view modules');
assert(!ordinary.html().includes('Try Lumo.<br>Tell us how it feels.'));
const entry=makeHarness('?ambassador=1');
assert.equal(entry.L.ambassadorMode,true);assert.equal(entry.L.testMode,false,'Ambassadors must see customer controls, not provider outcome selectors');
assert.equal(entry.L.route,'ambassadorWelcome');assert.equal(entry.paints.length,1,'Ambassador entry must be the first and only initial paint');
assert(entry.html().includes('Payments, account details and verification are simulated'));
for(const label of ['Start from sign-up','Explore a sample account','What to try'])assert(entry.html().includes(label));
assert(!entry.html().includes('Continue my Lumo'));
check('Ordinary and ambassador links render one correct entry, with sample boundaries and discoverable choices');

// Someone who cannot complete signup must still be able to report the problem.
entry.click('What to try');assert.equal(entry.L.route,'ambassadorGuide');
for(const text of ['0241230123','123456','University of Ghana','kwame@example.com','Do not enter real Ghana Card','does not send','GH₵450.00','GH₵200.00'])assert((entry.html()+entry.L.views.ambassadorWelcome()).includes(text),text);
entry.click('Leave feedback');assert.equal(entry.L.route,'feedback','Pre-signup feedback must not redirect to Sign in');
entry.set('feedbackName','Student one');entry.set('feedbackEase','2');entry.set('feedbackTask','Sign-up');entry.set('feedbackText','I could not understand the identity step.');
entry.click('Save my feedback');assert.equal(entry.L.state.feedback.length,1);assert.equal(entry.L.state.feedback[0].task,'Sign-up');
let download;entry.L.download=(name,text,type)=>download={name,text,type};
entry.click('Download feedback to share');assert.equal(download.name,'Lumo_Ambassador_Feedback.json');
assert.equal(JSON.parse(download.text).feedback[0].text,'I could not understand the identity step.');
assert(!Object.hasOwn(JSON.parse(download.text),'payments'),'Feedback export must not require exporting account activity');
entry.L.state.locked=true;entry.route('ambassadorGuide');entry.click('Leave feedback');assert.equal(entry.L.route,'feedback','Locked account feedback must remain available');
assert.equal(entry.L.state.locked,true,'Reporting feedback must not unlock the account');
entry.L.state.locked=false;
entry.route('ambassadorWelcome');entry.click('Start from sign-up');assert.equal(entry.L.route,'ambassadorReset','Saved feedback requires a reset decision');
assert.equal(entry.L.state.feedback.length,1,'Reset prompt must preserve prior feedback');
assert(entry.html().includes('Download my feedback'));entry.click('Keep my current account');assert.equal(entry.L.state.feedback.length,1);
check('Feedback works before onboarding and while locked, downloads explicitly, and reset is a separate decision');

// Fresh signup uses the actual onboarding journey without privileged tester controls.
const signup=makeHarness('?ambassador=1');
signup.click('Start from sign-up');assert.equal(signup.L.route,'welcome');
signup.click('Get started');assert.equal(signup.L.route,'samplePause');
signup.click('Start sign-up');assert.equal(signup.L.route,'phone');
signup.set('phoneNumber','0241230123');signup.L.onboarding.sendCode('signup');
signup.set('verificationCode','123456');signup.L.onboarding.verifyCode();assert.equal(signup.L.route,'identity');
signup.set('identityPrivacy','',true);signup.L.onboarding.beginIdentity();signup.L.onboarding.identityCheck();assert.equal(signup.L.route,'identityResult');
signup.set('campusName','University of Ghana');signup.set('campusEmail','kwame@example.com');signup.set('customerAddress','Sample hall, Legon');signup.L.onboarding.confirmVerifiedDetails();assert.equal(signup.L.route,'pin');
signup.set('newPin','123456');signup.L.onboarding.pinNext();signup.set('confirmPin','123456');signup.L.onboarding.pinConfirm();
signup.set('accountAgree','',true);signup.set('productMessages','',false);signup.L.onboarding.createAccount();
assert.equal(signup.L.route,'accountReady');assert.equal(signup.L.state.onboarded,true);assert.equal(signup.L.state.balance,0);assert.equal(signup.L.accountBalances().savings,0);assert.notEqual(signup.L.state.accounts.operational.number,signup.L.state.accounts.savings.number);signup.click('Add money');assert.equal(signup.L.route,'addMoney');signup.L.fundingDone();assert.equal(signup.L.route,'home');
assert(!/identityOutcome|campusOutcome|accountOutcome|payment-outcome/.test(signup.html()));
signup.L.openTab('more');signup.clickMenu('ambassadorGuide');assert.equal(signup.L.route,'ambassadorGuide');
signup.route('ambassadorWelcome');assert(signup.html().includes('Continue my Lumo'));signup.click('Continue my Lumo');assert.equal(signup.L.route,'home');
check('Student sample signup reaches fresh Home and the guide stays reachable from Menu');

// Loading the documented sample must produce the documented Pause, not merely a render.
const sample=makeHarness('?ambassador=1');sample.click('Explore a sample account');assert.equal(sample.L.route,'ambassadorSample');
assert(sample.html().includes('replaces the demo'));assert(sample.html().includes('123456'));
sample.click('Load sample account');assert.equal(sample.L.route,'home');assert.equal(sample.L.state.balance,720);assert.equal(sample.L.state.profile.pin,'123456');
sample.L.startSend('lumo');sample.L.pickPerson('abena');sample.set('payment-amount','450');sample.L.preparePayment();sample.L.continuePayment();
assert.equal(sample.L.route,'pause');const decision=sample.L.pauseEngine.evaluate(sample.L.state.paymentDraft);
assert.equal(decision.planImpact.gapAfter,50);assert.equal(decision.after,270);assert.equal(sample.L.state.balance,720,'Reviewing Pause cannot move money');assert.equal(sample.L.accountBalances().savings,200);
sample.L.pauseAction('edit_amount');assert.equal(sample.L.route,'send');assert.equal(sample.L.state.paymentDraft.name,'Abena Asante');
sample.route('ambassadorWelcome');sample.click('Start from sign-up');assert.equal(sample.L.route,'ambassadorReset');
assert.equal(sample.L.state.balance,720);sample.click('Reset and start sign-up');assert.equal(sample.L.route,'welcome');assert.equal(sample.L.state.onboarded,false);assert.equal(sample.L.state.balance,0);assert.equal(sample.L.accountBalances().savings,0);assert.equal(sample.L.state.txs.length,0);
ordinary.L.explore();ordinary.L.openTab('more');assert(!ordinary.html().includes('mono-menu-testing'),'Ordinary Menu must not expose business testing controls');assert(ordinary.html().includes('data-menu-route="ambassadorGuide"'),'Preview help stays available from the grouped Menu');
check('Sample account creates the promised GH₵50.00 essentials consequence and replacement is explicit');

for(const harness of [ordinary,entry,signup,sample])assert.deepEqual(harness.errors,[],'No runtime render fallback is allowed');
console.log('All ambassador entry checks passed.');
