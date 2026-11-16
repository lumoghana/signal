import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasswordRecovery,FACE_CONSENT_VERSION,bindFaceStorageConsent,syncFaceStorageConsent} from '../dist/js/password-recovery.js';
import {createSignupRecovery} from '../dist/js/signup-recovery.js';
import {captureRecoverySelfies} from '../dist/js/recovery-camera.js';

const id='11111111-1111-4111-8111-111111111111';
const key='LUMO-'+'k'.repeat(43),password='Private-test-password-42';
const now=()=>Date.parse('2026-11-16T12:00:00Z'),expiresAt='2026-11-16T12:05:00Z';
const photos=[0,1,2].map(index=>'data:image/jpeg;base64,'+Buffer.from([255,216,1,index,255,217]).toString('base64'));
const real={ok:true,simulation:true,environment:'sandbox',smsSimulation:true,smsAvailable:true,faceAvailable:true,faceMatching:'stored-template',faceSimulation:false,requiresBackupKey:true,identityVerified:false,livenessVerified:false,faceConsentVersion:FACE_CONSENT_VERSION};
const enrollment={...real,requestId:id,expiresAt,demoCode:'123456',phoneMasked:'+23324•••••00'};
const saved={...real,enrolled:true,faceEnrolled:true,templateEnrolled:true,templateVersion:1,keyRotationAvailable:true,backupKey:key};
const grant={...real,faceMatched:true,resetToken:'r'.repeat(43),expiresAt};
function recovery({status=real,verify=grant,remove={...real,removed:true,templateEnrolled:false},capture=async()=>photos}={}){
 const calls=[],views=[];
 const flow=createPasswordRecovery({now,capture,onChange:view=>views.push(view),request:async(operation,values,options)=>{calls.push({operation,values,options});return operation==='status'?status:operation==='start'||operation==='enrollmentStart'?enrollment:operation==='enrollmentVerify'||operation==='keyRotate'?saved:operation==='faceVerify'?verify:operation==='faceRemove'?remove:{ok:true,completed:true};}});
 return {flow,calls,views};
}
async function faceStage(h){assert.equal(await h.flow.start(),true);assert.equal(await h.flow.submit({identifier:'ama.student'}),true);assert.equal(h.flow.view.phase,'verify-face');}

test('storage consent buttons stay disabled until checked and become disabled again on withdrawal',()=>{
 const button={disabled:false},events={},control={checked:false,closest:()=>({querySelector:()=>button}),addEventListener:(name,handler)=>events[name]=handler};
 bindFaceStorageConsent({querySelectorAll:()=>[control]});assert.equal(button.disabled,true);control.checked=true;events.change();assert.equal(button.disabled,false);control.checked=false;events.change();assert.equal(button.disabled,true);control.checked=true;syncFaceStorageConsent(control,{busy:true});assert.equal(button.disabled,true);
});

test('mixed pilot flags do not relabel real saved-face comparison as simulated',async()=>{
 const h=recovery({status:{...real,enrollment:{faceEnrolled:true,faceSimulation:true,templateEnrolled:false,templateVersion:null,reEnrollmentRequired:true,backupKeyReady:true,templateCiphertext:'PRIVATE_TEMPLATE'}}});
 await h.flow.start('settings');assert.equal(h.flow.view.faceAvailable,true);assert.equal(h.flow.view.faceMatching,'stored-template');
 assert.equal(h.flow.view.enrollment.templateEnrolled,false);assert.equal(h.flow.view.enrollment.reEnrollmentRequired,true);
 const html=h.flow.render();assert.match(html,/Fresh setup required/);assert.match(html,/previous test setup did not save a reusable face profile/);assert.match(html,/Live-person checks are not verified/);assert.doesNotMatch(html,/Face checks and SMS are simulated|PRIVATE_TEMPLATE/);
 assert.doesNotMatch(JSON.stringify(h.flow.view),/PRIVATE_TEMPLATE/);h.flow.dispose();
});

test('old simulated face status cannot enable face reset or silent template enrollment',async()=>{
 const h=recovery({status:{ok:true,simulation:true,environment:'sandbox',requiresBackupKey:true,faceAvailable:true,smsAvailable:true}});
 await h.flow.start();assert.equal(h.flow.view.faceAvailable,false);assert.equal(h.flow.view.method,'sms');assert.equal(await h.flow.action('face'),false);
 await h.flow.start('settings');assert.equal(await h.flow.action('enroll'),false);assert.equal(h.calls.filter(c=>c.operation==='enrollmentStart'||c.operation==='faceVerify').length,0);h.flow.dispose();
});

