/** Fixed, illustrative pesewas. Explore never receives or changes account data. */
const available = 100000, food = 45000, transport = 20000, cushion = 10000;
const planned = food + transport, goalSaved = 25000, hackPayment = 2000, hackPercent = 5;
const hackSaved = Math.round(hackPayment * hackPercent / 100), payment = 30000;
export const EXPLORE_SAMPLE = Object.freeze({ available, food, transport, planned, cushion,
  left: available - planned - cushion, payment, shortfall: payment - (available - planned - cushion),
  afterPayment: available - payment, remainingCushion: available - payment - planned,
  periodLabel: 'Friday', snapshotLabel: 'Fixed example snapshot',
  goalSaved, goalTarget: 150000, hackPayment, hackPercent, hackSaved, goalAfter: goalSaved + hackSaved,
});

/** Only changes the open example calculation, never a live balance or the other scenes. */
export function calculateExploreAnswer({ available, planned, cushion } = {}) {
  if (![available, planned, cushion].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000)) return { ok: false, message: 'Use amounts from GH₵0 to GH₵1,000,000, with no more than two decimal places.' };
  const raw = available - planned - cushion;
  return { ok: true, available, planned, cushion, left: Math.max(0, raw), gap: Math.max(0, -raw) };
}

export const EXPLORE_SCENES = Object.freeze([
  { id: 'home', name: 'Your money', title: 'More than a balance.', copy: 'Know what’s left after your plan and breathing room.', duration: 4500 },
  { id: 'plan', name: 'Plan', title: 'Make room for real life.', copy: 'Keep food, transport and upcoming commitments in view.', duration: 4500 },
  { id: 'pause', name: 'Pause Moment', title: 'A moment. A clearer choice.', copy: 'Understand a payment’s impact before you decide.', duration: 5500 },
  { id: 'chat', name: 'Ask Lux', title: 'Chat with your money.', copy: 'Ask Lux about your spending, plans and goals.', duration: 5500 },
  { id: 'box', name: 'Money Boxes & Savings Hacks', title: 'Small moves. Real goals.', copy: 'Give your goal a Money Box. A Savings Hack helps it grow.', duration: 6000 },
  { id: 'partner', name: 'Accountability partner', title: 'A little backup for your goal.', copy: 'Choose someone you trust to help you stick with it.', duration: 5000 },
].map(scene => Object.freeze(scene)));

export function safeExploreIndex(input) {
  if (!['number', 'string'].includes(typeof input) || (typeof input === 'string' && !input.trim())) return 0;
  const n = Number(input);
  return Number.isFinite(n) ? Math.max(0, Math.min(EXPLORE_SCENES.length - 1, Math.floor(n))) : 0;
}

export function createExplorePlayback({ reducedMotion = false } = {}) {
  return { index: 0, elapsed: 0, paused: reducedMotion === true, complete: false, reducedMotion: reducedMotion === true };
}

/** A pure playback reducer. All time is supplied by the presentation controller. */
export function updateExplorePlayback(state, action = {}) {
  const select = index => ({ ...state, index: safeExploreIndex(index), elapsed: 0, paused: true, complete: false });
  const finish = () => ({ ...state, index: EXPLORE_SCENES.length - 1, elapsed: EXPLORE_SCENES.at(-1).duration, paused: true, complete: true });
  if (action.type === 'replay') return createExplorePlayback({ reducedMotion: state.reducedMotion });
  if (action.type === 'finish') return finish();
  if (action.type === 'select') return select(action.index);
  if (action.type === 'previous') return select(state.complete ? EXPLORE_SCENES.length - 1 : state.index - 1);
  if (action.type === 'next') return state.index === EXPLORE_SCENES.length - 1 ? finish() : select(state.index + 1);
  if (state.complete) return state;
  if (action.type === 'pause') return state.paused ? state : { ...state, paused: true };
  if (action.type === 'play') return state.paused ? { ...state, paused: false } : state;
  if (action.type === 'toggle') return { ...state, paused: !state.paused };
  if (action.type !== 'tick' || state.paused || typeof action.ms !== 'number' || !Number.isFinite(action.ms) || action.ms <= 0) return state;
  let elapsed = state.elapsed + action.ms, index = state.index;
  while (elapsed >= EXPLORE_SCENES[index].duration) {
    elapsed -= EXPLORE_SCENES[index].duration;
    if (index === EXPLORE_SCENES.length - 1) return finish();
    index++;
  }
  return { ...state, index, elapsed: Math.min(elapsed, EXPLORE_SCENES[index].duration) };
}
