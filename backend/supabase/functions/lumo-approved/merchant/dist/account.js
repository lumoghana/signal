import * as Shared from './shared.js';
import {MERCHANT_CAPABILITIES} from './connected-service.js';
import {getState,getWorkspaceMode} from './store.js';
export const isShared=true;
export const getCapabilities=()=>({...MERCHANT_CAPABILITIES});
export const supportsCapability=name=>MERCHANT_CAPABILITIES[name]===true;
function requireCapability(name){if(!supportsCapability(name))throw Object.assign(new Error('This account service is not available in the connected test yet. Your existing sign-in and account details have not changed.'),{status:503,code:'UNAVAILABLE_SERVICE',definitiveNoMutation:true})}

const LEGACY_BACKUP_KEY='lumo-merchant-legacy-import-v1';
const INVITATION_PENDING_KEY='lumo-merchant-invitation-pending-v1';
const invitationUsernamePattern=/^[a-z0-9][a-z0-9._]{2,23}$/;
const normalizedUsername=value=>String(value||'').trim().toLowerCase();
function invalidInvitationCredentials(message){return Object.assign(new Error(message),{status:400,code:'INVALID_REQUEST'})}
let invitationMemory=null;
function readPendingInvitation(){
 try{const value=JSON.parse(globalThis.sessionStorage?.getItem(INVITATION_PENDING_KEY)||'null');if(value?.version===1&&typeof value.token==='string'&&value.token&&typeof value.username==='string'&&value.username){invitationMemory=value}}catch{}
 // Old clients could save names that the shared service has never accepted.
 // Such a marker cannot represent a created account, so it is safe to release.
 if(invitationMemory&&!invitationUsernamePattern.test(normalizedUsername(invitationMemory.username))){writePendingInvitation(null);return null}
 return invitationMemory;
}
function writePendingInvitation(value){invitationMemory=value;try{if(value)globalThis.sessionStorage?.setItem(INVITATION_PENDING_KEY,JSON.stringify(value));else globalThis.sessionStorage?.removeItem(INVITATION_PENDING_KEY)}catch{}}
const invitationDefinitiveCodes=new Set(['INVITATION_INVALID','INVITATION_NOT_FOUND','INVITATION_EXPIRED','INVITATION_REVOKED','INVITATION_ACCESS_CHANGED','USERNAME_TAKEN']);
export function getPendingInvitation(){const value=readPendingInvitation();return value?{...value}:null}
export function clearPendingInvitation(username){const value=readPendingInvitation();if(!value||username&&value.username!==String(username).trim().toLowerCase())return;writePendingInvitation(null)}
function invitationMatches(value,current){return Boolean(value&&current&&value.username===String(current.username||'').toLowerCase()&&(!value.userId||value.userId===current.userId)&&(!value.businessId||value.businessId===current.businessId))}
export function getInvitationRecoveryNotice(current=getSession()){
 const value=readPendingInvitation();if(!invitationMatches(value,current))return '';
 return 'Your invitation account is signed in, but its private recovery key was not saved. Confirm your password to create a replacement key, then save it before continuing.';
}
export function getRecoveryKeyNotice(current=getSession()){
 if(current&&Object.hasOwn(current,'recoveryKeyPending')&&!current.recoveryKeyPending){if(invitationMatches(readPendingInvitation(),current))clearPendingInvitation(current.username);return '';}
 if(current?.recoveryKeyPending&&!Shared.getRecoveryKey())return 'Your private recovery key still needs saving. Confirm your password to create a replacement key, then save it before continuing.';
 return getInvitationRecoveryNotice(current);
}
function rememberInvitationAccount(result){
 const value=readPendingInvitation(),current=result?.session||getSession();
 if(invitationMatches(value,current))writePendingInvitation({...value,stage:'needs-key',userId:current.userId,businessId:current.businessId});
}