test('removing a saved face requires confirmation and current password without removing key or phone',async()=>{
 const h=recovery({status:{...real,faceAvailable:false,enrollment:{...saved,backupKeyReady:true,phoneSimulation:true,phoneMasked:'+23324•••••00'}}});
 await h.flow.start('settings');assert.match(h.flow.render(),/Remove saved face/);assert.equal(await h.flow.action('remove-face'),true);assert.equal(h.flow.view.phase,'face-remove');assert.match(h.flow.render(),/deletes your encrypted face profile/);
 assert.equal(await h.flow.submit({currentPassword:password}),false);assert.equal(await h.flow.submit({removeFace:true}),false);assert.equal(h.calls.length,1);
 assert.equal(await h.flow.submit({currentPassword:password,removeFace:'on'}),true);const sent=h.calls.find(c=>c.operation==='faceRemove');assert.deepEqual(sent.values,{currentPassword:password});assert.equal(sent.options.authenticated,true);
 assert.equal(h.flow.view.phase,'settings');assert.equal(h.flow.view.enrollment.templateEnrolled,false);assert.equal(h.flow.view.enrollment.backupKeyReady,true);assert.equal(h.flow.view.enrollment.phoneMasked,'+23324•••••00');assert.equal(h.flow.view.enrollment.phoneSimulation,true);assert.doesNotMatch(h.flow.render(),/data-password-recovery-action="remove-face"/);assert.doesNotMatch(JSON.stringify(h.views),/Private-test-password/);h.flow.dispose();
});

test('a failed or unconfirmed face deletion never claims the stored profile was removed',async()=>{
 for(const remove of [{ok:false,message:'Check your current password.'},{ok:true,removed:false,templateEnrolled:false},{ok:true,removed:true,templateEnrolled:true}]){
  const h=recovery({status:{...real,enrollment:saved},remove});await h.flow.start('settings');await h.flow.action('remove-face');assert.equal(await h.flow.submit({currentPassword:password,removeFace:true}),false);assert.equal(h.flow.view.enrollment.templateEnrolled,true);assert.equal(h.flow.view.phase,'face-remove');h.flow.dispose();
 }
});

test('a consumed key can be replaced after face removal and after reloading recovery settings',async()=>{
 const h=recovery({status:{...real,enrollment:{...saved,backupKeyReady:false,keyRotationAvailable:true}},remove:{...real,removed:true,templateEnrolled:false,enrollment:{keyRotationAvailable:true}}});
 await h.flow.start('settings');await h.flow.action('remove-face');assert.equal(await h.flow.submit({currentPassword:password,removeFace:true}),true);await h.flow.action('restart');assert.equal(h.flow.view.enrollment.templateEnrolled,false);assert.equal(h.flow.view.enrollment.keyRotationAvailable,true);assert.match(h.flow.render(),/data-password-recovery-action="rotate"\s*>Create private key/);assert.equal(await h.flow.action('rotate'),true);assert.equal(await h.flow.submit({currentPassword:password}),true);assert.equal(h.flow.view.phase,'backup-key');h.flow.dispose();
 const reloaded=recovery({status:{...real,enrollment:{templateEnrolled:false,backupKeyReady:false,keyRotationAvailable:true}}});await reloaded.flow.start('settings');assert.equal(await reloaded.flow.action('rotate'),true);assert.equal(await reloaded.flow.submit({currentPassword:password}),true);assert.equal(reloaded.flow.view.phase,'backup-key');reloaded.flow.dispose();
 const firstSetup=recovery({status:{...real,enrollment:{templateEnrolled:false,backupKeyReady:false,keyRotationAvailable:false}}});await firstSetup.flow.start('settings');assert.match(firstSetup.flow.render(),/data-password-recovery-action="rotate" disabled>Create private key/);assert.equal(await firstSetup.flow.action('rotate'),false);assert.equal(firstSetup.calls.length,1);firstSetup.flow.dispose();
});

