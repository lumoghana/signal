import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../dist/js/model.js';
import { parentRoute, routeKey, routeLabel, safeRoute, sectionForRoute, chatReturnRoute } from '../dist/js/navigation.js';
import { canOpenChatBySwipe } from '../dist/js/chat-gestures.js';
import { createRouter } from '../dist/js/router.js';

const home = { section: 'home', page: 'home' };
const list = { section: 'life', page: 'groups' };
const clone = value => structuredClone(value);
function fixture() {
  const state = createDemoState(), group = state.groups[0];
  group.participantId = 'me';
  group.members.forEach(member => { member.status = 'active'; });
  return { state, group, overview: { section: 'life', page: 'group-detail', id: group.id }, chat: { section: 'life', page: 'group-chat', id: group.id } };
}

test('group Overview, group Chat, and private Ask Lumo have separate identities and explicit parents', () => {
  const { state, group, overview, chat } = fixture();
  assert.notEqual(routeKey(overview), routeKey(chat));
  assert.notEqual(routeKey(chat), routeKey({ section: 'chat', page: 'home', returnTo: chat }));
  assert.deepEqual(safeRoute({ section: 'groups', page: 'chat', id: group.id }, state), chat);
  assert.deepEqual(parentRoute(chat, state), overview);
  assert.deepEqual(parentRoute(overview, state), list);
  assert.equal(sectionForRoute(chat), 'groups');
  assert.match(routeLabel(chat), /chat/i);
});

test('missing, invited and removed group-chat destinations cannot expose a conversation through history', () => {
  const { state, group, overview, chat } = fixture();
  assert.deepEqual(safeRoute({ ...chat, id: 'not-a-group' }, state), list);
  const member = group.members.find(item => item.id === 'me');
  for (const status of ['invited', 'removed']) {
    member.status = status;
    assert.deepEqual(safeRoute(chat, state), overview);
    assert.deepEqual(chatReturnRoute({ section: 'chat', page: 'home', returnTo: chat }, state), overview);
  }
  member.status = 'active';
  assert.deepEqual(safeRoute(chat, state), chat);
  group.participantId = 'unknown';
  assert.deepEqual(safeRoute(chat, state), overview);
});

test('private Ask Lumo restores the exact authorised group conversation without changing either draft or money', () => {
  const { state, overview, chat } = fixture();
  const draft = { chat: { input: 'My private balance', messages: [] }, groupChats: { [chat.id]: { me: { input: 'Is 3pm okay?', replyToId: 'message-one', scrollTop: 82 } } } };
  const before = JSON.stringify({ state, draft });
  for (const origin of [overview, chat]) {
    assert.deepEqual(chatReturnRoute({ section: 'chat', page: 'home', returnTo: origin }, state, draft), origin);
    assert.equal(canOpenChatBySwipe(origin), true);
  }
  assert.equal(JSON.stringify({ state, draft }), before);
});

function harness(state, draft) {
  let native = [null], pointer = 0, rendered = home;
  const pending = [];
  const history = {
    get state() { return native[pointer]; },
    pushState(value) { native = native.slice(0, pointer + 1); native.push(clone(value)); pointer += 1; },
    replaceState(value) { native[pointer] = clone(value); },
    go(delta) { pending.push(pointer + delta); },
  };
  const router = createRouter({ initialRoute: home, history,
    normalize: route => safeRoute(route, state, draft),
    parent: route => parentRoute(route, state, draft), key: routeKey,
    rootFor: route => route.section === 'life' && route.page.startsWith('group') ? list : home,
    onNavigate(route) { rendered = route; },
  });
  const flush = () => { while (pending.length) { pointer = pending.shift(); assert.ok(pointer >= 0 && pointer < native.length); router.receive(history.state); } };
  router.initialise();
  return { router, history, get current() { return rendered; },
    go(route, options) { router.go(route, options); flush(); },
    back() { router.back(); flush(); },
    nativeBack() { history.go(-1); flush(); },
    nativeForward() { history.go(1); flush(); },
  };
}

test('Overview, Chat, group list, Home and private Ask Lumo round-trip without repeated Back presses or lost drafts', () => {
  const { state, overview, chat } = fixture();
  const draft = { groupChats: { [chat.id]: { me: { input: 'I can collect the prints.' } } }, chat: { input: 'Private question' } };
  const before = JSON.stringify({ state, draft }), nav = harness(state, draft);
  nav.go(list); nav.go(overview); nav.go(chat);
  assert.deepEqual(nav.current, chat);
  nav.go({ section: 'chat', page: 'home', returnTo: chat });
  nav.go(chatReturnRoute(nav.current, state, draft), { replace: true });
  assert.deepEqual(nav.current, chat);
  nav.back(); assert.deepEqual(nav.current, overview);
  nav.back(); assert.deepEqual(nav.current, list);
  nav.go(chat); nav.go(home, { root: true });
  assert.deepEqual(nav.current, home);
  nav.go(list); nav.go(overview);
  assert.deepEqual(nav.current, overview, 'a group starts on its Overview when reopened from the list');
  assert.equal(JSON.stringify({ state, draft }), before);
});

test('native Forward into a revoked conversation revalidates membership and restores the gated Overview', () => {
  const { state, group, overview, chat } = fixture(), nav = harness(state, {});
  nav.go(list); nav.go(overview); nav.go(chat);
  nav.nativeBack(); assert.deepEqual(nav.current, overview);
  group.members.find(member => member.id === 'me').status = 'removed';
  nav.nativeForward();
  assert.deepEqual(nav.current, overview);
});
