import { EXPLORE_SCENES, EXPLORE_SAMPLE, calculateExploreAnswer, createExplorePlayback, updateExplorePlayback } from './explore-model.js';
import { cash } from './ui.js';
import { renderExploreScene, renderExploreEnd } from './explore-view.js';

/** Presentation-only playback; no member state, storage, payments or signup side effects. */
export function bindExplore(ctx, options = {}) {
  const root = ctx.$('.lumo-explore');
  if (!root) return () => {};
  const doc = root.ownerDocument || globalThis.document;
  const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
  const schedule = options.setTimeout || globalThis.setTimeout;
  const cancel = options.clearTimeout || globalThis.clearTimeout;
  let playback = createExplorePlayback({ reducedMotion: options.reducedMotion ?? media?.matches });
  let alive = true, timer = null, last = now(), manual = playback.reducedMotion, resumeWhenVisible = false;
  const q = selector => root.querySelector(selector);
  const stage = q('[data-explore-stage]');
  if (!stage) return () => {};
  const valid = () => alive && root.isConnected;
  const clear = () => { if (timer !== null) cancel(timer); timer = null; };
  const announce = message => { const live = q('[data-explore-live]'); if (live) live.textContent = message; };

  function paint({ scene = false, announceScene = false } = {}) {
    root.dataset.paused = String(playback.paused);
    root.dataset.manual = String(manual);
    root.dataset.complete = String(playback.complete);
    if (scene) stage.innerHTML = playback.complete ? renderExploreEnd() : renderExploreScene(playback.index);
    for (const button of root.querySelectorAll('[data-explore-scene]')) {
      const index = Number(button.dataset.exploreScene);
      const current = !playback.complete && index === playback.index;
      if (current) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      const percent = playback.complete || index < playback.index ? 100 : current ? Math.min(100, playback.elapsed / EXPLORE_SCENES[index].duration * 100) : 0;
      button.querySelector('[data-explore-fill]')?.style.setProperty('--explore-progress', `${percent}%`);
    }
    const controls = q('[data-explore-controls]');
    if (controls) controls.hidden = playback.complete;
    const count = q('[data-explore-count]');
    if (count) count.textContent = playback.complete ? 'All clear.' : `${playback.index + 1} / ${EXPLORE_SCENES.length}`;
    const previous = q('[data-explore-control="previous"]');
    if (previous) previous.disabled = playback.index === 0;
    const toggle = q('[data-explore-control="toggle"]');
    if (toggle) {
      toggle.setAttribute('aria-label', playback.paused ? 'Play tour' : 'Pause tour');
      toggle.setAttribute('aria-pressed', String(!playback.paused));
      toggle.innerHTML = playback.paused ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg><span>Play</span>' : '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg><span>Pause</span>';
    }
    const next = q('[data-explore-control="next"]');
    if (next) next.setAttribute('aria-label', playback.index === EXPLORE_SCENES.length - 1 ? 'Finish tour' : 'Next feature');
    const skip = q('[data-explore-control="skip"]');
    if (skip) { skip.hidden = playback.complete; skip.disabled = playback.complete; }
    if (playback.complete && scene) {
      announce('Tour finished. Replay, get started, or return to welcome.');
      q('[data-explore-end-title]')?.focus?.({ preventScroll: true });
    } else if (announceScene) announce(`${playback.index + 1} of ${EXPLORE_SCENES.length}. ${EXPLORE_SCENES[playback.index].name}. ${EXPLORE_SCENES[playback.index].copy}`);
  }

  function tick() {
    timer = null;
    if (!valid() || playback.paused || playback.complete) return;
    const time = now(), previous = playback;
    playback = updateExplorePlayback(playback, { type: 'tick', ms: Math.max(0, time - last) });
    last = time;
    const changed = playback.index !== previous.index || playback.complete !== previous.complete;
    if (changed) manual = false;
    paint({ scene: changed });
    if (!playback.paused && !playback.complete) timer = schedule(tick, 50);
  }

  function dispatch(action, { interactive = true } = {}) {
    clear();
    const before = playback;
    // Capture the fraction already shown before pausing or manually changing scenes.
    if (!playback.paused && !playback.complete) playback = updateExplorePlayback(playback, { type: 'tick', ms: Math.max(0, now() - last) });
    playback = updateExplorePlayback(playback, action);
    const selecting = ['select', 'next', 'previous'].includes(action.type);
    if (selecting) manual = true;
    if (action.type === 'replay') manual = playback.reducedMotion;
    const restart = manual && !playback.paused;
    if (restart) { manual = playback.reducedMotion; playback = { ...playback, elapsed: 0 }; }
    last = now();
    paint({ scene: selecting || restart || ['replay', 'finish'].includes(action.type) || before.index !== playback.index || before.complete !== playback.complete, announceScene: interactive && selecting });
    if (!playback.paused && !playback.complete) timer = schedule(tick, 50);
  }

  const click = event => {
    const button = event.target.closest('button');
    if (!valid() || !button || !root.contains(button) || button.disabled) return;
    if (button.dataset.exploreScene !== undefined) return dispatch({ type: 'select', index: button.dataset.exploreScene });
    const type = ({ previous: 'previous', toggle: 'toggle', next: 'next', skip: 'finish', replay: 'replay' })[button.dataset.exploreControl];
    if (type) dispatch({ type });
  };
  const explanation = event => {
    const details = event.target;
    if (!valid() || !details?.matches?.('details[data-explore-explanation]') || !details.open) return;
    manual = true;
    dispatch({ type: 'pause' }, { interactive: false });
    announce('Tour paused. Take your time with the details.');
  };
  const submitExample = event => {
    const form = event.target;
    if (!valid() || !form?.matches?.('[data-explore-example-form]')) return;
    event.preventDefault();
    manual = true; dispatch({ type: 'pause' }, { interactive: false });
    if (!form.isConnected) return;
    const inputs = {};
    for (const name of ['available', 'planned', 'cushion']) {
      const value = form.querySelector(`[name="${name}"]`)?.value?.trim() || '';
      inputs[name] = /^\d+(?:\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : NaN;
    }
    const result = calculateExploreAnswer(inputs), feedback = form.querySelector('[data-explore-example-feedback]');
    if (!result.ok) { if (feedback) feedback.textContent = result.message; return; }
    const money = value => cash(value, { decimals: value % 100 !== 0 });
    for (const name of ['available', 'planned', 'cushion', 'left']) {
      const node = q(`[data-explore-math="${name}"]`);
      if (node) node.textContent = `${['planned', 'cushion'].includes(name) ? '− ' : ''}${money(result[name])}`;
    }
    const answer = q('[data-explore-chat-answer]');
    if (answer) answer.textContent = result.gap > 0 ? `Your example plan and breathing room exceed the available money by ${money(result.gap)}. ${money(result.left)} is left until ${EXPLORE_SAMPLE.periodLabel}.` : `Based on your example plan, you have ${money(result.left)} left until ${EXPLORE_SAMPLE.periodLabel}.`;
    if (feedback) feedback.textContent = 'Example updated only. Your account and the other tour scenes are unchanged.';
  };
  const visibility = () => {
    if (!valid()) return;
    if (doc?.hidden) { resumeWhenVisible = !playback.paused && !playback.complete; dispatch({ type: 'pause' }, { interactive: false }); }
    else if (resumeWhenVisible) { resumeWhenVisible = false; dispatch({ type: 'play' }, { interactive: false }); }
  };
  const keydown = event => { if (event.key === 'Tab' && !playback.paused) dispatch({ type: 'pause' }); };
  const motionChange = event => {
    playback = { ...playback, reducedMotion: event.matches === true };
    if (event.matches) { manual = true; dispatch({ type: 'pause' }, { interactive: false }); }
  };
  root.addEventListener('click', click);
  root.addEventListener('keydown', keydown);
  root.addEventListener('toggle', explanation, true);
  root.addEventListener('submit', submitExample);
  doc?.addEventListener('visibilitychange', visibility);
  media?.addEventListener?.('change', motionChange);
  if (doc?.hidden) { resumeWhenVisible = !playback.paused; playback = { ...playback, paused: true }; }
  paint();
  if (!playback.paused) timer = schedule(tick, 50);
  return () => {
    alive = false; clear();
    root.removeEventListener('click', click);
    root.removeEventListener('keydown', keydown);
    root.removeEventListener('toggle', explanation, true);
    root.removeEventListener('submit', submitExample);
    doc?.removeEventListener('visibilitychange', visibility);
    media?.removeEventListener?.('change', motionChange);
  };
}
