import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState, applyAction } from '../dist/js/model.js';
import { renderLife } from '../dist/js/life.js';
import { renderGroupOverview, bindGroupOverview } from '../dist/js/group-overview.js';
import { openGroupFinancial, openGroupJoin, openGroupMembers, openGroupSimulation, openGroupDetails, openGroupMandate } from '../dist/js/group-actions.js';
import { getGroupActor, groupSummary } from '../dist/js/group-ledger.js';

class Element {
  constructor(attrs = '') {
    this.listeners = new Map(); this.isConnected = true; this.value = attrs.match(/value="([^"]*)"/)?.[1] || ''; this.checked = false; this.disabled = /\sdisabled(?:\s|>|$)/.test(attrs); this.textContent = ''; this.dataset = {};
    for (const match of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)) this.dataset[match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = match[2];
    this.name = attrs.match(/name="([^"]+)"/)?.[1];
  }
  addEventListener(event,fn){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(fn);}
  removeEventListener(event,fn){this.listeners.get(event)?.delete(fn);}
  emit(event,extra={}){const e={target:this,preventDefault(){},...extra};this[`on${event}`]?.(e);for(const fn of this.listeners.get(event)||[])fn(e);}
  click(){if(!this.disabled)this.emit('click');}
}
class Sheet extends Element {
  constructor(html){super();this.html=html;this.form=new Element();this.error=new Element();this.controls=[];
    for(const m of html.matchAll(/<(button|input|textarea|select)\b([^>]*)(?:>([\s\S]*?)<\/\1>)?/g)){
      const el=new Element(m[2]);el.tag=m[1];el.attrs=m[2];if(el.tag==='select'){el.value=m[3]?.match(/<option[^>]*value="([^"]+)"[^>]*selected/)?.[1]||m[3]?.match(/<option[^>]*selected[^>]*>([^<]+)/)?.[1]||m[3]?.match(/<option[^>]*value="([^"]+)"/)?.[1]||m[3]?.match(/<option[^>]*>([^<]+)/)?.[1]||'';}this.controls.push(el);
    }
  }
  querySelector(sel){if(sel==='form')return this.form;if(sel==='.group-action-error')return this.error;return this.querySelectorAll(sel)[0]||null;}
  querySelectorAll(sel){if(sel==='input,select')return this.controls.filter(x=>['input','select'].includes(x.tag));const match=sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(!match)return[];return this.controls.filter(x=>match[2]===undefined?new RegExp(`(?:^|\\s)${match[1]}(?:\\s|=|$)`).test(x.attrs):x.attrs.includes(`${match[1]}="${match[2]}"`));}
  detach(){this.isConnected=false;this.controls.forEach(x=>x.isConnected=false);this.form.isConnected=false;}
}
function setup(state=createDemoState()){
  const created=applyAction(state,'ensureProjectPrintingDemo',{});assert.equal(created.ok,true,created.message);const g=created.group;
  const ctx={state,draft:{},route:{section:'life',page:'group-detail',id:g.id},sheetLog:[],calls:[],toasts:[],refreshes:0,navigation:[],current:null,authPending:null,
    act(type,payload){this.calls.push({type,payload});return applyAction(this.state,type,payload);},
    sheet(html,bind){this.current?.detach();const sheet=new Sheet(html);this.current=sheet;this.sheetLog.push(html);bind?.(sheet);},
    closeSheet(){this.current?.detach();},refresh(){this.refreshes++;},saveDraft(){},toast(text){this.toasts.push(text);},
    auth(options){this.closeSheet();this.authPending=options;},go(route,options){this.route=route;this.navigation.push({route,options});},
  };
  return {state,g,ctx,field(name,value){const x=ctx.current.querySelector(`[name="${name}"]`);assert.ok(x,name);x.value=value;x.emit('input');return x;},submit(){ctx.current.form.emit('submit');},click(action){const x=ctx.current.querySelector(`[data-group-sheet="${action}"]`);assert.ok(x,action);x.click();},pin(){assert.ok(ctx.authPending);const auth=ctx.authPending;ctx.authPending=null;auth.onSuccess();}};
}
const seedFunded = h => {assert.equal(applyAction(h.state,'settleGroupContribution',{groupId:h.g.id,contributionId:h.g.contributions.find(c=>c.status==='pending').id,outcome:'success'}).ok,true);assert.equal(applyAction(h.state,'contributeGroup',{groupId:h.g.id,amount:3000}).ok,true);};
const payoutRequest = h => {const r=applyAction(h.state,'requestPayout',{groupId:h.g.id,amount:18000,recipient:'Balme Library prints',rail:'Lumo',destination:'@balmeprints',note:'Six project reports'});assert.equal(r.ok,true,r.message);return r.payout;};
function approveTwo(h,p){assert.equal(applyAction(h.state,'reviewPayout',{groupId:h.g.id,payoutId:p.id}).ok,true);assert.equal(applyAction(h.state,'approvePayout',{groupId:h.g.id,payoutId:p.id}).ok,true);assert.equal(applyAction(h.state,'setGroupParticipant',{groupId:h.g.id,memberId:'esi'}).ok,true);assert.equal(applyAction(h.state,'reviewPayout',{groupId:h.g.id,payoutId:p.id}).ok,true);assert.equal(applyAction(h.state,'approvePayout',{groupId:h.g.id,payoutId:p.id}).ok,true);}

