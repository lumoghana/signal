/* Signup regressions use the shipped index, mounted forms and real route guards.
   This DOM harness verifies behavior, not rendered phone geometry. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
let passed=0;
const check=(label,run)=>{run();passed++;console.log('PASS '+label);};
const view=h=>h.document.getElementById('view');
function click(h,label){const button=view(h).querySelectorAll('button').find(el=>el.textContent.trim()===label);assert(button,'Visible '+label+' action on '+h.L.route);button.click();return button;}
function submit(h){const form=view(h).querySelector('form');assert(form,'Working form on '+h.L.route);h.submit(form);}
function input(h,id,value){const field=h.set(id,value),handler=field.getAttribute('oninput');if(handler){h.context.__typedField=field;vm.runInContext('(function(){'+handler+'}).call(__typedField)',h.context);delete h.context.__typedField;}return field;}
function toDetails(h){
 const {L}=h;L.onboarding.start();input(h,'phoneNumber','0241230123');submit(h);assert.equal(L.route,'otp');input(h,'verificationCode','123456');submit(h);assert.equal(L.route,'identity');h.document.getElementById('identityPrivacy').checked=true;click(h,'Continue');assert.equal(L.route,'livecheck');click(h,'Continue');assert.equal(L.route,'identityResult');assert(h.document.getElementById('campusName'));assert(h.document.getElementById('campusEmail'));assert(view(h).textContent.includes('12 Mar 2004'));
}
function finishSecurity(h){input(h,'newPin','654321');submit(h);assert.equal(h.L.route,'confirmPin');input(h,'confirmPin','654321');submit(h);assert.equal(h.L.route,'accountReview');}
function clean(h){assert.deepEqual(h.errors,[]);}

for(const campus of ['University of Ghana','Kwame Nkrumah University of Science and Technology'])check(campus+' completes signup with university and email, without a Student ID or waitlist',()=>{
 const h=createHarness(),{L}=h;toDetails(h);assert.equal(h.document.getElementById('campusName').value,'University of Ghana');assert(!/student id|waitlist|launch updates/i.test(view(h).textContent));assert(!h.document.getElementById('studentId'));input(h,'campusName',campus);input(h,'campusEmail','kwame@example.com');assert.equal(h.document.getElementById('campusPilotNotice').hidden,campus==='University of Ghana');submit(h);assert.equal(L.route,'pin');assert.equal(L.state.profile.campus,campus);assert.equal(L.state.profile.email,'kwame@example.com');assert.equal(L.state.setup.campusStatus,'approved');assert.equal(L.state.setup.identityDetailsReviewed,true);assert.equal(L.state.profile.dateOfBirth,'2004-03-12');finishSecurity(h);assert(view(h).textContent.includes(campus));assert(view(h).textContent.includes('kwame@example.com'));assert(!/student id/i.test(view(h).textContent));click(h,'Create account');assert.equal(L.route,'accountReview','Consent remains required');h.document.getElementById('accountAgree').checked=true;click(h,'Create account');assert.equal(L.route,'accountReady');assert.equal(L.state.onboarded,true);assert.equal(L.state.balance,0);assert.notEqual(L.state.accounts.operational.number,L.state.accounts.savings.number);assert.equal(L.accountBalances().savings,0);assert.equal(view(h).querySelectorAll('button').find(button=>button.textContent==='Add money').getAttribute('onclick'),'L.beginFirstFunding()');assert.equal(L.state.profile.pin,'654321');assert.equal(L.state.profile.campus,campus);assert.equal(L.state.profile.email,'kwame@example.com');h.flush();clean(h);
});

check('university and email validation keeps the entered form and does not advance setup',()=>{
 for(const [campus,email,field] of [['','kwame@example.com','campusName'],['KNUST','kwame@','campusEmail']]){
  const h=createHarness(),{L}=h;toDetails(h);input(h,'campusName',campus);input(h,'campusEmail',email);submit(h);assert.equal(L.route,'identityResult');assert.notEqual(L.state.setup.campusStatus,'approved');assert.equal(h.document.getElementById('campusName').value,campus);assert.equal(h.document.getElementById('campusEmail').value,email);assert(view(h).querySelector('#error').textContent);assert.equal(h.document.activeElement.id,field);h.flush();clean(h);
 }
});

check('university email is optional and an empty value advances without inventing an address',()=>{
 const h=createHarness(),{L}=h;toDetails(h);input(h,'campusName','KNUST');input(h,'campusEmail','');submit(h);assert.equal(L.route,'pin');assert.equal(L.state.profile.email,'');assert.equal(L.state.setup.campusStatus,'approved');h.flush();clean(h);
});

check('unfinished drafts survive help, leaving and phone-confirmed resume',()=>{
 const h=createHarness(),{L}=h;toDetails(h);input(h,'campusName','University of Cape Coast');input(h,'campusEmail','student@example.com');const saved=copy(L.state.setup.drafts);L.go('help',{returnTo:'identityResult'});L.go('identityResult');assert.equal(h.document.getElementById('campusName').value,'University of Cape Coast');assert.equal(h.document.getElementById('campusEmail').value,'student@example.com');L.onboarding.leave();L.onboarding.resume();assert.equal(L.route,'phone');submit(h);assert.equal(L.route,'otp');input(h,'verificationCode','123456');submit(h);assert.equal(L.route,'identityResult');assert.equal(h.document.getElementById('campusName').value,saved.campusName);assert.equal(h.document.getElementById('campusEmail').value,saved.campusEmail);submit(h);assert.equal(L.route,'pin');h.flush();clean(h);
});

check('legacy campus pending, attention and unavailable routes offer the same editable continuation',()=>{
 for(const route of ['campusStatus','pilotUnavailable','campusInterest']){
  const h=createHarness(),{L}=h;Object.assign(L.state.setup,{phoneConfirmed:true,identityStatus:'approved',campusStatus:'pending'});L.go(route);assert(h.document.getElementById('campusName'));assert(h.document.getElementById('campusEmail'));assert(!/student id|waitlist|not available|launch update/i.test(view(h).textContent));input(h,'campusName','University for Development Studies');input(h,'campusEmail','student@example.com');submit(h);assert.equal(L.route,'pin');assert.equal(L.state.profile.campus,'University for Development Studies');assert.equal(L.state.setup.campusStatus,'approved');h.flush();clean(h);
 }
});

check('saved another-campus interest resumes signup and keeps its university and email',()=>{
 const h=createHarness(),{L}=h;L.state.setup.interest={campus:'University of Education, Winneba',email:'student@example.com',wants:true};L.onboarding.resume();assert.equal(L.route,'phone','Saved interest now resumes signup rather than a waitlist');input(h,'phoneNumber','0241230123');submit(h);input(h,'verificationCode','123456');submit(h);h.document.getElementById('identityPrivacy').checked=true;click(h,'Continue');click(h,'Continue');assert.equal(L.route,'identityResult');assert.equal(h.document.getElementById('campusName').value,'University of Education, Winneba');assert.equal(h.document.getElementById('campusEmail').value,'student@example.com');assert.equal(h.document.getElementById('campusPilotNotice').hidden,false);submit(h);assert.equal(L.route,'pin');assert.equal(L.state.setup.interest,undefined);h.flush();clean(h);
});

check('application correction edits university and email while retaining completed checks and pending semantics',()=>{
 const h=createHarness({testing:true}),{L}=h;toDetails(h);input(h,'campusName','University of Ghana');input(h,'campusEmail','student@example.com');submit(h);finishSecurity(h);h.document.getElementById('accountAgree').checked=true;h.set('accountOutcome','more');click(h,'Create account');assert.equal(L.route,'applicationStatus');assert(!/student id/i.test(view(h).textContent));const ref=L.state.setup.applicationRef,phone=L.state.profile.phone,pin=L.state.profile.pin;click(h,'Update university and email');assert.equal(L.route,'applicationCorrection');assert.equal(h.document.getElementById('correctCampusName').value,'University of Ghana');input(h,'correctCampusName','Ashesi University');input(h,'correctCampusEmail','invalid');submit(h);assert.equal(L.route,'applicationCorrection');assert.equal(L.state.setup.applicationStatus,'more');input(h,'correctCampusEmail','corrected@example.com');submit(h);assert.equal(L.route,'applicationStatus');assert.equal(L.state.setup.applicationStatus,'pending');assert.equal(L.state.setup.applicationRef,ref);assert.equal(L.state.setup.phoneConfirmed,true);assert.equal(L.state.setup.identityStatus,'approved');assert.equal(L.state.setup.securitySaved,true);assert.equal(L.state.profile.phone,phone);assert.equal(L.state.profile.pin,pin);assert.equal(L.state.profile.campus,'Ashesi University');assert.equal(L.state.profile.email,'corrected@example.com');assert.equal(L.state.onboarded,false);h.set('applicationOutcome','ready');click(h,'Check status');assert.equal(L.route,'accountReady');assert.equal(L.state.onboarded,true);h.flush();clean(h);
});

check('previously completed campus checks remain compatible and do not discard saved account details',()=>{
 const h=createHarness(),{L}=h;Object.assign(L.state.profile,{phone:'0241230123',campus:'University of Ghana',studentId:'10901234',pin:'123456'});Object.assign(L.state.setup,{phoneConfirmed:true,identityStatus:'approved',campusStatus:'approved',securitySaved:true});L.onboarding.next();assert.equal(L.route,'accountReview');assert.equal(L.state.profile.studentId,'10901234','Legacy saved field stays inert for compatibility');assert(!view(h).textContent.includes('10901234'));assert(!/student id/i.test(view(h).textContent));assert(view(h).textContent.includes('University of Ghana'));h.flush();clean(h);
});
console.log(`${passed} signup university checks passed`);
