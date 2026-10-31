/* Actual onboarding forms and two-account engine. These checks do not claim
   live identity verification or rendered phone geometry. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(options={}){const h=createHarness({...options,modules:['core.js','two-account-engine.js','onboarding.js']});h.L.render();return h;}
function type(h,id,value){const field=h.set(id,value),handler=field.getAttribute('oninput');if(handler){h.context.__typed=field;vm.runInContext('(function(){'+handler+'}).call(__typed)',h.context);delete h.context.__typed;}return field;}
function click(h,label){const button=view(h).querySelectorAll('button').find(el=>el.textContent.trim()===label);assert(button,'Visible '+label+' on '+h.L.route);button.click();return button;}
function submit(h){const form=view(h).querySelector('form');assert(form,'Working form on '+h.L.route);h.submit(form);}
function identity(h){const {L}=h;L.onboarding.start();type(h,'phoneNumber','0241230123');submit(h);type(h,'verificationCode','123456');submit(h);assert.equal(L.route,'identity');h.document.getElementById('identityPrivacy').checked=true;click(h,'Continue');assert.equal(L.route,'livecheck');click(h,'Continue');assert.equal(L.route,'identityResult');return L.state.setup.verifiedIdentity;}
function details(h,campus='University of Ghana'){type(h,'campusName',campus);type(h,'campusEmail','student@example.com');type(h,'customerAddress','Hall 2, Legon');submit(h);assert.equal(h.L.route,'pin');}
function security(h){type(h,'newPin','654321');submit(h);type(h,'confirmPin','654321');submit(h);assert.equal(h.L.route,'accountReview');}
const clean=h=>assert.deepEqual(h.errors,[]);

check('identity confirmation precedes an editable details review with authoritative fields read-only',()=>{
 const h=fixture(),{L}=h;const identityData=identity(h),root=view(h);assert(root.textContent.includes('Kwame Mensah'));assert(root.textContent.includes('12 Mar 2004'));assert(root.textContent.includes('GHA-000000000-0'));
 assert(h.document.getElementById('campusName'));assert(h.document.getElementById('campusEmail'));assert(h.document.getElementById('customerAddress'));assert(!root.querySelector('input[name="ghanaCard"]'));assert(!root.querySelector('input[name="dateOfBirth"]'));assert(!root.querySelector('input[name="fullName"]'));
 L.state.profile.name='Attempted edit';L.state.profile.dateOfBirth='1900-01-01';details(h,'Ashesi University');assert.equal(L.state.profile.name,identityData.name);assert.equal(L.state.profile.dateOfBirth,identityData.dateOfBirth);assert.equal(L.state.profile.ghanaCard,identityData.ghanaCard);assert.equal(L.state.profile.email,'student@example.com');assert.equal(L.state.profile.address,'Hall 2, Legon');assert.equal(L.state.profile.campus,'Ashesi University');assert.equal(L.state.setup.identityDetailsReviewed,true);assert.equal(L.state.setup.campusStatus,'approved');assert.equal(L.state.onboarded,false);clean(h);
});

check('non-Legon notice appears above the details heading and permits signup',()=>{
 const h=fixture(),{L}=h;identity(h);let notice=h.document.getElementById('campusPilotNotice');assert.equal(notice.hidden,true);type(h,'campusName','Kwame Nkrumah University of Science and Technology');assert.equal(notice.hidden,false);assert(notice.textContent.includes('Some campus features may be limited'));assert(view(h).innerHTML.indexOf('campusPilotNotice')<view(h).innerHTML.indexOf('Does this look right?'));assert(!/waitlist|student id/i.test(view(h).textContent));type(h,'campusEmail','student@example.com');submit(h);assert.equal(L.route,'pin');assert.equal(L.state.profile.pilotCampusLimited,true);assert.equal(L.state.setup.identityStatus,'approved');clean(h);
});

check('details validation keeps the editable information and prevents incomplete confirmation',()=>{
 const h=fixture(),{L}=h;identity(h);type(h,'campusName','');type(h,'campusEmail','student@example.com');submit(h);assert.equal(L.route,'identityResult');assert.equal(h.document.activeElement.id,'campusName');type(h,'campusName','Ashesi University');type(h,'campusEmail','wrong');type(h,'customerAddress','Campus residence');submit(h);assert.equal(L.route,'identityResult');assert.equal(h.document.activeElement.id,'campusEmail');assert.equal(h.document.getElementById('customerAddress').value,'Campus residence');assert.notEqual(L.state.setup.identityDetailsReviewed,true);assert.equal(L.state.onboarded,false);clean(h);
});

check('phone correction still requires OTP and returns to the saved detail review',()=>{
 const h=fixture(),{L}=h;identity(h);type(h,'campusName','University of Cape Coast');type(h,'campusEmail','student@example.com');type(h,'customerAddress','Hall 4');click(h,'Change number');assert.equal(L.route,'phone');assert.equal(L.state.setup.phoneConfirmed,false);type(h,'phoneNumber','0201234567');submit(h);assert.equal(L.route,'otp');type(h,'verificationCode','000000');submit(h);assert.equal(L.route,'otp');assert.equal(L.state.profile.phone,'0241230123');type(h,'verificationCode','123456');submit(h);assert.equal(L.route,'identityResult');assert.equal(L.state.profile.phone,'0201234567');assert.equal(h.document.getElementById('campusName').value,'University of Cape Coast');assert.equal(h.document.getElementById('customerAddress').value,'Hall 4');assert.equal(L.state.onboarded,false);clean(h);
});

check('successful signup creates two distinct empty accounts and makes Add money the next action',()=>{
 const h=fixture(),{L}=h;identity(h);details(h);security(h);click(h,'Create account');assert.equal(L.route,'accountReview');assert.equal(L.state.onboarded,false);assert.equal(L.state.accounts,undefined);h.document.getElementById('accountAgree').checked=true;click(h,'Create account');assert.equal(L.route,'accountReady');assert.equal(L.state.onboarded,true);assert.equal(L.state.accounts.version,2);const a=L.accountBalances();assert.equal(a.total,0);assert.equal(a.operational,0);assert.equal(a.savings,0);assert.notEqual(a.operationalNumber,a.savingsNumber);assert(/^\d{10}$/.test(a.operationalNumber));assert(/^\d{10}$/.test(a.savingsNumber));assert(view(h).textContent.includes('Your account has been created.'));assert(!view(h).textContent.includes(a.operationalNumber));assert(!view(h).textContent.includes(a.savingsNumber));assert(!/operational|savings|two accounts/i.test(view(h).textContent));const add=view(h).querySelectorAll('button').find(b=>b.textContent==='Add money');assert(add);assert.equal(add.getAttribute('onclick'),'L.beginFirstFunding()');assert(!view(h).textContent.includes('Start with a plan'));assert.equal(L.state.profile.pin,'654321');assert.equal(L.state.profile.address,'Hall 2, Legon');assert.equal(L.state.txs.length,0);clean(h);
});

check('pending account approval cannot create either account or bypass existing consent/security',()=>{
 const h=fixture({testing:true}),{L}=h;identity(h);details(h);security(h);h.document.getElementById('accountAgree').checked=true;h.set('accountOutcome','pending');click(h,'Create account');assert.equal(L.route,'applicationStatus');assert.equal(L.state.onboarded,false);assert.equal(L.state.accounts,undefined);const reference=L.state.setup.applicationRef;h.set('applicationOutcome','ready');click(h,'Check status');assert.equal(L.route,'accountReady');const numbers=[L.state.accounts.operational.number,L.state.accounts.savings.number];L.onboarding.ready();assert.equal(L.route,'accountReady');assert.deepEqual([L.state.accounts.operational.number,L.state.accounts.savings.number],numbers);assert.equal(L.state.setup.applicationRef,reference);assert.equal(L.state.txs.length,0);clean(h);
});

check('an unapproved or locked account cannot expose a ready-account confirmation',()=>{
 const h=fixture(),{L}=h;L.go('accountReady');assert(view(h).textContent.includes('Complete your setup.'));assert(!view(h).textContent.includes('Your account has been created.'));assert.equal(L.state.accounts,undefined);L.state.onboarded=true;L.state.locked=true;L.ensureAccounts();L.go('accountReady');assert(!view(h).textContent.includes(L.state.accounts.savings.number));assert(h.document.getElementById('signPin'));clean(h);
});

check('legacy approved records do not fabricate missing verified card or birth date',()=>{
 const h=fixture(),{L}=h;Object.assign(L.state.setup,{phoneConfirmed:true,identityStatus:'approved',verifiedName:'Kwame Mensah'});L.state.profile.phone='0241230123';L.go('identityResult');assert(view(h).textContent.includes('Not returned in this saved preview'));assert(!view(h).textContent.includes('GHA-000000000-0'));assert(!view(h).textContent.includes('12 Mar 2004'));assert.equal(L.state.onboarded,false);clean(h);
});

check('saved non-Legon interest is disclosed immediately and Ghana university spellings are recognised',()=>{
 const h=fixture(),{L}=h;L.state.setup.interest={campus:'Ashesi University',email:'student@example.com'};L.state.setup.identityStatus='approved';L.state.setup.phoneConfirmed=true;L.go('identityResult');assert.equal(h.document.getElementById('campusName').value,'Ashesi University');assert.equal(h.document.getElementById('campusPilotNotice').hidden,false);for(const name of ['University of Ghana','University of Ghana, Legon','UG','Legon'])assert.equal(L.isLegonUniversity(name),true);assert.equal(L.isLegonUniversity('University of Cape Coast'),false);clean(h);
});

console.log(passed+' account onboarding checks passed.');
