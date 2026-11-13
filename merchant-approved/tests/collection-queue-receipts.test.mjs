import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionQueue,newConfirmedReceipts,renderCollections} from '../dist/collections-ui.js';
const now=Date.parse('2026-11-12T12:00:00Z');
test('resumable request queue includes processing after expiry, but excludes paid, cancelled and expired unpaid requests',()=>{
 const make=(id,shopId='s',status='open',expiresAt='2026-11-12T12:10:00Z')=>({id,shopId,status,expiresAt});
 const state={requests:[make('waiting'),make('processing','s','open','2026-11-12T11:50:00Z'),make('paid'),make('cancelled','s','cancelled'),make('expired','s','open','2026-11-12T11:50:00Z'),make('other','other')],transactions:[{requestId:'processing',status:'processing'},{requestId:'paid',status:'paid'}]};
 assert.deepEqual(collectionQueue(state,'s',now).map(r=>r.id),['waiting','processing']);
});
test('receipt batches are chronological so the newest per-shop confirmation and announcement win',()=>{
 const transactions=[{id:'newest',status:'paid',confirmedAt:'2026-11-12T12:02:00Z'},{id:'middle',status:'paid',confirmedAt:'2026-11-12T12:01:00Z'},{id:'oldest',status:'paid',confirmedAt:'2026-11-12T12:00:00Z'},{id:'pending',status:'processing',createdAt:'2026-11-12T12:03:00Z'}];
 assert.deepEqual(newConfirmedReceipts(transactions,new Set(['oldest'])).map(t=>t.id),['middle','newest']);
 assert.deepEqual(newConfirmedReceipts([{...transactions[0],confirmedAt:'2026-11-12T12:00:00Z'},transactions[2]],new Set()).map(t=>t.id),['oldest','newest']);
});
