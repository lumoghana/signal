import test from 'node:test';
import assert from 'node:assert/strict';
import {filterActivity} from '../dist/js/activity-view.js';
const tx=[{id:'ref-22',merchant:'Ama',category:'Food',status:'pending',direction:'out',at:'2026-11-02T12:00:00Z'},{id:'ref-21',merchant:'Kojo',category:'Food',status:'reversed',direction:'out',at:'2026-10-30T12:00:00Z'},{id:'ref-20',merchant:'Allowance',category:'Income',status:'success',direction:'in',at:'2026-10-25T12:00:00Z'}];
test('activity locates a reference and combines date, category and status without changing the ledger',()=>{const before=structuredClone(tx);assert.deepEqual(filterActivity(tx,{query:'REF-22',status:'pending',category:'Food',from:'2026-11-01',to:'2026-11-02'}).map(t=>t.id),['ref-22']);assert.deepEqual(filterActivity(tx,{status:'reversed'}).map(t=>t.id),['ref-21']);assert.equal(filterActivity(tx,{direction:'in'}).length,1);assert.equal(filterActivity(tx,{from:'2026-11-01',to:'2026-11-01'}).length,0);assert.deepEqual(tx,before);});
