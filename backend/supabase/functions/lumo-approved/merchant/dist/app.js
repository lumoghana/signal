import {updateMarkup} from './stable-dom.js';
import {CONNECTED_CONSUMER_ORIGIN,MERCHANT_CAPABILITIES} from './connected-service.js';
import {parseMerchantPaymentLink,resolveSamplePaymentLink} from './payment-link-intent.js';
import {createAppNavigation} from './app-navigation.js';
import {captureFocus,restoreFocus} from './focus-preservation.js';
import {renderHome,renderCollections,renderAdministration,requestPresentation,collectionQueue,newConfirmedReceipts} from './collections-ui.js';
import {getState,subscribe,dispatch,metrics,formatMoney,resetDemo,switchWorkspace,hasRegistration,getWorkspaceMode,syncAccessUsers} from './store.js';
import {createSignup} from './signup.js';
import * as Auth from './account.js';
import * as Shared from './shared.js';
import {createReporting,paymentDate} from './reporting.js';
import {businessDay,financialTradingDay} from './domain.js';
import {createMerchantLuxConversation,renderMerchantLux} from './lux-chat.js';
import {merchantLuxStale} from './lux-brain.js';
import {createRefundAttempts} from './refund-attempts.js';
import {createSettlementAttempts} from './settlement-attempts.js';
import {createOperations} from './operations.js';
import {createDevices} from './devices.js';
import {receivingPayments} from './merchant-receipts.js';
import {createCashier} from './cashier.js';
import {createCounterSetup} from './counter-setup.js';
import {createPaymentLinkSharing} from './share-payment-link.js';
import {createBusinessPlan} from './business-plan.js';
import * as CounterLock from './counter-local-lock.js';
import {createDirectory} from './directory.js';
import {createCampusPay} from './campus-pay.js';
await Shared.bootstrap();
import {createAccess,securityPage} from './access.js';
import {createPeople} from './people.js';

const $ = (s,el=document)=>el.querySelector(s);
const E = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>formatMoney(Number(v)||0);
const canUse=name=>getWorkspaceMode()==='sample'||MERCHANT_CAPABILITIES[name]===true;
const capabilityUnavailable=error=>error?.definitiveNoMutation===true||error?.code==='UNAVAILABLE_SERVICE';
const date=v=>new Date(v).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const time=v=>new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const today=v=>new Date(v).toISOString().slice(0,10)===new Date().toISOString().slice(0,10);
const storeKey='lumo-merchant-ui-v2';
const appearanceLabels={system:'System',light:'Light',dark:'Dark'};
const appearanceSymbols={
 system:'<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M10.5 5h3M11 19h2"/>',
 light:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4m0-15.6-1.4 1.4M5.6 18.4l-1.4 1.4"/>',
 dark:'<path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z"/>'
};
const appearancePreference=()=>window.LumoAppearance?.getPreference()||'dark';
function updateAppearanceUI(){
 const preference=appearancePreference();
 document.querySelectorAll('[data-appearance-label]').forEach(node=>{node.textContent=appearanceLabels[preference]});
 document.querySelectorAll('[name="appearance"]').forEach(input=>{input.checked=input.value===preference});
 document.querySelectorAll('.appearance-hint').forEach(node=>{node.textContent=preference==='system'?'Follows your phone’s appearance.':'Saved for this device.'});
}
window.LumoAppearance?.subscribe(updateAppearanceUI);

let sampleAudioUnlocked=false,sampleAudioFailed=false;
const freshReceipts=new Map();let receiptContext='';
function receiptScope(){return [getWorkspaceMode(),state.business.id,Auth.getSession()?.id||ui.role,Auth.getSession()?.userId||ui.staffId].join(':')}
function resetReceiptBaseline(){receiptContext=receiptScope();knownPaid=new Set(receivingPayments(state).filter(t=>t.status==='paid').map(t=>t.id));freshReceipts.clear()}
function announceReceipt(payment){const node=document.getElementById('payment-announcement');if(node)node.textContent=`Payment received. ${money(payment.amount)} from ${payment.payer}. ${shopName(payment.shopId)}. Reference ${payment.reference}.`}
const refundAttempts=createRefundAttempts(),settlementAttempts=createSettlementAttempts();
let chargeSubmitting=false,pendingCharge=null;
let settlementSubmitting=false;
let refundSubmitting=false;
function settlementScope(){return [state.business.id,Auth.getSession()?.userId||ui.role]}
function pendingSettlement(){return settlementAttempts.read(...settlementScope())}
function matchingSettlement(pending){return pending&&state.settlements.find(record=>record.attemptId===pending.attemptId&&record.amount===pending.amount&&record.destination===pending.destination)}
function refundScope(){return [state.business.id,Auth.getSession()?.userId||ui.role]}
function pendingRefund(transactionId){return refundAttempts.read(...refundScope(),transactionId)}
let deviceId;try{deviceId=localStorage.getItem('lumo-sample-receiver-id')||crypto.randomUUID();localStorage.setItem('lumo-sample-receiver-id',deviceId)}catch{deviceId=crypto.randomUUID()}
let remembered={}; try{remembered=JSON.parse(localStorage.getItem(storeKey)||'{}');}catch{}
let ui={role:'owner',shopId:'night-market',staffId:'staff-kojo',page:'home',collectMode:'amount',collectionNote:'',scope:'all',activitySearch:'',activityStatus:'all',activityPeriod:'today',nearbySearch:'',area:'Night Market',charge:'',category:'all',modal:null,chat:[],location:null,...remembered};
let state=getState();let navigation=null,restoringNavigation=false,campusOverlayActive=false;
// Legacy sample data has no account ID. Give only that local workspace a stable
// reasoning identity; registered accounts always use the server's business ID.
function luxState(){return getWorkspaceMode()==='sample'&&!state.business.id?{...state,business:{...state.business,id:'sample-business'}}:state;}
function luxActor(){
 const session=getWorkspaceMode()==='registered'?Auth.getSession():null;
 if(getWorkspaceMode()==='registered')return session?{id:session.userId,role:session.role,shopIds:session.shopIds||[],businessId:session.businessId}:{id:'signed-out',role:'none',shopIds:[],businessId:state.business.id};
 return{id:ui.role==='owner'?'sample-owner':'sample-'+ui.role+'-'+(ui.staffId||'member'),role:ui.role,shopIds:ui.role==='owner'?state.shops.map(s=>s.id):[ui.shopId],businessId:luxState().business.id};
}
const merchantChat=createMerchantLuxConversation({getState:luxState,getActor:luxActor,getShopId:()=>scoped(),getIdentity:()=>[getWorkspaceMode(),Shared.getAuthEpoch(),Auth.getSession()?.id||'sample',Auth.getSession()?.userId,Auth.getSession()?.role,JSON.stringify(Auth.getSession()?.shopIds||[]),Shared.getCache().counter?.staffId,Shared.getCache().counter?.shiftId],isConnected:()=>getWorkspaceMode()==='registered',request:(question,context,signal)=>Shared.api('/api/lux',{method:'POST',body:{question,context,shopId:scoped()},signal}),onChange:()=>{if(appReady&&ui.page==='lux'){render();requestAnimationFrame(()=>{const log=document.querySelector('.lux-panel .chat-log');if(log)log.scrollTop=log.scrollHeight;});}}});

const url=new URL(location.href);
if((url.searchParams.has('pay')||url.searchParams.has('request'))&&['sample','registered'].includes(url.searchParams.get('workspace'))){
 try{state=switchWorkspace(url.searchParams.get('workspace'))}catch{}
}
if(url.searchParams.has('pay')||url.searchParams.has('request')||url.searchParams.has('code')){
 ui.role='student';ui.page='nearby';ui.shopId=url.searchParams.get('pay')||'night-market';
 setTimeout(()=>openPaymentLink(),120);
}
let knownPaid=new Set(receivingPayments(state).filter(t=>t.status==='paid').map(t=>t.id));
function ownerWorkspace(snapshot){
 state=snapshot||getState();const first=state.shops[0];
 reporting.reset();operations.reset();people?.reset();cashier?.reset();counterSetup?.reset();paymentSharing?.reset();businessPlan?.reset?.();sampleCounter=null;
 ui.role='owner';ui.page='home';ui.collectMode='amount';ui.collectionNote='';pendingCharge=null;ui.scope='all';ui.shopId=first?.id||'';ui.staffId=state.staff.find(s=>s.shopId===first?.id&&s.role==='manager'&&s.active)?.id||'';
 ui.modal=null;ui.charge='';ui.chat=[];ui.detailShop=null;ui.activitySearch='';ui.activityStatus='all';ui.activityPeriod='today';
 resetReceiptBaseline();navigation?.reset({page:ui.page,shopId:ui.shopId});persist();
}
let appReady=false,lastSignupStage='',access=null,people=null,identitySyncing=false,sharedRenderQueued=false,sharedRenderPending=false,lastExpiredQR='';
let sampleCounter=null;
const counterView=()=>{const value=getWorkspaceMode()==='registered'?Shared.getCache().counter:sampleCounter;return value&&getWorkspaceMode()==='registered'&&CounterLock.isLocked(value,Auth.getSession())?{...value,locked:true,staffId:null,staffName:null,localLock:true}:value};
const cashierMode=()=>ui.role==='cashier'||Boolean(getWorkspaceMode()==='registered'&&counterView());
function syncIdentity(){
 if(Auth.isShared)return;
 if(identitySyncing||getWorkspaceMode()!=='registered'||!Auth.hasOwner(state.business.id))return;
 const session=Auth.getSession();if(!session||session.businessId!==state.business.id)return;
 identitySyncing=true;try{state=syncAccessUsers(Auth.listUsers(state.business.id),{authoritative:session.role==='owner'})}finally{identitySyncing=false}
}
function enterAuthenticated(session){
 if(!session)throw new Error('Sign in to open your business.');
 state=switchWorkspace('registered');
 reporting.reset();operations.reset();
 if(Shared.getCache().counter?.locked){ui.role='cashier';ui.modal=null;signup.setActive(false);access?.hide();cashier?.reset();render();return}
 if(session.businessId!==state.business.id)throw new Error('This account belongs to another business.');
 syncIdentity();ui.role=session.role;ui.scope='all';ui.modal=null;ui.charge='';ui.chat=[];
 const assigned=session.role==='owner'?state.shops:state.shops.filter(sh=>session.shopIds.includes(sh.id));
 if(!assigned.length)throw new Error('Your account has no assigned shops. Ask the owner for access.');
 if(!assigned.some(sh=>sh.id===ui.shopId))ui.shopId=assigned[0].id;
 ui.staffId=state.staff.find(st=>st.authUserId===session.userId&&st.active)?.id||'';
 ui.page=session.role==='cashier'?'checkout':'home';cashier?.reset();counterSetup?.reset();ui.collectMode='amount';ui.collectionNote='';pendingCharge=null;resetReceiptBaseline();navigation?.reset({page:ui.page,shopId:ui.shopId});
 signup.clearPendingFor?.(session.username);signup.setActive(false);access?.hide();people?.reset();devices?.applyDevices(Shared.getCache().devices,{revision:Shared.getRevisions().devices,connection:Shared.connectionStatus().status});devices?.consumePayments(receivingPayments(state));devices?.start();persist();render();if(Auth.getRecoveryKey())access.show('recovery-key',{recoveryKey:Auth.getRecoveryKey()});else if(Auth.getRecoveryKeyNotice?.(session)||Auth.getInvitationRecoveryNotice?.(session))access.show('regenerate-key',{notice:Auth.getRecoveryKeyNotice?.(session)||Auth.getInvitationRecoveryNotice?.(session)});else if(Auth.getPendingLegacyImport?.()?.targetBusinessId===session.businessId)access.show('resume-import');
}
function showLogin(params={}){
 signup.setActive(false);
 if(hasRegistration())state=switchWorkspace('registered');
 access.show('login',params);
}

const signup=createSignup({
 hasRegistration:()=>hasRegistration(),
 getRegisteredName:()=>getWorkspaceMode()==='registered'?getState().business.name:'your business',
 onRender:()=>{if(appReady)render()},
 onComplete:async payload=>{
  Auth.validateNewCredentials(payload.credentials?.username,payload.credentials?.password);
  const result=await Auth.signup(payload);
  ownerWorkspace(switchWorkspace('registered'));return {...result,...result.state,recoveryKey:result.recoveryKey};
 },
 onDemo:()=>{ownerWorkspace(switchWorkspace('sample'));signup.setActive(false);access?.hide();render()},
 onLogin:params=>showLogin(params),
 onResume:()=>showLogin(),
 onEnter:()=>enterAuthenticated(Auth.getSession())
});
access=createAccess({
 auth:Auth,hasRegistration:()=>hasRegistration(),business:()=>state.business,
 onRender:()=>{if(appReady)render()},
 onAuthenticated:session=>enterAuthenticated(session),
 onSignOut:()=>{devices?.clearAnnouncementFailures?.();devices?.stop();window.speechSynthesis?.cancel();ui.modal=null;signup.setActive(false);state=getState();operations.reset();people?.reset();reporting.reset();render()},
 onSignup:()=>{signup.start();render()},
 onDemo:()=>{ownerWorkspace(switchWorkspace('sample'));signup.setActive(false);access.hide();render()},
 onBack:()=>render(),
 onRecoveryKeySaved:()=>enterAuthenticated(Auth.getSession()),
 onSecureExisting:async credentials=>{
  Auth.validateNewCredentials(credentials.username,credentials.password);
  await Auth.initializeOwner(credentials);

 }
});
people=createPeople({
 auth:Auth,getState:()=>getState(),getSession:()=>Auth.getSession(),getPreferredShopId:()=>ui.shopId,
 onRender:()=>{if(appReady&&ui.page==='team')render()},
 onUsersChanged:()=>{syncIdentity();render()},
 onInvitation:token=>{dismiss();signup.setActive(false);access.show('invite',{token})},
 onPasswordReset:challenge=>toast('Recovery is ready. The user completes Forgot password with their private recovery key.'),
 onOwnershipTransferred:()=>{ui.role=Auth.getSession()?.role||'manager';navigate('overview')},
 toast
});
signup.setActive(!(url.searchParams.has('pay')||url.searchParams.has('request')||url.searchParams.has('code')));
const reporting=createReporting({getState,getScope:scoped,isOwner:()=>ui.role==='owner',getContextKey:()=>[getWorkspaceMode(),state.business.id,Auth.getSession()?.userId,Auth.getSession()?.id].join(':'),onRender:()=>{if(appReady&&['activity','reports'].includes(ui.page))render()},onExport:csv,onOpenTransaction:id=>modal('transaction',{id}),onOpenClosing:id=>modal('closing-detail',{id})});
const devices=createDevices({api:Shared.api,getState,getSession:Auth.getSession,getShopId:()=>ui.shopId,onRender:()=>{if(appReady&&getWorkspaceMode()==='registered'&&!access.isActive()&&!signup.isActive())queueSharedRender()},toast,onTestVoice:amount=>testVoice(amount),onOpenTransaction:id=>{if(cashierMode()){dismiss();cashier.openReceipt(id)}else modal('transaction',{id})}});
const counterSetup=createCounterSetup({getSession:Auth.getSession,getUsers:()=>Shared.getCache().users||[],getState,getShopId:()=>ui.shopId,getDeviceId:devices.getDeviceId,api:Shared.api,onChange:()=>{if(appReady&&ui.page==='counter-setup')render()},onSetup:()=>{ui.role='cashier';ui.modal=null;ui.page='checkout';signup.setActive(false);access.hide();cashier.reset();devices.stop();window.speechSynthesis?.cancel();navigation?.reset({page:'checkout',shopId:ui.shopId});render()}});
function sampleCounterView(){
 const selected=currentShop(),eligible=state.staff.filter(person=>person.active&&person.role==='cashier'&&(person.shopIds||[person.shopId]).includes(selected?.id));
 if(!sampleCounter||sampleCounter.shopId!==selected?.id)sampleCounter={id:'sample-counter-'+selected?.id,label:'Front counter',shopId:selected?.id,shopName:selected?.name,shopCode:selected?.code,mode:ui.cashierPhoneMode==='dedicated'?'dedicated':'shared',locked:false};
 return {...sampleCounter,mode:ui.cashierPhoneMode==='dedicated'?'dedicated':'shared',staffId:sampleCounter.locked?null:ui.staffId,staffName:sampleCounter.locked?null:state.staff.find(person=>person.id===ui.staffId)?.name,eligibleStaff:eligible.filter(person=>ui.cashierPhoneMode!=='dedicated'||person.id===ui.staffId).map(person=>({id:person.id,userId:person.id,name:person.name,pinReady:true})),shiftId:(state.shifts||[]).find(shift=>shift.staffId===ui.staffId&&shift.status==='open')?.id};
}
async function cashierLock(payload={}){
 if(getWorkspaceMode()==='registered'&&payload.endShift)payload={...payload,counterStaffId:Auth.getSession()?.staffId,counterShiftId:Shared.getCache().counter?.shiftId};
 if(getWorkspaceMode()==='registered'){const counter=Shared.getCache().counter,session=Auth.getSession();CounterLock.lock(counter,session);devices.stop();window.speechSynthesis?.cancel();render();if(navigator.onLine===false)return {counter:counterView(),localOnly:true};return Shared.api('/api/counter/lock',{method:'POST',body:payload})}
 const counter=sampleCounterView();if(payload.endShift){const shift=(state.shifts||[]).find(value=>value.staffId===ui.staffId&&value.status==='open');if(shift)await performAction('END_SHIFT',{id:shift.id,note:payload.note||''})}
 sampleCounter={...counter,locked:true};sampleAudioUnlocked=false;return {counter:sampleCounter};
}
async function cashierUnlock(payload){
 if(getWorkspaceMode()==='registered'){const before=Shared.getCache().counter,session=Auth.getSession();if(CounterLock.isLocked(before,session))await Shared.api('/api/counter/lock',{method:'POST',body:{endShift:false}});const result=await Shared.api('/api/counter/unlock',{method:'POST',body:payload});if(result.counter?.locked!==false)throw Error('Lumo could not confirm this cashier unlock. Try again.');if(CounterLock.clear(result.counter,Auth.getSession()).locked)throw Error('This phone could not clear its screen lock. Allow browser storage and unlock again.');ui.role='cashier';ui.staffId=Auth.getSession()?.staffId||state.staff.find(person=>person.authUserId===Auth.getSession()?.userId)?.id||'';ui.shopId=result.counter?.shopId||ui.shopId;resetReceiptBaseline();devices.start();render();return result}
 const counter=sampleCounterView(),person=counter.eligibleStaff.find(value=>value.userId===payload.userId||value.id===payload.userId);if(!person)throw Error('Choose an assigned sample cashier.');if(!/^[0-9]{6}$/.test(payload.pin||''))throw Error('Use any 6 digits in the sample workspace.');
 ui.staffId=person.id;sampleCounter={...counter,locked:false,staffId:person.id,staffName:person.name};await performAction('START_SHIFT',{shopId:ui.shopId});resetReceiptBaseline();return {counter:sampleCounter};
}
const paymentSharing=createPaymentLinkSharing({getIdentity:()=>[getWorkspaceMode(),Shared.getAuthEpoch(),state.business.id,Auth.getSession()?.id||ui.role,Auth.getSession()?.userId||ui.staffId,Auth.getSession()?.role||ui.role,JSON.stringify([...(Auth.getSession()?.shopIds||[ui.shopId])].sort())].join(':'),getMerchantName:()=>state.business.name,canPublish:()=>['owner','manager'].includes(ui.role),onPublish:id=>navigate('activation',id),getRequest:id=>state.requests.find(request=>request.id===id),isSample:()=>getWorkspaceMode()==='sample',qrSvg,onChange:()=>{if(appReady&&ui.modal?.kind==='payment-share')renderModal()},createLink:payload=>{
 if(getWorkspaceMode()!=='registered')throw Error('Sign in to create a public payment link.');
 const counter=Shared.getCache().counter;if(counterView()?.locked)throw Error('Unlock this counter before sharing a payment link.');
 return Shared.api('/api/payment-links',{method:'POST',body:{...payload,...(counter?{counterStaffId:Auth.getSession()?.staffId,counterShiftId:counter.shiftId}:{})}});
},listLinks:()=>Shared.api('/api/payment-links'),openExternal:url=>{if(url.startsWith('mailto:'))location.href=url;else window.open(url,'_blank','noopener,noreferrer')}});
function openPaymentSharing({shopId=ui.shopId,requestId,amount,description}={}){const selected=shop(shopId);if(!selected){toast('Choose an assigned shop before sharing.',true);return}const request=requestId?state.requests.find(value=>value.id===requestId&&value.shopId===selected.id):null;if(requestId&&!request){toast('That request is no longer available to your account.',true);return}paymentSharing.open({shop:selected,request,amount,description});modal('payment-share')}
function openSharedPaymentLinks(id){paymentSharing.openList({shop:currentShop()},id);modal('payment-share')}
const businessPlan=createBusinessPlan({getState,getSession:Auth.getSession,getShopId:()=>ui.shopId,getRole:()=>ui.role,isSample:()=>getWorkspaceMode()==='sample',api:Shared.api,onChange:()=>{if(appReady&&ui.page==='business-plan')render()}});
const cashier=createCashier({getState,getActor:()=>{try{return actor()}catch{return {role:'cashier',shopId:counterView()?.shopId,staffId:null}}},getShop:()=>currentShop()||counterView(),getSession:Auth.getSession,getCounter:()=>getWorkspaceMode()==='sample'?sampleCounterView():counterView(),getConnectivity:()=>getWorkspaceMode()==='sample'?(navigator.onLine===false?'offline':'online'):Shared.connectionStatus().status,getReceiver:()=>receiverStatus(),money,E,icon,time,qrSvg,paymentLink,onChange:()=>{if(appReady)render()},act:performAction,api:Shared.api,
 onSharePayment:options=>openPaymentSharing({shopId:ui.shopId,...options}),onSharedLinks:()=>openSharedPaymentLinks(),onPreviewPayment:request=>modal('student-pay',{id:request.shopId,request:request.id,method:'qr'}),onCreateRequest:payload=>performAction('CREATE_REQUEST',payload),onRefundRequest:payload=>performAction('REFUND',payload),onHelp:payload=>performAction('ADD_TICKET',payload),onUnlock:cashierUnlock,onLock:cashierLock,onHandover:async payload=>{if(counterView()||getWorkspaceMode()==='sample')return cashierLock({...payload,endShift:true});const shift=(state.shifts||[]).find(value=>value.staffId===ui.staffId&&value.status==='open');if(shift)return performAction('END_SHIFT',{id:shift.id,note:payload.note||''})},onSound:()=>modal('cashier-sound'),onDemoRoles:()=>modal('role-switch'),onExit:()=>access.handleClick('access-sign-out'),onSignOut:()=>access.handleClick('access-sign-out'),isSample:()=>getWorkspaceMode()==='sample'});
