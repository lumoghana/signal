import test from 'node:test';
import assert from 'node:assert/strict';
import {createSecurityConsole} from '../../admin-portal/security-ui.mjs';
class Element{constructor(tag,attrs={}){this.tag=tag;Object.assign(this,attrs);this.children=[];this.handlers={};}append(...children){this.children.push(...children.flat(Infinity).filter(x=>x!==undefined&&x!==null&&x!==false));}replaceChildren(...children){this.children=[];this.append(...children);}addEventListener(name,fn){this.handlers[name]=fn;}reportValidity(){return true;}}
const el=(tag,attrs={},...children)=>{const n=new Element(tag,attrs);n.append(...children);return n;},button=(label,fn)=>el('button',{onclick:fn},label),field=(label,node)=>el('label',{},label,node);
const flatten=root=>{const out=[];const walk=n=>{out.push(n);for(const child of n?.children||[])walk(child);};walk(root);return out;};
const find=(root,label)=>flatten(root).find(n=>n?.tag==='button'&&n.children.includes(label));
function fixture({role='super_admin',send}={}){let staff={id:'staff-one',role},form,verified=0;const calls=[];
 const console=createSecurityConsole({rpc:async(command,payload)=>{calls.push({command,payload:structuredClone(payload)});return send?.(command,payload,calls.length)||{};},el,button,field,area:()=>el('textarea',{value:''}),date:String,openDialog(title,subtitle,body){form=body;},closeDialog(){},toast(){},reload(){},getStaff:()=>staff,verifyAuthenticator(){verified++;}});
 return {console,calls,get form(){return form;},get verified(){return verified;},switchActor(){staff={id:'staff-two',role};}};
}
const policy={environment:'pilot',mfaEnforced:false,revision:1,activeStaff:1,verifiedStaff:0,staffToEnrol:1,readyToEnforce:false,productionReady:false};
test('MFA rollout stays unavailable for an unenrolled sole operator and offers real enrolment',async()=>{
 const h=fixture({send:()=>({policy})}),main=el('main');await h.console.renderPolicy(main);
 assert.equal(find(main,'Require authenticator codes').disabled,true);assert.equal(find(main,'Require production sign-in policy').disabled,true);
 assert.ok(flatten(main).some(n=>typeof n==='string'&&n.includes('MFA is not yet required')));
 find(main,'Connect or verify my authenticator').onclick();assert.equal(h.verified,1);assert.deepEqual(h.calls.map(x=>x.command),['security.policy']);
});
test('an unknown MFA-enable submission retains its original revision, reason and request ID',async()=>{
 const h=fixture({send:(command,payload,n)=>{if(command==='security.policy')return {policy:{...policy,verifiedStaff:1,staffToEnrol:0,readyToEnforce:true}};if(n===2)throw Error('Unknown outcome');return {policy:{mfaEnforced:true}};}}),main=el('main');await h.console.renderPolicy(main);find(main,'Require authenticator codes').onclick();
 const form=h.form,reason=flatten(form).find(n=>n?.tag==='textarea');reason.value='All active staff enrolled';await form.handlers.submit({preventDefault(){}});reason.value='Changed after timeout';await form.handlers.submit({preventDefault(){}});
 assert.deepEqual(h.calls[2],h.calls[1]);assert.equal(h.calls[1].payload.expectedRevision,1);assert.equal(h.calls[1].payload.reason,'All active staff enrolled');
});
test('recovery controls distinguish confirmed, fenced unapplied and legacy unknown writes',async()=>{
 const rows=[{requestId:'confirmed',module:'consumer',state:'confirmed',authApplied:true,requiresAuthMarker:true},{requestId:'fenced',module:'merchant',state:'running',authApplied:false,requiresAuthMarker:true},{requestId:'legacy',module:'admin',state:'running',authApplied:false,requiresAuthMarker:false,executionId:'must-not-render'}];
 const h=fixture({role:'risk',send:()=>({rows,total:3})}),main=el('main');await h.console.renderRecovery(main);
 assert.ok(find(main,'Reconcile confirmed reset'));assert.ok(find(main,'Cancel fenced unapplied reset'));assert.ok(flatten(main).some(n=>typeof n==='string'&&n.includes('Legacy unknown writes')));assert.ok(!flatten(main).includes('must-not-render'));
 const support=fixture({role:'support',send:()=>({rows,total:3})}),readOnly=el('main');await support.console.renderRecovery(readOnly);assert.equal(find(readOnly,'Reconcile confirmed reset'),undefined);assert.equal(find(readOnly,'Cancel fenced unapplied reset'),undefined);
});
test('an old operator cannot submit a displayed security mutation after account change',async()=>{
 const h=fixture({send:()=>({policy:{...policy,verifiedStaff:1,staffToEnrol:0,readyToEnforce:true}})}),main=el('main');await h.console.renderPolicy(main);find(main,'Require authenticator codes').onclick();const form=h.form;flatten(form).find(n=>n?.tag==='textarea').value='Original staff evidence';h.switchActor();await form.handlers.submit({preventDefault(){}});assert.equal(h.calls.length,1);
});
test('lost-factor recovery reads show an authenticator step without pretending to resolve anything',async()=>{
 const h=fixture({role:'support',send:()=>{throw Object.assign(Error('Verify authenticator'),{code:'MFA_REQUIRED'});}}),main=el('main');await h.console.renderRecovery(main);assert.ok(find(main,'Verify my authenticator'));assert.equal(find(main,'Reconcile confirmed reset'),undefined);assert.deepEqual(h.calls.map(x=>x.command),['recovery.resets.list']);
});

test('staged recovery controls show the release message without suggesting authenticator or queue retries',async()=>{
 const message='Recovery resolution is not enabled for this release. Keep the original reset reference and use the existing support process.';
 const h=fixture({role:'risk',send:()=>{throw Object.assign(Error(message),{code:'RECOVERY_RESOLUTION_UNAVAILABLE'});}}),main=el('main');await h.console.renderRecovery(main);
 assert.ok(flatten(main).includes(message));assert.equal(find(main,'Verify my authenticator'),undefined);assert.equal(find(main,'Refresh reset queue'),undefined);assert.equal(find(main,'Reconcile confirmed reset'),undefined);assert.deepEqual(h.calls.map(x=>x.command),['recovery.resets.list']);
});
test('an already-open reset confirmation cannot retry an operation unavailable for this release',async()=>{
 const h=fixture({role:'risk',send:command=>{if(command==='recovery.resets.list')return {rows:[{requestId:'original-reset',module:'consumer',authApplied:true}],total:1};throw Object.assign(Error('Recovery resolution is not enabled for this release.'),{code:'RECOVERY_RESOLUTION_UNAVAILABLE'});}}),main=el('main');await h.console.renderRecovery(main);find(main,'Reconcile confirmed reset').onclick();const form=h.form;flatten(form).find(n=>n?.tag==='textarea').value='Original independent evidence';await form.handlers.submit({preventDefault(){}});await form.handlers.submit({preventDefault(){}});
 assert.equal(h.calls.filter(x=>x.command==='recovery.resets.reconcile').length,1);const submit=flatten(form).find(n=>n?.tag==='button'&&n.type==='submit');assert.equal(submit.disabled,true);assert.equal(submit.textContent,'Unavailable for this release');assert.ok(find(form,'Back to current records'));
});