test('storage consent is unchecked and required before capturing or sending enrollment photos',async()=>{
 let captures=0;const h=recovery({capture:async options=>{captures++;assert.equal(options.purpose,'enrollment');assert.equal(options.faceMatching,'stored-template');return photos;}});
 await h.flow.start('settings');await h.flow.action('enroll');const html=h.flow.render();assert.match(html,/name="faceConsent" required/);assert.doesNotMatch(html,/name="faceConsent"[^>]*checked/);assert.match(html,/type="submit"[^>]*disabled[^>]*>Continue to camera/);
 assert.equal(await h.flow.submit({currentPassword:password}),false);assert.equal(captures,0);assert.equal(h.calls.length,1);
 assert.equal(await h.flow.submit({currentPassword:password,faceConsent:'on'}),true);assert.equal(captures,1);
 const call=h.calls.find(c=>c.operation==='enrollmentStart');assert.deepEqual(call.values.faceConsent,{version:FACE_CONSENT_VERSION,accepted:true});assert.equal(call.options.authenticated,true);assert.deepEqual(call.values.photos,photos);assert.equal(call.values.currentPassword,password);
 assert.doesNotMatch(JSON.stringify(h.flow.view),/Private-test-password|data:image|PRIVATE_TEMPLATE/);
 assert.equal(await h.flow.submit({code:'123456'}),true);assert.equal(h.flow.view.phase,'backup-key');assert.equal(h.flow.view.enrollment.templateEnrolled,true);assert.equal(h.flow.view.enrollment.templateVersion,1);assert.equal(h.flow.view.enrollment.faceSimulation,false);assert.doesNotMatch(JSON.stringify(h.views),new RegExp(key));h.flow.dispose();
});

test('a matching response must come from the stored-template protocol before a reset grant is installed',async()=>{
 for(const verify of [{ok:false,code:'FACE_NO_MATCH',message:'Your saved face could not be confirmed.'},{ok:true,resetToken:'r'.repeat(43),expiresAt,simulation:true,faceMatched:true},{...grant,faceSimulation:true},{...grant,faceMatched:false}]){
  const h=recovery({verify});await faceStage(h);assert.equal(await h.flow.submit({backupKey:key}),false);assert.equal(h.flow.view.phase,'verify-face');assert.equal(h.calls.some(c=>c.operation==='complete'),false);assert.doesNotMatch(JSON.stringify(h.flow.view),/rrrrrrrr|data:image/);h.flow.dispose();
 }
 const h=recovery();await faceStage(h);assert.equal(await h.flow.submit({backupKey:key}),true);assert.equal(h.flow.view.phase,'password');const sent=h.calls.find(c=>c.operation==='faceVerify');assert.deepEqual(Object.keys(sent.values).sort(),['backupKey','photos','requestId']);assert.equal(sent.values.requestId,id);assert.equal(await h.flow.submit({newPassword:password,confirmPassword:password}),true);assert.equal(h.flow.view.phase,'success');h.flow.dispose();
});

test('face recovery still requires the private key and late capture after leaving sends no proof',async()=>{
 let resolve;const h=recovery({capture:()=>new Promise(r=>{resolve=r;})});await faceStage(h);
 assert.equal(await h.flow.submit({backupKey:''}),false);assert.equal(resolve,undefined);
 const pending=h.flow.submit({backupKey:key});assert.equal(h.flow.view.busy,true);h.flow.dispose();resolve(photos);assert.equal(await pending,false);assert.equal(h.calls.some(c=>c.operation==='faceVerify'),false);
});

test('leaving while a face decision is in flight never installs its late reset grant',async()=>{
 let resolve;const calls=[];const flow=createPasswordRecovery({now,capture:async()=>photos,request:async(operation,values)=>{calls.push({operation,values});return operation==='status'?real:operation==='start'?enrollment:new Promise(r=>{resolve=r;});}});
 await faceStage({flow});const pending=flow.submit({backupKey:key});await new Promise(r=>setImmediate(r));assert.equal(typeof resolve,'function');flow.dispose();resolve(grant);assert.equal(await pending,false);assert.equal(calls.some(c=>c.operation==='complete'),false);assert.doesNotMatch(JSON.stringify(flow.view),/rrrrrrrr|data:image/);
});

