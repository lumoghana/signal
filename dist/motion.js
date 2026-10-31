/* Lumo motion: reveal the consequence, hold it, then settle. Presentation only. */
(()=>{
'use strict';
if(!window.L)return;
const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
const jobs=new Set();
const rules=Object.freeze({reveal:180,hold:80,resolve:220,press:100,ease:'cubic-bezier(.2,.75,.3,1)'});
const duration=rules.reveal+rules.hold+rules.resolve;
let lastChatCount=0,lastProjection='';
const canMove=()=>!preference.matches&&!document.hidden;
const all=(root,selector)=>[...(root?.querySelectorAll?.(selector)||[])];
const stop=()=>{for(const job of [...jobs])job.cancel();jobs.clear();};
const animate=(element,frames,options={})=>{
 if(!element||!canMove()||typeof element.animate!=='function')return null;
 const {scope='',...timing}=options;
 let animation;
 try{animation=element.animate(frames,{duration,easing:rules.ease,...timing});}catch{return null;}
 const job={scope,element,cancel(){try{animation.cancel();}catch{}jobs.delete(job);}};
 jobs.add(job);
 animation.finished?.then?.(()=>jobs.delete(job),()=>jobs.delete(job));
 return animation;
};
// Every keyframe keeps the real text present. There are no counters or money tweens.
const focus=(element,{distance=4,scope=''}={})=>animate(element,[
 {opacity:.88,transform:`translateY(${distance}px)`},
 {opacity:1,transform:'translateY(0)',offset:rules.reveal/duration},
 {opacity:1,transform:'translateY(0)',offset:(rules.reveal+rules.hold)/duration},
 {opacity:1,transform:'translateY(0)'}
],{scope});
const finishScene=scene=>{
 scene.classList?.remove('pause-is-playing');scene.classList?.add('pause-is-complete');
 const token=scene.querySelector?.('.pause-payment-token');if(token)token.style.opacity='0';
};
const resultState=hero=>{
 const requested=hero?.dataset?.paymentState||hero?.getAttribute?.('data-payment-state');
 if(!requested)return '';
 const id=hero.dataset?.resultId||hero.getAttribute?.('data-result-id')||L.params?.id||L.state?.paymentDraft?.submittedTxId;
 const tx=(L.state?.txs||[]).find(item=>item.id===id);
 // Markup cannot turn a pending or undelivered transaction into a success flourish.
 if(['confirmed','success'].includes(requested))return tx?.status==='success'&&(!tx.delivery||tx.delivery==='delivered')?'confirmed':'';
 return requested;
};
const animateResult=hero=>{
 const state=resultState(hero),mark=hero.querySelector?.('.success-mark,.result-mark,[data-result-mark]');
 if(!mark)return;
 if(state==='confirmed'){
  animate(mark,[{transform:'scale(.96)'},{transform:'scale(1.025)',offset:rules.reveal/duration},{transform:'scale(1.025)',offset:(rules.reveal+rules.hold)/duration},{transform:'scale(1)'}]);
  all(mark,'svg path').forEach(path=>{
   let length;try{length=path.getTotalLength();}catch{return;}
   if(Number.isFinite(length)&&length>0)animate(path,[{strokeDasharray:length,strokeDashoffset:length},{strokeDasharray:length,strokeDashoffset:0}],{duration:rules.resolve});
  });
 }else if(['pending','delivery-pending'].includes(state)){
  // A finite focus change, not a success bounce or a perpetual waiting animation.
  animate(mark,[{opacity:.7},{opacity:1}],{duration:rules.reveal+rules.hold});
 }else if(['failed','delivery-failed','reversed'].includes(state)){
  animate(mark,[{opacity:.85},{opacity:1}],{duration:rules.reveal});
 }
};
L.motionRules=rules;
L.motionProjection=element=>{
 if(!element)return;
 // In-place amount editing stays calm. Replace this edge effect rather than stacking it.
 for(const job of [...jobs])if(job.scope==='projection-live'&&job.element===element)job.cancel();
 animate(element,[
  {opacity:1,boxShadow:'0 0 0 2px rgba(32,38,30,.12)'},
  {opacity:1,boxShadow:'0 0 0 0 rgba(32,38,30,0)'}
 ],{duration:rules.reveal,scope:'projection-live'});
};
L.motionPrivacy=visible=>{
 const root=document.getElementById('view');if(!root)return;
 root.classList?.toggle('lumo-balances-revealed',!!visible);
 if(!visible)return;
 // The relationship appears together. No sequential hiding or disclosure of other details.
 all(root,'#overview-balance,#overview-room,.home-plan-math').forEach(element=>focus(element,{distance:2}));
};
L.motion=()=>{
 stop();
 const root=document.getElementById('view');if(!root)return;
 document.documentElement.classList.add('lumo-motion-ready');
 if(!canMove()){all(root,'.pause-scene').forEach(finishScene);return;}
 // Screen movement is brief and never delays a control or a consequence.
 const screen=root.querySelector?.('.screen');
 if(screen)animate(screen,[{transform:'translateY(3px)'},{transform:'translateY(0)'}],{duration:rules.reveal});
 all(root,'[data-insight]').slice(0,3).forEach(element=>focus(element));
 const projection=[L.state?.paymentDraft?.id,L.state?.paymentDraft?.amount,L.state?.paymentDraft?.fee,L.state?.paymentDraft?.essentialId].join('|');
 if(projection!==lastProjection){
  all(root,'[data-projection]').forEach(element=>focus(element,{distance:3}));
  lastProjection=projection;
 }
 all(root,'[data-payment-state]').forEach(animateResult);
 const count=L.state?.chats?.length||0;
 if(L.route==='chat'&&count>lastChatCount){
  const answer=root.querySelector?.('#chat-latest-reply');
  if(answer)focus(answer,{distance:lastChatCount?3:7});
  // The introduction has already collapsed; the usable answer takes its place at once.
  const workspace=root.querySelector?.('.chat-has-conversation');
  if(!lastChatCount&&workspace)animate(workspace,[{transform:'translateY(5px)'},{transform:'translateY(0)'}],{duration:rules.resolve});
 }
 lastChatCount=count;
 if(root.querySelector?.('.pause-scene'))L.animatePause();
};
L.animatePause=()=>{
 const scene=document.querySelector('.pause-scene');if(!scene)return;
 for(const job of [...jobs])if(job.scope==='pause')job.cancel();
 finishScene(scene);
 if(!canMove())return;
 const wallet=scene.querySelector?.('.pause-wallet'),recipient=scene.querySelector?.('.pause-recipient'),token=scene.querySelector?.('.pause-payment-token');
 // The optional sample replay illustrates the route, while projected figures stay final.
 if(token&&wallet&&recipient){
  const a=wallet.getBoundingClientRect(),b=recipient.getBoundingClientRect(),c=token.getBoundingClientRect();
  const startX=a.left+a.width/2-(c.left+c.width/2),startY=a.top+a.height/2-(c.top+c.height/2);
  const endX=b.left+b.width/2-(c.left+c.width/2),endY=b.top+b.height/2-(c.top+c.height/2);
  animate(token,[{opacity:0,transform:`translate(${startX}px,${startY}px) scale(.8)`},{opacity:1,transform:`translate(${startX}px,${startY}px) scale(1)`,offset:rules.reveal/duration},{opacity:1,transform:`translate(${endX}px,${endY}px) scale(1)`,offset:(rules.reveal+rules.hold)/duration},{opacity:0,transform:`translate(${endX}px,${endY}px) scale(.9)`}],{scope:'pause'});
 }
 const facts=scene.querySelector?.('.pause-wallet');if(facts)focus(facts,{distance:2,scope:'pause'});
};
const syncPreference=()=>{
 document.documentElement.classList.toggle('lumo-motion-paused',!canMove());
 if(!canMove()){stop();all(document,'.pause-scene').forEach(finishScene);}
};
document.addEventListener('visibilitychange',syncPreference);
preference.addEventListener?.('change',syncPreference);
syncPreference();
})();
