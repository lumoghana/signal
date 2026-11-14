import {merchantFetch} from './connected-service.js';
import {replaceRegisteredState,clearRegisteredState,getWorkspaceMode} from './store.js';
const listeners=new Set(),AUTH_KEY='lumo-shared-auth-state-v2',controllers=new Set();
const emptyCache=()=>({session:null,user:null,state:null,users:[],invitations:[],sessions:[],audit:[],devices:[],counter:null,student:null});
const clone=value=>JSON.parse(JSON.stringify(value));
const token=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const AUTH_SESSION_KEY=AUTH_KEY+'-tab',AUTH_CHANNEL='lumo-shared-auth-events-v2';
let memoryAuth={epoch:token(),locked:false,pendingLogout:false,kind:'initial',authVersion:0};
let authChannel=null,lockStatus={persistent:false,durable:false,kind:'memory',crossTab:false};
function readAuth(storage,key){try{const value=JSON.parse(storage?.getItem(key)||'null');return value&&typeof value.epoch==='string'?value:null}catch{return null}}
function localAuth(){try{return readAuth(globalThis.localStorage,AUTH_KEY)}catch{return null}}
function tabAuth(){try{return readAuth(globalThis.sessionStorage,AUTH_SESSION_KEY)}catch{return null}}
const authVersion=value=>Number.isSafeInteger(value?.authVersion)?value.authVersion:0;
const authStamp=value=>JSON.stringify([value?.epoch,authVersion(value),value?.locked,value?.pendingLogout,value?.kind]);
function newestAuth(values){
 let best=null;
 for(const value of values.filter(Boolean)){
  if(!best||authVersion(value)>authVersion(best)){best=value;continue}
  if(authVersion(value)!==authVersion(best))continue;
  // A lock wins an exact-version conflict. New explicit authentication writes a later version.
  if(value.locked&&!best.locked){best=value;continue}
  if(value.locked===best.locked&&(Number(value.writtenAt||0)>Number(best.writtenAt||0)||Number(value.writtenAt||0)===Number(best.writtenAt||0)&&String(value.epoch)>String(best.epoch)))best=value;
 }
 return best;
}
function authState(){
 const local=localAuth(),tab=tabAuth(),value=newestAuth([local,tab,memoryAuth])||memoryAuth;
 memoryAuth=value;
 if(local&&authStamp(local)===authStamp(value))lockStatus={persistent:true,durable:true,kind:'local',crossTab:true};
 else if(tab&&authStamp(tab)===authStamp(value))lockStatus={persistent:true,durable:true,kind:'session',crossTab:Boolean(authChannel)};
 else lockStatus={persistent:false,durable:false,kind:'memory',crossTab:Boolean(authChannel)};
 return value;
}
let observedEpoch=authState().epoch,observedStamp=authStamp(authState()),cache=emptyCache(),available=false,connection='connecting',lastError='',recoveryKey='',recoveryKeyReference='',busyRefresh=false,authSignature='',stateSignature='';
let revisions={auth:-1,student:-1,devices:-1},logoutRetry=false,transitionBackup=null;
let requestSequence=0,studentResponseOrder=0;
export function getCache(){return cache}
export function isAvailable(){return available}
export function connectionStatus(){return {status:connection,error:lastError}}
export function getAuthEpoch(){return authState().epoch}
export function getRevisions(){return {...revisions}}
export function localLockStatus(){authState();return {...lockStatus}}
export const getLocalLockStatus=localLockStatus;
export function isAuthTransitionPending(){const value=authState();return value.locked&&!value.pendingLogout&&!['logged-out','logout'].includes(value.kind)}
export function isLocallyLocked(){return Boolean(authState().locked)}
export function subscribeShared(fn){listeners.add(fn);return()=>listeners.delete(fn)}
function emit(type){for(const fn of listeners){try{fn(type,cache)}catch(error){console.error('Account update:',error.message)}}}
function stopRequests(){for(const controller of controllers)controller.abort();controllers.clear()}
function clearIdentity(){const hadSharedSnapshot=Boolean(cache.state);cache={...emptyCache(),student:cache.student};recoveryKey='';recoveryKeyReference='';authSignature='';stateSignature='';clearRegisteredState({preserveLegacy:!hadSharedSnapshot});emit('account');emit('data')}
function writeAuth(value,{expectedEpoch}={}){
 const current=authState();if(expectedEpoch&&current.epoch!==expectedEpoch)throw failChanged();
 const next={...value,authVersion:Math.max(authVersion(current),authVersion(memoryAuth),authVersion(localAuth()),authVersion(tabAuth()))+1,writtenAt:Date.now()};
 memoryAuth=next;observedEpoch=next.epoch;observedStamp=authStamp(next);
 let localSaved=false,tabSaved=false;
 try{globalThis.localStorage?.setItem(AUTH_KEY,JSON.stringify(next));localSaved=authStamp(localAuth())===authStamp(next)}catch{}
 try{globalThis.sessionStorage?.setItem(AUTH_SESSION_KEY,JSON.stringify(next));tabSaved=authStamp(tabAuth())===authStamp(next)}catch{}
 lockStatus={persistent:localSaved||tabSaved,durable:localSaved||tabSaved,kind:localSaved?'local':tabSaved?'session':'memory',crossTab:localSaved||Boolean(authChannel)};
 try{authChannel?.postMessage({type:'auth-state',value:next})}catch{}
 return next;
}
function snapshotSignature(value){
 if(!value)return JSON.stringify(value);
 const strip=entry=>{if(!entry||typeof entry!=='object')return entry;const {checkedAt,...rest}=entry;return rest};
 const readiness=value.shopReadiness;
 return JSON.stringify(readiness===undefined?value:{...value,shopReadiness:Array.isArray(readiness)?readiness.map(strip):readiness&&typeof readiness==='object'?Object.fromEntries(Object.entries(readiness).map(([key,entry])=>[key,strip(entry)])):readiness});
}