const randomId=()=>crypto.randomUUID();
const safeRead=()=>{try{const value=JSON.parse(localStorage.getItem(LEGACY_BACKUP_KEY)||'null');return value?.snapshot?.business&&value.attemptId?value:null}catch{return null}};
const safeWrite=value=>{try{localStorage.setItem(LEGACY_BACKUP_KEY,JSON.stringify(value))}catch{throw new Error('This browser could not preserve your saved business before import. Export it or enable browser storage before continuing.')}};
const safeRemove=()=>{try{localStorage.removeItem(LEGACY_BACKUP_KEY)}catch{}};
const isSharedBusiness=b=>Boolean(b?.sandbox||b?.verificationStatus==='approved-sandbox'||/^business-\d+$/.test(b?.id||''));
function isLegacySnapshot(value){
 const snapshot=value?.business?value:{business:value},b=snapshot.business;
 if(!b||isSharedBusiness(b))return false;
 return b.storageOrigin==='browser-legacy'||(Boolean(b.id)&&b.verificationStatus!=='approved-sandbox'&&!b.sandbox&&(snapshot.mode==='registered'||getWorkspaceMode()==='registered'));
}
export function getSession(){const session=Shared.getCache().session;if(session&&(!Number.isFinite(Date.parse(session.expiresAt||''))||Date.parse(session.expiresAt)<=Date.now())){Shared.lockLocal('expired');return null}return session}
export const getUser=id=>Shared.getCache().users.find(user=>user.id===id)|| (Shared.getCache().user?.id===id?Shared.getCache().user:null);
export const listUsers=businessId=>Shared.getCache().users.filter(user=>!businessId||user.businessId===businessId);
export const listInvitations=businessId=>Shared.getCache().invitations.filter(invite=>!businessId||invite.businessId===businessId);
export const listSessions=()=>Shared.getCache().sessions;
export const getAuthAudit=()=>Shared.getCache().audit;
export const hasOwner=businessId=>Boolean(getSession()?.businessId===businessId||Shared.getCache().state?.business?.id===businessId||getState().business?.id===businessId&&isSharedBusiness(getState().business));
export const subscribeAuth=fn=>Shared.subscribeShared(type=>{if(type==='account')fn()});
export const getRecoveryKey=Shared.getRecoveryKey;
export const getRecoveryKeyReference=Shared.getRecoveryKeyReference;
export function clearRecoveryKey(){Shared.clearRecoveryKey();const current=getSession();if(invitationMatches(readPendingInvitation(),current))clearPendingInvitation(current.username)}
export async function acknowledgeRecoveryKey({reference=Shared.getRecoveryKeyReference()}={}){
 const current=getSession();if(!current)throw new Error('Sign in again before confirming your recovery key.');
 if(!reference){if(current.recoveryKeyPending)throw Object.assign(new Error('This recovery key is no longer available. Replace it and save the new key.'),{status:409,code:'RECOVERY_KEY_CHANGED'});clearRecoveryKey();return {success:true,legacy:true};}
 const result=await Shared.api('/api/auth/recovery-key/ack',{method:'POST',body:{reference}});
 if(Shared.getRecoveryKeyReference()===reference)Shared.clearRecoveryKey();
 const updated=getSession();if(!updated?.recoveryKeyPending&&invitationMatches(readPendingInvitation(),updated))clearPendingInvitation(updated.username);
 return result;
}
export const getStorageStatus=()=>({persistent:true,server:true});
export function getPendingLegacyImport(){const value=safeRead();return value?{attemptId:value.attemptId,targetBusinessId:value.targetBusinessId||null,username:value.username||'',businessName:value.snapshot.business.name,sourceBusinessId:value.snapshot.business.id}:null}
export const hasPendingLegacyImport=()=>Boolean(safeRead());
export function canMigrateLegacyBusiness(value=getState()){
 const backup=safeRead(),session=getSession();
 if(backup){if(!backup.targetBusinessId)return true;return session?.role==='owner'&&session.businessId===backup.targetBusinessId}
 return isLegacySnapshot(value);
}
export function validateNewCredentials(username,password){username=String(username||'').trim().toLowerCase();if(!/^[a-z][a-z0-9._]{2,23}$/.test(username))throw Error('Choose a username of 3–24 characters, starting with a letter.');if(String(password||'').length<10||String(password).length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))throw Error('Use 10–128 characters with a letter and a number.');return {valid:true,username}}
const post=(path,body,options={})=>Shared.api(path,{method:'POST',body,...options});
function authPost(path,body,kind='sign-in',unlockOnSuccess=true){const authEpoch=Shared.beginAuthTransition(kind);return post(path,body,{authEpoch,unlockOnSuccess})}
export async function signup(payload){return authPost('/api/signup',payload,'signup')}
function legacySignup(snapshot,username,password,attemptId){
 const b=snapshot.business,first=snapshot.shops?.[0];if(!first)throw new Error('Your saved business has no shop to import.');
 return {name:b.name,ownerName:b.ownerName,phone:b.phone,businessType:b.businessType||'sole-trader',registrationNumber:b.registrationNumber||'',destination:b.destination||'Sandbox destination not set',verification:{phone:true,identity:true,face:true},shop:{name:first.name,area:first.area,category:first.category||'Other',lat:first.lat,lng:first.lng},credentials:{username,password},attemptId,signupAttemptId:attemptId};
}
export async function initializeOwner({username:enteredUsername,password,confirmImport=false}){
 if(confirmImport!==true)throw new Error('Confirm that you want to import this saved prototype into the shared sandbox.');
 const username=validateNewCredentials(enteredUsername,password).username;let backup=safeRead();
 if(!backup){const snapshot=getState();if(!isLegacySnapshot(snapshot))throw new Error('This business is already shared. Sign in with its existing username and password.');backup={snapshot,attemptId:randomId(),signupAttemptId:randomId(),username,targetBusinessId:null,createdAt:new Date().toISOString()};safeWrite(backup)}
 if(backup.username&&backup.username!==username)throw new Error('Use '+backup.username+' to resume this saved import. Sign in instead of creating another account.');
 const current=getSession();if(current&&current.username!==username)throw new Error('Sign out of the current account before importing this saved business.');
 if(backup.targetBusinessId){if(!current)await signIn(username,password);if(getSession()?.businessId!==backup.targetBusinessId)throw new Error('Sign in to the owner account created for this import before continuing.')}
 else{
  const result=await signup(legacySignup(backup.snapshot,username,password,backup.signupAttemptId));
  backup={...backup,targetBusinessId:result.state?.business?.id||getSession()?.businessId};if(!backup.targetBusinessId)throw new Error('Your shared account could not be confirmed. Retry the same import details.');safeWrite(backup);
 }
 return resumeLegacyImport({currentPassword:password,confirmImport:true});
}
export async function resumeLegacyImport({currentPassword,confirmImport=false}){
 if(confirmImport!==true)throw new Error('Confirm the saved prototype import before continuing.');
 const backup=safeRead(),session=getSession();if(!backup)throw new Error('There is no saved prototype import to resume.');
 if(!session||session.role!=='owner'||session.businessId!==backup.targetBusinessId)throw new Error('Sign in to the owner account created for this import.');
 const snapshot=structuredClone(backup.snapshot);delete snapshot.business.storageOrigin;delete snapshot.shopReadiness;
 const result=await post('/api/migrate',{snapshot,currentPassword,attemptId:backup.attemptId,migrationAttemptId:backup.attemptId,confirmImport:true});safeRemove();return result;
}
export async function signIn(username,password,{remember=false}={}){const r=await authPost('/api/auth/login',{username,password,remember},'sign-in');rememberInvitationAccount(r);return r.session}
export async function signOut(){const authEpoch=Shared.lockLocal('signed-out');try{await post('/api/auth/logout',{},{authEpoch});return {success:true,localOnly:false}}catch(error){const status=Shared.localLockStatus?.()||{kind:'local',persistent:true};const message=status.kind==='memory'?'This page is locked while it remains open. Browser storage is blocked. Reconnect and confirm server sign-out before reloading or closing this page.':status.kind==='session'?'This tab is locked. Keep it open and reconnect to finish server sign-out before using other tabs. Other tabs may still have access.':'This device is locked. Server sign-out will retry when you reconnect.';return {success:true,localOnly:true,message,lockKind:status.kind}}}
export async function getInvitation(token){const r=await Shared.api('/api/invitations/'+encodeURIComponent(token));return r.invitation||r}
export async function createInvitation(payload){const r=await post('/api/invitations',payload);return r.invitation||r.entity||r}
export async function acceptInvitation(payload){
 const pending=readPendingInvitation(),username=normalizedUsername(payload.username),token=String(payload.token||'').trim();
 if(!invitationUsernamePattern.test(username))throw invalidInvitationCredentials('Choose a username of 3–24 letters, numbers, dots or underscores, starting with a letter or number.');
 if(typeof payload.password!=='string'||payload.password.length<10||payload.password.length>128||!/[A-Za-z]/.test(payload.password)||!/[0-9]/.test(payload.password))throw invalidInvitationCredentials('Use 10–128 characters with a letter and a number.');
 if(pending&&(pending.token!==token||pending.username!==username))throw Object.assign(new Error('Finish the invitation request for @'+pending.username+' before accepting another invitation.'),{status:409,code:'INVITATION_PENDING'});
 const original=pending||{version:1,token,username,stage:'submitted',startedAt:new Date().toISOString()};writePendingInvitation(original);
 try{const result=await authPost('/api/invitations/accept',{...payload,token,username},'invitation');rememberInvitationAccount(result);return result}
 catch(error){
  if(invitationDefinitiveCodes.has(error.code)||error.status===400&&error.code==='INVALID_REQUEST'||error.code==='INVITATION_ACCEPTED'&&!pending)clearPendingInvitation(username);
  else{writePendingInvitation({...original,stage:'uncertain'});try{error.invitationPending=true}catch{}}
  throw error;
 }
}
export async function resendInvitation(id){const r=await post('/api/invitations/'+encodeURIComponent(id)+'/resend',{});return r.invitation||r.entity||r}
export async function revokeInvitation(id){return post('/api/invitations/'+encodeURIComponent(id)+'/revoke',{})}
export async function updateUser(id,updates){const r=await post('/api/users/'+encodeURIComponent(id),updates);return r.user||r.entity||r}
export async function requestUserReset(id){requireCapability('staffReset');return post('/api/users/'+encodeURIComponent(id)+'/reset',{})}
export async function revokeSession(id){const currentId=getSession()?.id;const result=await post('/api/sessions/'+encodeURIComponent(id)+'/revoke',{});if(id===currentId)Shared.lockLocal('session-ended');return result}
export async function changePassword(payload){requireCapability('passwordChange');return authPost('/api/auth/password',payload,'password-change')}
export async function beginRecovery(username){requireCapability('passwordRecovery');return post('/api/auth/recovery/start',{username})}
export async function completeRecovery(payload){requireCapability('passwordRecovery');const result=await authPost('/api/auth/recovery/complete',payload,'password-recovery',false);Shared.lockLocal('password-recovered');return result}
export async function recoverUsername(payload){requireCapability('usernameRecovery');return post('/api/auth/username',payload)}
export async function changePhone(payload){return post('/api/auth/phone',payload)}
export async function verifyStepUp(payload){const result=await post('/api/auth/step-up',payload);return {...result,stepUpToken:result.stepUpToken||result.proof}}
export async function regenerateRecoveryKey(payload){return post('/api/auth/recovery-key',payload)}
export async function transferOwner(payload){requireCapability('ownershipTransfer');const result=await authPost('/api/auth/transfer',payload,'ownership-transfer');Shared.lockLocal('ownership-transferred');return result}