test('Overview retains group identity, Home, unread Chat, money context and the participant label',()=>{
  const {state,g,ctx}=setup(),html=renderGroupOverview(ctx,ctx.route);
  assert.match(html,/data-group-tab="overview" class="selected" aria-current="page"/);assert.match(html,/data-group-tab="chat"/);assert.match(html,/unread updates/);assert.match(html,/data-group-action="home"/);assert.match(html,/GH₵120.00/);assert.match(html,/GH₵60.00 remaining/);assert.match(html,/Participant simulation/);assert.match(html,/Group funds stay separate/);assert.equal(state.wallet,248000);assert.match(renderLife(ctx,{section:'life',page:'groups'}),/Sample group/);
  const fresh={state:createEmptyState(),draft:{}};assert.match(renderLife(fresh,{section:'life',page:'groups'}),/Try Project Printing/);
});
test('group creation keeps its existing stages and adds a purpose and optional deadline',()=>{
  const ctx={state:createEmptyState(),draft:{}};
  assert.match(renderLife(ctx,{section:'life',page:'group-create',step:0}),/name="groupPurpose"/);
  assert.match(renderLife(ctx,{section:'life',page:'group-create',step:1}),/name="groupDeadline"/);
});
test('invited participant sees the history disclosure before accepting, with no collection leak in group list',()=>{
  const h=setup();const invite=applyAction(h.state,'inviteGroupMember',{groupId:h.g.id,name:'Abena',role:'contributor'});assert.equal(invite.ok,true);const member=invite.member;
  applyAction(h.state,'setGroupParticipant',{groupId:h.g.id,memberId:member.id});
  const list=renderLife(h.ctx,{section:'life',page:'groups'});assert.match(list,/Invitation waiting/);assert.doesNotMatch(list.match(/<button class="panel life-group-card" data-action="life-group-group-project-printing">[\s\S]*?<\/button>/)[0],/GH₵120.00|group-unread/);
  const html=renderGroupOverview(h.ctx,h.ctx.route);assert.match(html,/full earlier group conversation/);assert.doesNotMatch(html,/GH₵120.00|data-group-tab="chat"/);
  openGroupJoin(h.ctx,h.g);assert.match(h.ctx.current.html,/from before you joined/);h.submit();assert.equal(member.status,'invited');
  h.ctx.current.querySelector('[name="groupJoinConsent"]').checked=true;h.submit();assert.equal(member.status,'active');assert.equal(h.ctx.calls.at(-1).payload.acceptHistory,true);
});
test('the contribution flow confirms with PIN, returns to the same Chat, and cannot double debit',()=>{
  const h=setup();h.ctx.route.page='group-chat';const before=h.state.wallet;openGroupFinancial(h.ctx,h.g,'contribute');h.field('groupContributionAmount','30');h.submit();h.click('confirm');const callback=h.ctx.authPending.onSuccess;h.pin();callback();
  assert.equal(h.state.wallet,before-3000);assert.equal(groupSummary(h.g).collected,15000);assert.equal(h.ctx.route.page,'group-chat');assert.equal(h.g.contributions.filter(c=>c.memberId==='me').length,1);
});
test('contribution PIN callbacks cannot act after a participant switch or navigation away',()=>{
  for(const change of ['actor','route']){const h=setup(),before=h.state.wallet;openGroupFinancial(h.ctx,h.g,'contribute');h.submit();h.click('confirm');if(change==='actor')applyAction(h.state,'setGroupParticipant',{groupId:h.g.id,memberId:'esi'});else h.ctx.route={section:'home',page:'home'};h.pin();assert.equal(h.state.wallet,before);assert.equal(groupSummary(h.g).collected,12000);}
});
test('payout review authorises only the selected approver and binds the reviewed revision',()=>{
  const h=setup();seedFunded(h);const p=payoutRequest(h);openGroupFinancial(h.ctx,h.g,'review',p.id);assert.match(h.ctx.current.html,/Approve as Ama/);assert.doesNotMatch(h.ctx.current.html,/data-approve-member/);h.click('approve');p.revision++;h.pin();assert.deepEqual(p.approvals,[]);assert.match(h.ctx.toasts.at(-1),/changed/);
});
test('a contributor can inspect the mandate but gets no payout approval controls',()=>{
  const h=setup();seedFunded(h);const p=payoutRequest(h);applyAction(h.state,'setGroupParticipant',{groupId:h.g.id,memberId:'kwame'});openGroupFinancial(h.ctx,h.g,'review',p.id);assert.match(h.ctx.current.html,/Only the designated approvers/);assert.doesNotMatch(h.ctx.current.html,/data-group-sheet="approve"/);assert.match(h.ctx.current.html,/Six project reports/);assert.equal(p.approvals.length,0);
});
test('processing failure, retry and a second failure create separate results through the UI',()=>{
  const h=setup();seedFunded(h);const p=payoutRequest(h);approveTwo(h,p);const before=h.g.balance;
  for(let i=0;i<2;i++){
    openGroupFinancial(h.ctx,h.g,'execute',p.id);h.click('confirm');h.pin();assert.equal(p.status,'processing');assert.equal(h.g.balance,before);
    openGroupFinancial(h.ctx,h.g,'review',p.id);h.click('fail-result');assert.equal(p.status,'failed');assert.equal(h.g.balance,before);
    if(i===0){openGroupFinancial(h.ctx,h.g,'retry',p.id);h.click('confirm');assert.equal(p.status,'approved');}
  }
  assert.equal(p.history.filter(e=>e.type==='failed').length,2);
});
test('a confirmed payout follows two approvals, explicit processing, and one debit',()=>{
  const h=setup();seedFunded(h);const p=payoutRequest(h),wallet=h.state.wallet;approveTwo(h,p);openGroupFinancial(h.ctx,h.g,'execute',p.id);h.click('confirm');h.pin();assert.equal(p.status,'processing');assert.equal(h.g.balance,18000);
  openGroupFinancial(h.ctx,h.g,'review',p.id);const stale=h.ctx.current.querySelector('[data-group-sheet="confirm-result"]');h.click('confirm-result');stale.click();assert.equal(p.status,'success');assert.equal(h.g.balance,0);assert.equal(groupSummary(h.g).collected,18000);assert.equal(h.state.wallet,wallet);
});
test('Overview navigation preserves group identity and cleanup ignores detached controls',()=>{
  const h=setup(),root=new Element();h.ctx.$=()=>root;const cleanup=bindGroupOverview(h.ctx,h.ctx.route);
  const trigger=dataset=>root.emit('click',{target:{closest:()=>({dataset})}});
  trigger({groupTab:'chat'});assert.equal(h.ctx.route.page,'group-chat');assert.equal(h.ctx.route.id,h.g.id);
  h.ctx.route={section:'life',page:'group-detail',id:h.g.id};trigger({groupAction:'home'});assert.equal(h.ctx.route.section,'home');const count=h.ctx.navigation.length;cleanup();trigger({groupTab:'chat'});assert.equal(h.ctx.navigation.length,count);
});
test('member controls and details preserve privacy and expose local participant testing clearly',()=>{
  const h=setup();openGroupDetails(h.ctx,h.g);assert.match(h.ctx.current.html,/Personal balances, budgets and IOUs stay private/);assert.doesNotMatch(h.ctx.current.html,/GH₵2,480/);
  openGroupMembers(h.ctx,h.g);assert.match(h.ctx.current.html,/data-group-sheet="invite"/);openGroupSimulation(h.ctx,h.g);assert.match(h.ctx.current.html,/No live messages or payments/);assert.match(h.ctx.current.html,/Simulate confirmation/);
  applyAction(h.state,'setGroupParticipant',{groupId:h.g.id,memberId:'kwame'});openGroupMembers(h.ctx,h.g);assert.doesNotMatch(h.ctx.current.html,/data-group-sheet="invite"|data-group-manage=/);
});