const campusPay=createCampusPay({api:Shared.api,onRender:()=>renderCampusPay(),toast,onReturnMerchant:()=>{campusPay.hide();if(Auth.getSession())enterAuthenticated(Auth.getSession());else showLogin()}});
const directory=createDirectory({api:Shared.api,onRender:()=>{if(appReady&&ui.role==='student'&&!access.isActive()&&!signup.isActive())render()},onPay:(shop,options)=>campusPay.open(shop,options),onLogin:showLogin,onStudent:()=>campusPay.openWallet(),getStudent:()=>Shared.getCache().student,onScan:()=>modal('student-scan'),formatMoney:money});
const operations=createOperations({getState,getSession:Auth.getSession,getRole:()=>ui.role,getStaffId:()=>ui.staffId,getShopId:()=>ui.shopId,getDevices:()=>Shared.getCache().devices,getDeviceReadiness:()=>Shared.getCache().state?.shopReadiness||[],getConnectionStatus:()=>Shared.connectionStatus().status,onSelectShop:selectShop,isShared:()=>getWorkspaceMode()==='registered',act,api:Shared.api,onRender:render,toast,onNavigate:navigate,onApprovals:()=>modal('approvals'),onSound:id=>navigate('devices',id),onInvite:id=>{navigate('team',id);people.openInvite?.(id)},onQR:id=>modal('shop-qr',{id}),onClose:id=>modal('open-close',{id}),onOpenTransaction:id=>modal('transaction',{id})});
function renderCampusPay(){if(campusPay?.isActive()&&!campusOverlayActive){campusOverlayActive=true;if(!restoringNavigation)navigation?.openModal({kind:'campus-payment'})}else if(!campusPay?.isActive()&&campusOverlayActive){campusOverlayActive=false;if(!restoringNavigation)navigation?.dismissModal()}if(!campusPay?.isActive()){$('#modal-root').innerHTML='';$('#app').inert=false;document.body.classList.remove('modal-open');return}const result=campusPay.render();updateMarkup($('#modal-root'),result,{preserveFields:backgroundRender});$('#app').inert=true;document.body.classList.add('modal-open')}


