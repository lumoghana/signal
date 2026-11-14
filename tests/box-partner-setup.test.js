import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createDemoState, applyAction } from '../dist/js/model.js';
import {getBoxPartnerInvitationPreview} from '../dist/js/box-partner-invitation.js';
import { renderPlanning, bindPlanning } from '../dist/js/planning.js';

class Element extends EventTarget {
  constructor(value = '', dataset = {}) { super(); this.value = value; this.dataset = dataset; this.isConnected = true; this.disabled = false; this.textContent = ''; }
  click() { this.dispatchEvent(new Event('click')); }
}
const boxDraft = changes => ({name:'Next semester',emoji:'🎓',target:90000,deadline:'2027-01-15',...changes});
const createRoute = (step, extra = {}) => ({section:'boxes',page:'create',step,...extra});
function binder({state = createEmptyState({name:'Ama',phone:'0240000000'}),draft = {box:boxDraft()},route = createRoute('partner'),action,fields = {}}) {
  let current = {...route}, capture, refreshes = 0;
  const nodes = new Map(Object.entries(fields).map(([key,value]) => [key,new Element(value)]));
  const button = new Element('',{action:`p:${action}`}), error = new Element(), navigations = [], acts = [], sheets = [], celebrations = [], toasts = [];
  const ctx = {state,draft,get route(){return current;},
    $(selector){return selector === '#planning-error' ? error : nodes.get(selector) || null;},
    $$(selector){return selector === 'input, select' ? [...nodes.values()] : selector.startsWith('[data-action') ? [button] : [];},
    setCapture(fn){capture=fn;},saveDraft(){},refresh(){capture?.();refreshes++;},
    go(next){capture?.();current=next;navigations.push(next);},finish(next){current=next;navigations.push(next);},
    act(type,payload){acts.push({type,payload});return applyAction(state,type,payload);},
    toast(message){toasts.push(message);},closeSheet(){},sheet(html){sheets.push(html);},celebrate(value){celebrations.push(value);},auth(value){sheets.push(value);},
  };
  const cleanup = bindPlanning(ctx,route);
  return {ctx,state,draft,nodes,button,error,navigations,acts,sheets,celebrations,toasts,cleanup,get refreshes(){return refreshes;},setRoute(next){current=next;},capture(){capture?.();},click(){button.click();}};
}