export function lockLocal(reason='signed-out'){
 transitionBackup=null;stopRequests();const value={epoch:token(),locked:true,pendingLogout:true,kind:'logout',reason};writeAuth(value);clearIdentity();return value.epoch;
}
export function beginAuthTransition(kind='login'){
 stopRequests();transitionBackup=cache.session?{cache:clone(cache),revisions:{...revisions},recoveryKey,recoveryKeyReference,workspace:getWorkspaceMode()}:null;const value={epoch:token(),locked:true,pendingLogout:false,kind};writeAuth(value);clearIdentity();return value.epoch;
}
function finishLogout(epoch){const current=authState();if(current.epoch===epoch)writeAuth({...current,locked:true,pendingLogout:false,kind:'logged-out'},{expectedEpoch:epoch})}
function failChanged(){const error=new Error('Your account changed while this request was running. Continue with the current sign-in.');error.status=409;error.code='AUTH_CHANGED';return error}
function responseRevision(result){return Number.isSafeInteger(result.revision)?result.revision:null}
function signature(){return JSON.stringify([cache.session,cache.users,cache.invitations,cache.sessions,cache.audit,cache.counter])}
export function applyResponse(result={},options={}){
 const epoch=options.authEpoch||getAuthEpoch();if(epoch!==getAuthEpoch())throw failChanged();
 if(options.expectedWalletId&&Object.hasOwn(result,'student')&&result.student?.id!==options.expectedWalletId)throw Object.assign(new Error('This payment belongs to another student wallet. Reopen the original wallet before checking its outcome.'),{status:409,code:'WALLET_CHANGED'});
 const revision=responseRevision(result),unlocked=Boolean(options.unlockOnSuccess&&result.session),locked=isLocallyLocked();
 const oldSignature=signature(),hadSharedSnapshot=Boolean(cache.state);
 const hasIdentity=['session','state','users','invitations','sessions','audit','user','counter'].some(key=>Object.hasOwn(result,key));
 if(unlocked){transitionBackup=null;writeAuth({...authState(),locked:false,pendingLogout:false,kind:'authenticated'},{expectedEpoch:epoch});revisions.auth=-1;revisions.devices=-1}
 const acceptAuth=hasIdentity&&(!locked||unlocked||result.session===null)&&(unlocked||revision===null||revision>=revisions.auth);
 if(acceptAuth){
  if(Object.hasOwn(result,'session')&&!Object.hasOwn(result,'counter'))cache.counter=null;
  if(revision!==null)revisions.auth=revision;
  for(const key of ['session','user','state','users','invitations','sessions','audit','counter'])if(Object.hasOwn(result,key))cache[key]=result[key];
 }
 if(Object.hasOwn(result,'devices')&&(!isLocallyLocked()||result.session===null)&&(unlocked||revision===null||revision>=revisions.devices)){
  cache.devices=result.devices;if(revision!==null)revisions.devices=revision;
 }
 if(Object.hasOwn(result,'student')){
  const order=Number.isSafeInteger(options.studentOrder)?options.studentOrder:++requestSequence,sameWallet=(result.student?.id||null)===(cache.student?.id||null);
  if((sameWallet||order>=studentResponseOrder)&&(revision===null||revision>=revisions.student)){cache.student=result.student;studentResponseOrder=Math.max(studentResponseOrder,order);if(revision!==null)revisions.student=revision}
 }
 // Anonymous or revoked merchant sessions must not retain a previous authorised snapshot.
 if(acceptAuth&&result.session===null){cache={...emptyCache(),student:cache.student};recoveryKey='';recoveryKeyReference='';stateSignature='';clearRegisteredState({preserveLegacy:!hadSharedSnapshot});}
 // Apply revocations and mute authority before installing receipts into the store.
 emit('authority');
 if(acceptAuth&&cache.counter){recoveryKey='';recoveryKeyReference='';}
 if(acceptAuth&&cache.state){const next=snapshotSignature(cache.state),changed=next!==stateSignature;stateSignature=next;replaceRegisteredState(cache.state,{activate:getWorkspaceMode()==='registered',eventType:'REMOTE_SYNC',notify:changed})}
 const incomingKeyReference=String(result.recoveryKeyReference||result.session?.recoveryKeyReference||'');
 if(result.recoveryKey&&!isLocallyLocked()&&(acceptAuth||!hasIdentity)&&(!cache.session?.recoveryKeyReference||incomingKeyReference===cache.session.recoveryKeyReference)){recoveryKey=result.recoveryKey;recoveryKeyReference=incomingKeyReference;}
 else if(recoveryKeyReference&&cache.session?.recoveryKeyReference&&recoveryKeyReference!==cache.session.recoveryKeyReference){recoveryKey='';recoveryKeyReference='';}
 const nextSignature=signature();if(oldSignature!==nextSignature||authSignature!==nextSignature){authSignature=nextSignature;emit('account')}
 emit('data');return result;
}
const publicPath=path=>/^\/api\/(?:health|directory|lookup|payments(?:\/quote)?|student(?:\/|$)|sandbox-fund|signup|auth\/(?:login|logout|recovery(?:\/|$)|username)|invitations(?:\/accept|\/[^/]+$))/.test(path);
function localLockedError(){const error=new Error('This device is signed out. Sign in again to continue.');error.status=401;error.code='LOCAL_LOCKED';return error}
function isAuthFailure(path,result){return !/\/api\/(student|payments|sandbox-fund)/.test(path)&&['SIGN_IN_REQUIRED','SESSION_INVALID','SESSION_EXPIRED','SESSION_REVOKED','AUTH_REQUIRED'].includes(result.code||result.error?.code)}
export async function api(path,options={}){
 const method=options.method||'GET',epoch=options.authEpoch||getAuthEpoch();if(epoch!==getAuthEpoch())throw failChanged();
 const studentOrder=++requestSequence;
 if(isLocallyLocked()&&!options.unlockOnSuccess&&!publicPath(path)&&!path.startsWith('/api/logout'))throw localLockedError();
 const headers={Accept:'application/json',...(options.headers||{})};
 if(method!=='GET'&&method!=='HEAD'){headers['Content-Type']='application/json';headers['X-Lumo-Request']='1'}
 if(options.signal?.aborted)throw new DOMException('Question cancelled.','AbortError');
 const controller=new AbortController();controllers.add(controller);
 const callerAbort=()=>controller.abort();options.signal?.addEventListener('abort',callerAbort,{once:true});
 const timeout=setTimeout(()=>controller.abort(new DOMException('The connection timed out. Retry with the same reference.','TimeoutError')),path==='/api/lux'?28000:15000);timeout.unref?.();
 try{
  const response=await merchantFetch(path,{signal:controller.signal,authEpoch:epoch,method,credentials:'same-origin',headers,...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
  if(epoch!==getAuthEpoch())throw failChanged();
  if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('The shared service is unavailable. Please retry when connected.');
  const result=await response.json();if(controller.signal.aborted)throw new DOMException('Question cancelled.','AbortError');if(epoch!==getAuthEpoch())throw failChanged();
  if(!response.ok){
   if(response.status===401&&cache.session&&isAuthFailure(path,result))lockLocal('session-ended');
   const error=new Error(result.error?.message||result.error||result.message||'We could not complete that request.');error.status=response.status;error.code=result.code||result.error?.code;error.definitiveNoMutation=error.code==='UNAVAILABLE_SERVICE'||result.noMutation===true;throw error;
  }
  const wasOffline=connection!=='online';available=true;connection='online';lastError='';
  const applied=applyResponse(result,{authEpoch:epoch,unlockOnSuccess:options.unlockOnSuccess,studentOrder,expectedWalletId:options.expectedWalletId});
  if(/\/api\/(?:auth\/)?logout$/.test(path))finishLogout(epoch);
  if(wasOffline)emit('connection');return applied;
 }catch(error){
  if(epoch!==getAuthEpoch())throw failChanged();
  if(options.unlockOnSuccess&&transitionBackup&&(error.status>=400&&error.status<500&&error.status!==401||error.definitiveNoMutation===true)&&isAuthTransitionPending()){
   const saved=transitionBackup;transitionBackup=null;cache=saved.cache;revisions=saved.revisions;recoveryKey=saved.recoveryKey;recoveryKeyReference=saved.recoveryKeyReference||'';writeAuth({...authState(),locked:false,pendingLogout:false,kind:'authenticated'},{expectedEpoch:epoch});authSignature=signature();stateSignature=snapshotSignature(cache.state);if(cache.state)replaceRegisteredState(cache.state,{activate:saved.workspace==='registered'});emit('authority');emit('account');emit('data');
  }
  if((!error.status||error.status>=500)&&!(error.name==='AbortError'&&options.signal?.aborted)&&error.code!=='AUTH_CHANGED'&&!error.definitiveNoMutation){connection='offline';lastError=error.message;emit('connection')}
  throw error;
 }finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',callerAbort);controllers.delete(controller)}
}
async function retryLogout(){
 const current=authState();if(logoutRetry||!current.locked||!current.pendingLogout)return;logoutRetry=true;
 try{await api('/api/auth/logout',{method:'POST',body:{},authEpoch:current.epoch})}catch{}finally{logoutRetry=false}
}
export async function bootstrap(){if(isLocallyLocked()){clearIdentity();await retryLogout();}else try{await api('/api/session')}catch{}return cache}
export async function refresh(){
 if(busyRefresh)return cache;busyRefresh=true;
 try{if(isLocallyLocked())await retryLogout();else await api('/api/session')}catch{}finally{busyRefresh=false}return cache;
}
export function getRecoveryKey(){return recoveryKey}
export function getRecoveryKeyReference(){return recoveryKeyReference}
export function clearRecoveryKey(){recoveryKey='';recoveryKeyReference=''}
export function startSync(){const timer=setInterval(()=>refresh(),4000);timer.unref?.();return()=>clearInterval(timer)}
function acceptExternalAuth(value){
 const selected=newestAuth([authState(),value]);if(!selected||authStamp(selected)===observedStamp)return;
 memoryAuth=selected;observedEpoch=selected.epoch;observedStamp=authStamp(selected);
 try{globalThis.sessionStorage?.setItem(AUTH_SESSION_KEY,JSON.stringify(selected))}catch{}
 transitionBackup=null;stopRequests();clearIdentity();
 if(!selected.locked)refresh();
}
try{if(typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'){authChannel=new BroadcastChannel(AUTH_CHANNEL);authChannel.addEventListener('message',event=>{if(event.data?.type==='auth-state'&&event.data.value?.epoch)acceptExternalAuth(event.data.value)});authChannel.unref?.()}}catch{authChannel=null}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 if(event.key!==AUTH_KEY)return;let value;try{value=event.newValue?JSON.parse(event.newValue):localAuth()}catch{return}acceptExternalAuth(value);
});

if(typeof window!=='undefined')window.addEventListener('lumo-merchant-session-change',()=>{if(!isLocallyLocked())refresh()});