let lastModalTrigger=null;
let scanStream=null,scanFrame=null,shopLocationGeneration=0;
function invalidateShopLocationCapture(){shopLocationGeneration++}
function syncShopLocationFields(){
 const form=$('#shop-form');if(!form)return;
 const custom=document.getElementById('shop-custom-area-field');
 if(custom){custom.hidden=form.elements.area?.value!=='Other';const input=custom.querySelector('input');if(input)input.required=!custom.hidden;}
 const lat=Number(form.elements.lat?.value),lng=Number(form.elements.lng?.value),link=document.getElementById('shop-map-link');
 if(link&&Number.isFinite(lat)&&Number.isFinite(lng))link.href='https://www.google.com/maps/search/?api=1&query='+lat+','+lng;
}
function captureShopLocation(){
 const form=$('#shop-form'),context=ui.modal;if(!form||!context||!['edit-shop','add-shop'].includes(context.kind))return;
 if(!navigator.geolocation){toast('Location is unavailable. Choose the campus area and confirm the landmark instead.',true);return}
 const generation=++shopLocationGeneration,businessId=state.business.id,workspace=getWorkspaceMode(),modalKey=context.key;
 const stillCurrent=()=>generation===shopLocationGeneration&&ui.modal?.key===modalKey&&state.business.id===businessId&&getWorkspaceMode()===workspace&&Boolean($('#shop-form'));
 navigator.geolocation.getCurrentPosition(position=>{
  if(!stillCurrent())return;const latitude=position.coords.latitude,longitude=position.coords.longitude;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){toast('The position could not be read. Choose the campus area and check the landmark.',true);return}
  const current=$('#shop-form');current.elements.lat.value=latitude.toFixed(6);current.elements.lng.value=longitude.toFixed(6);
  if(current.elements.locationConfirmed)current.elements.locationConfirmed.checked=false;
  const link=document.getElementById('shop-map-link');if(link)link.href='https://www.google.com/maps/search/?api=1&query='+latitude+','+longitude;
  toast('Position captured. Check the pin and confirm the entrance.');
 },()=>{if(stillCurrent())toast('Location unavailable. Choose your campus area and confirm the landmark instead.',true)},{timeout:10000});
}
function stopScanner(){if(scanFrame)cancelAnimationFrame(scanFrame);scanFrame=null;if(scanStream)scanStream.getTracks().forEach(t=>t.stop());scanStream=null}
const paths={
home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
shops:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/><path d="M2 10a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2"/>',
payments:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18m-13 5h4"/>',
settlements:'<path d="M3 10h18M5 10v9m5-9v9m4-9v9m5-9v9M2 21h20M3 6l9-4 9 4v2H3z"/>',
team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
reports:'<path d="M4 3v18h17M9 16v-5m5 5V7m5 9v-3"/>',
settings:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3h3l2 3h3l1-3 3-1 2-3-2-2 1-3-2-3h-3l-2-3z"/><circle cx="12" cy="12" r="3"/>',
help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
chevron:'<path d="m9 5 7 7-7 7"/>',
down:'<path d="m6 9 6 6 6-6"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
close:'<path d="m6 6 12 12M6 18 18 6"/>',
search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
check:'<path d="m5 12 4 4L19 6"/>',
copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
qr:'<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zm6-3v3m-9-3v9M3 12h6m3-9v6"/>',
sound:'<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
mute:'<path d="m11 4-6 5H2v6h3l6 5zM17 9l5 6m0-6-5 6"/>',
pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0"/><circle cx="12" cy="10" r="3"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
logout:'<path d="M9 4H3v16h6m5-13 5 5-5 5m-7-5h12"/>',
shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
refund:'<path d="M3 10h12a6 6 0 1 1 0 12M3 10l5-5m-5 5 5 5"/>',
eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18"/>',
link:'<path d="m10 13 4-4m-7 6-2 2a4 4 0 0 0 6 6l4-4a4 4 0 0 0-1-6M17 9l2-2a4 4 0 0 0-6-6L9 5a4 4 0 0 0 1 6" transform="translate(0 -1) scale(.95)"/>',
wallet:'<path d="M20 8V5H4a2 2 0 0 0 0 4h17v12H4a2 2 0 0 1-2-2V7m19 6h-6v4h6"/>',
filter:'<path d="M4 5h16l-6 7v7l-4 2v-9z"/>',
back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
refresh:'<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>',
print:'<path d="M6 8V2h12v6M6 17H2V8h20v9h-4M6 14h12v8H6z"/>'
};
function icon(name,cls=''){return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.spark}</svg>`}
function btn(text,action,cls='secondary',data=''){return `<button class="btn ${cls}" data-action="${action}" ${data}>${text}</button>`}
function badge(status){const c=['paid','active','open','completed'].includes(status)?'success':['processing','requested','pending'].includes(status)?'warning':['failed','rejected','cancelled'].includes(status)?'danger':'neutral';return `<span class="badge ${c}"><span class="dot"></span>${E(({paid:'Confirmed',processing:'Processing',requested:'Approval needed',open:'Open',active:'Active'})[status]||status)}</span>`}
function initial(s){return String(s||'L').split(' ').map(x=>x[0]).slice(0,2).join('')}
function shop(id){return state.shops.find(x=>x.id===id)}
function shopName(id){return shop(id)?.name||'Unassigned'}
function currentShop(){return shop(ui.shopId)||state.shops[0]}
function actor(){
 if(getWorkspaceMode()==='registered'&&ui.role!=='student'){
  const session=Auth.getSession();if(!session||session.businessId!==state.business.id)throw new Error('Sign in again to continue.');
  if(session.role==='owner')return {role:'owner',userId:session.userId};
  const person=state.staff.find(st=>st.authUserId===session.userId&&st.active);
  if(!person||!session.shopIds.includes(ui.shopId))throw new Error('This shop is outside your assigned access.');
  return {role:session.role,userId:session.userId,shopId:ui.shopId,staffId:person.id};
 }
 return ui.role==='owner'||ui.role==='student'?{role:ui.role}:{role:ui.role,shopId:ui.shopId,staffId:ui.staffId,...(ui.role==='cashier'?{counterId:'sample-counter-'+ui.shopId}:{})};
}
function scoped(){return ui.role==='owner'?(ui.scope==='all'?null:ui.scope):ui.shopId}
function txns(){return state.transactions.filter(t=>!scoped()||t.shopId===scoped())}
function persist(){try{localStorage.setItem(storeKey,JSON.stringify({role:ui.role,shopId:ui.shopId,staffId:ui.staffId,page:ui.page,scope:ui.scope,area:ui.area}));return true}catch{return false}}
function toast(message,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.innerHTML=icon(error?'help':'check')+`<span>${E(message)}</span>`;$('#toast-root').append(el);setTimeout(()=>el.remove(),4500)}
async function performAction(type,payload={},customActor){
 if(getWorkspaceMode()==='registered'){
  if(!Auth.getSession())throw new Error('Sign in again to continue.');
  const counter=Shared.getCache().counter;if(counter){if(counterView()?.locked)throw Error('Unlock this counter with your cashier PIN.');payload={...payload,counterStaffId:Auth.getSession()?.staffId,counterShiftId:counter.shiftId};}
  if((type==='REFUND'&&['owner','manager'].includes(Auth.getSession()?.role)||type==='APPROVE_REFUND'&&payload.approve===true)&&!payload.stepUpProof){
   dismiss();const proof=await access.requestStepUp({purpose:'refund',title:'Confirm this refund',description:'Verify your password before returning funds to the original payer.'});
   if(!proof)throw Object.assign(new Error('Refund cancelled. No funds were returned.'),{status:400,code:'CANCELLED'});
   payload={...payload,stepUpProof:proof.stepUpToken};
  }
  const result=await Shared.api(type==='PAY'?'/api/simulate':'/api/action',{method:'POST',body:{type,payload}});return result.entity||result.state;
 }
 return dispatch(type,payload,customActor||actor());
}
async function act(type,payload={},customActor){try{return await performAction(type,payload,customActor)}catch(e){toast(e.message,true);return null}}
function knownChargeRequest(){return pendingCharge?state.requests.find(request=>request.attemptId===pendingCharge.payload.attemptId):null}
function selectShop(id){
 if(!id)return false;
 const session=Auth.getSession();
 if(!state.shops.some(shop=>shop.id===id)||getWorkspaceMode()==='registered'&&session?.role!=='owner'&&!session?.shopIds?.includes(id))throw new Error('This shop is outside your assigned access.');
 if(id===ui.shopId)return true;
 if(knownChargeRequest())pendingCharge=null;
 if(chargeSubmitting||pendingCharge){toast('Retrieve the outstanding QR before changing the receiving shop.',true);return false}
 ui.shopId=id;ui.detailShop=id;ui.charge='';
 if(ui.role!=='owner')ui.scope=id;
 persist();return true;
}
function navigate(page,shopId){if(page==='business-plan'&&ui.role==='manager'&&state.businessPlanAccess?.canView!==true){toast('The owner must allow access to the business plan first.',true);return}invalidateShopLocationCapture();if(page!==ui.page){if(['operations','activation','shop-operations','support'].includes(ui.page))operations.leave?.();if(ui.page==='team')people.leave?.()}if(shopId&&!selectShop(shopId))return;if(page==='devices')devices.refresh();if(page==='counter-setup')counterSetup.refresh();if(page==='business-plan')businessPlan.refresh();if(page==='payment-links'){openSharedPaymentLinks();return;}if(page==='nearby')directory.refresh();ui.page=page;ui.modal=null;if(!restoringNavigation)navigation?.syncPage({page:ui.page,shopId:ui.shopId});$('#app').inert=false;persist();render();window.scrollTo({top:0,behavior:'instant'})}
async function presentKnownSettlement(pending,known){const scope=settlementScope(),workspace=getWorkspaceMode();try{await settlementAttempts.clear(...scope,pending.attemptId)}catch(error){toast(error.message,true)}if(workspace===getWorkspaceMode()&&JSON.stringify(scope)===JSON.stringify(settlementScope())&&state.settlements.some(record=>record.id===known.id))modal('settlement-detail',{id:known.id})}
function modal(kind,data={}){invalidateShopLocationCapture();if(kind==='open-settle'){const pending=pendingSettlement(),known=matchingSettlement(pending);if(known)return presentKnownSettlement(pending,known)}if(getWorkspaceMode()==='registered'&&ui.role==='student'&&['notifications','account-menu','demo-console','mobile-menu'].includes(kind))return;if(kind!=='student-scan')stopScanner();lastModalTrigger=document.activeElement;ui.modal={kind,...data,key:crypto.randomUUID()};if(!restoringNavigation)navigation?.openModal({kind,id:data.id});renderModal();requestAnimationFrame(()=>($('#modal-root [data-receipt-id]')?$('#modal-title'):($('#modal-root [autofocus]')||$('#modal-root .close-btn')))?.focus({preventScroll:true}))}
function dismiss(){invalidateShopLocationCapture();stopScanner();ui.modal=null;if(!restoringNavigation)navigation?.dismissModal();$('#app').inert=false;$('#modal-root').innerHTML='';document.body.classList.remove('modal-open');lastModalTrigger?.focus?.()}
function assignedShopSelect(){
 const session=Auth.getSession(),ids=session?.shopIds||[];
 return ids.length>1?`<select class="select assigned-shop-select" data-change="assignedShop" aria-label="Switch assigned shop">${state.shops.filter(sh=>ids.includes(sh.id)).map(sh=>`<option value="${sh.id}" ${sh.id===ui.shopId?'selected':''}>${E(sh.name)}</option>`).join('')}</select>`:'';
}
function scopeSelect(){return `<select class="select scope-select" data-change="scope" aria-label="Filter shops"><option value="all" ${ui.scope==='all'?'selected':''}>All shops</option>${state.shops.map(s=>`<option value="${s.id}" ${ui.scope===s.id?'selected':''}>${E(s.name)}</option>`).join('')}</select>`}
function heading(title,subtitle,actions='',eyebrow='YOUR BUSINESS, IN VIEW'){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="subtitle">${subtitle}</p></div><div class="page-actions">${actions}</div></div>`}
function empty(title,text,action=''){return `<div class="empty-state">${icon('payments')}<h3>${title}</h3><p>${text}</p>${action}</div>`}
function stat(label,value,note='',i='reports'){return `<div class="stat-card"><div class="stat-label">${label}${icon(i)}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`}
function qrSvg(link){try{const q=window.qrcode(0,'M');q.addData(link);q.make();return q.createSvgTag({cellSize:4,margin:16,scalable:true})}catch{return '<p>QR unavailable. Use the merchant code below.</p>'}}
function paymentLink(sid,request=null){const shared=getWorkspaceMode()==='registered',link=new URL((shared?CONNECTED_CONSUMER_ORIGIN:location.origin)+'/');link.searchParams.set('pay',sid);if(!shared)link.searchParams.set('workspace','sample');const selected=shop(sid);if(shared&&selected?.published!==true&&selected?.testAcceptanceToken)link.searchParams.set('testKey',selected.testAcceptanceToken);if(request){link.searchParams.set('request',request.id);if(!shared)link.searchParams.set('amount',request.amount)}return link.href}
function consumerIntentLink(intent){const link=new URL(CONNECTED_CONSUMER_ORIGIN+'/');link.searchParams.set('pay',intent.shopId);if(intent.requestId)link.searchParams.set('request',intent.requestId);if(intent.testKey)link.searchParams.set('testKey',intent.testKey);return link.href}
function formatStatusSummary(){let pending=state.transactions.filter(t=>t.status==='processing'&&(ui.role==='owner'||t.shopId===ui.shopId)).length;return pending?`${pending} payment${pending>1?'s':''} processing`:'Payments running smoothly'}
function chart(){
 const days=Array.from({length:7},(_,i)=>{let d=new Date();d.setDate(d.getDate()-6+i);return d});
 const values=Array(7).fill(0);for(const payment of txns().filter(t=>t.status==='paid')){const cutoff=shop(payment.shopId)?.cutoff||'00:00';const current=businessDay(Date.now(),cutoff),paid=financialTradingDay(state,payment);const age=Math.round((Date.parse(current)-Date.parse(paid))/86400000);if(age>=0&&age<7)values[6-age]+=payment.amount}
 const max=Math.max(...values,10000);const points=values.map((v,i)=>[35+i*75,155-v/max*125]);const line=points.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ');
 return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 520 205" role="img" aria-label="Confirmed collections over the last seven days"><defs><linearGradient id="chartfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cde99c" stop-opacity=".65"/><stop offset="1" stop-color="#cde99c" stop-opacity="0"/></linearGradient></defs>${[35,75,115,155].map(y=>`<line x1="25" y1="${y}" x2="505" y2="${y}" stroke="#e9ece5" stroke-dasharray="3 5"/>`).join('')}<path d="${line} L485,165 L35,165Z" fill="url(#chartfill)"/><path d="${line}" stroke="#507c31" stroke-width="2.5" fill="none" stroke-linejoin="round"/>${points.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${i===6?5:3}" fill="${i===6?'#cdef72':'#507c31'}" stroke="white" stroke-width="2"><title>${date(days[i])}: ${money(values[i])}</title></circle>`).join('')}${days.map((d,i)=>`<text x="${35+i*75}" y="194" text-anchor="middle" fill="#879080" font-size="11">${i===6?'Today':i===5?'Yesterday':(6-i)+' days ago'}</text>`).join('')}</svg></div>`;
}
function recentTable(list,limit=6){
 if(!list.length)return empty('Nothing here yet','Payments will appear here as soon as they arrive.');
 return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Payment</th><th>Shop</th><th>Status</th><th>Time</th><th class="amount">Amount</th><th></th></tr></thead><tbody>${[...list].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,limit).map(t=>`<tr data-action="transaction" data-id="${t.id}" tabindex="0" role="button" aria-label="View payment ${E(t.reference)}"><td><div class="transaction-name"><span class="transaction-avatar">${E(initial(t.payer))}</span><span><strong>${E(t.payer)}</strong><small>${E(t.reference)}</small></span></div></td><td>${E(shopName(t.shopId))}</td><td>${badge(t.status)}</td><td><span>${time(paymentDate(t))}</span><small>${today(paymentDate(t))?'Today':date(paymentDate(t))}</small></td><td class="amount">${money(t.amount)}</td><td>${icon('chevron')}</td></tr>`).join('')}</tbody></table></div>`;
}
function shopCard(s){
 const m=metrics(s.id);let max=Math.max(...state.shops.map(x=>metrics(x.id).todayGross),1);
 return `<article class="shop-card"><div class="shop-top"><div class="shop-icon" style="--shop-color:${E(s.color||'#dfeabf')}">${icon('shops')}</div>${badge(s.accepting?'active':'paused')}</div><h3 class="shop-name">${E(s.name)}</h3><p class="shop-area">${icon('pin')}${E(s.area)} · ${E(s.code)}</p><div class="shop-number">${money(m.currentNet)}<span>Current collection period</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(3,m.todayGross/max*100)}%"></div></div><div class="shop-footer"><span>${m.todayCount} payments today</span><button class="text-btn" data-action="shop" data-id="${s.id}">View shop ${icon('arrow')}</button></div></article>`;
}
function overview(){
 const owner=ui.role==='owner',m=metrics(scoped()),sh=currentShop();
 const greeting=new Date().getHours()<12?'Good morning':new Date().getHours()<17?'Good afternoon':'Good evening';
 const name=getWorkspaceMode()==='registered'?(Auth.getSession()?.name?.split(' ')[0]||'there'):owner?(getWorkspaceMode()==='registered'?Auth.getSession()?.name?.split(' ')[0]:state.business.ownerName?.split(' ')[0])||'Akua':ui.role==='manager'?sh.manager||'Ama':'Kojo';
 const approvals=state.refunds.filter(r=>r.status==='requested'&&(!scoped()||r.shopId===scoped()));
 return heading(`${greeting}, ${E(name)}<span class="greeting-dot">.</span>`,owner?'A clear view of your money. Across every shop.':`${E(sh.name)} · Your shop, ready for the day.`,owner?`${scopeSelect()}${btn(icon('plus')+' Take a payment','open-charge','primary')}`:btn(icon('qr')+' Take a payment','go-checkout','primary'))
 +`${m.priorPeriodAllocations?`<div class="callout warning"><span>Includes ${money(m.priorPeriodAllocations)} assigned to a shop after an earlier trading period. Those funds were already in the merchant account.</span></div>`:''}`
 +`<div class="dashboard-grid"><section class="account-card"><div class="account-label">${icon(owner?'wallet':'shops')}${owner?'Merchant balance':'Current shop collections'}<button class="icon-btn balance-eye" data-action="toggle-balance" aria-label="Show or hide balance">${icon('eye')}</button></div><div class="account-value">${ui.hideBalance?'••••••':money(owner?metrics().balance:m.currentNet)}</div><p class="account-meta">${owner?'One merchant account. Every shop connected.':'Since your last daily close.'}</p><div class="account-pills"><span><span class="live-dot"></span>${owner?'Available '+money(metrics().available):m.currentCount+' confirmed payments'}</span>${owner?`<span>${E(state.business.accountNumber)} ${btn(icon('copy'),'copy-account','ghost small','aria-label="Copy account number"')}</span>`:''}</div><div class="account-actions">${owner?btn('Settle to bank '+icon('arrow'),'open-settle','light'):btn('Close shop day '+icon('arrow'),'open-close','light',`data-id="${sh.id}"`)}${btn(owner?'Account details':'Show QR',owner?'account-details':'shop-qr','outline-light',owner?'':`data-id="${sh.id}"`)}</div><div class="account-decoration">${icon('spark')}</div></section><section class="panel owner-chart"><div class="panel-heading"><div><div class="eyebrow">THE LAST 7 TRADING DAYS</div><h2 class="panel-title">Collections, at a glance</h2></div><span class="badge neutral">By shop cutoff</span></div>${chart()}</section></div>`
 +`<div class="stat-grid">${stat('Collected today',money(m.todayGross),`${m.todayCount} confirmed payments`,'payments')}${stat('Still processing',money(m.pending),'Included after confirmation','clock')}${stat('Refunded today',money(m.todayRefunds),'Returned to original payers','refund')}${stat(owner?'Connected shops':'Current period',owner?state.shops.length:m.currentCount,owner?`${state.shops.filter(s=>s.accepting).length} accepting payments`:'Payments since last close','shops')}</div>`
 +(owner&&state.business.verificationStatus==='approved-demo'&&state.transactions.length===0?`<div class="callout success first-sale-callout">${icon('check')}<span><strong>Your business is ready for its first payment.</strong><br>Display your shop QR, invite a cashier and enable the receiving phone.</span>${btn('Show shop QR','shop-qr','secondary small',`data-id="${sh.id}"`)}${btn('Invite your team','go-team','ghost small')}</div>`:'')
 +(approvals.length?`<div class="callout warning">${icon('bell')}<span><strong>${approvals.length} refund approval${approvals.length>1?'s':''} waiting.</strong> Your team needs a decision.</span>${btn('Review','approvals','small secondary')}</div>`:'')
 +`<div class="section-heading"><div><h2 class="section-title">${owner?'Your shops':'Your shop activity'}</h2><p class="muted">${owner?'Independent counters. One business.':'Every confirmed payment, accounted for.'}</p></div>${owner?btn('Manage shops '+icon('arrow'),'go-shops','ghost'):btn('View payments '+icon('arrow'),'go-activity','ghost')}</div>`
 +(owner?`<div class="shops-grid">${(scoped()?state.shops.filter(s=>s.id===scoped()):state.shops).map(shopCard).join('')}</div>`:sh.lastClosing?'':`<div class="callout">${icon('shield')}<span>Closing the day resets this shop’s collection period. The merchant’s money stays in the shared account.</span></div>`)
 +`<section class="panel section-gap"><div class="panel-heading"><div><h2 class="panel-title">Latest payments</h2><p class="muted text-small">Confirmation you can count on.</p></div><button class="text-btn" data-action="go-activity">View all ${icon('arrow')}</button></div>${recentTable(txns())}</section>`
 +`<div class="lux-strip"><div class="lux-symbol">${icon('spark')}</div><div><strong>A little clarity for your business.</strong><span>Ask Lux about your collections, shops or settlements.</span></div>${btn('Ask Lux '+icon('arrow'),'go-lux','secondary small')}</div>`;
}
function shopsPage(){
 return heading('Every shop. One view.','Each location runs its own day. You keep the full picture.',btn(icon('plus')+' Add a shop','add-shop','primary'),'YOUR LOCATIONS')
 +`<div class="callout">${icon('wallet')}<span><strong>One account · ${E(state.business.accountNumber)}</strong><br>All shop payments collect here. Shop totals reset at close; your merchant funds remain.</span>${btn('Account details','account-details','small ghost')}</div>`
 +`<div class="shops-grid section-gap">${state.shops.map(shopCard).join('')}</div>`
 +`<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">How your shops connect</h2>${icon('shield')}</div><div class="connection-flow"><div><span class="connection-node">${icon('shops')}</span><strong>${state.shops.length} independent shops</strong><p>Own QR, staff and daily collections</p></div>${icon('arrow')}<div><span class="connection-node lime">${icon('wallet')}</span><strong>One merchant account</strong><p>All confirmed funds, in one place</p></div>${icon('arrow')}<div><span class="connection-node">${icon('settlements')}</span><strong>Your business bank</strong><p>Owner-controlled settlement</p></div></div></section>`;
}
function shopDetail(){
 const s=shop(ui.detailShop)||currentShop(),m=metrics(s.id),team=state.staff.filter(t=>(t.shopIds||[t.shopId]).includes(s.id)),closed=state.closings.filter(c=>c.shopId===s.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
 return heading(E(s.name),`${E(s.area)} · ${E(s.code)}`,`${btn(icon('qr')+' Shop QR','shop-qr','secondary',`data-id="${s.id}"`)}${btn('Close shop day','open-close','primary',`data-id="${s.id}"`)}`,'SHOP OVERVIEW')
 +`<div class="stat-grid">${stat('Current collections',money(m.currentNet),'Resets when this shop closes','wallet')}${stat('Collected today',money(m.todayGross),`${m.todayCount} confirmed payments`,'payments')}${stat('Processing',money(m.pending),'Awaiting confirmation','clock')}${stat('Shop team',team.filter(t=>t.active).length,'Active staff members','team')}</div>`
 +`<div class="split-grid"><section class="panel"><div class="panel-heading"><h2 class="panel-title">Shop details</h2>${btn(icon('settings')+' Edit','edit-shop','ghost small',`data-id="${s.id}"`)}</div><div class="detail-list">${[['Area',s.area],['Category',s.category],['Merchant code',s.code],['Manager',s.manager],['Hours',s.hours||'7:00 am – 10:00 pm'],['Acceptance',s.accepting?'Accepting Lumo':'Paused']].map(([k,v])=>`<div class="detail-row"><span>${k}</span><strong>${E(v)}</strong></div>`).join('')}</div><div class="panel-bottom">${btn(s.accepting?'Pause payments':'Resume payments','toggle-shop','secondary full',`data-id="${s.id}"`)}</div></section><section class="panel"><div class="panel-heading"><h2 class="panel-title">Daily closing history</h2>${icon('calendar')}</div>${closed.length?`<div class="activity-list">${closed.slice(0,4).map(c=>`<button class="activity-item" data-action="closing-detail" data-id="${c.id}"><span class="transaction-avatar">${icon('check')}</span><span><strong>${date(c.createdAt)} · ${time(c.createdAt)}</strong><small>${c.transactionIds?.length||0} payments archived</small></span><strong>${money(c.net)}</strong>${icon('chevron')}</button>`).join('')}</div>`:empty('Your first close awaits','A permanent daily report appears here after closing.')}</section></div>`
 +`<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Shop payments</h2></div>${recentTable(state.transactions.filter(t=>t.shopId===s.id),12)}</section>`;
}
function activity(){return reporting.renderActivity();}
function collectionContext(){
 const s=currentShop(),session=Auth.getSession();
 const shops=ui.role==='owner'?state.shops:getWorkspaceMode()==='sample'?[s]:state.shops.filter(sh=>session?.shopIds?.includes(sh.id));
 return {state,ui,shop:s,metrics:metrics(s.id),money,E,icon,qrSvg,paymentLink,time,soundPanel,shops,submitting:chargeSubmitting,pending:!!pendingCharge,receiver:receiverStatus(s.id),freshReceiptId:freshReceipts.get(s.id),receiptWhen:t=>date(t.confirmedAt||t.createdAt)+' · '+time(t.confirmedAt||t.createdAt),shared:getWorkspaceMode()==='registered'};
}
function home(){return renderHome(collectionContext())}
function checkout(){return renderCollections(collectionContext())}
function administration(){return renderAdministration({state,ui,shop:currentShop(),metrics:metrics(),shopMetrics:metrics(currentShop().id),money,E,icon,registered:getWorkspaceMode()==='registered'})+(['owner','manager'].includes(ui.role)?`<section class="admin-group"><h2>Shop floor</h2><div class="admin-tools"><button class="admin-tool" data-action="go-counter-setup"><span class="admin-tool-icon">${icon('phone')}</span><span><strong>Counter phones</strong><small>Dedicated or shared cashier access</small></span>${icon('chevron')}</button></div></section>`:'')+`<section class="admin-group appearance-settings-group"><h2>This device</h2><div class="admin-tools"><button class="admin-tool" data-action="appearance-settings"><span class="admin-tool-icon">${icon('phone')}</span><span><strong>Appearance</strong><small data-appearance-label>${appearanceLabels[appearancePreference()]}</small></span>${icon('chevron')}</button></div></section>`}

function settlements(){
 const m=metrics(),pending=pendingSettlement();
 return heading('Your money, on your terms.','Move confirmed proceeds to your verified business destination.',btn('Settle funds '+icon('arrow'),'open-settle','primary'),'SETTLEMENTS')
 +`${pending?`<div class="callout warning"><span>A settlement for <strong>${money(pending.amount)}</strong> needs its original outcome checked. Its amount and destination are saved.</span>${btn('Check original settlement','open-settle','secondary small')}</div>`:''}`
 +`<div class="stat-grid three">${stat('Merchant balance',money(m.balance),'All shops, one account','wallet')}${stat('Available to settle',money(m.available),'Pending payouts already reserved','settlements')}${stat('Completed settlements',money(m.settled),'Paid to your business destination','check')}</div>`
 +`<div class="split-grid"><section class="panel"><div class="panel-heading"><h2 class="panel-title">Settlement destination</h2>${icon('shield')}</div><div class="bank-destination"><div class="bank-icon">GCB</div><div><strong>${E(state.business.destination||'GCB Bank · 1130 0456 7890')}</strong><p>${E(state.business.name)}</p><span class="badge success">Verified · demo</span></div></div><div class="panel-bottom">${btn('Change destination','edit-destination','ghost small')}</div></section><section class="panel"><div class="panel-heading"><h2 class="panel-title">How settlement works</h2>${icon('clock')}</div><div class="detail-list"><div class="detail-row"><span>Method</span><strong>Owner initiated</strong></div><div class="detail-row"><span>Prototype fee</span><strong>GH₵0.00</strong></div><div class="detail-row"><span>Arrival</span><strong>Simulated confirmation</strong></div></div><p class="notice">Fees and timing shown here are demonstration terms. Live bank settlement is not connected.</p></section></div>`
 +`<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Settlement history</h2>${btn(icon('download')+' Export','export-settlements','ghost small')}</div>${state.settlements.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Destination</th><th>Status</th><th>Date</th><th class="amount">Amount</th><th></th></tr></thead><tbody>${[...state.settlements].reverse().map(t=>`<tr data-action="settlement-detail" data-id="${t.id}" tabindex="0" role="button"><td><strong>${E(t.reference)}</strong></td><td>${E(t.destination)}</td><td>${badge(t.status)}</td><td>${date(t.createdAt)}</td><td class="amount">${money(t.amount)}</td><td>${icon('chevron')}</td></tr>`).join('')}</tbody></table></div>`:empty('Your proceeds are ready','Your first settlement will appear here.')}</section>`;
}
function team(){
 if(getWorkspaceMode()==='registered'&&ui.role==='owner')return people.render();
 const list=state.staff.filter(s=>(getWorkspaceMode()!=='registered'||s.authUserId)&& (ui.role==='owner'||(s.shopIds||[s.shopId]).includes(ui.shopId)));
 return heading('Good people. Clear permissions.','Give each person the access they need to run their shop.',ui.role==='owner'?btn(icon('plus')+' Invite team member','add-staff','primary'):'','YOUR TEAM')
 +`${getWorkspaceMode()==='sample'?`<div class="callout section-gap">${icon('shield')}<span>This sample team uses demo roles. Create your merchant account to try individual usernames, passwords, invitations and shop assignments.</span>${btn('Start merchant signup','onboarding','secondary small')}</div>`:''}`
 +`<div class="staff-grid">${list.map(s=>`<article class="panel staff-card"><div class="staff-top"><span class="avatar large" style="background:${s.role==='manager'?'#e8dfef':'#e5edcd'}">${E(initial(s.name))}</span>${badge(s.active?'active':'paused')}</div><h3>${E(s.name)}</h3><p class="muted">${s.role==='manager'?'Shop manager':'Cashier'} · ${E((s.shopIds||[s.shopId]).map(shopName).join(', '))}</p><div class="permission-note">${icon('shield')}<span>${s.role==='manager'?'Shop activity, daily close and limited refunds':'Payment requests and assigned shop receipts'}</span></div>${ui.role==='owner'?btn(s.active?'Suspend access':'Restore access','toggle-staff','ghost small',`data-id="${s.id}"`):''}</article>`).join('')}</div>`
 +`<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Who can do what?</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Permission</th><th>Owner</th><th>Shop manager</th><th>Cashier</th></tr></thead><tbody>${[['Take payments','Yes','Own shop','Own shop'],['See merchant balance','Yes','—','—'],['Close shop day','Any shop','Own shop','—'],['Approve refunds','Within available funds','Up to GH₵100','Request approval'],['Settle to bank','Yes','—','—'],['Manage all shops and staff','Yes','—','—']].map(r=>`<tr>${r.map((c,i)=>`<${i?'td':'th'}>${c}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div><p class="notice">${getWorkspaceMode()==='registered'?'Your shared account and assigned shops determine access. The server checks permissions for every change.':'Role controls are simulated in this browser-only sample.'}</p></section>`;
}
function reports(){return reporting.renderReport();}
function closePage(){
 const s=currentShop(),m=metrics(s.id);
 return heading('Close with confidence.',`${E(s.name)} · A permanent record of this collection period.`,btn('Review & close day','open-close','primary',`data-id="${s.id}"`),'DAILY CLOSE')
 +`${m.priorPeriodAllocations?`<div class="callout warning"><span>Includes ${money(m.priorPeriodAllocations)} assigned from an earlier period. The receipt’s original confirmation time remains in its history.</span></div>`:''}`
 +`<div class="stat-grid three">${stat('Confirmed collections',money(m.currentGross),`${m.currentCount} payments this period`,'payments')}${stat('Refunds this period',money(m.currentRefunds),'Completed refunds','refund')}${stat('Net collections',money(m.currentNet),'Archived when you close','reports')}</div>`
 +`<div class="callout success">${icon('shield')}<span><strong>Your merchant’s funds stay put.</strong><br>Closing saves this report and starts a new shop collection period at zero. The shared account balance stays unchanged.</span></div><section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Payments in this period</h2></div>${recentTable(m.currentTransactions||state.transactions.filter(t=>t.shopId===s.id&&t.status==='paid'),30)}</section>`;
}
function support(){
 const list=state.tickets.filter(t=>ui.role==='owner'||t.shopId===ui.shopId);
 return heading('We’re here for your business.','Get help with a payment, settlement or shop setup.',btn(icon('plus')+' Get help','support-ticket','primary'),'HELP & SUPPORT')
 +`<div class="support-grid">${[['payments','Payment help','Track a missing receipt or report a wrong amount.'],['settlements','Settlement help','Understand a pending or failed payout.'],['phone','Shop & device help','Get your receiving phone and team ready.']].map(([i,t,p])=>`<button class="panel support-card" data-action="support-ticket" data-subject="${t}"><span class="support-icon">${icon(i)}</span><h3>${t}</h3><p>${p}</p><span class="text-btn">Get help ${icon('arrow')}</span></button>`).join('')}</div><section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Your support cases</h2></div>${list.length?`<div class="activity-list">${list.map(t=>`<button class="activity-item" data-action="ticket-detail" data-id="${t.id}"><span class="transaction-avatar">${icon('help')}</span><span><strong>${E(t.subject)}</strong><small>${E(t.id)} · ${date(t.createdAt)}</small></span>${badge(t.status)}${icon('chevron')}</button>`).join('')}</div>`:empty('All clear for now','Your support cases will appear here.')}</section><p class="notice">Support cases stay within this prototype. No message is sent to an external team.</p>`;
}
function security(){
 const session=Auth.getSession();if(!session||session.businessId!==state.business.id)return empty('Sample access','Use your registered business to manage account security.');
 return securityPage({session,capabilities:Auth.getCapabilities(),users:session.role==='owner'?Auth.listUsers(state.business.id):[Auth.getUser(session.userId)],sessions:Auth.listSessions(state.business.id,session),audit:Auth.getAuthAudit(state.business.id).filter(a=>session.role==='owner'||a.userId===session.userId)});
}
function settings(){
 return heading('Your business, your way.','Manage your details, receiving phone and business setup.','','BUSINESS SETTINGS')
 +`<div class="split-grid"><section class="panel"><div class="panel-heading"><h2 class="panel-title">Business profile</h2>${icon('shops')}</div><form data-form="business" class="form-body"><label class="field"><span class="label">Trading name</span><input class="input" name="name" value="${E(state.business.name)}" required maxlength="70"></label><label class="field"><span class="label">Owner name</span><input class="input" name="ownerName" value="${E(state.business.ownerName)}" required maxlength="60"></label><div class="field"><span class="label">Merchant virtual account</span><div class="readonly-field">${E(state.business.accountNumber)} ${icon('shield')}</div><span class="hint">One account for all your shops.</span></div><button class="btn primary" type="submit">Save details</button></form></section><section class="panel"><div class="panel-heading"><h2 class="panel-title">Payment announcements</h2>${icon('sound')}</div>${soundPanel()}<div class="panel-bottom">${btn('Manage sound','sound-settings','secondary full')}</div></section></div>`
 +`<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Explore your setup</h2></div><div class="settings-links"><button data-action="onboarding">${icon('shops')}<span><strong>Merchant signup</strong><small>Start at signup, or continue a business you have already created.</small></span>${icon('chevron')}</button><button data-action="privacy">${icon('shield')}<span><strong>Prototype privacy & security</strong><small>Understand what is stored and what is simulated.</small></span>${icon('chevron')}</button><button data-action="demo-console">${icon('refresh')}<span><strong>Prototype controls</strong><small>Try payment scenarios and explore sample data.</small></span>${icon('chevron')}</button></div></section>`;
}
function soundConfig(){try{return JSON.parse(localStorage.getItem('lumo-sound')||'null')}catch{return null}}
function canReceive(shopId){
 if(!shop(shopId)||ui.role==='student'||signup.isActive())return false;
 if(getWorkspaceMode()==='sample')return true;
 const session=Auth.getSession();if(!session||session.businessId!==state.business.id)return false;
 if(session.role==='owner')return true;
 return session.shopIds.includes(shopId)&&state.staff.some(st=>st.authUserId===session.userId&&st.active&&(st.shopIds||[st.shopId]).includes(shopId));
}
function receivingEnabled(sound=soundConfig()){
 if(getWorkspaceMode()==='registered'){const current=devices.getDevices().find(d=>d.deviceId===devices.getDeviceId()||d.id===devices.getDeviceId());return ui.role!=='student'&&devices.canAnnounce(current?.shopId||ui.shopId);}
 if(!sampleAudioUnlocked||!sound?.enabled||sound.deviceId!==deviceId||!canReceive(sound.shopId))return false;
 if(getWorkspaceMode()==='sample')return !sound.businessId||sound.businessId===state.business.id;
 return sound.businessId===state.business.id&&sound.userId===Auth.getSession()?.userId;
}
function receiverStatus(shopId=ui.shopId){
 if(globalThis.navigator?.onLine===false||getWorkspaceMode()==='registered'&&Shared.connectionStatus().status==='offline')return {state:'offline',label:'Offline',detail:'Connection lost. Check confirmed receipts when the connection returns.'};
 if(getWorkspaceMode()==='registered'){
  const current=devices.getDevices().find(d=>d.deviceId===devices.getDeviceId()||d.id===devices.getDeviceId());
  if(devices.getAnnouncementFailures().some(f=>f.shopId===shopId&&f.needsRetest)||current?.shopId===shopId&&current?.announcementFailed)return {state:'failed',label:'Sound failed',detail:'A confirmed payment could not be spoken. Check its receipt and retest sound.'};
  if(devices.canAnnounce(shopId))return {state:'ready',label:'Ready to receive',detail:'This open, connected tab announces confirmed payments.'};
  if(current?.revokedAt||current?.sessionValid===false)return {state:'muted',label:'Sign-in needed',detail:'Restore this receiving phone from a valid sign-in.'};
  if(!current||current.shopId!==shopId)return {state:'muted',label:'Pair this phone',detail:'Pair this phone with the selected shop and test sound.'};
  return {state:'muted',label:current.enabled===false?'Sound off':'Tap to enable sound',detail:'Keep this tab open and complete a sound test before serving.'};
 }
 if(sampleAudioFailed)return {state:'failed',label:'Sound failed',detail:'Sound could not play. Check the receipt and retest the receiving phone.'};
 return soundConfig()?.shopId===shopId&&receivingEnabled()?{state:'ready',label:'Ready to receive',detail:'This open tab announces confirmed sample payments.'}:{state:'muted',label:'Sound off',detail:'Enable and test sound on this phone. Visible receipts remain available.'};
}
function soundPanel(){
 const current=getWorkspaceMode()==='registered'?devices.getDevices().find(d=>d.deviceId===devices.getDeviceId()||d.id===devices.getDeviceId()):soundConfig(),on=receivingEnabled(current);
 return `<div class="sound-status"><span class="sound-orb ${on?'on':''}">${icon(on?'sound':'mute')}</span><div><strong>${on?'Announcements are on':'Turn on payment announcements'}</strong><p>${on?E(shopName(current?.shopId))+' · This tab is the receiving device.':'Hear the exact amount. Keep your hands free.'}</p></div></div>`;
}
function nearby(){return directory.render();}
function lux(){
 const chat=merchantChat.sync();
 return heading('A clearer view, with Lux.',`Viewing ${E(scoped()?shopName(scoped()):'all shops')}. Answers use confirmed Lumo records in this scope.`,ui.role==='owner'?scopeSelect():'','LUX FOR BUSINESS')+renderMerchantLux({view:chat,state:luxState(),actor:luxActor(),connected:getWorkspaceMode()==='registered'});
}
function topbarAccess(student,owner,manager){
 if(student)return getWorkspaceMode()==='sample'?`<button class="btn ghost small" data-action="role-switch">Switch experience ${icon('down')}</button>`:`<button class="btn ghost small" data-action="merchant-signin">Merchant sign in ${icon('arrow')}</button>`;
 const registered=getWorkspaceMode()==='registered',session=registered?Auth.getSession():null;
 return `<button class="icon-btn" data-action="notifications" aria-label="Notifications">${icon('bell')}<span class="notification-dot"></span></button><button class="user-chip" data-action="${registered?'account-menu':'role-switch'}" aria-label="${registered?'Your account':'Switch experience'}"><span class="avatar">${session?E(initial(session.name)):owner?E(initial(state.business.ownerName)):manager?'AM':'KM'}</span><span>${session?E(session.username):owner?'Owner':manager?'Manager':'Cashier'}</span>${icon('down')}</button>`;
}
let renderedFormContext='',markupContext='',backgroundRender=false,lastRenderedActor='',renderedModalActor='';
function writeAppMarkup(html){const next=[formContext(),signup.isActive()?'signup':access?.isActive()?'access':'workspace'].join(':');updateMarkup($('#app'),html,{replace:next!==markupContext,preserveFields:backgroundRender});markupContext=next;}
function actorContext(){const session=Auth.getSession(),counter=counterView();return JSON.stringify([getWorkspaceMode(),Shared.getAuthEpoch(),state.business.id,session?.id,session?.userId,session?.role||ui.role,[...(session?.shopIds||[])].sort(),counter?.staffId,counter?.shiftId,counter?.locked])}
function formContext(){return JSON.stringify([actorContext(),ui.page,ui.shopId])}
function render(options={}){const previous=backgroundRender;backgroundRender=options.background===true;try{return renderPage()}finally{backgroundRender=previous}}
function renderPage(){
 state=getState();const actor=actorContext();if(lastRenderedActor&&actor!==lastRenderedActor){stopScanner();ui.modal=null}lastRenderedActor=actor;merchantChat.sync();
 if(getWorkspaceMode()==='registered'&&counterView()){ui.role='cashier';if(signup.isActive())signup.setActive(false);if(access?.isActive())access.hide()}
 if(getWorkspaceMode()==='registered'&&ui.role!=='student'&&!signup.isActive())access?.enforceRecoveryCheckpoint?.();
 if(cashierMode()&&!signup.isActive()&&!access?.isActive()){
  const session=Auth.getSession();
  if(getWorkspaceMode()==='registered'&&!session){access.show('login');return}
  if(session){ui.role='cashier';ui.shopId=counterView()?.shopId||session.shopIds?.[0]||ui.shopId;ui.staffId=session.staffId||state.staff.find(person=>person.authUserId===session.userId)?.id||''}
  const focus=captureFocus($('#app'));writeAppMarkup(cashier.render());renderModal();restoreFocus($('#app'),focus);cashier.afterRender?.();return;
 }
 const draftContext=formContext(),mainFocus=renderedFormContext===formContext()?captureFocus($('#app')):null;
 const homePanels=renderedFormContext===draftContext&&ui.page==='home'?[...document.querySelectorAll('#app details[data-home-panel]')].map(panel=>({id:panel.dataset.homePanel,open:panel.open})):[];
 if(access?.isActive()){
  stopScanner();$('#app').inert=false;writeAppMarkup(access.render());$('#modal-root').innerHTML='';document.body.classList.remove('modal-open');return;
 }
 if(!signup.isActive()&&getWorkspaceMode()==='registered'&&ui.role!=='student'){
  const session=Auth.getSession();
  if(!session||session.businessId!==state.business.id){access.show(Auth.hasOwner(state.business.id)?'login':'secure');return}
  ui.role=session.role;
  if(session.role!=='owner'){
   if(!session.shopIds.includes(ui.shopId))ui.shopId=session.shopIds.find(id=>state.shops.some(sh=>sh.id===id))||'';
   ui.staffId=state.staff.find(st=>st.authUserId===session.userId&&st.active)?.id||'';
   if(!ui.shopId||!ui.staffId){access.show('login');return}
  }else ui.staffId='';
 }
 if(signup.isActive()){
  const focused=document.activeElement,focusedName=focused?.name,caret=focused?.selectionStart;
  stopScanner();$('#app').inert=false;writeAppMarkup(signup.render());$('#modal-root').innerHTML='';document.body.classList.remove('modal-open');
  const stage=$('#app form[data-signup-step]')?.dataset.signupStep||($('.signup-shell')?.classList.contains('is-success')?'success':'welcome');
  if(stage!==lastSignupStage){lastSignupStage=stage;requestAnimationFrame(()=>{($('#app [autofocus]')||$('#signup-heading'))?.focus({preventScroll:true});window.scrollTo(0,0);$('.signup-main')?.scrollTo(0,0)})}
  else if(focusedName){const restored=[...$('#app').querySelectorAll('input,select,textarea')].find(x=>x.name===focusedName);if(restored){restored.focus({preventScroll:true});try{restored.setSelectionRange(caret,caret)}catch{}}}
  return;
 }const focus=document.activeElement?.id,sel=document.activeElement?.selectionStart;
 const owner=ui.role==='owner',student=ui.role==='student',manager=ui.role==='manager';
 const nav=student?[]:[['home','home','Home'],['checkout','qr','Collect'],['administration','settings','Administration']];
 const allowed=student?['nearby']:owner?['home','checkout','administration','overview','shops','shop-detail','activity','settlements','team','reports','settings','support','lux','security','activation','shop-operations','operations','devices','counter-setup','business-plan']:manager?['home','checkout','administration','overview','activity','close','team','reports','support','lux','security','activation','shop-operations','operations','devices','counter-setup','business-plan']:['home','checkout','administration','activity','support','security','activation','shop-operations','devices'];
 if(ui.role==='manager'&&state.businessPlanAccess?.canView!==true){const i=allowed.indexOf('business-plan');if(i>=0)allowed.splice(i,1)}
 if(!allowed.includes(ui.page))ui.page=allowed[0];
 const inCollect=ui.page==='checkout',inHome=ui.page==='home';
 const activeNav=page=>page===(inHome?'home':inCollect?'checkout':'administration');
 const currentTitle=({home:'Home',checkout:'Collect',administration:'Administration',overview:'Business overview',activity:'Payments & refunds',shops:'Shops',settlements:'Settlements',team:'Team & access',reports:'Reports',lux:'Ask Lux',close:'Close shop day',settings:'Business settings',support:'Help & support','shop-detail':'Shop details',nearby:'Campus Pay',security:'Account & security',activation:'Get shop ready','shop-operations':'Run this shop',operations:'Operations',devices:'Receiving phones','counter-setup':'Counter phones','business-plan':'Business plan'})[ui.page]||'Administration';
 const pages={home,overview,administration,shops:shopsPage,'shop-detail':shopDetail,activity,settlements,team,reports,checkout,close:closePage,support,settings,nearby,lux,security,activation:()=>operations.render('activation'),'shop-operations':()=>operations.render('shop-operations'),operations:()=>operations.render('operations'),devices:()=>devices.render(),'counter-setup':()=>counterSetup.render(),'business-plan':()=>businessPlan.render()};
 writeAppMarkup(`<div class="app-shell ${student?'student-mode':'collections-app'}">${!student?`<aside class="sidebar"><a class="brand" href="#" data-action="go-home"><span class="canonical-wordmark">lumo</span><span class="brand-qualifier">merchant</span></a><button class="business-switch" data-action="${getWorkspaceMode()==='registered'?'account-menu':'role-switch'}"><span class="avatar">${E(initial(state.business.name))}</span><span><strong>${E(state.business.name)}</strong><small>${owner?'Business owner':ui.role==='manager'?'Shop manager':'Cashier'}</small></span>${icon('down')}</button><div class="nav-label">YOUR WORKSPACE</div><nav class="sidebar-nav" aria-label="Main navigation">${nav.map(([p,i,t])=>`<button class="nav-item ${activeNav(p)?'active':''}" data-action="nav" data-page="${p}" ${activeNav(p)?'aria-current="page"':''}>${icon(i)}<span>${t}</span>${icon('chevron')}</button>`).join('')}</nav><div class="collections-sidebar-note"><span>${icon('qr')}</span><h2>Made for the next customer.</h2><p>Enter an amount, show your QR and keep things moving.</p></div><div class="sidebar-foot"><div class="demo-card"><span class="demo-label"><span class="dot"></span> TEST MONEY PROTOTYPE</span><p>${getWorkspaceMode()==='sample'?'Explore a sample business.':'Your access follows your account.'}</p><button class="text-btn" data-action="${getWorkspaceMode()==='sample'?'demo-console':'open-sample'}">${getWorkspaceMode()==='sample'?'Demo controls':'Open sample business'} ${icon('arrow')}</button></div><div class="sidebar-signature"><span class="live-dot"></span> A little clearer. Every day.</div></div></aside>`:''}<div class="main-shell"><header class="topbar"><a class="mobile-brand" href="#" data-action="go-home"><strong class="canonical-wordmark">lumo</strong><span class="brand-qualifier">merchant</span></a><div class="breadcrumb">${student?'Lumo / Campus Pay':`${E(state.business.name)} <span>/</span> ${currentTitle}`}</div><div class="topbar-actions"><span class="live-status"><span class="live-dot"></span>${getWorkspaceMode()==='registered'?'Shared test workspace':'Sample workspace'}</span>${topbarAccess(student,owner,manager)}</div></header><main class="page ${student?'student-page':inCollect?`checkout-page ${(ui.collectMode||'amount')==='amount'?'collect-amount-page':''}`:inHome?'home-page':ui.page==='administration'?'administration-page':''}">${getWorkspaceMode()==='registered'?connectionBanner():''}${!student&&!inCollect&&!inHome&&ui.page!=='administration'?`<button class="admin-back text-btn" data-action="go-administration">${icon('back')} Administration</button>`:''}${pages[ui.page]()}</main><footer class="page-footer"><span>© ${new Date().getFullYear()} Lumo Merchant</span><span>Test money · Bank and SMS not connected</span><button data-action="privacy">About this prototype</button></footer></div>${!student?`<nav class="bottom-nav" aria-label="Mobile navigation">${nav.map(([p,i,t])=>`<button class="${activeNav(p)?'active':''}" data-action="nav" data-page="${p}" ${activeNav(p)?'aria-current="page"':''}>${icon(i)}<span>${t}</span></button>`).join('')}</nav>`:getWorkspaceMode()==='sample'?`<button class="floating-demo" data-action="demo-console">${icon('refresh')}Switch experience</button>`:''}</div>`);

 renderModal();if(campusPay.isActive())renderCampusPay();
 if(draftContext===formContext())for(const panel of homePanels){const restored=[...document.querySelectorAll('#app details[data-home-panel]')].find(node=>node.dataset.homePanel===panel.id);if(restored)restored.open=panel.open}
 if(draftContext===formContext()&&!ui.modal&&!campusPay.isActive())restoreFocus($('#app'),mainFocus);
 renderedFormContext=formContext();
}

function field(label,name,value='',extra=''){return `<label class="field"><span class="label">${label}</span><input class="input" name="${name}" value="${E(value)}" ${extra}></label>`}
function shopOptions(selected=ui.shopId){return state.shops.map(s=>`<option value="${s.id}" ${s.id===selected?'selected':''}>${E(s.name)}</option>`).join('')}
function modalShell(title,body,footer='',wide=false){return `<div class="modal-backdrop" data-action="backdrop"><section class="modal ${wide?'wide':''} ${ui.modal.kind==='appearance-settings'?'appearance-modal':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-key="${ui.modal.key}"><header class="modal-header"><h2 id="modal-title" tabindex="-1">${title}</h2><button class="icon-btn close-btn" data-action="dismiss" aria-label="Close dialog">${icon('close')}</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`}
function renderModal(){
 if(!ui.modal){renderedModalActor='';$('#app').inert=false;updateMarkup($('#modal-root'),'');document.body.classList.remove('modal-open');return}
 const modalActor=actorContext(),old=$('[data-modal-key]'),same=old?.dataset.modalKey===ui.modal.key&&renderedModalActor===modalActor,modalFocus=same?captureFocus($('#modal-root')):null,previousReceipt=same?$('#modal-root [data-receipt-id]')?.dataset.receiptId:null;if(renderedModalActor&&renderedModalActor!==modalActor)stopScanner();renderedModalActor=modalActor;

 const d=ui.modal;let title='',body='',footer='',wide=false;
 if((d.kind==='role-switch'||d.kind==='demo-console')&&getWorkspaceMode()==='sample'){
  title=d.kind==='demo-console'?'Explore Lumo Merchant':'Choose your experience';wide=true;
  body=`<p class="muted">A complete sample business. Switch perspectives to follow the same payment from student to shop to owner.</p><div class="role-grid">${[['owner','Business owner','All shops, account balance and controls.','wallet'],['manager','Shop manager','Local collections, refunds and daily close.','shops'],['cashier','Cashier','Quick checkout and spoken confirmations.','qr'],['student','Student','Nearby shops, codes and campus payments.','pin']].map(([r,t,p,i])=>`<button class="radio-card ${ui.role===r?'selected':''}" data-action="switch-role" data-role="${r}">${icon(i)}<strong>${t}</strong><small>${p}</small></button>`).join('')}</div><label class="field"><span class="label">Cashier phone</span><select class="select" data-change="cashierPhoneMode"><option value="shared" ${ui.cashierPhoneMode!=='dedicated'?'selected':''}>Shared phone</option><option value="dedicated" ${ui.cashierPhoneMode==='dedicated'?'selected':''}>Dedicated phone</option></select></label><label class="field"><span class="label">Shop for manager / cashier</span><select class="select" data-change="demoShop">${shopOptions()}</select></label><div class="callout">${icon('shield')}<span>Demo role switching is for exploration. Sample funds and records are saved in this browser.</span></div>`;
  if(d.kind==='demo-console')body+=`<div class="demo-tools"><h3>Make something happen</h3>${btn(icon('plus')+' Simulate incoming payment','simulate','secondary')}${btn(icon('sound')+' Test announcements','sound-settings','secondary')}${btn('Start merchant signup','onboarding','secondary')}<h3>Resolve a pending demo payment</h3>${state.transactions.filter(t=>t.status==='processing').map(t=>`<div class="demo-pending"><span>${E(t.payer)} · ${money(t.amount)}<small>${E(shopName(t.shopId))}</small></span>${btn('Confirm','resolve-payment','small primary',`data-id="${t.id}" data-status="paid"`)}${btn('Fail','resolve-payment','small secondary',`data-id="${t.id}" data-status="failed"`)}</div>`).join('')||'<p class="muted">No processing payments.</p>'}<h3>Resolve a pending demo settlement</h3>${state.settlements.filter(t=>t.status==='processing').map(t=>`<div class="demo-pending"><span>${money(t.amount)}<small>${E(t.reference)}</small></span>${btn('Complete','resolve-settlement','small primary',`data-id="${t.id}" data-status="paid"`)}${btn('Fail','resolve-settlement','small secondary',`data-id="${t.id}" data-status="failed"`)}</div>`).join('')||'<p class="muted">No processing settlements.</p>'}<div class="demo-reset">${btn('Reset sample workspace','confirm-reset','ghost danger small')}<small>Restores the original sample data.</small></div></div>`;
 }
 if(d.kind==='payment-share'){title='Share payment link';body=paymentSharing.render()}
 if(d.kind==='appearance-settings'){
  title='Appearance';
  body=`<div class="appearance-picker"><fieldset class="appearance-options"><legend class="sr-only">Choose your appearance</legend>${Object.entries(appearanceLabels).map(([value,label])=>`<label class="appearance-choice"><input type="radio" name="appearance" value="${value}" ${appearancePreference()===value?'checked':''}><span class="appearance-choice-face ${value}"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${appearanceSymbols[value]}</svg><span>${label}</span><i aria-hidden="true">${icon('check')}</i></span></label>`).join('')}</fieldset><p class="appearance-hint" role="status">${appearancePreference()==='system'?'Follows your phone’s appearance.':'Saved for this device.'}</p></div>`;
 }
 if(d.kind==='cashier-sound'){title='Payment sound';body=getWorkspaceMode()==='registered'?devices.render():soundPanel()+btn('Enable & test sound','enable-sound','primary full');}
 if(d.kind==='account-menu'){
  const session=Auth.getSession();title='Your account';
  body=`<div class="account-profile-menu"><span class="avatar large">${E(initial(session?.name))}</span><h3>${E(session?.name)}</h3><p>@${E(session?.username)} · ${E(session?.role)}</p></div><div class="settings-links"><button data-action="open-profile">${icon('team')}<span>My profile</span>${icon('chevron')}</button><button data-action="go-security">${icon('shield')}<span>Account & security</span>${icon('chevron')}</button>${session?.role==='owner'?`<button data-action="go-team">${icon('team')}<span>Team & access</span>${icon('chevron')}</button>`:''}<button data-action="access-sign-out">${icon('logout')}<span>Sign out</span></button></div>`;
 }
 if(d.kind==='demo-console'&&getWorkspaceMode()==='registered'){
  title='Prototype payment scenarios';
  body=`<p class="muted">Payment scenarios run in the browser-only sample. To test a shared payment, use your signed-in Lumo consumer app and this shop’s QR.</p>${btn('Open sample business','open-sample','secondary')}`;
 }
 if(d.kind==='mobile-menu'){
  const menu=ui.role==='owner'?[['overview','Overview'],['activation','Get shop ready'],['shops','Your shops'],['shop-operations','Run this shop'],['activity','Payments'],['settlements','Settlements'],['team','Team & access'],['reports','Reports'],['devices','Receiving phones'],['operations','Operations'],['lux','Ask Lux'],['settings','Business settings'],['support','Help & support']]:ui.role==='manager'?[['overview','Shop overview'],['activation','Get shop ready'],['shop-operations','Run this shop'],['checkout','Take payment'],['activity','Payments'],['close','Close day'],['team','Shop team'],['reports','Reports'],['devices','Receiving phones'],['lux','Ask Lux'],['support','Help & support']]:[['checkout','Take payment'],['activity','Payments'],['shop-operations','Shift & handover'],['devices','Receiving phones'],['support','Help & support']];
  title='Your workspace';body=`<div class="settings-links">${menu.map(([page,label])=>`<button data-action="nav" data-page="${page}"><span>${label}</span>${icon('chevron')}</button>`).join('')}${getWorkspaceMode()==='sample'||ui.role==='owner'?`<button data-action="demo-console"><span>Explore prototype</span>${icon('refresh')}</button>`:`<button data-action="open-sample"><span>Open sample business</span>${icon('refresh')}</button>`}${getWorkspaceMode()==='registered'?`<button data-action="go-security"><span>Account & security</span>${icon('shield')}</button><button data-action="access-sign-out"><span>Sign out</span>${icon('logout')}</button>`:''}</div>`;
 }
 if(d.kind==='charge-shop'){
  title='Which shop is taking payment?';
  body=`<p class="muted">Choose the receiving location. Its collections and phone will receive this payment.</p><label class="field"><span class="label">Receiving shop</span><select id="charge-shop" name="chargeShop" class="select">${shopOptions()}</select></label>`;
  footer=btn('Open checkout '+icon('arrow'),'choose-charge-shop','primary');
 }
 if(d.kind==='consumer-handoff'){title='Continue in Lumo';body='<p>Open your consumer app to check the merchant and amount, then approve the payment with your transaction PIN.</p>';footer=`<a class="btn primary" href="${E(d.link)}" target="_blank" rel="noopener">Open in Lumo</a>`}
 if(d.kind==='copy-fallback'){
  title='Copy payment details';body=`<p class="muted">Select and copy these details.</p><textarea class="input" readonly rows="3">${E(d.value)}</textarea>`;
 }
 if(d.kind==='account-details'){
  title=ui.role==='owner'?'Your merchant account':'Shop acceptance details';
  body=`<div class="account-detail-hero">${icon('wallet')}<span>${E(state.business.name)}</span><strong>${E(state.business.accountNumber)}</strong><small>Lumo merchant virtual account · sample</small></div><div class="callout">${icon('shops')}<span>One merchant account holds all shop funds. Each location has its own collection record, QR and code.</span></div><div class="detail-list"><div class="detail-row"><span>Banking partner</span><strong>GCB Bank · demo connection</strong></div>${ui.role==='owner'?`<div class="detail-row"><span>Merchant balance</span><strong>${money(metrics().balance)}</strong></div>`:''}<div class="detail-row"><span>Connected shops</span><strong>${state.shops.length}</strong></div></div><p class="hint">Account-number payments need a shop selection or reference for correct attribution.</p>`;
  footer=btn('Copy account number','copy-account','primary')+btn('Show shop QR','shop-qr','secondary',`data-id="${ui.shopId}"`);
 }
 if(d.kind==='collection-requests'){
  title='Payment requests';const requests=collectionQueue(state,ui.shopId);
  body=requests.length?`<div class="activity-list">${requests.map(r=>`<button class="activity-item" data-action="request-detail" data-id="${E(r.id)}">${icon('qr')}<span><strong>${money(r.amount)}</strong><small>${requestPresentation(state,r).status==='processing'?'Checking payment':'Waiting for payment'} · ${E(r.description||'Payment request')} · ${time(r.createdAt)}</small></span>${icon('chevron')}</button>`).join('')}</div>`:empty('No active requests','Ready for your next customer.');
 }
 if(d.kind==='shop-qr'||d.kind==='request-detail'){
  const r=d.kind==='request-detail'?state.requests.find(r=>r.id===d.id):null;
  if(d.kind==='request-detail'&&!r){title='Request unavailable';body='<p>This payment request is no longer available in this workspace.</p>';footer=btn('Back to collections','next-customer','primary')}
  else{
   const s=shop(r?.shopId||d.id)||currentShop(),link=paymentLink(s.id,r),view=r?requestPresentation(state,r):null;
   const shared=getWorkspaceMode()==='registered';
   title=r?(view.status==='paid'?'Payment received':view.status==='processing'?'Payment processing':view.status==='waiting'?'Scan to pay':view.status==='expired'?'QR expired':'Request cancelled'):'Your reusable shop QR';
   if(view?.status==='paid'){
    body=`<div class="qr-confirmed" data-collection-state="paid" data-receipt-id="${E(view.transaction.id)}"><div class="receipt-success">${icon('check')}</div><span class="badge success">Confirmed payment</span><div class="receipt-amount">${money(r.amount)}</div><h3>Payment received.</h3><p>${E(view.transaction.payer)} paid ${E(s.name)}</p><div class="detail-list"><div class="detail-row"><span>Reference</span><strong>${E(view.transaction.reference)}</strong></div><div class="detail-row"><span>Confirmed</span><strong>${time(view.transaction.confirmedAt||view.transaction.createdAt)}</strong></div></div><p class="notice">Test money credited to this shop’s collections.</p></div>`;
    footer=btn('Next customer '+icon('arrow'),'next-customer','primary')+btn('View receipt','transaction','secondary',`data-id="${view.transaction.id}"`);
   }else if(view&&!view.canPay){
    const processing=view.status==='processing';
    body=`<div class="qr-confirmed"><div class="receipt-success pending">${icon(processing?'clock':'qr')}</div><div class="receipt-amount">${money(r.amount)}</div><h3>${processing?'Waiting for confirmation':view.status==='expired'?'Time for a fresh QR.':'This request is cancelled.'}</h3><p>${processing?'This payment has not been confirmed. Check its status before collecting again.':'This QR can no longer be used. Create a new request for the next payment.'}</p><p class="notice">${E(s.name)} · ${E(r.description||'Payment request')}</p></div>`;
    footer=processing?btn('Check payment status','check-collection','primary')+btn('View payment','transaction','secondary',`data-id="${view.processing.id}"`):btn('New payment '+icon('arrow'),'next-customer','primary');
   }else{
    body=`<div class="collection-qr-dialog"><div class="qr-card"><div class="qr-brand"><strong class="canonical-wordmark">lumo</strong><span class="brand-qualifier">merchant</span></div><h3>${E(state.business.name)}</h3><p>${E(s.name)}</p>${r?`<div class="qr-amount">${money(r.amount)}</div><p>${E(r.description||'')}</p>`:''}<div class="qr-image">${qrSvg(link)}</div><div class="qr-code-label">${E(s.code)}</div><p>${shared?(r?'Scan with Lumo to pay this exact amount.':'Customer scans, enters the amount and confirms.'):'Preview a sample payment in this browser.'}</p>${r?`<div class="qr-state-line waiting" role="status"><span class="live-dot"></span>Waiting for payment <span class="qr-countdown" data-qr-expires="${E(r.expiresAt)}">${Math.floor(view.remaining/60)}:${String(view.remaining%60).padStart(2,'0')}</span></div>`:'<span class="badge neutral">Reusable QR · Customer enters amount</span>'}</div><p class="notice">${shared?'Scan to Pay in Lumo Test uses the shared merchant test wallet.':'Browser-only sample. Its QR and shop code cannot receive payments from the Lumo consumer app. Create a merchant account to test across phones.'} No real money is moved.</p></div>`;
    footer=(!shared?btn('Create merchant account','onboarding','primary'):'')+(r?btn('Check payment status','check-collection','primary'):'')+btn('Share payment link','share-payment-link','secondary',`data-id="${s.id}" ${r?`data-request="${r.id}"`:''}`)+(shared?`<a class="btn ghost small" href="${E(link)}" target="_blank" rel="noopener">Open in Lumo</a>`:btn('Preview customer payment','student-pay','ghost small',`data-id="${s.id}" ${r?`data-request="${r.id}"`:''}`))+(!r?btn(icon('download')+' QR poster','download-poster','ghost small',`data-id="${s.id}"`):btn('Cancel request','cancel-request','ghost danger small',`data-id="${r.id}"`));
   }
  }
 }

 if(d.kind==='add-shop'||d.kind==='edit-shop'){
  const s=d.id?shop(d.id):{},area=s.area||'Night Market',knownAreas=['Night Market','Pentagon','Akuafo','Balme Library'],customArea=!knownAreas.includes(area),areaChoice=customArea?'Other':area;title=d.id?'Edit shop':'Connect a new shop';
  body=`<form data-form="shop" id="shop-form"><input type="hidden" name="id" value="${E(d.id||'')}">${field('Shop name','name',s.name||'','required maxlength="50" autofocus')}<label class="field"><span class="label">Campus area</span><select class="select" name="area" data-change="shopArea">${[...knownAreas,'Other'].map(a=>`<option ${areaChoice===a?'selected':''}>${E(a)}</option>`).join('')}</select></label><div id="shop-custom-area-field" style="margin-top:17px" ${customArea?'':'hidden'}>${field('Other campus area','customArea',customArea&&area!=='Other'?area:'',`maxlength="60" data-change="shopCustomArea" ${customArea?'required':''} placeholder="e.g. Sarbah Hall"`)}</div>${field('Landmark or directions','landmark',s.landmark||'','required maxlength="180" placeholder="e.g. Beside the Night Market entrance"')}<label class="field"><span class="label">Category</span><select class="select" name="category">${['Food & drinks','Provisions','Printing','Laundry','Other'].map(c=>`<option ${s.category===c?'selected':''}>${c}</option>`).join('')}</select></label>${field('Opening hours','hours',s.hours||'7 am – 10 pm','required maxlength="100"')}<input type="hidden" name="lat" value="${s.lat||5.6509}"><input type="hidden" name="lng" value="${s.lng||-.1878}"><div class="location-ready"><strong>Confirm the shop entrance</strong><p>Start with the campus area, or capture your phone location while standing at the counter. Check the pin before confirming.</p><a id="shop-map-link" class="text-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${s.lat||5.6509},${s.lng||-.1878}">Check location in Maps</a></div>${btn(icon('pin')+' Use this phone’s location','capture-shop-location','secondary small')}<label class="field check-line"><input type="checkbox" name="locationConfirmed" required><span>I checked the area, landmark and shop entrance.</span></label><p class="hint">Invite the manager from Team & access after the shop is created. A typed name does not create an account.</p><div class="callout">${icon('wallet')}<span>This shop shares your existing merchant account. It receives a unique shop code and its own collection record.</span></div></form>`;
  footer=`<button type="submit" form="shop-form" class="btn primary">${d.id?'Save changes':'Create shop'}</button>`;
 }
 if(d.kind==='add-staff'){
  title='Invite someone to the team';body=`<form id="staff-form" data-form="staff">${field('Full name','name','','required maxlength="60" autofocus')}${field('Phone number','phone','','type="tel" required placeholder="024 000 0000" maxlength="20"')}<div class="form-grid"><label class="field"><span class="label">Role</span><select class="select" name="role"><option value="cashier">Cashier</option><option value="manager">Shop manager</option></select></label><label class="field"><span class="label">Assigned shop</span><select class="select" name="shopId">${shopOptions()}</select></label></div><div class="callout">${icon('shield')}<span>Access is limited to the assigned shop. The merchant balance and settlement controls stay with the owner.</span></div><p class="hint">Creates sample access only. No SMS invitation will be sent.</p></form>`;footer=`<button class="btn primary" form="staff-form" type="submit">Create demo invitation</button>`;
 }
 if(d.kind==='transaction'){
  const t=state.transactions.find(x=>x.id===d.id);if(!t){dismiss();return}
  const refunded=state.refunds.filter(r=>r.transactionId===t.id&&r.status==='paid').reduce((a,r)=>a+r.amount,0),reserved=state.refunds.filter(r=>r.transactionId===t.id&&['requested','processing'].includes(r.status)).reduce((a,r)=>a+r.amount,0);
  title='Payment details';body=`<div class="receipt"><div class="receipt-success ${t.status==='paid'?'':'pending'}">${icon(t.status==='paid'?'check':'clock')}</div><div class="receipt-amount">${money(t.amount)}</div>${badge(t.status)}<p>${E(t.payer)} → ${E(shopName(t.shopId))}</p></div><div class="detail-list">${[['Reference',t.reference],['Started',date(t.createdAt)+' · '+time(t.createdAt)],['Confirmed',t.status==='paid'?date(paymentDate(t))+' · '+time(paymentDate(t)):'Not confirmed'],['Payment method',({qr:'QR payment',code:'Shop code',account:'Account number',request:'Payment request'})[t.method]||t.method],['Cashier',t.staffName||t.performedBy||state.staff.find(s=>s.id===t.staffId)?.name||'Shop receiver'],['Refunded',money(refunded)],['Awaiting refund approval',money(reserved)]].map(([k,v])=>`<div class="detail-row"><span>${k}</span><strong>${E(v)}</strong></div>`).join('')}</div>${state.refunds.some(r=>r.transactionId===t.id)?`<section class="receipt-refund-history"><h3>Refund history</h3>${state.refunds.filter(r=>r.transactionId===t.id).sort((a,b)=>Date.parse(b.decidedAt||b.paidAt||b.createdAt)-Date.parse(a.decidedAt||a.paidAt||a.createdAt)).map(r=>`<div class="detail-row"><span><strong>${E(r.reason||'Customer refund')}</strong><small>${date(r.createdAt)} · ${time(r.createdAt)}${r.decidedAt?' · Decision '+date(r.decidedAt)+' '+time(r.decidedAt):r.status==='rejected'?' · Decision time unavailable':''}</small></span><span><strong>${money(r.amount)}</strong>${badge(r.status)}</span></div>`).join('')}</section>`:''}${!t.shopId?`<form data-form="assign" id="assign-form"><input name="id" type="hidden" value="${t.id}"><label class="field"><span class="label">Assign to shop</span><select class="select" name="shopId">${shopOptions()}</select></label><button type="submit" class="btn secondary full">Assign collection</button></form>`:''}`;
  footer=(t.status==='paid'&&refunded+reserved<t.amount?btn(ui.role==='cashier'?'Request refund':'Refund payment','refund','secondary',`data-id="${t.id}"`):'')+btn('Get help','support-ticket','ghost',`data-transaction="${t.id}"`)+btn(icon('download')+' Receipt','download-receipt','ghost small',`data-id="${t.id}"`);
 }
 if(d.kind==='refund'){
  const t=state.transactions.find(t=>t.id===d.id),pending=pendingRefund(t.id),remaining=t.amount-state.refunds.filter(r=>r.transactionId===t.id&&['paid','processing','requested'].includes(r.status)).reduce((a,r)=>a+r.amount,0);title=ui.role==='cashier'?'Request a refund':'Return a payment';body=`<p class="muted">Return funds to ${E(t.payer)} against the original payment.</p><form id="refund-form" data-form="refund"><input type="hidden" name="transactionId" value="${t.id}">${pending?'<div class="callout warning">The last refund result is unconfirmed. Retry the same refund to retrieve its outcome without crediting twice.</div>':''}${field('Refund amount · GH₵','amount',((pending?.amount??remaining)/100).toFixed(2),'type="number" min="0.01" step="0.01" required autofocus'+(pending?' readonly':''))}<label class="field"><span class="label">Reason</span><select class="select" name="reason" ${pending?'disabled':''}>${['Customer request','Wrong amount','Duplicate payment','Item unavailable'].map(reason=>`<option ${(pending?.reason||'Customer request')===reason?'selected':''}>${reason}</option>`).join('')}</select></label><div class="callout">${icon('shield')}<span>${ui.role==='cashier'?'The owner will review this request.':ui.role==='manager'?'Owner approval is needed once total returns on this payment exceed GH₵100.':'Refunds return to the original payer.'} Available funds and previous refunds are checked.</span></div></form>`;footer=`<button class="btn primary" form="refund-form" type="submit" ${refundSubmitting?'disabled':''}>${refundSubmitting?'Checking refund…':ui.role==='cashier'?'Send for approval':'Confirm refund'}</button>`;
 }
 if(d.kind==='approvals'){
  title='Refund approvals';body=state.refunds.filter(r=>r.status==='requested'&&(ui.role==='owner'||r.shopId===ui.shopId)).map(r=>{const t=state.transactions.find(t=>t.id===r.transactionId);return `<div class="approval-card"><strong>${money(r.amount)} · ${E(t?.payer)}</strong><p>${E(shopName(r.shopId))} · ${E(r.reason)}</p><div>${ui.role==='owner'?btn('Approve','approve-refund','primary small',`data-id="${r.id}" data-approve="true"`)+btn('Decline','approve-refund','secondary small',`data-id="${r.id}" data-approve="false"`):'<span class="badge warning">Awaiting owner decision</span>'}</div></div>`}).join('')||empty('All caught up','There are no refund requests waiting.');
 }
 if(d.kind==='open-close'){
  const s=shop(d.id)||currentShop(),m=metrics(s.id);title='Close '+E(s.name);body=`<p class="muted">Review this period before saving its closing report.</p><div class="report-summary"><span>Net collections to archive</span><strong>${money(m.currentNet)}</strong><small>${m.currentCount} confirmed payments</small></div>${m.priorPeriodAllocations?`<div class="callout warning"><span>Includes ${money(m.priorPeriodAllocations)} assigned from an earlier period.</span></div>`:''}<div class="detail-list"><div class="detail-row"><span>Gross collections</span><strong>${money(m.currentGross)}</strong></div><div class="detail-row"><span>Completed refunds</span><strong>${money(m.currentRefunds)}</strong></div><div class="detail-row"><span>Next period starts at</span><strong>GH₵0.00</strong></div></div><div class="callout success">${icon('shield')}<span>The merchant account balance stays unchanged. Payment history and pending receipts remain traceable.</span></div>`;footer=btn('Keep day open','dismiss','secondary')+btn('Close & save report','confirm-close','primary',`data-id="${s.id}" `);
 }
 if(d.kind==='closing-detail'){
  const c=state.closings.find(c=>c.id===d.id);title='Daily closing report';body=`<div class="receipt"><div class="receipt-success">${icon('check')}</div><h3>${E(shopName(c.shopId))}</h3><p>${date(c.createdAt)} · ${time(c.createdAt)}</p><div class="receipt-amount">${money(c.net)}</div><span class="badge success">Archived</span></div>${c.adjustmentNote?`<div class="callout warning"><span>${E(c.adjustmentNote)}</span></div>`:''}<div class="detail-list">${[['Gross collections',money(c.gross)],['Refunds',money(c.refunds)],['Payments',c.transactionIds?.length||0],['Merchant funds','Unchanged by closing']].map(([k,v])=>`<div class="detail-row"><span>${k}</span><strong>${E(v)}</strong></div>`).join('')}</div>`;footer=btn(icon('download')+' Download report','download-closing','primary',`data-id="${c.id}"`);
 }
 if(d.kind==='open-settle'){
  const pending=pendingSettlement();
  if(!canUse('settlement')&&!pending){title='Settlement availability';body='<p>Bank and mobile money settlement are not connected in this test. Your shared merchant test funds remain in Lumo. No payout has been started.</p>';footer=btn('Done','dismiss','primary')}else{
  title=pending?'Check your saved settlement':'Settle your collections';body=`<form id="settle-form" data-form="settle"><div class="available-box"><span>Available to settle</span><strong>${money(metrics().available)}</strong></div>${pending?`<div class="callout warning"><span>${pending.submitted?'The previous result is unconfirmed. Checking this same reference retrieves its outcome and cannot create a second payout.':'Your saved settlement has not been confirmed. Continue with the same amount and destination.'}</span></div>`:''}${field('Amount · GH₵','amount',pending?(pending.amount/100).toFixed(2):'','type="number" step="0.01" min="0.01" required autofocus'+(pending?' readonly':''))}${!pending?'<button class="text-btn" type="button" data-action="settle-all">Use available balance</button>':''}<div class="detail-list"><div class="detail-row"><span>${pending?'Original destination':'Destination'}</span><strong>${E(pending?.destination||state.business.destination)}</strong></div><div class="detail-row"><span>Demo fee</span><strong>GH₵0.00</strong></div></div><p class="notice">A demo payout reserves these funds until its outcome is confirmed. No bank transfer is made.</p></form>`;footer=`<button class="btn primary" type="submit" form="settle-form">${pending?.submitted?'Check original settlement':pending?'Continue saved settlement':'Confirm demo settlement'}</button>`;
  }
 }
 if(d.kind==='settlement-detail'){
  const t=state.settlements.find(t=>t.id===d.id);title='Settlement details';body=`<div class="receipt"><div class="receipt-success ${t.status==='paid'?'':'pending'}">${icon(t.status==='paid'?'check':'clock')}</div><div class="receipt-amount">${money(t.amount)}</div>${badge(t.status)}</div><div class="detail-list">${[['Reference',t.reference],['Destination',t.destination],['Requested',date(t.createdAt)+' · '+time(t.createdAt)],['Fee',money(t.fee)]].map(([k,v])=>`<div class="detail-row"><span>${k}</span><strong>${E(v)}</strong></div>`).join('')}</div>${t.status==='processing'?'<p class="notice">Funds are reserved. Use prototype controls to simulate completion or failure.</p>':''}${t.status==='failed'?'<div class="callout warning">The payout failed. Reserved funds are available again.</div>':''}`;footer=btn('Get help','support-ticket','secondary','data-subject="Settlement help"')+btn('Prototype controls','demo-console','ghost');
 }
 if(d.kind==='edit-destination'){
  title='Change settlement destination';body=`<form id="destination-form" data-form="destination"><p class="muted">Owner-only action. Live changes require destination verification and strong authentication.</p>${field('Business bank or eligible business MoMo','destination',state.business.destination,'required maxlength="100" autofocus')}<label class="checkbox-field"><input type="checkbox" name="confirm" required>I understand this changes only the sample destination.</label></form>`;footer=`<button class="btn primary" type="submit" form="destination-form">Save demo destination</button>`;
 }
 if(d.kind==='sound-settings'){
  const c=soundConfig(),on=receivingEnabled(c);
  title='Hear every payment';body=`<div class="sound-hero"><span class="sound-orb on">${icon('sound')}</span><h3>“Lumo. Payment received.<br>Twenty-five cedis.”</h3><p>Clear confirmation, while you keep serving.</p></div><label class="field"><span class="label">This phone receives announcements for</span><select name="soundShop" class="select" id="sound-shop">${ui.role==='owner'?shopOptions(c?.shopId||ui.shopId):`<option value="${ui.shopId}">${E(currentShop().name)}</option>`}</select></label><div class="sound-buttons">${btn(icon('sound')+(on?' Test voice':' Enable & test voice'),'enable-sound','primary full')}${on?btn('Turn off announcements','disable-sound','secondary full'):''}</div><p class="notice">Allow sound through your browser. Keep this tab open for the web demo. Locked-screen and background delivery require native app testing. Only new confirmed receipts are announced.</p>`;
 }
 if(d.kind==='simulate'){
  title='Simulate a customer payment';body=`<form id="simulate-form" data-form="simulate"><p class="muted">Watch a sample payment reach the shop and owner instantly.</p><label class="field"><span class="label">Receiving shop</span><select class="select" name="shopId">${ui.role==='owner'?shopOptions():`<option value="${ui.shopId}">${E(currentShop().name)}</option>`}</select></label>${field('Customer name','payer','Kofi Asante','required maxlength="60"')}${field('Amount · GH₵','amount','25.00','type="number" min="0.01" step="0.01" required')}<label class="field"><span class="label">Outcome</span><select class="select" name="status"><option value="paid">Confirmed payment</option><option value="processing">Still processing</option><option value="failed">Failed payment</option></select></label><p class="hint">Processing and failed payments never announce success or increase available funds.</p></form>`;footer=`<button class="btn primary" type="submit" form="simulate-form">Send demo payment</button>`;
 }
 if(d.kind==='student-pay'){
  const s=shop(d.id)||currentShop(),r=d.request?state.requests.find(r=>r.id===d.request):null;
  title='Pay '+E(s.name);body=`<div class="verified-merchant"><span class="shop-icon">${icon('shops')}</span><span><strong>${E(state.business.name)}</strong><small>${E(s.name)} · ${E(s.area)}</small></span>${icon('shield')}</div><form id="student-pay-form" data-form="student-pay"><input name="shopId" type="hidden" value="${s.id}"><input name="requestId" type="hidden" value="${E(r?.id||'')}"><input name="method" type="hidden" value="${E(d.method||'qr')}">${field(r?'Payment amount · GH₵ · Locked':'Payment amount · GH₵','amount',r?(r.amount/100).toFixed(2):d.amount?(d.amount/100).toFixed(2):'','type="number" min="0.01" step="0.01" required autofocus '+(r?'readonly aria-readonly="true"':''))}${r?'<p class="notice">Amount locked by the merchant’s payment request.</p>':''}${field('Your name','payer','Kofi Asante','required maxlength="60"')}<div class="student-review"><span>Paying from</span><strong>Lumo everyday account · demo</strong><span>Payment fee</span><strong>GH₵0.00</strong></div><p class="notice">Review the shop and amount before authorising. No real money moves.</p></form>`;footer=`<button class="btn primary full" type="submit" form="student-pay-form">Review payment ${icon('arrow')}</button>`;
 }
 if(d.kind==='student-review'){
  const p=d.payment,s=shop(p.shopId);title='A little clarity before you pay';body=`<div class="receipt"><span class="shop-icon">${icon('shops')}</span><h3>${E(state.business.name)}</h3><p>${E(s.name)}</p><div class="receipt-amount">${money(p.amount)}</div></div>${p.amount>=10000?`<div class="pause-preview"><span class="eyebrow">LUMO PAUSE · DEMO</span><strong>A moment to check.</strong><p>This purchase is above GH₵100. Make sure it fits what you have planned.</p><small>Your budgets and this reminder stay private to you.</small></div>`:''}<div class="callout">${icon('shield')}<span>Demo authorisation. The merchant receives only payment details.</span></div><p class="notice">Production payments will require your PIN or supported biometric approval.</p>`;footer=btn('Back','student-pay','secondary',`data-id="${p.shopId}" data-amount="${p.amount}" ${p.requestId?`data-request="${p.requestId}"`:''}`)+btn('Authorise demo payment','authorise-student','primary',p.amount>=10000?'disabled id="authorise-button"':'');
  if(p.amount>=10000){const reviewKey=d.key;setTimeout(()=>{const b=$('#authorise-button');if(b&&ui.modal?.key===reviewKey)b.disabled=false},3000)}
 }
 if(d.kind==='student-success'){
  const t=state.transactions.find(t=>t.id===d.id);title='Payment complete';body=`<div class="receipt"><div class="receipt-success">${icon('check')}</div><h3>You’re all paid.</h3><div class="receipt-amount">${money(t.amount)}</div><p>${E(state.business.name)} · ${E(shopName(t.shopId))}</p><span class="badge success">Confirmed</span></div><div class="detail-list"><div class="detail-row"><span>Reference</span><strong>${E(t.reference)}</strong></div><div class="detail-row"><span>Category</span><strong>${E(shop(t.shopId)?.category||'Campus purchase')}</strong></div><div class="detail-row"><span>Payment fee</span><strong>GH₵0.00</strong></div></div><div class="callout success">${icon('spark')}<span>Recorded as a campus purchase. Your shop’s collection record and the owner’s balance are updated.</span></div>`;footer=btn('Done','dismiss','primary')+btn('View shop side','view-shop-after-pay','secondary',`data-id="${t.shopId}"`);
 }
 if(d.kind==='enter-code'||d.kind==='enter-account'||d.kind==='student-scan'){
  title=d.kind==='enter-code'?'Enter shop code':d.kind==='enter-account'?'Pay a merchant account':'Open a payment QR';
  body=`<form id="lookup-form" data-form="lookup"><input type="hidden" name="type" value="${d.kind}">${field(d.kind==='enter-code'?'Shop code':d.kind==='enter-account'?'Merchant account number':'Paste the QR payment link','value',d.kind==='enter-account'?state.business.accountNumber:'',`required autofocus placeholder="${d.kind==='enter-code'?'e.g. LUM101':d.kind==='enter-account'?'Merchant account number':'Paste a Lumo Merchant QR link'}"`)}${d.kind==='enter-account'?`<label class="field"><span class="label">Which shop are you paying?</span><select name="shopId" class="select">${shopOptions()}</select></label><p class="hint">One account serves all shops. Select the actual shop so its receiving phone is notified.</p>`:d.kind==='student-scan'?`<div class="scanner-box"><video id="scan-video" playsinline muted></video><canvas id="scan-canvas" hidden></canvas><span>Point your camera at the shop’s Lumo QR.</span></div>${btn(icon('qr')+' Start camera','start-scanner','secondary full')}<p class="hint">Camera access is optional. You can paste a copied QR link above.</p><div class="demo-code-list">${state.shops.map(s=>btn(E(s.name),'student-pay','secondary small',`data-id="${s.id}"`)).join('')}</div>`:'<p class="hint">The shop name appears before you enter an amount.</p>'}</form>`;footer=`<button type="submit" form="lookup-form" class="btn primary">Find shop ${icon('arrow')}</button>`;
 }
 if(d.kind==='support-ticket'){
  title='Let’s get it sorted';body=`<form id="ticket-form" data-form="ticket">${d.transaction?`<input type="hidden" name="shopId" value="${E(state.transactions.find(t=>t.id===d.transaction)?.shopId||'')}">`:ui.role==='owner'?`<label class="field"><span class="label">Case concerns</span><select class="select" name="shopId"><option value="">Whole business</option>${shopOptions('')}</select></label>`:`<input type="hidden" name="shopId" value="${E(ui.shopId)}">`}${field('Subject','subject',d.subject||(d.transaction?'Payment help':'Shop support'),'required maxlength="100" autofocus')}${field('Payment reference (optional)','transactionId',state.transactions.find(t=>t.id===d.transaction)?.reference||d.transaction||'','maxlength="80"')}<label class="field"><span class="label">Tell us what happened</span><textarea class="input" name="message" rows="4" required maxlength="1000" placeholder="Include the amount, shop and what you noticed."></textarea></label><p class="hint">Saved as a prototype case. No external message is sent.</p></form>`;footer=`<button class="btn primary" form="ticket-form" type="submit">Create support case</button>`;
 }
 if(d.kind==='ticket-detail'){
  const t=state.tickets.find(t=>t.id===d.id);title=E(t.subject);body=`${badge(t.status)}<p class="ticket-message">${E(t.message)}</p>${(t.responses||[]).map(response=>`<div class="callout"><div><strong>Business response · ${date(response.createdAt)} ${time(response.createdAt)}</strong><p>${E(response.message)}</p>${response.status?badge(response.status):''}</div></div>`).join('')}<div class="detail-list"><div class="detail-row"><span>Case</span><strong>${E(t.id)}</strong></div><div class="detail-row"><span>Created</span><strong>${date(t.createdAt)} · ${time(t.createdAt)}</strong></div><div class="detail-row"><span>Reference</span><strong>${E(t.paymentReference||t.transactionId||'—')}</strong></div></div><p class="notice">Responses from the business appear here. External support is not connected.</p>`;
 }
 if(d.kind==='notifications'){
  title='A little heads-up';body=`<div class="activity-list"><button class="activity-item" data-action="go-activity"><span class="transaction-avatar">${icon('clock')}</span><span><strong>${formatStatusSummary()}</strong><small>Processing receipts stay outside available funds.</small></span>${icon('chevron')}</button><button class="activity-item" data-action="approvals"><span class="transaction-avatar">${icon('refund')}</span><span><strong>${state.refunds.filter(r=>r.status==='requested'&&(ui.role==='owner'||r.shopId===ui.shopId)).length} refund requests</strong><small>Review requests from your team.</small></span>${icon('chevron')}</button><button class="activity-item" data-action="demo-console"><span class="transaction-avatar">${icon('spark')}</span><span><strong>Your demo workspace is ready</strong><small>Try a student payment, daily close or settlement.</small></span>${icon('chevron')}</button></div>`;
 }
 if(d.kind==='privacy'){
  title='About this prototype';body=`<div class="privacy-copy"><h3>A working experience with sample money.</h3><p>Businesses, people, account numbers, shop positions and funds are illustrative. Payments, verification, staff invitations, refunds, settlement and support are simulated.</p><h3>Shared sandbox records.</h3><p>Registered accounts, shop records, invitations and test payments use a shared server so different phones can participate. The isolated sample business and device preferences stay in your browser. No bank connection exists.</p><h3>Student and shop locations.</h3><p>A student’s location is used on their device to sort nearby shops, without background tracking. A confirmed shop position and landmark are saved with the business. Publishing the shop makes these details visible in the campus directory. Unpublish it from Shop readiness to remove the public listing.</p><h3>Speech needs an enabled tab.</h3><p>Payment announcements use your browser’s speech capabilities. Keep the designated receiving tab open. Native background delivery is outside this web prototype.</p><h3>Access follows your account.</h3><p>Registered users have server-checked usernames, hashed test passwords and assigned shop access across devices. The sample business keeps a role switcher for review. A real release needs production identity verification, bank integrations and reliable native device notifications.</p></div>`;
 }
 if(d.kind==='confirm-reset'){
  title='Restore the sample business?';body='<p>This restores the original sample business and its demo records. Any business created through merchant signup is preserved separately.</p>';footer=btn('Keep my changes','dismiss','secondary')+btn('Reset demo','reset-demo','danger');
 }
 if(!title){dismiss();return}
 updateMarkup($('#modal-root'),modalShell(title,body,footer,wide),{replace:!same,preserveFields:same});$('#app').inert=true;document.body.classList.add('modal-open');if(scanStream&&d.kind==='student-scan'){const video=$('#scan-video');if(video){if(video.srcObject!==scanStream)video.srcObject=scanStream;if(video.paused)video.play().catch(()=>{})}}
 if(['edit-shop','add-shop'].includes(d.kind))syncShopLocationFields();
 const receiptNode=$('#modal-root [data-receipt-id]');
 if(receiptNode?.dataset.receiptId&&receiptNode.dataset.receiptId!==previousReceipt){const payment=state.transactions.find(t=>t.id===receiptNode.dataset.receiptId);if(payment)announceReceipt(payment);requestAnimationFrame(()=>$('#modal-title')?.focus({preventScroll:true}))}
 else if(same)restoreFocus($('#modal-root'),modalFocus);
}
function say(amount,test=false,shopId=ui.shopId,payment=null){
 if(getWorkspaceMode()==='registered'){if(ui.role==='student'||!devices.canAnnounce(shopId))return}else if(!receivingEnabled())return;
 const context=payment?devices.announcementContext(payment):null;
 const failed=error=>{if(payment&&context)void devices.announcementFailed(payment,context,error).catch(()=>{});else{sampleAudioFailed=true;sampleAudioUnlocked=false;toast('Voice could not play. Check browser sound permissions.',true);render()}};
 if(!('speechSynthesis'in window)){failed('unsupported');return}
 const value=Math.round(amount),cedis=Math.floor(value/100),pesewas=value%100;
 const utter=new SpeechSynthesisUtterance(`Lumo. Payment received. ${cedis} ${cedis===1?'cedi':'cedis'}${pesewas?`, ${pesewas} ${pesewas===1?'pesewa':'pesewas'}`:''}.`);
 utter.lang='en-GH';utter.rate=.9;utter.volume=1;utter.onerror=e=>failed(e?.error||'speech-error');try{const voices=speechSynthesis.getVoices();utter.voice=voices.find(v=>v.lang==='en-GH')||voices.find(v=>v.lang==='en-GB')||null;speechSynthesis.speak(utter)}catch{failed('speech-error')}if(test)toast('Voice test sent. Check your phone’s volume.');
}
function csv(rows,name){const content='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');download(content,name,'text/csv;charset=utf-8')}
function download(content,name,type='text/plain'){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);toast('Download prepared.')}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('Copied to clipboard.')}catch{modal('copy-fallback',{value});toast('Copy the displayed details manually.')}}
function ask(q,options){return merchantChat.ask(q,options);}
function luxHandoff(el){
 const message=merchantChat.getView().messages.find(m=>m.id===el.dataset.index),a=message?.answer?.actions?.[Number(el.dataset.option)];
 if(!message||!a)return;
 if(merchantLuxStale(luxState(),message.answer,{actor:luxActor()})){void ask(message.question,{previous:message.answer.plan});return;}
 const allowed=ui.role==='owner'?['activity','overview','reports','settlements','close','shops','shop-detail','business-plan','payment-links']:['activity','overview','reports','close','business-plan','payment-links'];
 if(!allowed.includes(a.page))return;
 if(a.shopId&&!selectShop(a.shopId))return;
 if(a.page==='payment-links'){openSharedPaymentLinks(a.paymentLinkId);return}
 if(a.page==='close'&&ui.role==='owner'){modal('open-close',{id:a.shopId||ui.shopId});return;}
 if(a.filters&&['activity','reports'].includes(a.page)){
  if(ui.role==='owner')ui.scope=state.shops.some(s=>s.id===a.filters.shopId)?a.filters.shopId:'all';
  reporting.openReview(a.page==='reports'?'report':'activity',a.filters);
 }
 navigate(a.page,a.shopId);
}

