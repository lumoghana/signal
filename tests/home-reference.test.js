import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHome,renderHomeAccounts,homeNotice,homeTransactions} from '../dist/js/home-view.js';
import {createDemoState,createEmptyState,getSummary} from '../dist/js/model.js';

const context=(state=createDemoState(),draft={})=>({state,draft});
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const shown=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

function addOutsideMoney(state){
  state.income.amount=8000000;
  state.externalBalances=[{balance:9000000}];
  state.ious.push({id:'expected-only',type:'owedToMe',status:'open',amount:7000000,paid:0,due:date(1)});
  state.groups[0].balance=20000000;
}

test('Everyday leads with left after plan and keeps its actual available balance secondary',()=>{
  const ctx=context();ctx.state.settings.hideBalance=false;addOutsideMoney(ctx.state);
  const html=renderHome(ctx),summary=getSummary(ctx.state);
  assert.equal(summary.spendable,128000);assert.equal(summary.available,248000);
  assert.match(html,/aria-label="Left after plan GH₵1,280\.00"/);
  assert.match(shown(html),/Available balance GH₵2,480\.00/);
  assert.doesNotMatch(html,/GH₵(?:80,000|90,000|70,000|200,000)\.00/);
  assert.match(html,/data-action="home-accounts"/);assert.match(html,/Everyday selected/);
  assert.match(html,/data-action="budget">View budget/);
  assert.match(html,/aria-label="Add money to Everyday"/);
  assert.doesNotMatch(html,/data-action="pay"/,'Pay remains in the app navigation rather than duplicating a large Home action.');
  assert.equal((html.match(/data-action="fund"/g)||[]).length,1,'A funded account needs just the compact funding action.');
});

test('the retired balance-view preference cannot replace the agreed left-after-plan hero',()=>{
  const ctx=context(undefined,{balanceMode:'available'});ctx.state.settings.hideBalance=false;
  assert.match(renderHome(ctx),/aria-label="Left after plan GH₵1,280\.00"/);
});

test('Savings has its own held-money total, account selector and Money Box journeys',()=>{
  const ctx=context(undefined,{homeAccount:'savings'});ctx.state.settings.hideBalance=false;addOutsideMoney(ctx.state);
  ctx.state.boxes[0].archived=true;
  const html=renderHome(ctx);
  assert.match(html,/aria-label="Your Savings account"/);assert.match(html,/Savings selected/);
  assert.match(html,/aria-label="Total saved GH₵740\.00"/);
  assert.match(shown(html),/Money Boxes 2 goals/);
  assert.match(html,/data-action="home-boxes">View boxes/);
  assert.match(html,/data-action="home-save"/);
  assert.doesNotMatch(html,/GH₵(?:2,480|80,000|90,000|70,000|200,000)\.00/);
  assert.doesNotMatch(html,/Left after plan|Available balance|data-action="budget"/);
  assert.equal(getSummary(ctx.state).savings,74000,'Archived boxes still hold the student’s savings.');
});

test('the account picker distinguishes Everyday from Savings without combining outside or group money',()=>{
  const ctx=context(undefined,{homeAccount:'savings'});ctx.state.settings.hideBalance=false;addOutsideMoney(ctx.state);
  const html=renderHomeAccounts(ctx);
  assert.match(html,/data-home-select="everyday" aria-pressed="false"/);
  assert.match(html,/data-home-select="savings" aria-pressed="true"/);
  assert.match(shown(html),/Everyday Available balance GH₵2,480\.00/);
  assert.match(shown(html),/Savings In your Money Boxes GH₵740\.00/);
  assert.match(html,/Group collections and money outside Lumo stay separate/);
  assert.doesNotMatch(html,/GH₵(?:80,000|90,000|70,000|200,000)\.00/);
});

