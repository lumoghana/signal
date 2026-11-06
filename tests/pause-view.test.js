import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPauseScreen } from '../dist/js/pause-view.js';

test('Pause retains exact pesewas while whole-cedi examples stay concise', () => {
  const html = renderPauseScreen({ metric: 15025, amount: 50099, reservedFrom: 'plan', recipient: 'Ama' });
  assert.match(html, /<strong[^>]*>GH₵150\.25<\/strong>/);
  assert.match(html, /Sending · GH₵500\.99 to Ama/);
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