function acceptScannedLink(text){
 try{
  const intent=parseMerchantPaymentLink(text,{origin:location.origin});
  if(intent.workspace==='sample'){const result=resolveSamplePaymentLink(state,intent);stopScanner();modal('student-pay',{id:result.shop.id,request:result.request?.id,method:'qr'});return true}
  stopScanner();
  modal('consumer-handoff',{link:consumerIntentLink(intent)});return true;
 }catch(error){toast(error.message||'That QR is not a recognised payment link.',true);return false}
}
async function startScanner(){
 if(!navigator.mediaDevices?.getUserMedia){toast('Camera is unavailable here. Paste the QR link instead.',true);return}
 try{stopScanner();scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(ui.modal?.kind!=='student-scan'){stopScanner();return}const v=$('#scan-video');v.srcObject=scanStream;await v.play();let frames=0;const read=()=>{if(!scanStream||ui.modal?.kind!=='student-scan')return;const video=$('#scan-video'),canvas=$('#scan-canvas');if(video?.readyState>=2&&canvas&&++frames%4===0){const ratio=Math.min(1,640/video.videoWidth);canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(video,0,0,canvas.width,canvas.height);const im=c.getImageData(0,0,canvas.width,canvas.height);const result=window.jsQR?.(im.data,im.width,im.height,{inversionAttempts:'dontInvert'});if(result&&acceptScannedLink(result.data))return}scanFrame=requestAnimationFrame(read)};read()}catch{stopScanner();toast('Camera access was unavailable. You can paste the payment link.',true)}
}
async function openPaymentLink(){
 try{
  const intent=parseMerchantPaymentLink(url,{origin:location.origin});
  if(intent.workspace==='sample'){const result=resolveSamplePaymentLink(state,intent);modal('student-pay',{id:result.shop.id,request:result.request?.id,method:'qr'});return}
  modal('consumer-handoff',{link:consumerIntentLink(intent)});
 }catch(error){toast(error.message||'That QR is not a recognised payment link.',true)}
}
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
 const a=el.dataset.action;if(a==='backdrop'&&e.target!==el)return;
 if(a==='appearance-settings'){modal('appearance-settings');return}
 if(el.tagName==='A')e.preventDefault();
 if(a.startsWith('plan-')){await businessPlan.handleClick(el,e);return}
 if(a.startsWith('share-')&&a!=='share-payment-link'){await paymentSharing.handleClick(el,e);return}
 if(a==='share-payment-link'){const options={shopId:el.dataset.id||ui.shopId,requestId:el.dataset.request};if(!options.requestId&&el.dataset.amount==='draft'){options.amount=ui.charge?Math.round(Number(ui.charge)*100):undefined;options.description=ui.collectionNote}openPaymentSharing(options);return}
 if(a==='shared-payment-links'){openSharedPaymentLinks(el.dataset.id);return}
 if(a.startsWith('counter-')){await counterSetup.handleClick(el,e);return}
 if(a.startsWith('cashier-')){await cashier.handleClick(el,e);return}
 if(a.startsWith('device-')){await devices.handleClick(a,el,e);return}
 if(a.startsWith('directory-')){await directory.handleClick(a,el,e);return}
 if(a.startsWith('campus-pay-')){await campusPay.handleClick(a,el,e);return}
 if(a.startsWith('ops-')){await operations.handleClick(a,el,e);return}
 if(a.startsWith('reporting-')){reporting.handleClick(a,el,e);return}
 if(a.startsWith('access-')){dismiss();access.handleClick(a,el,e);return}
 if(a.startsWith('people-')){people.handleClick(a,el,e);return}
 if(a.startsWith('signup-')){signup.handleClick(a,el,e);return}
 if(a.startsWith('go-')){navigate(a.slice(3));return}
 const id=el.dataset.id;
 switch(a){
 case'nav':navigate(el.dataset.page);break;
 case'dismiss':case'backdrop':closeOverlayWithBack();break;
 case'role-switch':if(getWorkspaceMode()==='registered')modal('account-menu');else modal('role-switch');break;
 case'account-menu':modal('account-menu');break;
 case'merchant-signin':dismiss();signup.setActive(false);if(Auth.getSession())enterAuthenticated(Auth.getSession());else showLogin();break;
 case'open-profile':dismiss();access.show('profile');break;
 case'open-sample':dismiss();ownerWorkspace(switchWorkspace('sample'));signup.setActive(false);access.hide();render();break;
 case'sound-settings':if(getWorkspaceMode()==='registered'){navigate('devices');break}modal('sound-settings');break;
 case'collection-requests':case'demo-console':case'mobile-menu':case'account-details':case'add-shop':case'add-staff':case'notifications':case'privacy':case'confirm-reset':case'approvals':case'open-settle':case'edit-destination':modal(a);break;
 case'switch-role':cashier.reset();sampleCounter=null;pendingCharge=null;ui.charge='';ui.collectionNote='';if(getWorkspaceMode()!=='sample'){toast('Sign in to use your assigned role.',true);break}if(['manager','cashier'].includes(el.dataset.role)&&!state.staff.some(s=>s.shopId===ui.shopId&&s.role===el.dataset.role&&s.active)){toast('There is no active '+el.dataset.role+' for this shop. Add one from the owner’s Team workspace.',true);break}ui.role=el.dataset.role;ui.scope='all';ui.page=ui.role==='student'?'nearby':'home';ui.staffId=state.staff.find(s=>s.shopId===ui.shopId&&s.role===(ui.role==='manager'?'manager':'cashier')&&s.active)?.id||'';dismiss();resetReceiptBaseline();navigation?.reset({page:ui.page,shopId:ui.shopId});persist();render();if(ui.role==='student')directory.refresh();break;
 case'shop':navigate('shop-detail',id);break;
 case'edit-shop':case'shop-qr':case'transaction':case'request-detail':case'refund':case'open-close':case'closing-detail':case'settlement-detail':case'ticket-detail':modal(a,{id});break;
 case'toggle-balance':ui.hideBalance=!ui.hideBalance;render();break;
 case'choose-charge-shop':if(!selectShop($('#charge-shop').value))break;ui.staffId=state.staff.find(s=>s.shopId===ui.shopId&&s.role==='cashier'&&s.active)?.id||'';navigate('checkout');break;
 case'open-charge':navigate('checkout');break;
 case'collect-shortcut':if(!['amount','static'].includes(el.dataset.mode))break;ui.collectMode=el.dataset.mode;navigate('checkout');break;
 case'collect-mode':ui.collectMode=el.dataset.mode==='static'?'static':'amount';render();break;
 case'clear-charge':if(pendingCharge||chargeSubmitting){toast('Retrieve the saved QR before clearing the amount.',true);break}ui.charge='';ui.collectionNote='';render();break;
 case'next-customer':if(knownChargeRequest())pendingCharge=null;if(pendingCharge){dismiss();navigate('checkout');toast('Retrieve the outstanding QR before starting another payment.',true);break}ui.charge='';ui.collectionNote='';ui.collectMode='amount';if(ui.page==='checkout'&&ui.modal)closeOverlayWithBack();else{dismiss();navigate('checkout')}break;
 case'check-collection':if(getWorkspaceMode()==='registered')await Shared.refresh();renderModal();if(Shared.connectionStatus().status==='offline')toast('Connection lost. Payment status could not be checked.',true);else toast('Payment status checked.');break;
 case'key':if(chargeSubmitting||pendingCharge){toast('Check the saved QR request before starting another payment.',true);break}if(el.dataset.value==='⌫')ui.charge=ui.charge.slice(0,-1);else if(el.dataset.value==='.'&&!ui.charge.includes('.'))ui.charge=(ui.charge||'0')+'.';else if(el.dataset.value!=='.'&&ui.charge.replace('.','').length<7&&(!ui.charge.includes('.')||ui.charge.split('.')[1].length<2))ui.charge=(ui.charge==='0'?'':ui.charge)+el.dataset.value;render();break;
 case'create-charge':{
  if(chargeSubmitting)break;
  const context=[getWorkspaceMode(),state.business.id,Auth.getSession()?.id||ui.role,ui.shopId].join(':'),amount=Math.round(Number(ui.charge)*100),description=(ui.collectionNote||'').trim();
  if(!Number.isSafeInteger(amount)||amount<=0){toast('Enter an amount above zero.',true);break}
  if(!pendingCharge&&(!currentShop().accepting||currentShop().open===false)){toast('Open this shop before collecting a payment.',true);break}
  if(!pendingCharge||pendingCharge.context!==context)pendingCharge={context,payload:{shopId:ui.shopId,staffId:ui.role==='owner'?undefined:ui.staffId,amount,description,attemptId:crypto.randomUUID()}};
  chargeSubmitting=true;render();
  try{
   const r=await performAction('CREATE_REQUEST',pendingCharge.payload);
   if(context===[getWorkspaceMode(),state.business.id,Auth.getSession()?.id||ui.role,ui.shopId].join(':')){pendingCharge=null;ui.charge='';ui.collectionNote='';render();modal('request-detail',{id:r.id})}
  }catch(error){if([400,403,404,422].includes(error.status))pendingCharge=null;toast(error.message+(pendingCharge?' Tap Generate again to retrieve the same QR.':''),true)}
  finally{chargeSubmitting=false;render()}
  break;
 }

 case'cancel-request':if(await act('CANCEL_REQUEST',{id})){dismiss();toast('Payment request cancelled.')}break;
 case'toggle-shop':{const s=shop(id);if(await act('UPDATE_SHOP',{id,accepting:!s.accepting})){toast(s.accepting?'Shop paused.':'Shop is accepting payments.');render()}break}
 case'toggle-staff':{const s=state.staff.find(s=>s.id===id);if(await act('UPDATE_STAFF',{id,active:!s.active}))toast('Staff access updated.');break}
 case'confirm-close':{const before=metrics().balance,c=await act('CLOSE_DAY',{shopId:id});if(c){modal('closing-detail',{id:c.id});toast(ui.role==='owner'?`Day closed. Merchant balance remains ${money(before)}.`:'Shop period closed. Merchant funds stay unchanged.')}break}
 case'approve-refund':if(await act('APPROVE_REFUND',{id,approve:el.dataset.approve==='true'})){toast('Refund request updated.');render()}break;
 case'settle-all':$('#settle-form [name="amount"]').value=(metrics().available/100).toFixed(2);break;
 case'copy-account':copy(state.business.accountNumber);break;
 case'copy-link':copy(el.dataset.link);break;
 case'enable-sound':{sampleAudioFailed=false;sampleAudioUnlocked=true;const sid=$('#sound-shop').value;if(!canReceive(sid)){toast('Sign in with access to this shop to enable announcements.',true);break}localStorage.setItem('lumo-sound',JSON.stringify({enabled:true,deviceId,shopId:sid,businessId:state.business.id,userId:Auth.getSession()?.userId||null}));say(2500,true);render();break}
 case'disable-sound':sampleAudioUnlocked=false;localStorage.setItem('lumo-sound',JSON.stringify({enabled:false,deviceId}));window.speechSynthesis?.cancel();render();break;
 case'simulate':if(!canUse('simulation')){modal('demo-console');break}modal('simulate');break;
 case'resolve-payment':{if(!canUse('simulation')){toast('Use the sample business for simulated outcomes.',true);break}const t=await act('RESOLVE_PAYMENT',{id,status:el.dataset.status},{role:'owner'});if(t)toast('Demo payment outcome updated.');break}
 case'resolve-settlement':{if(!canUse('simulation')){toast('Settlement simulation is not connected.',true);break}const t=await act('RESOLVE_SETTLEMENT',{id,status:el.dataset.status},{role:'owner'});if(t)toast('Demo settlement outcome updated.');break}
 case'student-pay':if(getWorkspaceMode()==='registered'){const request=el.dataset.request?state.requests.find(r=>r.id===el.dataset.request):null;if(!shop(id)||el.dataset.request&&!request){toast('This payment request is unavailable.',true);break}window.open(paymentLink(id,request),'_blank','noopener');break}if(el.dataset.request&&!state.requests.find(r=>r.id===el.dataset.request)){toast('Payment request unavailable. Ask for a new QR.',true);break}modal('student-pay',{id,request:el.dataset.request,amount:Number(el.dataset.amount)||undefined,method:el.dataset.method});break;
 case'authorise-student':{const p=ui.modal.payment;const t=await act('PAY',{...p,status:'paid',attemptId:ui.modal.attemptId},{role:'student'});if(t)modal(t.status==='paid'?'student-success':'transaction',{id:t.id});break}
 case'view-shop-after-pay':if(getWorkspaceMode()==='registered'){dismiss();signup.setActive(false);if(Auth.getSession())enterAuthenticated(Auth.getSession());else showLogin();break}ui.role='manager';ui.shopId=id;ui.staffId=state.staff.find(s=>s.shopId===id&&s.role==='manager')?.id;ui.page='home';dismiss();resetReceiptBaseline();navigation?.reset({page:ui.page,shopId:ui.shopId});persist();render();break;
 case'enter-code':case'enter-account':case'student-scan':modal(a);break;
 case'start-scanner':startScanner();break;
 case'locate':if(!navigator.geolocation)toast('Location is unavailable. Choose a campus area.',true);else{toast('Finding your location…');navigator.geolocation.getCurrentPosition(p=>{ui.location=[p.coords.latitude,p.coords.longitude];render();toast('Nearby shops sorted by your location.')},()=>toast('Location was unavailable. You can choose an area instead.',true),{enableHighAccuracy:true,timeout:10000,maximumAge:60000})}break;
 case'capture-shop-location':captureShopLocation();break;
 case'support-ticket':modal('support-ticket',{subject:el.dataset.subject,transaction:el.dataset.transaction});break;
 case'onboarding':dismiss();signup.start();render();break;
 
 case'ask-lux':void ask(el.dataset.question);break;
 case'lux-fresh':merchantChat.clear();break;
 case'lux-open':luxHandoff(el);break;
 case'lux-recheck':{const m=merchantChat.getView().messages.find(m=>m.id===el.dataset.index);if(m)void ask(m.question,{previous:m.answer?.plan});break;}
 case'reset-demo':resetDemo();ui={role:'owner',shopId:'night-market',staffId:'staff-kojo',page:'home',collectMode:'amount',collectionNote:'',scope:'all',activitySearch:'',activityStatus:'all',activityPeriod:'today',nearbySearch:'',area:'Night Market',charge:'',chat:[],modal:null};localStorage.removeItem('lumo-sound');resetReceiptBaseline();navigation?.reset({page:ui.page,shopId:ui.shopId});persist();render();toast('Sample workspace restored.');break;
 case'export-payments':{reporting.handleClick('reporting-export-activity',el);break;const list=txns();csv([['Reference','Payer','Shop','Amount GHS','Status','Date','Method'],...list.map(t=>[t.reference,t.payer,shopName(t.shopId),(t.amount/100).toFixed(2),t.status,t.createdAt,t.method])],'lumo-payments.csv');break}
 case'export-settlements':csv([['Reference','Amount GHS','Fee GHS','Status','Destination','Date'],...state.settlements.map(t=>[t.reference,(t.amount/100).toFixed(2),(t.fee/100).toFixed(2),t.status,t.destination,t.createdAt])],'lumo-settlements.csv');break;
 case'download-closing':{const c=state.closings.find(c=>c.id===id);csv([['Shop','Closed','Payments','Gross GHS','Refunds GHS','Net GHS','Trading day Ghana','Prior-period allocations GHS','Adjustment note'],[shopName(c.shopId),c.createdAt,c.transactionIds.length,(c.gross/100).toFixed(2),(c.refunds/100).toFixed(2),(c.net/100).toFixed(2),c.businessDay||c.businessDate||'',((c.priorPeriodAllocations||0)/100).toFixed(2),c.adjustmentNote||'']],`lumo-close-${id}.csv`);break}
 case'download-receipt':{const t=state.transactions.find(t=>t.id===id);download(`LUMO MERCHANT · SAMPLE RECEIPT\n\n${state.business.name}\n${shopName(t.shopId)}\n\nAmount: ${money(t.amount)}\nStatus: ${t.status}\nPayer: ${t.payer}\nReference: ${t.reference}\nDate: ${new Date(t.createdAt).toLocaleString()}\n\nPrototype only. No real money moved.\n`,`lumo-receipt-${t.reference}.txt`);break}
 case'download-poster':{const s=shop(id),svg=qrSvg(paymentLink(s.id)).replace(/<svg /,'<svg x="110" y="180" width="380" height="380" ');download(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#f3f4f1"/><rect x="30" y="30" width="540" height="740" rx="30" fill="white"/><text x="300" y="100" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="800" letter-spacing="-2" fill="#191a22">lumo<tspan font-size="16" font-weight="600" letter-spacing="1"> merchant</tspan></text><text x="300" y="145" text-anchor="middle" font-family="Arial" font-size="21">${E(state.business.name)}</text>${svg}<text x="300" y="605" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold">${E(s.code)}</text><text x="300" y="650" text-anchor="middle" font-family="Arial" font-size="21">${E(s.name)}</text><text x="300" y="690" text-anchor="middle" font-family="Arial" font-size="16">${getWorkspaceMode()==='registered'?'Scan to pay · Confirm the shop in Lumo':'Browser-only sample · Preview on this device'}</text><text x="300" y="735" text-anchor="middle" font-family="Arial" font-size="12" fill="#747580">${getWorkspaceMode()==='registered'?'TEST MONEY · REGISTERED MERCHANT':'BROWSER-ONLY SAMPLE MERCHANT'}</text></svg>`,`lumo-${s.code}-poster.svg`,'image/svg+xml');break}
 }
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(!f.dataset.form)return;e.preventDefault();if(f.dataset.form==='payment-share'){await paymentSharing.handleSubmit(f,e);return}if(f.dataset.form==='business-plan'){await businessPlan.handleSubmit(f,e);return}if(f.dataset.form==='cashier'){await cashier.handleSubmit(f,e);return}if(['counter-pin','counter-setup'].includes(f.dataset.form)){await counterSetup.handleSubmit(f,e);return}if(f.dataset.form==='devices'){await devices.handleSubmit(f,e);return}if(f.dataset.form==='directory'){await directory.handleSubmit(f,e);return}if(f.dataset.form==='campus-pay'){await campusPay.handleSubmit(f,e);return}if(f.dataset.form==='operations'){await operations.handleSubmit(f,e);return}if(f.dataset.form==='access'){access.handleSubmit(f);return}if(f.dataset.form==='people'){people.handleSubmit(f);return}if(f.dataset.form==='signup'){signup.handleSubmit(f);return}const p=Object.fromEntries(new FormData(f)),type=f.dataset.form;
 switch(type){
 case'business':if(await act('UPDATE_BUSINESS',p))toast('Business profile updated.');break;
 case'shop':{const {customArea,...fields}=p,area=p.area==='Other'?String(customArea||'').trim():p.area;if(!area||area.length>60){toast('Enter a campus area using up to 60 characters.',true);break}const payload={...fields,area,lat:Number(p.lat),lng:Number(p.lng),activation:{locationConfirmed:p.locationConfirmed==='on'}};const s=await act(p.id?'UPDATE_SHOP':'ADD_SHOP',payload);if(s){dismiss();ui.detailShop=s.id;ui.page='shop-detail';render();toast(p.id?'Shop details saved.':'Your new shop is connected.')}break}
 case'staff':if(await act('ADD_STAFF',p)){dismiss();toast('Demo staff invitation created.')}break;
 case'refund':{
 if(refundSubmitting)break;refundSubmitting=true;
 const scope=refundScope(),workspace=getWorkspaceMode(),authEpoch=Shared.getAuthEpoch(),sessionId=Auth.getSession()?.id,modalKey=ui.modal?.key;let payload;
 const currentContext=()=>workspace===getWorkspaceMode()&&JSON.stringify(scope)===JSON.stringify(refundScope())&&(workspace!=='registered'||authEpoch===Shared.getAuthEpoch()&&Auth.getSession()?.id===sessionId);
 const requireContext=()=>{if(!currentContext()){const error=new Error('Your account or workspace changed. Check this refund from its original account.');error.code='AUTH_CHANGED';throw error}};
 const buttons=[...f.querySelectorAll('button'),...document.querySelectorAll('button[form="refund-form"]')];buttons.forEach(button=>button.disabled=true);
 try{payload=await refundAttempts.begin(...scope,{...p,amount:Math.round(Number(p.amount)*100)});requireContext();const r=await performAction('REFUND',payload);requireContext();const cleared=await refundAttempts.clear(...scope,p.transactionId,payload.attemptId);if(currentContext()&&cleared&&ui.modal?.key===modalKey)dismiss();if(currentContext())toast(r.status==='requested'?'Refund sent for owner approval.':'Refund completed.')}
 catch(error){if(payload&&currentContext()&&[400,403,404,422].includes(error.status))try{await refundAttempts.clear(...scope,p.transactionId,payload.attemptId)}catch{}if(currentContext()){toast(error.message+(pendingRefund(p.transactionId)?' Retry this same refund to confirm its outcome.':''),true);if(ui.modal?.key===modalKey)renderModal()}}
 finally{refundSubmitting=false;buttons.forEach(button=>button.disabled=false);if(currentContext()&&ui.modal?.key===modalKey)renderModal()}break
 }
 case'settle':{
 if(settlementSubmitting)break;if(!canUse('settlement')&&!pendingSettlement()){modal('open-settle');break}settlementSubmitting=true;
 const scope=settlementScope(),workspace=getWorkspaceMode(),authEpoch=Shared.getAuthEpoch(),sessionId=Auth.getSession()?.id;let pending,proof=null,checking=false;
 const currentContext=()=>workspace===getWorkspaceMode()&&JSON.stringify(scope)===JSON.stringify(settlementScope())&&(workspace!=='registered'||authEpoch===Shared.getAuthEpoch()&&Auth.getSession()?.id===sessionId&&Auth.getSession()?.role==='owner');
 const requireContext=()=>{if(!currentContext()){const error=new Error('Your account or workspace changed. Open the saved settlement from its original owner account.');error.status=409;error.code='AUTH_CHANGED';throw error}};
 try{
  pending=await settlementAttempts.begin(...scope,{amount:Math.round(Number(p.amount)*100),destination:state.business.destination});requireContext();checking=pending.submitted;
  if(getWorkspaceMode()==='registered'&&!pending.submitted&&!canUse('settlement')){await settlementAttempts.cancelDraft(...scope,pending.attemptId);modal('open-settle');break}
  if(getWorkspaceMode()==='registered'&&!pending.submitted){dismiss();proof=await access.requestStepUp({purpose:'settlement',title:'Confirm this settlement',description:'Verify your password before reserving funds for this saved amount and destination.'});if(!proof){await settlementAttempts.cancelDraft(...scope,pending.attemptId);break}requireContext()}
  async function send(){requireContext();pending=await settlementAttempts.markSubmitted(...scope,pending.attemptId);requireContext();return performAction('SETTLE',{amount:pending.amount,destination:pending.destination,attemptId:pending.attemptId,...(proof?.stepUpToken?{stepUpProof:proof.stepUpToken}:{})})}
  let settlement;
  try{settlement=await send()}catch(error){
   if(error.code!=='STEP_UP_REQUIRED'||getWorkspaceMode()!=='registered'||proof)throw error;
   dismiss();proof=await access.requestStepUp({purpose:'settlement',title:'Confirm the saved settlement',description:'The server has no completed request for this reference. Verify your password to continue with the same amount and destination.'});if(!proof)break;requireContext();settlement=await send();
  }
  requireContext();await settlementAttempts.clear(...scope,pending.attemptId);requireContext();modal('settlement-detail',{id:settlement.id});toast(checking?'Original settlement found.':settlement.status==='processing'?'Demo payout created. Funds are reserved.':'Settlement outcome confirmed.');
 }catch(error){
  if(pending&&([400,422].includes(error.status)||error.code==='DESTINATION_MISMATCH'||capabilityUnavailable(error)))await settlementAttempts.clear(...scope,pending.attemptId);
  toast(error.message+(pending&&currentContext()&&settlementAttempts.read(...scope)?' Open Settle funds to check the same saved settlement.':''),true);
  if(ui.modal?.kind==='open-settle')renderModal();
 }finally{settlementSubmitting=false}
 break;
 }
 case'destination':{let proof=null;if(getWorkspaceMode()==='registered'){dismiss();proof=await access.requestStepUp({purpose:'destination',title:'Confirm settlement details',description:'Verify your password before changing the business destination.'});if(!proof)break}if(await act('UPDATE_BUSINESS',{destination:p.destination,stepUpProof:proof?.stepUpToken})){dismiss();toast('Sandbox destination updated.')}break;}
 case'simulate':{if(!canUse('simulation')){modal('demo-console');break}const t=await act('PAY',{...p,amount:Math.round(Number(p.amount)*100),method:'qr',staffId:state.staff.find(s=>s.shopId===p.shopId&&s.role==='cashier'&&s.active)?.id,attemptId:crypto.randomUUID()},{role:'student'});if(t){modal('transaction',{id:t.id});toast(t.status==='paid'?'Payment received by '+shopName(t.shopId):t.status==='processing'?'Payment is processing. No funds credited.':'Payment failed. No funds credited.')}break}
 case'student-pay':{const s=shop(p.shopId);if(!s.accepting){toast('This shop has paused Lumo payments.',true);break}const amount=Math.round(Number(p.amount)*100);if(!Number.isSafeInteger(amount)||amount<=0){toast('Enter a valid payment amount.',true);break}modal('student-review',{payment:{...p,amount,requestId:p.requestId||undefined},attemptId:crypto.randomUUID()});break}
 case'lookup':{if(p.type==='student-scan'){acceptScannedLink(p.value);break}let s,r;if(p.type==='enter-code')s=state.shops.find(s=>s.code.toUpperCase()===p.value.trim().toUpperCase());else if(p.type==='enter-account'){if(p.value.replace(/\s/g,'')===state.business.accountNumber)s=shop(p.shopId)}else{try{const u=new URL(p.value);s=shop(u.searchParams.get('pay'));r=state.requests.find(r=>r.id===u.searchParams.get('request'));if(u.searchParams.has('request')&&!r)s=null}catch{}}if(!s){toast('No matching shop found. Check the code or account.',true);break}modal('student-pay',{id:s.id,request:r?.id,method:p.type==='enter-code'?'code':p.type==='enter-account'?'account':'qr'});break}
 case'ticket':{const linked=state.transactions.find(t=>t.id===p.transactionId||t.reference===p.transactionId),shopId=linked?.shopId||(ui.role==='owner'?p.shopId||null:ui.shopId);const t=await act('ADD_TICKET',{...p,shopId});if(t){modal('ticket-detail',{id:t.id});toast('Prototype support case saved.')}break}
 case'assign':if(await act('ASSIGN_PAYMENT',p)){dismiss();toast('Collection assigned to the shop.')}break;
 case'lux':void ask(p.question);break;

 }
});
function handleField(element){
 if(element.name?.startsWith('paymentShare')){paymentSharing.handleChange(element);return}
 if(element.closest?.('form[data-form="business-plan"]')||element.name?.startsWith('plan')){businessPlan.handleChange(element);return}
 if(element.closest?.('.cashier-workspace')||element.closest?.('form[data-form="cashier"]')){cashier.handleChange(element);return}
 if(element.closest?.('form[data-form="counter-setup"]')){counterSetup.handleChange(element);return}
 if(element.name==='question'&&element.closest?.('form[data-form="lux"]')){merchantChat.setInput(element.value);return;}
 if(element.name==='appearance'&&element.type==='radio'){if(!element.checked)return;const result=window.LumoAppearance?.setPreference(element.value);updateAppearanceUI();if(!result?.saved){const hint=document.querySelector('.appearance-hint');if(hint)hint.textContent='Changed for now. Your browser could not save this choice.'}return}
 if(access.isActive()){access.handleChange(element);return}
 if(signup.isActive()){signup.handleChange(element);return}
 if(campusPay.isActive()){campusPay.handleChange(element);return}
 if(element.dataset.reporting){reporting.handleChange(element);return}
 if(element.closest?.('form[data-form="operations"]')||element.name?.startsWith('operations')){operations.handleChange(element);return}
 if(element.closest?.('form[data-form="devices"]')){devices.handleChange(element);return}
 if(ui.role==='student'){directory.handleChange(element);return}
 if(ui.page==='team'&&getWorkspaceMode()==='registered'&&ui.role==='owner'){people.handleChange(element);return}
 if(element.dataset.change==='shopCustomArea'){invalidateShopLocationCapture();const form=element.closest('form');if(form?.elements.locationConfirmed)form.elements.locationConfirmed.checked=false;return}
 if(element.dataset.change==='shopArea'){invalidateShopLocationCapture();const custom=document.getElementById('shop-custom-area-field');if(custom){custom.hidden=element.value!=='Other';const input=custom.querySelector('input');if(input)input.required=element.value==='Other'}const coords={'Night Market':[5.6509,-.1878],Pentagon:[5.6535,-.1845],Akuafo:[5.649,-.1936],'Balme Library':[5.6515,-.1863]}[element.value];const form=element.closest('form');if(form?.elements.locationConfirmed)form.elements.locationConfirmed.checked=false;if(coords&&form){form.elements.lat.value=coords[0];form.elements.lng.value=coords[1];const link=document.getElementById('shop-map-link');if(link)link.href='https://www.google.com/maps/search/?api=1&query='+coords.join(',')}return}
 if(element.dataset.change==='collectionNote'){if(!chargeSubmitting&&!pendingCharge)ui.collectionNote=element.value;return}
 if(element.dataset.change==='collectShop'){if(chargeSubmitting||pendingCharge){toast('Check the saved request before changing shops.',true);render();return}if(!selectShop(element.value)){render();return}ui.collectionNote='';navigation?.syncPage({page:ui.page,shopId:ui.shopId},{replace:true});render();return}
 if(element.dataset.change==='assignedShop'){const session=Auth.getSession();if(session?.shopIds.includes(element.value)){ui.shopId=element.value;persist();render()}return}
 if(element.dataset.bind){ui[element.dataset.bind]=element.value;render();return}
 const key=element.dataset.change;if(!key)return;
 if(key==='demoShop'){ui.shopId=element.value;ui.staffId=state.staff.find(person=>(person.shopIds||[person.shopId]).includes(ui.shopId)&&person.role===(ui.role==='manager'?'manager':'cashier')&&person.active)?.id||'';persist();render()}
 else{ui[key]=element.value;render()}
}
document.addEventListener('input',e=>handleField(e.target));
document.addEventListener('change',e=>handleField(e.target));
document.addEventListener('keydown',e=>{
 if(cashierMode()&&!ui.modal&&!access.isActive()&&!signup.isActive()&&cashier.handleKeydown?.(e))return;
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target?.name==='question'&&e.target.closest?.('form[data-form="lux"]')){e.preventDefault();void ask(e.target.value);return;}
 if(ui.page==='checkout'&&(ui.collectMode||'amount')==='amount'&&!ui.modal&&!signup.isActive()&&!access.isActive()&&!campusPay.isActive()&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||'')){if(/^[0-9.]$/.test(e.key)||e.key==='Backspace'){e.preventDefault();document.querySelector(`[data-action="key"][data-value="${e.key==='Backspace'?'⌫':e.key}"]`)?.click()}else if(e.key==='Enter'&&!e.target.closest?.('button,a,[role="button"]')){e.preventDefault();document.querySelector('[data-action="create-charge"]:not(:disabled)')?.click()}}
 if(e.key==='Escape'){if(ui.modal||campusPay.isActive())closeOverlayWithBack();return}
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-action]')){e.preventDefault();e.target.click()}
 const dialog=$('#modal-root [role="dialog"]');if(dialog&&e.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not(:disabled),input:not([type="hidden"]),select,textarea,a[href]')].filter(el=>el.offsetParent!==null);if(!nodes.length)return;if(e.shiftKey&&document.activeElement===nodes[0]){nodes.at(-1).focus();e.preventDefault()}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){nodes[0].focus();e.preventDefault()}}
});
subscribe(event=>{
 state=getState();
 const switchEvent=['WORKSPACE_SWITCH','REGISTER_BUSINESS','DEMO_RESET','RESET_DEMO'].includes(event.type);
 if(switchEvent||receiptContext!==receiptScope())resetReceiptBaseline();
 const newConfirmed=newConfirmedReceipts(receivingPayments(state),knownPaid);
 for(const payment of newConfirmed){knownPaid.add(payment.id);if(ui.role!=='student'&&!signup.isActive()&&!access.isActive()){freshReceipts.set(payment.shopId,payment.id);if(payment.shopId===ui.shopId)announceReceipt(payment)}}
 if(getWorkspaceMode()==='registered'){
  if(Auth.getSession()&&ui.role!=='student'&&!signup.isActive())for(const payment of devices.consumePayments(receivingPayments(state)))say(payment.amount,false,payment.shopId,payment);
  if(!access.isActive()&&!signup.isActive()){if(event.type==='REMOTE_SYNC')queueSharedRender();else render();}return;
 }
 if(access.isActive()||signup.isActive())return;
 if(!switchEvent){const sound=soundConfig();for(const t of newConfirmed){if(receivingEnabled(sound)&&sound.shopId===t.shopId)say(t.amount)}}
 render();
});
let previousSession=Auth.getSession();
Auth.subscribeAuth(()=>{
 if(!appReady)return;
 state=getState();
 const currentSession=Auth.getSession(),ended=Boolean(previousSession&&!currentSession),operatorChanged=previousSession?.userId!==currentSession?.userId,authorityChanged=JSON.stringify([previousSession?.id,previousSession?.role,previousSession?.shopIds,previousSession?.expiresAt,previousSession?.recoveryKeyPending,previousSession?.recoveryKeyReference])!==JSON.stringify([currentSession?.id,currentSession?.role,currentSession?.shopIds,currentSession?.expiresAt,currentSession?.recoveryKeyPending,currentSession?.recoveryKeyReference]);previousSession=currentSession;if(operatorChanged){paymentSharing.reset();businessPlan.reset?.();cashier.reset();counterSetup.reset();devices.stop();window.speechSynthesis?.cancel();freshReceipts.clear();if(currentSession&&!counterView()?.locked)devices.start()}
 if(ended){paymentSharing.reset();businessPlan.reset?.();CounterLock.reset();cashier.reset();counterSetup.reset();navigation?.reset({page:'home',shopId:''});freshReceipts.clear();receiptContext='';const announcement=document.getElementById('payment-announcement');if(announcement)announcement.textContent='';devices.clearAnnouncementFailures?.();operations.reset();people?.reset();reporting.reset()}
 if(ended&&!Shared.isAuthTransitionPending()&&!signup.isActive()&&ui.role!=='student'){devices.stop();ui.modal=null;access.show('login',{notice:'Your session ended. Sign in again to continue.'});return}
 if(!receivingEnabled())window.speechSynthesis?.cancel();
 if(!Auth.getSession())devices.stop();
 if(access.isActive()||signup.isActive())return;
 if(getWorkspaceMode()==='registered'){syncIdentity();if(!signup.isActive()&&!access.isActive()&&ui.role!=='student'){
  const session=Auth.getSession();if(!session){ui.modal=null;access.show('login');return}
  ui.role=session.role;ui.staffId=state.staff.find(st=>st.authUserId===session.userId&&st.active)?.id||'';
 }}
 if(authorityChanged||operatorChanged||ended||counterView()?.locked)render();else queueSharedRender();
});
setInterval(()=>{if(appReady&&getWorkspaceMode()==='registered'&&ui.role!=='student'&&!signup.isActive()&&!access.isActive()&&!Auth.getSession())render()},30000);
document.addEventListener('focusin',event=>{if(/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName||''))requestAnimationFrame(()=>event.target?.scrollIntoView?.({block:'nearest',behavior:'smooth'}))});
window.addEventListener('pagehide',stopScanner);
window.addEventListener('storage',e=>{if(e.key==='lumo-sound'||e.key==='lumo-counter-screen-lock-v1'){if(counterView()?.locked){devices.stop();window.speechSynthesis?.cancel()}render()}});
setInterval(()=>{if(!appReady||signup.isActive()||access.isActive()||campusPay.isActive())return;const countdown=document.querySelector('[data-qr-expires]');if(countdown){const seconds=Math.max(0,Math.ceil((Date.parse(countdown.dataset.qrExpires)-Date.now())/1000));if(seconds===0){const key=[ui.modal?.key,countdown.dataset.qrExpires].join(':');if(key!==lastExpiredQR){lastExpiredQR=key;renderModal()}}else countdown.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}},1000);

