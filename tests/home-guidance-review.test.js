import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction} from '../dist/js/model.js';
import {renderHome,homeTransactions} from '../dist/js/home-view.js';
import {renderActivityEntries} from '../dist/js/activity-view.js';
const ctx=state=>({state,draft:{},route:{section:'home',page:'home'}});

test('Home keeps its account balance clear without the dated daily-guide line',()=>{
  const s=createDemoState(), c=ctx(s);
  for(const account of ['everyday','savings']) for(const hidden of [false,true]){
    c.draft.homeAccount=account;s.settings.hideBalance=hidden;
    const before=structuredClone(s),html=renderHome(c);
    assert.doesNotMatch(html,/home-guidance|Until \d|\/day guide|Daily guide/);
    assert.match(html,account==='everyday'?/Left after plan/:/Total saved/);
    assert.deepEqual(s,before,'Changing the Home presentation cannot change recorded money.');
  }
});

test('the balance eye is beside the account selector and names the next privacy action',()=>{
  const s=createDemoState(),c=ctx(s);
  for(const account of ['everyday','savings']) for(const hidden of [false,true]){
    c.draft.homeAccount=account;s.settings.hideBalance=hidden;
    const html=renderHome(c),controls=html.split('<div class="home-hero">')[1].split('<div class="home-amount-line">')[0];
    assert.match(controls,/data-action="home-accounts"/);
    assert.match(controls,/data-action="visibility"/);
    assert.match(controls,hidden?/aria-label="Show balance"/:/aria-label="Hide balance"/);
    assert.match(controls,new RegExp(`aria-pressed="${!hidden}"`));
    assert.equal((html.match(/data-action="visibility"/g)||[]).length,1);
    if(hidden){assert.match(html,/aria-label="Balance hidden"/);assert.doesNotMatch(html,/aria-label="(?:Left after plan|Total saved) GH₵/);}
    else assert.match(html,account==='everyday'?/aria-label="Left after plan GH₵1,280\.00"/:/aria-label="Total saved GH₵740\.00"/);
  }
});

test('first money, missing plan and expired plan keep their useful existing context',()=>{
  const s=createEmptyState();s.onboardingDone=true;
  assert.match(renderHome(ctx(s)),/Add money when you’re ready/);
  s.wallet=10000;
  assert.match(renderHome(ctx(s)),/Give your money a purpose/);
  const demo=createDemoState();demo.budget.endDate='2020-01-01';
  assert.match(renderHome(ctx(demo)),/Time to refresh your plan/);
});

test('outside debt repayments are explicit records, excluded from Home account movements',()=>{const s=createEmptyState();s.onboardingDone=true;s.wallet=10000;s.buffer=0;const i=applyAction(s,'createIOU',{name:'Esi',amount:3000,type:'owedByMe'}).iou;assert.equal(applyAction(s,'settleIOU',{id:i.id,amount:3000,outside:true,destination:'cash'}).ok,true);assert.equal(homeTransactions(s).length,0);assert.equal(homeTransactions(s,'savings').length,0);const html=renderActivityEntries(ctx(s));assert.match(html,/Paid outside Lumo/);assert.match(html,/Lumo unchanged/);assert.doesNotMatch(html,/−GH₵30/);assert.equal(s.wallet,10000);});
