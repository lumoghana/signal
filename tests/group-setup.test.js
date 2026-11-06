import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { renderLife } from '../dist/js/life.js';
import { parentRoute, safeRoute } from '../dist/js/navigation.js';

const payload = (overrides = {}) => ({ name: 'Hall project', target: 50000, members: [
  { id: 'me', name: 'Ama', role: 'approver' },
  { id: 'esi', name: 'Esi', phone: '024 111 2222', role: 'approver' },
  { id: 'kofi', name: 'Kofi', role: 'contributor' },
], mandate: { approvers: ['me', 'esi'], threshold: 2 }, ...overrides });
const fresh = () => createEmptyState({ name: 'Ama' });

test('new collections retain chosen people, contacts and roles without creating money', () => {
  const s = fresh(), before = s.wallet;
  const result = applyAction(s, 'createGroup', payload({ idempotencyKey: 'chosen-people' }));
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(result.group.members.map(m => [m.id, m.name, m.role, m.amount]), [['me','Ama','approver',0],['esi','Esi','approver',0],['kofi','Kofi','contributor',0]]);
  assert.equal(result.group.members[1].phone, '0241112222');
  assert.deepEqual(result.group.members.map(m => m.status), ['active', 'invited', 'invited']);
  assert.equal(result.group.balance, 0);
  assert.equal(s.wallet, before);
  assert.equal(s.transactions.length, 0);
  assert.deepEqual(result.group.mandate, { approvers: ['me', 'esi'], threshold: 2 });
  assert.equal(applyAction(s, 'createGroup', payload({ idempotencyKey: 'chosen-people' })).duplicate, true);
  assert.equal(s.groups.length, 1);
});

test('new collections never silently enrol default friends', () => {
  const s = fresh();
  const result = applyAction(s, 'createGroup', { name: 'Our goal', target: 1000 });
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(result.group.members.map(m => m.id), ['me']);
  assert.equal(result.group.members[0].name, 'Ama');
});

test('duplicate identities and impossible mandates are rejected atomically', () => {
  for (const change of [
    { members: [...payload().members, { id: 'another', name: 'Different name', phone: '+233241112222', role: 'contributor' }] },
    { members: [...payload().members, { id: 'esi', name: 'Different name', role: 'contributor' }] },
    { members: [...payload().members, null] },
    { mandate: { approvers: ['me', 'kofi'], threshold: 2 } },
    { mandate: { approvers: ['me', 'esi'], threshold: 3 } },
  ]) {
    const s = fresh(), before = JSON.stringify(s);
    assert.equal(applyAction(s, 'createGroup', payload(change)).ok, false);
    assert.equal(JSON.stringify(s), before);
  }
});

test('adding a duplicate contact after creation does not change roles or approvals', () => {
  const s = fresh(), { group } = applyAction(s, 'createGroup', payload());
  const before = JSON.stringify(s);
  assert.equal(applyAction(s, 'addGroupMember', { id: group.id, memberId: 'esi', name: 'Esi', role: 'approver' }).ok, false);
  assert.equal(applyAction(s, 'addGroupMember', { id: group.id, name: 'Other Esi', phone: '+233241112222', role: 'approver' }).ok, false);
  assert.equal(JSON.stringify(s), before);
});

test('an empty Groups page has one creation action and a saved draft has one resume action', () => {
  const ctx = { state: fresh(), draft: {} };
  const html = renderLife(ctx, { section: 'life', page: 'groups' });
  assert.equal((html.match(/data-action="life-new-group"/g) || []).length, 1);
  ctx.draft.groupCreate = { name: 'Hall project' };
  const saved = renderLife(ctx, { section: 'life', page: 'groups' });
  assert.equal((saved.match(/data-action="life-resume-group"/g) || []).length, 1);
  assert.equal((saved.match(/data-action="life-new-group"/g) || []).length, 0);
});

test('member selection and review use chosen names, roles and five-step navigation', () => {
  const ctx = { state: fresh(), draft: { groupCreate: { name: 'Hall project', target: 50000, targetText: '500', membersVersion: 1, members: payload().members.slice(1), threshold: 2 } } };
  const members = renderLife(ctx, { section: 'life', page: 'group-create', step: 2 });
  assert.match(members, /Step 3 of 5/);
  assert.match(members, /data-action="life-create-add-member"/);
  assert.match(members, /Esi/);
  assert.doesNotMatch(members, /Senam|Jonathan/);
  const review = renderLife(ctx, { section: 'life', page: 'group-create', step: 4 });
  assert.match(review, /3 group members/);
  assert.match(review, /2 of 2 approvals/);
  assert.match(review, /life-create-edit-2/);
  assert.deepEqual(parentRoute({ section: 'life', page: 'group-create', step: 2, edit: true }), { section: 'life', page: 'group-create', step: 4 });
  assert.deepEqual(parentRoute({ section: 'life', page: 'group-create', step: 4 }), { section: 'life', page: 'group-create', step: 3 });
});

test('restored unfinished setup cannot bypass choosing its members', () => {
  const s = fresh(); s.onboardingDone = true;
  const draft = { groupCreate: { name: 'Hall project', target: 50000 } };
  assert.deepEqual(safeRoute({ section: 'life', page: 'group-create', step: 4 }, s, draft), { section: 'life', page: 'group-create', step: 2 });
});


test('display names are not identities: two Esis with different contacts have separate memberships', () => {
  const s = fresh(), result = applyAction(s, 'createGroup', payload({members:[...payload().members,{id:'esi-two',name:'Esi',phone:'0202223333',role:'contributor'}]}));
  assert.equal(result.ok,true,result.message);assert.equal(result.group.members.filter(m=>m.name==='Esi').length,2);
  const next=applyAction(s,'inviteGroupMember',{groupId:result.id,name:'Esi',phone:'0272223333',role:'contributor'});
  assert.equal(next.ok,true,next.message);assert.notEqual(next.member.id,'esi');assert.notEqual(next.member.id,'esi-two');
});