test('failed contribution retry outcomes and a later reversal remain separate ledger transitions',()=>{
  const h=setup(),before=h.state.wallet;
  openGroupFinancial(h.ctx,h.g,'contribute');h.field('groupContributionStatus','failed');h.submit();h.click('confirm');h.pin();
  const contribution=h.g.contributions.find(c=>c.memberId==='me');assert.equal(contribution.status,'failed');assert.equal(h.state.wallet,before);
  for(let i=0;i<2;i++){
    openGroupSimulation(h.ctx,h.g);h.ctx.current.querySelector(`[data-group-contribution-retry="${contribution.id}"]`).click();assert.equal(contribution.status,'pending');assert.equal(h.state.wallet,before-3000);
    openGroupSimulation(h.ctx,h.g);h.ctx.current.querySelector(`[data-group-contribution-result="${contribution.id}:failed"]`).click();assert.equal(contribution.status,'failed');assert.equal(h.state.wallet,before);
  }
  assert.equal(contribution.statusHistory.filter(e=>e.status==='failed').length,3);
  openGroupSimulation(h.ctx,h.g);h.ctx.current.querySelector(`[data-group-contribution-retry="${contribution.id}"]`).click();openGroupSimulation(h.ctx,h.g);h.ctx.current.querySelector(`[data-group-contribution-result="${contribution.id}:success"]`).click();assert.equal(contribution.status,'success');assert.equal(groupSummary(h.g).collected,15000);
  openGroupSimulation(h.ctx,h.g);h.ctx.current.querySelector(`[data-group-contribution-result="${contribution.id}:reversed"]`).click();assert.equal(contribution.status,'reversed');assert.equal(h.state.wallet,before);assert.equal(groupSummary(h.g).collected,12000);
});

