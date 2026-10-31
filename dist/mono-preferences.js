/* One marketing choice across signup, Privacy and Notifications. Existing
   account choices win over legacy defaults; no other preference is changed. */
(()=>{
'use strict';
if(!window.L||L.monoPreferences||!L.acct||!L.onboarding)return;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function sync(state=L.state){
 if(state!==L.state)return;
 let changed=false;
 if(!record(state.prefs)){state.prefs={};changed=true;}
 if(!record(state.accountPrefs)){
  state.accountPrefs={personalisation:false,plan:true,chat:true};changed=true;
 }
 const preferences=state.accountPrefs;
 // An existing own false may be an explicit opt-out. Never replace it with
 // an older signup true, even if its original reason cannot be recovered.
 const value=own(preferences,'marketing')?preferences.marketing===true:state.prefs.marketing===true;
 if(preferences.marketing!==value){preferences.marketing=value;changed=true;}
 if(state.prefs.marketing!==value){state.prefs.marketing=value;changed=true;}
 if(changed&&state===L.state)L.save();
}
function acceptedChoice(state,value){
 if(state!==L.state)return;
 sync(state);
 if(state!==L.state)return;
 if(state.accountPrefs.marketing===value&&state.prefs.marketing===value)return;
 state.accountPrefs.marketing=value;state.prefs.marketing=value;L.save();
}
for(const route of ['privacy','notificationPrefs']){
 const view=L.views[route];if(!view)continue;
 L.views[route]=function(...args){sync();return view.apply(this,args);};
}
const toggle=L.acct.toggle;
L.acct.toggle=function(key,...args){
 const state=L.state;
 if(key==='marketing')sync(state);
 const result=toggle.call(this,key,...args);
 if(key==='marketing'&&state===L.state)sync(state);
 return result;
};
const create=L.onboarding.createAccount;
L.onboarding.createAccount=function(...args){
 const state=L.state,reference=state.setup?.applicationRef,onboarded=state.onboarded;
 const updates=document.getElementById('productMessages'),choice=updates?.checked===true;
 const result=create.apply(this,args);
 // The original controller alone validates consent/completed setup and
 // creates the application reference. Failed or repeated submissions cannot
 // change an existing marketing choice. Pending applications count as sent.
 if(state===L.state&&!onboarded&&!reference&&state.setup?.applicationRef&&updates)acceptedChoice(state,choice);
 return result;
};
for(const [owner,name]of [[L.acct,'toggle'],[L.onboarding,'createAccount']]){
 const action=owner[name];owner[name]=function(...args){return L.accountChange?L.accountChange(()=>action.apply(this,args),'Save account preferences'):action.apply(this,args);};
}
L.monoPreferences=Object.freeze({version:1});
sync();
})();
