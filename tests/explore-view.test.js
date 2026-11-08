import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { renderExplore, renderExploreScene, renderExploreEnd } from '../dist/js/explore-view.js';
import { EXPLORE_SCENES } from '../dist/js/explore-model.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const money = (html, amount) => assert.match(text(html), new RegExp(`GH₵\\s*${amount.replaceAll(',', ',?')}(?:\\.00)?(?![\\d,.])`));

test('the tour labels sample money and exposes all scenes and playback controls immediately', () => {
  const html = renderExplore();
  assert.match(text(html), /Sample account\s*·\s*No real money/i);
  assert.match(html, /<h1\b[^>]*id="explore-title"/);
  assert.match(html, /aria-labelledby="explore-title"/);
  for (let index = 0; index < EXPLORE_SCENES.length; index++) {
    const button = html.match(new RegExp(`<button\\b[^>]*data-explore-scene="${index}"[^>]*>`))?.[0];
    assert.ok(button);
    assert.match(button, /aria-label="[^"]+"/);
  }
  for (const action of ['skip', 'previous', 'toggle', 'next']) assert.match(html, new RegExp(`data-explore-control="${action}"`));
  assert.match(html, /data-explore-live/);
  assert.doesNotMatch(html, /data-action="(?:start|demo|welcome-signin)"|<form\b/);
});

test('each app scene has one concise tooltip explaining its own feature', () => {
  for (let index = 0; index < EXPLORE_SCENES.length; index++) {
    const html = renderExploreScene(index), scene = EXPLORE_SCENES[index];
    assert.equal((html.match(/data-explore-tooltip(?:\s|>)/g) || []).length, 1, `${scene.id} gets one tooltip`);
    assert.ok(text(html).includes(scene.title));
    assert.ok(text(html).includes(scene.copy));
    assert.doesNotMatch(html, /data-action="(?:start|demo|pay-[^"]*|p:[^"]*)"|<textarea\b|contenteditable/);
    if (scene.id === 'chat') {
      const forms = [...html.matchAll(/<form\b[^>]*>/g)];
      assert.equal(forms.length, 1, 'only the isolated example calculator can accept input');
      assert.match(forms[0][0], /data-explore-example-form/);
      const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(match => match[0]);
      assert.equal(inputs.length, 3);
      assert.deepEqual(inputs.map(input => input.match(/name="([^"]+)"/)[1]), ['available', 'planned', 'cushion']);
      for (const input of inputs) assert.match(input, /type="number"/);
    } else assert.doesNotMatch(html, /<form\b|<input\b/);
  }
});

test('home and plan show the same available money, essentials and breathing room', () => {
  const home = renderExploreScene(0), plan = renderExploreScene(1);
  money(home, '250');
  money(home, '1,000');
  assert.match(text(home), /Left after plan/i);
  money(plan, '450');
  money(plan, '200');
  money(plan, '100');
  assert.match(text(plan), /food/i);
  assert.match(text(plan), /transport/i);
  assert.match(text(plan), /breathing room/i);
});

test('Pause and Ask Lux use the same sample money without presenting a live payment or editable chat', () => {
  const pause = renderExploreScene(2), chat = renderExploreScene(3);
  money(pause, '300');
  money(pause, '50');
  assert.match(text(pause), /before you decide/i);
  assert.match(pause, /lux-pause-worried\.png/);
  assert.match(text(chat), /What can I spend\?/i);
  money(chat, '250');
  assert.match(text(chat), /Based on your plan, you have GH₵250 left until Friday\./);
  assert.doesNotMatch(pause + chat, /contenteditable|<textarea\b|data-action="pay-|type="(?:password|tel|email|text)"/);
});

test('Money Boxes demonstrate the one-cedi Savings Hack and the spare-money condition', () => {
  const html = renderExploreScene(4), copy = text(html);
  assert.match(copy, /laptop/i);
  money(html, '250');
  money(html, '251');
  money(html, '1,500');
  money(html, '20');
  money(html, '1');
  assert.match(copy, /5%/);
  assert.match(copy, /money to spare|enough spendable/i);
});

test('the optional accountability partner has accepted and a withdrawal still requires the owner’s PIN', () => {
  const html = renderExploreScene(5), copy = text(html);
  assert.match(copy, /Esi/);
  assert.match(copy, /accepted|confirmed/i);
  assert.match(copy, /code/i);
  assert.match(copy, /your (?:own )?PIN/i);
  money(html, '251');
  assert.doesNotMatch(html, /<input\b|<form\b|data-action="p:/);
});

test('finishing offers a voluntary start, replay or return without automatically replacing an account', () => {
  const html = renderExploreEnd();
  assert.match(html, /data-action="start"/);
  assert.match(html, /data-explore-control="replay"/);
  assert.match(html, /data-action="welcome-tour-close"/);
  assert.match(text(html), /Let’s get started/);
  assert.match(text(html), /Replay|Watch again/i);
  assert.match(text(html), /Back to welcome/i);
  assert.doesNotMatch(html, /data-action="demo"|<form\b/);
});

test('rendering is independent of private account data and every referenced asset is available offline', () => {
  const context = Object.freeze({ get state() { throw new Error('Explore must not read account data'); } });
  const html = renderExplore(context) + EXPLORE_SCENES.map((_, index) => renderExploreScene(index, context)).join('') + renderExploreEnd(context);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2, 'the tour should reuse the real Lux illustrations');
  for (const asset of assets) assert.ok(existsSync(new URL(`../dist${asset}`, import.meta.url)), `${asset} is packaged`);
  assert.doesNotMatch(html, /https?:\/\/|data-action="demo"|type="(?:password|tel|email)"/i);
});