test('hidden balances use masked visible slots and the account picker never reveals their amounts',()=>{
  const ctx=context();ctx.state.settings.hideBalance=true;
  for(const account of ['everyday','savings']){
    ctx.draft.homeAccount=account;
    const html=renderHome(ctx),picker=renderHomeAccounts(ctx);
    assert.match(html,/aria-label="Balance hidden"/);
    assert.match(html,/home-money-spacer" aria-hidden="true">GH₵[\d,.]+/);
    assert.match(html,/home-money-value">••••\.••/);
    assert.doesNotMatch(html,/aria-label="(?:Left after plan|Total saved) GH₵/);
    assert.equal((picker.match(/••••\.••/g)||[]).length,2);
    assert.doesNotMatch(picker,/GH₵[\d,.]+/);
  }
});

test('latest moves is collapsed and inaccessible by default, with an explicit reveal control',()=>{
  const ctx=context(),html=renderHome(ctx),attributes=html.match(/id="home-moves-content"([^>]*)>/)[1];
  assert.match(html,/data-home-moves-toggle aria-expanded="false" aria-controls="home-moves-content"/);
  assert.match(html,/Swipe up for latest moves/);assert.match(attributes,/inert/);assert.match(attributes,/aria-hidden="true"/);
  ctx.draft.homeMovesOpen=true;
  const expanded=renderHome(ctx),openAttributes=expanded.match(/id="home-moves-content"([^>]*)>/)[1];
  assert.match(expanded,/data-home-moves-toggle aria-expanded="true"/);
  assert.doesNotMatch(openAttributes,/inert|aria-hidden="true"/);
  assert.match(expanded,/data-action="all-activity"/);
  assert.match(expanded,/data-home-moves-close aria-label="Close latest moves"/);
});

test('latest moves contains actual account records with escaped content and working detail actions',()=>{
  const ctx=context(undefined,{homeMovesOpen:true});
  ctx.state.transactions=Array.from({length:15},(_,i)=>({id:`actual-${i}`,type:'payment',direction:'out',status:i===1?'pending':'success',amount:100+i,merchant:i===0?'<untrusted merchant>':`Merchant ${i}`,note:i===0?'<script>claim</script>':'A recorded payment',at:new Date().toISOString()}));
  ctx.state.transactions.unshift({id:'outside-split',type:'split-manual-receipt',direction:'in',status:'success',amount:9000,merchant:'External split claim'},{id:'outside-iou',type:'iou-manual-receipt',direction:'in',status:'success',amount:8000,merchant:'External IOU claim'});
  const before=structuredClone(ctx.state),moves=homeTransactions(ctx.state),html=renderHome(ctx);
  assert.deepEqual(moves.map(tx=>tx.id),Array.from({length:12},(_,i)=>`actual-${i}`));
  for(const tx of moves)assert.ok(html.includes(`data-action="root-tx:${tx.id}"`));
  assert.doesNotMatch(html,/root-tx:actual-12|root-tx:outside-|External split claim|External IOU claim/);
  assert.match(html,/&lt;untrusted merchant&gt;/);assert.match(html,/&lt;script&gt;claim&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<untrusted merchant>|<script>/);assert.match(html,/Awaiting confirmation/);
  assert.deepEqual(ctx.state,before,'Rendering cannot confirm or otherwise mutate a transaction.');
});

test('Savings history selects only its actual Money Box records and shows direction from Savings',()=>{
  const state=createDemoState();state.transactions=[
    {id:'to-box',type:'saving',boxId:'laptop',direction:'out',status:'success',amount:1000,merchant:'Laptop',at:new Date().toISOString()},
    {id:'from-box',type:'withdrawal',boxTransfer:true,boxId:'laptop',direction:'in',status:'success',amount:500,merchant:'Laptop',at:new Date().toISOString()},
    {id:'legacy-saving',type:'saving',rail:'internal',direction:'out',status:'success',amount:200,merchant:'Old box record',at:new Date().toISOString()},
    {id:'personal-payment',type:'payment',direction:'out',status:'success',amount:500,merchant:'Lunch',at:new Date().toISOString()},
    {id:'outside-claim',type:'iou-manual-receipt',boxId:'laptop',direction:'in',status:'success',amount:500,merchant:'Claim',at:new Date().toISOString()},
  ];
  assert.deepEqual(homeTransactions(state,'savings').map(tx=>tx.id),['to-box','from-box','legacy-saving']);
  const html=renderHome(context(state,{homeAccount:'savings',homeMovesOpen:true}));
  const to=html.split('data-action="root-tx:to-box"')[1].split('</button>')[0],from=html.split('data-action="root-tx:from-box"')[1].split('</button>')[0];
  assert.match(to,/\+GH₵10\.00/);assert.match(from,/−GH₵5\.00/);
  assert.doesNotMatch(html,/root-tx:personal-payment|root-tx:outside-claim/);
});

test('an empty account invites funding and a budget without fabricating money or activity',()=>{
  const state=createEmptyState();state.settings.hideBalance=false;
  const html=renderHome(context(state));
  assert.match(html,/aria-label="Available to plan GH₵0\.00"/);assert.match(html,/Create a budget/);
  assert.match(html,/Add your first money/);assert.equal(homeNotice(state).action,'fund');
  assert.match(html,/Add money when you’re ready/);assert.doesNotMatch(html,/data-action="root-tx:/);
  state.wallet=5000;
  assert.equal(homeNotice(state).action,'budget');assert.match(renderHome(context(state)),/Give your money a purpose/);
});