function closeOverlayWithBack(){const fallback=()=>{if(campusPay.isActive())campusPay.hide();else dismiss()};if(navigation)navigation.backOrDismiss(fallback);else fallback()}
function historyModalAvailable(value){
 if(!value)return true;
 const owners=['approvals','open-settle','settlement-detail','edit-destination','add-shop','edit-shop','add-staff','charge-shop'];
 if(owners.includes(value.kind)&&ui.role!=='owner')return false;
 if(value.id){const lists={'request-detail':state.requests,'shop-qr':state.shops,transaction:state.transactions,'closing-detail':state.closings,'settlement-detail':state.settlements,'ticket-detail':state.tickets,'open-close':state.shops,'edit-shop':state.shops};if(lists[value.kind]&&!lists[value.kind].some(row=>row.id===value.id))return false}
 return true;
}
navigation=createAppNavigation({getContext:()=>[getWorkspaceMode(),state.business.id,Auth.getSession()?.id||ui.role,ui.role].join(':'),onRestore:route=>{
 // Appearance is a device-only sheet available before account access. History
 // may close/reopen that sheet, but cannot navigate into a business workspace.
 if(access.isActive()||signup.isActive()){
  if(route.modal&&route.modal.kind!=='appearance-settings'||ui.modal?.kind!=='appearance-settings'&&route.modal?.kind!=='appearance-settings')return false;
  restoringNavigation=true;
  try{dismiss();if(route.modal)modal('appearance-settings');return true}finally{restoringNavigation=false}
 }
 if(!historyModalAvailable(route.modal))return false;
 const previousRole=ui.role,session=Auth.getSession();if(getWorkspaceMode()==='registered'&&previousRole!=='student'&&(!session||session.role!==previousRole))return false;
 if(route.shopId&&(!state.shops.some(s=>s.id===route.shopId)||getWorkspaceMode()==='registered'&&session?.role!=='owner'&&previousRole!=='student'&&!session?.shopIds?.includes(route.shopId)))return false;
 restoringNavigation=true;
 try{if(campusPay.isActive())campusPay.hide();dismiss();navigate(route.page,route.shopId);if(ui.page!==route.page)return false;if(route.modal)modal(route.modal.kind,{id:route.modal.id});return true}finally{restoringNavigation=false}
}});