test('detached final-payment controls cannot reopen PIN or start a group payment',()=>{
  const h=setup();seedFunded(h);const p=payoutRequest(h);approveTwo(h,p);openGroupFinancial(h.ctx,h.g,'execute',p.id);
  const button=h.ctx.current.querySelector('[data-group-sheet="confirm"]');h.ctx.closeSheet();button.click();assert.equal(h.ctx.authPending,null);assert.equal(p.status,'approved');assert.equal(h.g.balance,18000);
});

test('a complete full-target Lumo payout request reviews fee and purpose before PIN',()=>{
 const h=setup();seedFunded(h);openGroupFinancial(h.ctx,h.g,'request');
 assert.match(h.ctx.current.html,/Where’s it going/);assert.match(h.ctx.current.html,/Demo fee: GH₵0.00/);
 h.submit();assert.match(h.ctx.current.html,/GH₵180.00 total from the group account/);assert.match(h.ctx.current.html,/Total from group/);assert.match(h.ctx.current.html,/does not move money or count as an approval/);
 h.click('confirm');h.pin();assert.equal(h.g.payouts.length,1);assert.equal(h.g.payouts[0].amount,18000);assert.equal(h.g.payouts[0].fee,0);assert.equal(h.g.payouts[0].status,'pending');assert.equal(h.g.balance,18000);assert.deepEqual(h.g.payouts[0].approvals,[]);
});

test('collection closure reviews proportional returns and requires PIN while retaining chat',()=>{
 const h=setup();seedFunded(h);const wallet=h.state.wallet;openGroupDetails(h.ctx,h.g);h.click('close-collection');assert.match(h.ctx.current.html,/original contributors/);assert.match(h.ctx.current.html,/GH₵180.00/);h.click('confirm');assert.equal(h.g.status,'open');h.pin();assert.equal(h.g.status,'closed');assert.equal(h.g.balance,0);assert.equal(h.g.refunds.length,6);assert.equal(h.state.wallet,wallet+3000);assert.ok(h.g.chat.messages.length);
 assert.match(renderGroupOverview(h.ctx,h.ctx.route),/Collection closed/);assert.doesNotMatch(renderGroupOverview(h.ctx,h.ctx.route),/data-group-action="contribute"|>Request payout</);
});

