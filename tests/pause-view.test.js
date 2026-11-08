import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPauseScreen } from '../dist/js/pause-view.js';

test('Pause retains exact pesewas while whole-cedi examples stay concise', () => {
  const html = renderPauseScreen({ metric: 15025, amount: 50099, reservedFrom: 'plan', recipient: 'Ama', reason: 'A precise comparison is available here.' });
  assert.match(html, /<strong[^>]*>GH₵150\.25<\/strong>/);
  assert.match(html, /<details class="pause-screen-details"><summary>Payment details<\/summary><p class="pause-screen-context">Sending · GH₵500\.99 to Ama<\/p>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(renderPauseScreen({ metric: 15000, amount: 50000 }), /<strong[^>]*>GH₵150<\/strong>/);
});

test('Pause names only the evaluated reserved source and rejects arbitrary source copy', () => {
  for (const source of ['plan', 'cushion', 'plan and cushion']) {
    assert.ok(renderPauseScreen({ metric: 1000, reservedFrom: source }).includes(`from your ${source}.`));
  }
  assert.match(renderPauseScreen({ metric: 1000, reservedFrom: 'savings account' }), /from your plan or cushion\./);
  assert.match(renderPauseScreen({ kind: 'remaining', metric: 4500, reservedFrom: 'cushion' }), /left after your plan\./);
});

test('display strings cannot inject markup and the sample does not imply a real payment', () => {
  const html = renderPauseScreen({ amount: 50000, metric: 15000, sample: true, tour: true,
    recipient: 'Ama <script>alert(1)</script>',
    primary: { label: '<img src=x onerror=alert(1)>', attributes: 'data-tour-demo="smaller-payment"' },
    headerLeft: { label: 'Previous "scene"', attributes: 'data-tour-action="back"' },
  });
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /Ama &lt;script&gt;/);
  assert.match(html, /aria-label="Previous &quot;scene&quot;"/);
  assert.match(html, /Sample payment · GH₵500/);
  assert.match(html, /SAMPLE MONEY/);
  assert.doesNotMatch(html, /class="pause-screen-secondary"/);
});


test('the main Pause presents one consequence and escapes every part of the supplied sentence', () => {
  const html = renderPauseScreen({ metric: 99999, reason: 'Full comparison', consequence: {
    before: 'This payment leaves <script>', strong: 'GH₵30 short <img src=x>', after: ' for your plan & costs.',
  } });
  const main = html.match(/<h2 class="pause-screen-impact"[^>]*>([\s\S]*?)<\/h2>/)?.[1];
  assert.equal(main, 'This payment leaves &lt;script&gt;<strong>GH₵30 short &lt;img src=x&gt;</strong> for your plan &amp; costs.');
  assert.doesNotMatch(main, /999|Full comparison/);
  assert.equal((main.match(/<strong>/g) || []).length, 1);
  assert.match(html, /<h1 class="pause-screen-title">Pause\.<\/h1>/);
  assert.match(html, /lux-pause-worried\.png/);
});