test('accountability partner is a visible optional fifth-stage setup choice, with accurate consent and demo copy',()=>{
  const ctx={state:createEmptyState(),draft:{box:boxDraft()}};
  const html=renderPlanning(ctx,createRoute('partner'));
  assert.match(html,/Accountability partner/);assert.match(html,/Step 4 of 5/);assert.match(html,/Save with a little backup/);
  assert.match(html,/fresh code for each move back to Everyday/);assert.match(html,/confirm with your PIN/);
  assert.match(html,/No SMS or message is sent/);assert.match(html,/Not now/);
  assert.match(html,/This is still your money\. Your partner cannot spend it/);
  assert.match(html,/<details[^>]*><summary>If your partner is unavailable/);
  assert.match(html,/Toll-free number to be confirmed/);
  assert.match(html,/relationship changes|urgent access/);
  assert.match(html,/verify your identity and record a review/);
  assert.match(html,/accountability partner controls/);
  assert.match(html,/current partner or verified Lumo support must approve/);
  assert.match(html,/Once they accept/);
  assert.ok(html.indexOf('Toll-free number to be confirmed') < html.indexOf('data-action="p:box-partner-toggle"'), 'recovery guidance is available before the optional partner is enabled');
  assert.doesNotMatch(html,/href="tel:/);
  assert.doesNotMatch(html,/name="box-partner-phone"/);
  const before=JSON.stringify(ctx.state);renderPlanning(ctx,createRoute('partner'));assert.equal(JSON.stringify(ctx.state),before);
});

test('date advances into partner setup, while editing a date returns to review',()=>{
  for (const edit of [false,true]) {
    const h=binder({route:createRoute('date',edit?{edit:true}:{}),action:'box-date',fields:{'[name="planning-date"]':'2027-01-15'}});
    h.click();assert.equal(h.navigations.at(-1).step,edit?'review':'partner');h.cleanup();
  }
});

test('an old or skipped draft stays unprotected and the review explains that a partner can be added later',()=>{
  const draft={box:boxDraft()}, h=binder({draft,action:'box-partner'});
  h.click();assert.equal(h.navigations.at(-1).step,'review');
  const html=renderPlanning(h.ctx,createRoute('review'));
  assert.match(html,/Step 5 of 5/);assert.match(html,/No partner\. You can add one later/);
  h.cleanup();
  const save=binder({draft,route:createRoute('review'),action:'box-save'});save.click();
  assert.equal(save.acts[0].type,'createBox');assert.equal(save.acts[0].payload.accountabilityPartner,undefined);
  assert.equal(save.state.boxes.length,1);assert.equal(save.state.boxes[0].protection,undefined);assert.equal(save.state.wallet,0);save.cleanup();
});

test('partner fields capture without rerender and survive JSON session restoration',()=>{
  const draft={box:boxDraft({partnerEnabled:true})}, h=binder({draft,action:'box-partner',fields:{'[name="box-partner-name"]':'Esi Owusu','[name="box-partner-phone"]':'+233 24 123 4567'}});
  h.nodes.get('[name="box-partner-name"]').dispatchEvent(new Event('input'));
  h.nodes.get('[name="box-partner-phone"]').dispatchEvent(new Event('input'));
  assert.equal(h.refreshes,0);assert.equal(draft.box.partnerName,'Esi Owusu');assert.equal(draft.box.partnerPhone,'+233 24 123 4567');
  assert.equal(draft.box.lastRoute.step,'partner');
  const restored=JSON.parse(JSON.stringify(draft));const html=renderPlanning({state:h.state,draft:restored},createRoute('partner'));
  assert.match(html,/value="Esi Owusu"/);assert.match(html,/value="\+233 24 123 4567"/);h.cleanup();
});

test('a partner must accept and confirm their first code before review can create the box',()=>{
  const state=createDemoState(),before={wallet:state.wallet,boxes:state.boxes.length,transactions:state.transactions.length};
  const draft={box:boxDraft({partnerEnabled:true,partnerName:'Esi Owusu',partnerPhone:'+233 24 123 4567'})};
  const choose=binder({state,draft,action:'box-partner'});choose.click();
  assert.equal(choose.navigations.length,0);assert.equal(draft.box.partnerPhone,'0241234567');assert.equal(draft.box.partnerCodePhase,'code');assert.equal(choose.acts[0].type,'sendBoxPartnerInvitation');assert.equal(state.boxes.length,before.boxes);choose.cleanup();
  const premature=binder({state,draft,route:createRoute('review'),action:'box-save'});premature.click();assert.equal(premature.acts.length,0);assert.match(premature.error.textContent,/Confirm your partner/);premature.cleanup();
  const id=draft.box.partnerInvitationId;
  assert.equal(applyAction(state,'respondBoxPartnerInitialInvitation',{invitationId:id,decision:'accepted'}).ok,true);
  const code=getBoxPartnerInvitationPreview(state,id).code;
  const verify=binder({state,draft,action:'partner-initial-verify',fields:{'[name="box-partner-code"]':code}});verify.click();assert.equal(verify.error.textContent,'');assert.equal(state.boxes.length,before.boxes);assert.equal(draft.box.partnerCode,undefined);assert.doesNotMatch(JSON.stringify(draft),new RegExp(code));verify.cleanup();
  const next=binder({state,draft,action:'partner-initial-continue'});next.click();assert.equal(next.navigations.at(-1).step,'review');next.cleanup();
  const review=renderPlanning({state,draft},createRoute('review'));assert.match(review,/Esi Owusu/);assert.match(review,/024 ••• 4567/);assert.match(review,/Accepted and number confirmed/);assert.doesNotMatch(review,/0241234567/);
  const save=binder({state,draft,route:createRoute('review'),action:'box-save'});save.click();
  assert.deepEqual(save.acts[0].payload.accountabilityPartner,{name:'Esi Owusu',phone:'0241234567'});assert.equal(save.acts[0].payload.partnerInvitationId,id);
  const box=state.boxes.at(-1);assert.equal(box.protection.status,'active');assert.equal(box.protection.partner.phone,'0241234567');
  assert.equal(state.wallet,before.wallet);assert.equal(box.balance,0);assert.equal(state.boxes.length,before.boxes+1);assert.equal(state.transactions.length,before.transactions);
  save.click();assert.equal(state.boxes.length,before.boxes+1,'Repeated clicks never create a second box.');save.cleanup();
});

test('missing, invalid and self partner details cannot progress or be silently saved',()=>{
  for (const partner of [{partnerName:'',partnerPhone:'0241234567'},{partnerName:'Esi',partnerPhone:'123'},{partnerName:'Ama',partnerPhone:'+233240000000'}]) {
    const draft={box:boxDraft({partnerEnabled:true,...partner})}, h=binder({draft,action:'box-partner'}), before=JSON.stringify(h.state);
    h.click();assert.equal(h.navigations.length,0);assert.ok(h.error.textContent);assert.equal(JSON.stringify(h.state),before);h.cleanup();
    const save=binder({draft,route:createRoute('review'),action:'box-save'});save.click();assert.equal(save.acts.length,0);assert.equal(save.state.boxes.length,0);save.cleanup();
  }
});

test('unchanged partner details retain confirmation while an edited number requires a fresh acceptance',()=>{
 const state=createDemoState(),draft={box:boxDraft({partnerEnabled:true,partnerName:'Esi',partnerPhone:'0241234567'})};
 const send=binder({state,draft,action:'box-partner'});send.click();send.cleanup();
 const id=draft.box.partnerInvitationId,payload={invitationId:id,setupId:draft.box.partnerSetupId,boxName:draft.box.name,partner:{name:'Esi',phone:'0241234567'}};
 assert.equal(applyAction(state,'respondBoxPartnerInitialInvitation',{invitationId:id,decision:'accepted'}).ok,true);
 assert.equal(applyAction(state,'verifyBoxPartnerInvitation',{...payload,code:getBoxPartnerInvitationPreview(state,id).code}).ok,true);
 const details=binder({state,draft,action:'partner-initial-details'});details.click();details.cleanup();assert.equal(draft.box.partnerInvitationId,id);
 const unchanged=binder({state,draft,action:'box-partner'});unchanged.click();assert.equal(unchanged.acts.length,0);assert.equal(draft.box.partnerCodePhase,'code');unchanged.cleanup();
 draft.box.partnerPhone='0209876543';
 const review=renderPlanning({state,draft},createRoute('review'));assert.match(review,/Confirmation needed/);assert.match(review,/<button[^>]+data-action="p:box-save"[^>]+disabled/);
 const altered=binder({state,draft,action:'box-partner'});altered.click();assert.equal(altered.acts[0].type,'sendBoxPartnerInvitation');assert.notEqual(draft.box.partnerInvitationId,id);assert.equal(getBoxPartnerInvitationPreview(state,draft.box.partnerInvitationId).status,'awaiting-partner');altered.cleanup();
});

test('skipping after typing a partner does not enroll them and canceling an edit restores the previous choice',()=>{
  const draft={box:boxDraft({partnerEnabled:true,partnerName:'Esi',partnerPhone:'0241234567'})};
  const skip=binder({draft,action:'box-partner-skip'});skip.click();assert.equal(draft.box.partnerEnabled,false);assert.equal(skip.navigations.at(-1).step,'review');skip.cleanup();
  draft.box.partnerEnabled=true;
  const edit=binder({draft,route:createRoute('review'),action:'box-edit-partner'});edit.click();assert.equal(edit.navigations.at(-1).step,'partner');assert.equal(edit.navigations.at(-1).edit,true);edit.cleanup();
  draft.box.partnerName='New person';draft.box.partnerPhone='0209876543';draft.box.partnerEnabled=false;
  const cancel=binder({draft,route:createRoute('partner',{edit:true}),action:'edit-cancel'});cancel.click();
  assert.equal(draft.box.partnerEnabled,true);assert.equal(draft.box.partnerName,'Esi');assert.equal(draft.box.partnerPhone,'0241234567');assert.equal(cancel.navigations.at(-1).step,'review');cancel.cleanup();
});

test('pending box detail offers non-locking invitation management while recovery keeps protection',()=>{
  const state=createEmptyState({phone:'0240000000'});
  const result=applyAction(state,'createBox',{name:'Laptop',target:100000});assert.equal(result.ok,true,result.message);
  assert.equal(applyAction(state,'requestBoxProtection',{boxId:result.id,partner:{name:'Esi',phone:'0241234567'},pin:'1234'}).ok,true);
  const html=renderPlanning({state,draft:{}},{section:'boxes',page:'detail',id:result.id});
  assert.match(html,/Accountability partner/);assert.match(html,/Invitation pending · Withdrawals stay available/);
  assert.match(html,/data-action="p:box-partner-manage"/);assert.match(html,/data-action="p:box-lock"/);
  result.box.protection.status='recovery-required';
  const recovery=renderPlanning({state,draft:{}},{section:'boxes',page:'detail',id:result.id});
  assert.match(recovery,/Partner details need review · Verified support can help/);
  assert.doesNotMatch(recovery,/Invitation pending · Transfers back protected/);
  assert.match(recovery,/data-action="p:box-lock"/);
  assert.match(recovery,/Partner approval stays on/);
  assert.equal(result.box.protection.status,'recovery-required','Rendering the independent goal lock never removes recovery protection.');
});

test('personal Unlock and partner approval remain independent throughout a protected withdrawal',()=>{
  const state=createEmptyState({phone:'0240000000'});
  const {box}=applyAction(state,'createBox',{name:'Laptop',target:100000});
  assert.equal(applyAction(state,'requestBoxProtection',{boxId:box.id,partner:{name:'Esi',phone:'0241234567'},pin:'1234'}).ok,true);
  assert.equal(applyAction(state,'respondBoxPartnerInvite',{boxId:box.id,invitationId:box.protection.invitationId,decision:'accepted'}).ok,true);
  box.balance=5000;box.locked=true;
  const route={section:'boxes',page:'detail',id:box.id},protection=structuredClone(box.protection),audit=structuredClone(box.protectionAudit);
  const locked=binder({state,draft:{},route,action:'box-withdraw'});locked.click();
  assert.equal(locked.acts.length,0);assert.equal(locked.sheets.length,0);
  assert.match(locked.toasts.at(-1),/Unlock your goal lock.*Partner approval stays on/);locked.cleanup();
  const unlock=binder({state,draft:{},route,action:'box-lock'});unlock.click();
  assert.equal(unlock.acts.length,0,'Opening the personal unlock still requires authentication.');
  const auth=unlock.sheets.at(-1);assert.match(auth.title,/Unlock your Money Box/);assert.equal(box.locked,true);
  auth.onSuccess();assert.equal(box.locked,false);assert.deepEqual(box.protection,protection);assert.deepEqual(box.protectionAudit,audit);
  assert.equal(state.wallet,0);assert.equal(box.balance,5000);unlock.cleanup();
  const withdrawal=binder({state,draft:{},route,action:'box-withdraw'});withdrawal.click();
  assert.equal(withdrawal.acts.length,0);assert.match(withdrawal.sheets.at(-1),/data-bp-amount-form/);
  assert.match(withdrawal.sheets.at(-1),/partner’s code and your PIN/);
  assert.equal(applyAction(state,'withdrawBox',{id:box.id,amount:1000,pin:'1234'}).ok,false,'A personal unlock cannot substitute for the partner approval.');
  const release=applyAction(state,'requestBoxRelease',{boxId:box.id,kind:'withdrawal',amount:1000});assert.equal(release.ok,true,release.message);
  const issued=applyAction(state,'issueBoxPartnerCode',{boxId:box.id,requestId:release.requestId});assert.equal(issued.ok,true,issued.message);
  assert.equal(applyAction(state,'verifyBoxPartnerCode',{boxId:box.id,requestId:release.requestId,code:issued.code}).authorized,true);
  assert.equal(applyAction(state,'withdrawBox',{id:box.id,amount:1000,requestId:release.requestId,pin:'0000'}).ok,false,'Partner approval never replaces the owner PIN.');
  assert.equal(state.wallet,0);assert.equal(box.balance,5000);
  assert.equal(applyAction(state,'withdrawBox',{id:box.id,amount:1000,requestId:release.requestId,pin:'1234'}).ok,true);
  assert.equal(state.wallet,1000);assert.equal(box.balance,4000);assert.deepEqual(box.protection,protection);withdrawal.cleanup();
});

test('disposed or detached setup controls cannot create a box or overwrite its draft',()=>{
  const h=binder({route:createRoute('review'),action:'box-save'});h.cleanup();h.click();assert.equal(h.acts.length,0);assert.equal(h.state.boxes.length,0);
  const detached=binder({action:'box-partner-toggle'});detached.button.isConnected=false;detached.click();assert.equal(detached.draft.box.partnerEnabled,undefined);detached.cleanup();
  const moved=binder({route:createRoute('review'),action:'box-save'});moved.setRoute({section:'home',page:'home'});moved.click();assert.equal(moved.acts.length,0);moved.cleanup();
});

test('connected partner setup visibly explains the unavailable recovery route before enabling protection',()=>{
 const ctx={state:createEmptyState(),draft:{box:boxDraft()},connected:true};
 const html=renderPlanning(ctx,createRoute('partner'));
 assert.match(html,/data-partner-support-limit/);assert.match(html,/cannot bypass their approval/);assert.match(html,/Choose a Money Box without a partner/);
 assert.ok(html.indexOf('data-partner-support-limit')<html.indexOf('data-action="p:box-partner-toggle"'));
 assert.ok(html.indexOf('data-partner-support-limit')<html.indexOf('<details'));
 assert.doesNotMatch(html,/contact Lumo support through the planned toll-free line/);
});