test('capture consent describes enrollment separately from verification and cancel opens no camera',async()=>{
 for(const purpose of ['enrollment','recovery']){
  let opens=0;const nodes=[];const make=tag=>{const handlers=new Map();const node={tag,children:[],style:{},textContent:'',setAttribute(){},append(...children){this.children.push(...children);},addEventListener(name,handler){handlers.set(name,handler);},removeEventListener(name){handlers.delete(name);},focus(){document.activeElement=this;},remove(){this.removed=true;},fire(name){handlers.get(name)?.({preventDefault(){}});}};nodes.push(node);return node;};
  const document={hidden:false,activeElement:null,createElement:make,addEventListener(){},removeEventListener(){},defaultView:{addEventListener(){},removeEventListener(){}}};document.body=make('body');document.body.style.overflow='visible';
  const pending=captureRecoverySelfies({purpose,faceMatching:'stored-template',document,secureContext:true,mediaDevices:{getUserMedia:async()=>{opens++;throw Error();}}});
  const copy=nodes.map(n=>n.textContent).join(' ');assert.match(copy,purpose==='enrollment'?/encrypted face profile/:/compare with your saved face profile/);assert.match(copy,/Live-person checks are not verified/);assert.match(copy,purpose==='enrollment'?/face-profile setup I selected/:/will not replace my saved face profile/);
  const consent=nodes.find(n=>n.name==='cameraConsent'),open=nodes.find(n=>n.textContent==='Allow camera');assert.notEqual(consent.checked,true);assert.equal(open.disabled,true);nodes.find(n=>n.textContent==='Cancel camera').fire('click');await assert.rejects(pending,{name:'AbortError'});assert.equal(opens,0);assert.equal(document.body.style.overflow,'visible');
 }
});

function signup({status=real,startReply=enrollment,verifyReply=saved}={}){
 const calls=[];let encoded=0,completed;
 const flow=createSignupRecovery({now,password,captures:['camera-one','camera-two','camera-three'],preparePhotos:async captures=>{encoded++;assert.deepEqual(captures,['camera-one','camera-two','camera-three']);return photos;},request:async(operation,values,options)=>{calls.push({operation,values,options});return operation==='status'?status:operation==='enrollmentStart'?startReply:verifyReply;},onComplete:value=>{completed=value;}});
 return {flow,calls,get encoded(){return encoded;},get completed(){return completed;}};
}
test('signup waits for explicit storage consent before encoding or reusing its original selfies',async()=>{
 const h=signup();assert.equal(await h.flow.start(),true);assert.equal(h.flow.view.phase,'consent');assert.equal(h.encoded,0);assert.deepEqual(h.calls.map(c=>c.operation),['status']);
 assert.match(h.flow.render(),/name="faceConsent" required/);assert.doesNotMatch(h.flow.render(),/name="faceConsent"[^>]*checked/);assert.equal(await h.flow.submit({faceConsent:false}),false);assert.equal(h.encoded,0);
 assert.equal(await h.flow.submit({faceConsent:'on'}),true);assert.equal(h.encoded,1);assert.equal(h.flow.view.phase,'code');assert.deepEqual(h.calls[1].values.faceConsent,{version:FACE_CONSENT_VERSION,accepted:true});assert.equal(h.calls[1].values.currentPassword,password);assert.equal(h.calls[1].options.authenticated,true);assert.doesNotMatch(JSON.stringify(h.flow.view),/data:image|Private-test-password/);
 assert.equal(await h.flow.submit({code:'123456'}),true);assert.equal(h.flow.view.phase,'key');assert.equal(await h.flow.submit({savedKey:false}),false);assert.equal(await h.flow.submit({savedKey:true}),true);assert.equal(h.completed.faceMatching,'stored-template');assert.equal(h.completed.faceSimulation,false);assert.equal(h.calls.some(c=>c.operation==='register'),false);h.flow.dispose();
});

test('signup cannot upgrade hash-only simulation to saved-face enrollment or accept unconfirmed storage',async()=>{
 const unavailable=signup({status:{ok:true,faceAvailable:true,simulation:true,environment:'sandbox'}});assert.equal(await unavailable.flow.start(),false);assert.equal(unavailable.flow.view.phase,'unavailable');assert.equal(unavailable.encoded,0);assert.equal(unavailable.calls.length,1);unavailable.flow.dispose();
 const h=signup({verifyReply:{...saved,templateEnrolled:false}});await h.flow.start();await h.flow.submit({faceConsent:true});assert.equal(await h.flow.submit({code:'123456'}),false);assert.equal(h.flow.view.phase,'interrupted');assert.equal(h.completed,undefined);h.flow.dispose();
});

test('signup ignores delayed status after account change or disposal without processing captures',async()=>{
 let resolve,encoded=0;const flow=createSignupRecovery({now,password,captures:[1,2,3],preparePhotos:async()=>{encoded++;return photos;},request:()=>new Promise(r=>{resolve=r;})});const pending=flow.start();flow.dispose();resolve(real);assert.equal(await pending,false);assert.equal(encoded,0);
});
