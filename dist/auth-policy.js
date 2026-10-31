/* One account-level preview credential policy. Real authorisation is a bank /
   device integration; this shared demonstration never claims native security. */
(()=>{
'use strict';
const MAX=5,COOLDOWN=60000;
const snapshot=()=>{
 const p=L.state.credentialPolicy||{},until=Number(p.blockedUntil)||0;
 const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));
 const failures=until&&until<=Date.now()?0:Math.max(0,Number(p.failures)||0);
 return {ok:!seconds,locked:!!L.state.locked,coolingDown:seconds>0,seconds,remaining:Math.max(0,MAX-failures),failures,blockedUntil:until,message:seconds?'Too many PIN attempts. Try again in '+seconds+' seconds, or recover access.':''};
};
const persist=()=>L.save()!==false;
L.authPolicy=Object.freeze({
 version:1,maxAttempts:MAX,cooldownMs:COOLDOWN,
 status:snapshot,
 verify(value,{allowLocked=false,purpose=''}={}){
  const current=snapshot();
  if(L.persistence?.ensureCurrent?.()===false)return {...current,ok:false,message:'Load the latest saved progress before approving this action.'};
  if(current.coolingDown)return {...current,ok:false};
  if(L.state.locked&&!allowLocked)return {...current,ok:false,locked:true,message:'Sign in again before approving this action.'};
  const pin=String(value??'');
  if(!/^\d{6}$/.test(pin))return {...current,ok:false,message:'Enter your six-digit Lumo PIN.'};
  if(!L.state.profile?.pin)return {...current,ok:false,message:'There is no PIN saved for this sample account.'};
  let different=pin.length^String(L.state.profile.pin).length;
  for(let i=0;i<6;i++)different|=pin.charCodeAt(i)^String(L.state.profile.pin).charCodeAt(i);
  const policy={failures:current.failures,blockedUntil:0};
  if(different){
   policy.failures++;
   if(policy.failures>=MAX){policy.blockedUntil=Date.now()+COOLDOWN;L.state.locked=true;}
   L.state.credentialPolicy=policy;
   if(!persist())return {...snapshot(),ok:false,message:'Lumo could not save the PIN-attempt state. Resolve the saved-progress warning before continuing.'};
   const result=snapshot();
   return {...result,ok:false,message:result.message||'That PIN did not match. '+result.remaining+' attempt'+(result.remaining===1?'':'s')+' remaining.'};
  }
  L.state.credentialPolicy={failures:0,blockedUntil:0};
  if(!persist())return {...snapshot(),ok:false,message:'Lumo could not save this approval. Resolve the saved-progress warning before continuing.'};
  return {...snapshot(),ok:true,purpose:String(purpose).slice(0,80),message:''};
 },
 reset(){
  if(L.persistence?.ensureCurrent?.()===false)return false;
  L.state.credentialPolicy={failures:0,blockedUntil:0};return persist();
 }
});
})();