appReady=true;resetReceiptBaseline();navigation.reset({page:ui.page,shopId:ui.shopId});
if(url.searchParams.has('invite')){if(hasRegistration())state=switchWorkspace('registered');signup.setActive(false);access.show('invite',{token:url.searchParams.get('invite')})}
else if(!url.searchParams.has('pay')&&!url.searchParams.has('request')&&!url.searchParams.has('code')&&Auth.getSession()&&hasRegistration()){enterAuthenticated(Auth.getSession())}
render();


Shared.startSync();directory.refresh();

function connectionBanner(){const status=Shared.connectionStatus();return status.status==='offline'?'<div class="callout warning" role="status">Connection lost. Displayed receipts may be out of date. A pending screen or customer screenshot is not payment confirmation.</div>':'<div class="shared-indicator"><span class="live-dot"></span>Shared sandbox · Test money · Bank and SMS not connected</div>'}
function testVoice(amount){return new Promise((resolve,reject)=>{if(!window.speechSynthesis)throw Error('Voice is unavailable on this browser.');const value=amount/100;const utter=new SpeechSynthesisUtterance('Lumo voice test. Twenty-five cedis. This is a test.');utter.lang='en-GH';utter.rate=.9;utter.onend=()=>resolve(true);utter.onerror=()=>reject(Error('Voice could not play. Check your phone volume and browser sound permission.'));speechSynthesis.speak(utter);setTimeout(()=>reject(Error('Voice test did not finish. Tap to test again.')),15000)})}

function queueSharedRender(){
 sharedRenderPending=true;if(sharedRenderQueued)return;sharedRenderQueued=true;
 queueMicrotask(()=>{sharedRenderQueued=false;flushSharedRender()});
}
function flushSharedRender(){
 if(!sharedRenderPending||!appReady||signup.isActive()||access.isActive())return;
 sharedRenderPending=false;const x=window.scrollX,y=window.scrollY;render({background:true});if(window.scrollX!==x||window.scrollY!==y)window.scrollTo(x,y);
}
document.addEventListener('focusout',()=>setTimeout(flushSharedRender,0));
Shared.subscribeShared(type=>{
 if(type==='data'&&appReady&&counterView()&&!signup.isActive())queueSharedRender();
 if(type==='authority')devices.applyDevices(Shared.getCache().devices,{revision:Shared.getRevisions().devices,connection:Shared.connectionStatus().status});
 if(type==='connection'){devices.setConnection(Shared.connectionStatus().status);if(appReady&&!signup.isActive()&&!access.isActive())queueSharedRender()}
});
