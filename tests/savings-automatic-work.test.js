import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction} from '../dist/js/model.js';
import {savingsAutomaticWork} from '../dist/js/savings-parity-model.js';
import {savingsAutomaticWork as serverWork} from '../backend/supabase/functions/lumo-approved/domain/savings-parity-model.js';
import {renderSavingsHackTerms} from '../dist/js/savings-hack-disclosure.js';
const today=new Date().toISOString().slice(0,10);
function fixture(){const s=createEmptyState();s.wallet=10000;s.buffer=0;const made=applyAction(s,'createBox',{name:'Synthetic schedule',target:10000,hack:{type:'scheduled',value:100,frequency:'daily',nextRun:today}});assert.equal(made.ok,true);return {s,box:made.box};}

test('archived schedules create no automatic occurrence; restoring produces an executable one',()=>{
 const {s,box}=fixture();box.archived=true;assert.deepEqual(savingsAutomaticWork(s),{due:[],income:[]});
 const restored=applyAction(s,'restoreBox',{id:box.id});assert.equal(restored.ok,true);const work=savingsAutomaticWork(s);assert.equal(work.due.length,1);assert.deepEqual(serverWork(structuredClone(s)),work);
 const before=s.wallet,r=applyAction(s,'runScheduledSavings');assert.equal(r.ok,true);assert.equal(box.balance,100);assert.equal(s.wallet,before-100);assert.equal(savingsAutomaticWork(s).due.length,0);
 assert.equal(applyAction(s,'runScheduledSavings').ok,true);assert.equal(box.balance,100,'one due date is saved once');
});

test('automatic work binds rule details and remains stable across input ordering',()=>{
 const {s,box}=fixture(),before=JSON.stringify(savingsAutomaticWork(s));box.hack.value=200;assert.notEqual(JSON.stringify(savingsAutomaticWork(s)),before);
 s.transactions=[{id:'a',type:'income',direction:'in',status:'success',ledgerJournalId:'receipt-b'},{id:'b',type:'income',direction:'in',status:'success',ledgerJournalId:'receipt-a'}];s._sharedIncomeSeen=['receipt-b'];assert.deepEqual(savingsAutomaticWork(s).income,['receipt-a']);assert.deepEqual(savingsAutomaticWork({...s,transactions:[...s.transactions].reverse()}),savingsAutomaticWork(s));
});

test('paused due rules are recorded as skipped and recovery still protects the wallet',()=>{
 const {s,box}=fixture();box.hack.paused=true;assert.equal(savingsAutomaticWork(s).due.length,1);const before=s.wallet;assert.equal(applyAction(s,'runScheduledSavings').ok,true);assert.equal(s.wallet,before);assert.equal(s.savingsHistory[0].status,'skipped');assert.equal(savingsAutomaticWork(s).due.length,0);
});

test('saving terms disclose automatic foreground sync and ordered rule allocation',()=>{
 const text=renderSavingsHackTerms().replace(/<[^>]+>/g,' ');assert.match(text,/open or return to the app, during connected account sync/);assert.match(text,/earlier rule can use the spare money before a later rule/);assert.match(text,/No live standing order is created/);assert.doesNotMatch(text,/run when you choose Check scheduled savings/);
});
