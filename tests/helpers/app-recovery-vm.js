import assert from 'node:assert/strict';
import vm from 'node:vm';
/** Run the actual recovery lifecycle helpers in older app-function VM tests. */
export function createAppRecoveryContext(values,appSource){
 const from=appSource.indexOf('function clearSignupRecovery(){'),to=appSource.indexOf('async function completeSignup(){',from);
 assert.ok(from>=0&&to>from,'Published signup recovery helpers must be present');
 const scope=vm.createContext({ctx:{},resetConsumerRewards(){},signupRecovery:null,signupRecoveryOwner:null,signupRecoveryVersion:null,signupRecoveryLifecycle:0,pendingSignupRecoverySeed:null,view:{querySelector(){return null;}},...values});
 vm.runInContext(appSource.slice(from,to),scope);
 return scope;
}