test('group bank lookup finds the registered name before review and invalidates it when account changes',async t=>{
 const timers=[];t.mock.method(globalThis,'setTimeout',fn=>{timers.push(fn);return timers.length;});t.mock.method(globalThis,'clearTimeout',()=>{});
 const h=setup();openGroupFinancial(h.ctx,h.g,'request');
 const rail=h.ctx.current.querySelector('[name="groupPayoutRail"]');rail.value='bank';rail.emit('change');
 h.field('groupPayoutDestination','1234567890123');h.field('groupPayoutBank','GCB Bank');h.field('groupPayoutAmount','30');
 const lookup=h.ctx.current.querySelector('[data-group-sheet="lookup"]');lookup.emit('click',{currentTarget:lookup});assert.equal(lookup.disabled,true);timers.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.ctx.current.html,/Ama Mensah/);assert.match(h.ctx.current.html,/Demo lookup/);assert.match(h.ctx.current.html,/Demo fee: GH₵1.00/);assert.equal(h.ctx.draft.groupPayout.lookedUp,true);
 h.field('groupPayoutDestination','99999999');assert.equal(h.ctx.draft.groupPayout.lookedUp,false);h.submit();assert.equal(h.g.payouts.length,0);assert.match(h.ctx.current.error.textContent,/recipient|registered account/);
 h.field('groupPayoutDestination','1234567890123');const again=h.ctx.current.querySelector('[data-group-sheet="lookup"]');again.emit('click',{currentTarget:again});timers.shift()();await new Promise(resolve=>setImmediate(resolve));h.submit();assert.match(h.ctx.current.html,/GH₵31.00 total/);h.click('confirm');h.pin();assert.equal(h.g.payouts[0].recipient,'Ama Mensah');assert.equal(h.g.payouts[0].bank,'GCB Bank');assert.equal(h.g.payouts[0].fee,100);
});


test('large personal contributions show a private plan-impact review before PIN; simulated members do not',()=>{
 const h=setup(),wallet=h.state.wallet;h.g.target=300000;
 openGroupFinancial(h.ctx,h.g,'contribute');h.field('groupContributionAmount','2000');h.submit();h.click('confirm');
 assert.equal(h.ctx.authPending,null);assert.match(h.ctx.current.html,/Lumo Pause/);assert.match(h.ctx.current.html,/Your share. Your plan./);assert.match(h.ctx.current.html,/Everyday after/);assert.equal(h.state.wallet,wallet);
 const continueButton=h.ctx.current.querySelector('[data-outflow-continue]');assert.ok(continueButton);continueButton.click();assert.ok(h.ctx.authPending);h.pin();assert.equal(h.state.wallet,wallet-200000);
 const other=setup();other.g.target=300000;applyAction(other.state,'setGroupParticipant',{groupId:other.g.id,memberId:'kwame'});openGroupFinancial(other.ctx,other.g,'contribute');other.field('groupContributionAmount','2000');other.submit();other.click('confirm');assert.ok(other.ctx.authPending);assert.doesNotMatch(other.ctx.sheetLog.at(-1),/Everyday after/);
});

test('a promoted approver sees explicit acceptance and contributor invitations keep existing money actions available',()=>{
 const h=setup();applyAction(h.state,'setGroupMemberRole',{groupId:h.g.id,memberId:'kwame',role:'approver'});applyAction(h.state,'setGroupParticipant',{groupId:h.g.id,memberId:'kwame'});
 openGroupMembers(h.ctx,h.g);assert.match(h.ctx.current.html,/Review payout agreement/);h.click('accept-mandate');assert.match(h.ctx.current.html,/does not authorise|never counts/);h.submit();assert.equal(h.g.members.find(m=>m.id==='kwame').mandateAcceptedRevision||0,0);
 h.ctx.current.querySelector('[name="groupMandateConsent"]').checked=true;h.submit();assert.equal(h.g.members.find(m=>m.id==='kwame').mandateAcceptedRevision,h.g.mandateRevision);
});

test('former members have a reinvite action that reuses their existing membership and contribution history',()=>{
 const h=setup();const prior=h.g.members.find(m=>m.id==='kwame'),amount=prior.amount;applyAction(h.state,'removeGroupMember',{groupId:h.g.id,memberId:'kwame'});openGroupMembers(h.ctx,h.g);
 const rejoin=h.ctx.current.querySelector('[data-group-reinvite="kwame"]');assert.ok(rejoin);rejoin.click();assert.match(h.ctx.current.html,/Their earlier contributions/);h.submit();assert.equal(prior.status,'invited');assert.equal(prior.amount,amount);assert.equal(h.g.members.filter(m=>m.id==='kwame').length,1);
});
