/* Branded choices preserve the existing validation and mutation functions.
   Pending decisions and form fields live only in this short-lived closure. */
(()=>{
'use strict';
let pending=null,accepting=false;
const E=L.e,B=L.btn;
const clone=value=>JSON.parse(JSON.stringify(value||{}));
const controls=()=>[...(document.getElementById('view')?.querySelectorAll?.('input,select,textarea')||[])].filter(el=>el.id);
const sensitive=el=>el.type==='password'||/pin|password|otp|verification/i.test(el.id);
const clear=decision=>{if(!decision)return;for(const field of decision.secrets||[])field.node.value='';decision.secrets.length=0;decision.fields.length=0;};
const current=()=>{
 if(pending&&pending.account!==L.state){clear(pending);pending=null;}
 return pending;
};
// Artwork can retain the originating task without exposing fields or actions.
L.nativeDecisionContext=()=>current()?{route:pending.route,scene:pending.artScene}:null;
function present(message,action,title='Before you continue',label='Confirm'){
 clear(pending);
 const fields=controls();
 // A confirmation continues the same task. Sensitive controls are retained as
 // short-lived detached DOM nodes, never serialized into a draft or storage.
 pending={account:L.state,message:String(message),action,title,label,route:L.route,artScene:L.boldArt?.sceneFor(L.route),params:clone(L.params),fields:fields.filter(el=>!sensitive(el)).map(el=>({id:el.id,value:el.value,checked:el.checked})),secrets:fields.filter(sensitive).map(node=>({id:node.id,node}))};
 L.go('actionConfirm');
}
L.views.actionConfirm=()=>{
 current();
 if(!pending)return L.header('Your choice is saved','Return to the task you were working on.')+B('Go back','L.back()');
 return L.header(pending.title,'')+`<div class="native-decision-copy"><p>${E(pending.message)}</p></div><div id="error" role="alert"></div><div class="actions">${B(E(pending.label),'L.acceptNativeDecision()')}${B('Keep things as they are','L.cancelNativeDecision()','secondary')}</div>`;
};
const restore=decision=>{
 L.go(decision.route,decision.params);
 for(const field of decision.fields){const el=document.getElementById(field.id);if(el){el.value=field.value;if(typeof field.checked==='boolean')el.checked=field.checked;}}
 for(const field of decision.secrets){const el=document.getElementById(field.id);if(el)el.value=field.node.value;field.node.value='';}
};
L.cancelNativeDecision=()=>{const decision=current();if(!decision)return L.back();pending=null;restore(decision);clear(decision);};
L.acceptNativeDecision=()=>{
 const decision=current();if(!decision)return;pending=null;restore(decision);
 accepting=true;const confirm=window.confirm;
 try{window.confirm=()=>true;decision.action();}finally{window.confirm=confirm;accepting=false;clear(decision);}
};
const wrap=(owner,name,title,label)=>{
 const action=owner?.[name];if(typeof action!=='function')return;
 owner[name]=function(...args){
  if(accepting)return action.apply(this,args);
  let message=null;const confirm=window.confirm,self=this;
  // Existing preconditions still execute before a decision is presented. The
  // original function returns at its own confirmation gate without mutating.
  try{window.confirm=value=>{message=String(value);return false;};action.apply(self,args);}finally{window.confirm=confirm;}
  if(message)present(message,()=>action.apply(self,args),title,label);
 };
};
wrap(L,'markExternalEssential','Cover this cost outside Lumo?','Mark as covered');
wrap(L,'removeEssential','Remove this planned cost?','Remove cost');
wrap(L,'archiveGoal','Archive this goal?','Archive goal');
for(const [name,title,label]of [['savePhone','Change your phone number?','Change number'],['signout','Sign out of Lumo?','Sign out'],['endSession','End this session?','End session'],['resolveCase','Close this saved report?','Close report'],['submitClosure','Request account closure?','Request closure'],['confirmClosure','Confirm preview closure?','Confirm closure'],['cancelClosure','Keep your account open?','Cancel closure request'],['cancelSale','Cancel this unpaid sale?','Cancel sale'],['reconcileAdjustment','Confirm this adjustment?','Confirm adjustment']])wrap(L.acct,name,title,label);
const profile=L.views.profileEdit;
if(profile)L.views.profileEdit=()=>profile().replace("if(confirm('Discard your unsaved changes?'))L.go('profile')",'L.confirmProfileDiscard()');
L.confirmProfileDiscard=()=>present('Discard your unsaved profile changes?',()=>L.finishForm('profile'),'Discard these changes?','Discard changes');
const before=L.beforeNavigate;
L.beforeNavigate=function(route,...args){
 if(pending&&L.route==='actionConfirm'&&route!=='actionConfirm'){clear(pending);pending=null;}
 return before?.call(this,route,...args);
};
const render=L.render;
L.render=function(...args){current();return render.apply(this,args);};
})();
