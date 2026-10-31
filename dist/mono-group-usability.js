/* Preserve orientation while selecting people and rules. The existing group
   controllers still own every validation, role, mandate and financial record. */
(()=>{
'use strict';
if(!window.L||L.monoGroupUsability)return;
const routes={toggleApprover:'groupMoneyApprovers',togglePerson:'groupMoneyContacts',setMode:'groupMoneyPeople',peopleTab:'groupMoneyContacts',addPerson:'groupMoneyPeople'};
const installed=new WeakSet();
const choiceRoute='monoGroupDraftReplace';
let choice=null,resuming=null;
const allowed=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const account=()=>String(L.state.profile?.account||L.state.profile?.handle||L.state.profile?.phone||L.state.profile?.name||'');
const signature=draft=>JSON.stringify(draft);
const currentDraft=()=>{const draft=L.state.groupMoney?.draft;return draft?.account===account()?draft:null;};
const meaningful=draft=>!!draft&&!draft.createdId&&(!!String(draft.title||'').trim()||!!String(draft.total||'').trim()||!!String(draft.target||'').trim()||(draft.people||[]).some(person=>!person.isOwner&&String(person.name||'').trim())||draft.stage&&draft.stage!=='basics'||draft.deadline&&draft.deadline!==new Date(Date.now()+14*86400000).toISOString().slice(0,10));
const valid=decision=>!!decision&&allowed()&&L.state===decision.state&&account()===decision.account&&currentDraft()===decision.draft&&signature(decision.draft)===decision.signature&&decision.intent();
function queueResume(){
 const decision=resuming;if(!decision||decision.queued||L.route!==decision.route||JSON.stringify(L.params||{})!==decision.params)return;
 decision.queued=true;
 // A browser Back event completes before the original controller starts the
 // replacement. Its push then replaces the confirmation's forward entry.
 setTimeout(()=>{
  if(resuming!==decision)return;resuming=null;
  if(!valid(decision)||L.route!==decision.route||JSON.stringify(L.params||{})!==decision.params)return;
  decision.action();
 },0);
}
function keepDraft(){const returning=!!resuming;choice=null;resuming=null;if(L.route===choiceRoute&&!returning)L.back();}
function replaceDraft(){
 const decision=choice;
 if(L.route!==choiceRoute||resuming)return false;
 if(!valid(decision)){choice=null;return L.error('Your unfinished request changed. Go back and review it before starting another.');}
 choice=null;resuming=decision;L.back();queueResume();return true;
}
L.views[choiceRoute]=()=>{
 const decision=choice;
 if(!valid(decision))return L.header('This choice is no longer current.','Your unfinished request has not been replaced.')+L.btn('Go back','L.monoGroupUsability.keepDraft()','secondary');
 const previous=decision.draft.type==='split'?'split':'collection',next=decision.type==='split'?'split':'collection',replacement=decision.newSource?'a split for another payment':'a '+next;
 return L.header('Replace your unfinished '+previous+'?')+'<div class="native-decision-copy"><p>You have an unfinished '+previous+'. Starting '+replacement+' will replace it.</p></div><div id="error" role="alert"></div><div class="actions">'+L.btn('Replace & start '+next,'L.monoGroupUsability.replaceDraft()')+L.btn('Keep my '+previous,'L.monoGroupUsability.keepDraft()','secondary')+'</div>';
};
L.taskSheet?.register(choiceRoute,{family:'records',treatment:'confirmation',label:'Unfinished request'});
const interactive=node=>node?.matches?.('button,input,select,textarea,a[href],summary');
const descriptor=node=>interactive(node)?{id:node.id||'',tag:node.localName,action:node.getAttribute('onclick'),label:node.getAttribute('aria-label')}:null;
const replacement=(root,old)=>{
 if(!old)return null;
 const candidates=[...root.querySelectorAll('button,input,select,textarea,a[href],summary')];
 const found=old.id?candidates.find(node=>node.id===old.id):old.action?candidates.find(node=>node.localName===old.tag&&node.getAttribute('onclick')===old.action&&node.getAttribute('aria-label')===old.label):null;
 return found&&!found.disabled&&!found.hidden&&!found.closest?.('[hidden],[inert]')?found:null;
};
function install(){
 const gm=L.gm;if(!gm||installed.has(gm))return;installed.add(gm);
 for(const [name,route]of Object.entries(routes)){
  const original=gm[name];if(typeof original!=='function')continue;
  gm[name]=function(...args){
   const view=document.getElementById('view');
   if(!allowed()||L.route!==route||!view)return original.apply(this,args);
   // Re-selecting an already active mode must not reset custom shares.
   if(name==='setMode'&&['equal','custom'].includes(args[0])&&currentDraft()?.mode===args[0]){gm.capture?.();return false;}
   const body=view.querySelector('.gm-body'),state=L.state,key=account(),params=JSON.stringify(L.params||{}),scroll={top:view.scrollTop,left:view.scrollLeft,bodyTop:body?.scrollTop||0,bodyLeft:body?.scrollLeft||0},oldFocus=view.contains(document.activeElement)?descriptor(document.activeElement):null;
   const result=original.apply(this,args);
   if(L.state!==state||account()!==key||!allowed()||L.route!==route||JSON.stringify(L.params||{})!==params||document.getElementById('view')!==view)return result;
   const active=document.activeElement,error=document.getElementById('error');
   // Validation owns its field/error focus and scrolling. A removed control
   // also keeps the controller's normal focus instead of guessing a substitute.
   if(active?.getAttribute?.('aria-invalid')==='true'||error&&error.textContent.trim()&&(active===error||error.contains(active)))return result;
   const target=replacement(view,oldFocus);
   if(oldFocus&&!target)return result;
   if(target)target.focus?.({preventScroll:true});
   const updatedBody=view.querySelector('.gm-body');if(updatedBody){updatedBody.scrollTop=scroll.bodyTop;updatedBody.scrollLeft=scroll.bodyLeft;}
   view.scrollTop=scroll.top;view.scrollLeft=scroll.left;
   return result;
  };
 }
 for(const [name,type]of [['startSplit','split'],['startCollection','collection']]){
  const original=gm[name];if(typeof original!=='function')continue;
  gm[name]=function(...args){
   if(!allowed())return original.apply(this,args);
   if(type==='split'&&args[0]&&L.groupMoney?.splitForSource?.(args[0]))return original.apply(this,args);
   if(type==='split'&&args[0]&&!L.groupMoney?.eligibleSource?.((L.state.txs||[]).find(tx=>tx.id===args[0])))return L.toast('Choose a completed payment.');
   const draft=currentDraft();
   if(L.route===choiceRoute)return false;
   // The no-argument controller path resumes an existing source split without
   // resetting its edited title, custom shares or current setup stage.
   if(type==='split'&&args[0]&&draft?.type==='split'&&!draft.createdId&&draft.sourceTxId===args[0])return original.call(this);
   const newSource=type==='split'&&!!args[0]&&draft?.type==='split'&&draft.sourceTxId!==args[0];
   if(!draft||draft.type===type&&!newSource||!meaningful(draft))return original.apply(this,args);
   choice={state:L.state,account:account(),draft,signature:signature(draft),type,newSource,route:L.route,params:JSON.stringify(L.params||{}),intent:()=>type!=='split'||!args[0]||!!L.groupMoney?.eligibleSource?.((L.state.txs||[]).find(tx=>tx.id===args[0])),action:()=>original.apply(this,args)};
   resuming=null;L.go(choiceRoute);return false;
  };
 }
 const next=gm.next;
 if(typeof next==='function')gm.next=function(...args){
  const draft=currentDraft();
  if(!allowed()||L.route!=='groupMoneySplit'||draft?.mode!=='custom')return next.apply(this,args);
  const state=L.state,key=account(),shares=new Map(draft.people.map(person=>[person.id,person.amount]));
  const result=next.apply(this,args);
  // The original controller validates the basics and advances first. Retain
  // explicit shares after its equal-share initialisation; its existing review
  // still rejects a changed total that no longer matches those shares.
  if(L.state===state&&account()===key&&allowed()&&currentDraft()===draft&&L.route==='groupMoneyPeople'&&draft.mode==='custom'){
   for(const person of draft.people)if(shares.has(person.id))person.amount=shares.get(person.id);
   L.clearFormDraft?.('groupMoneyPeople',L.params||{});L.render();
  }
  return result;
 };
}
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let result=decorate?decorate.call(this,html,route):html;
 const draft=L.state.groupMoney?.draft;
 if(route==='groupMoneyPeople'&&allowed()&&draft?.type==='split')result=result.replace(/<button\b([^>]*\bonclick="L\.gm\.setMode\('(equal|custom)'\)"[^>]*)>/g,(_,attrs,mode)=>'<button'+attrs.replace(/\saria-pressed="[^"]*"/g,'')+' aria-pressed="'+(draft.mode===mode)+'">');
 if(route==='groupMoneyList'&&allowed()){
  const filter=['all','split','collection'].includes(L.params.filter)?L.params.filter:'all';
  result=result.replace(/<button\b([^>]*\bonclick="L\.go\('groupMoneyList',\{filter:'(all|split|collection)'\}\)"[^>]*)>/g,(_,attrs,value)=>'<button'+attrs.replace(/\saria-pressed="[^"]*"/g,'')+' aria-pressed="'+(filter===value)+'">');
 }
 return result;
};
// Presentation adapters are installed before group-money-ui in the reviewed
// script order. Lazily wrap its controls once the full product has loaded.
const render=L.render;
L.render=function(...args){install();if(choice&&!valid(choice))choice=null;if(resuming&&!valid(resuming))resuming=null;const result=render.apply(this,args);queueResume();return result;};
const before=L.beforeNavigate;
L.beforeNavigate=function(route,params,...args){
 if(L.route===choiceRoute&&route!==choiceRoute)choice=null;
 if(resuming&&(route!==resuming.route||JSON.stringify(params||{})!==resuming.params))resuming=null;
 return before?.call(this,route,params,...args);
};
L.monoGroupUsability=Object.freeze({version:1,keepDraft,replaceDraft});
install();
})();
