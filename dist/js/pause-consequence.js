import { cash } from './ui.js';
import { getSummary } from './model.js';
import { getPauseTradeoff } from './pause-intelligence.js';

const money = value => cash(value, { decimals: value % 100 !== 0 });
const sentence = (before, strong = '', after = '') => ({ before, strong, after });

/** One consequence, based on held money and the evaluated category release. */
export function getPauseConsequence(state, draft = {}, evaluation = {}) {
  const impact = getPauseTradeoff(state, draft, evaluation);
  if (!impact.known) return sentence('Lumo cannot calculate this payment’s full impact yet.');
  if (impact.afterAvailable < 0) {
    return sentence('This payment and its fee exceed your available money by ', money(-impact.afterAvailable), '.');
  }
  if (!impact.allowed) return sentence('Review this payment before continuing.');
  if (state.budget.created !== true) {
    return sentence('You’d have ', money(impact.afterAvailable), ' left, with no essentials plan to compare it with.');
  }

  const before = getSummary(state);
  const baselinePlanGap = Math.max(0, before.planned - before.available);
  if (impact.planGap > 0) {
    if (baselinePlanGap > 0) {
      return impact.planGap > baselinePlanGap
        ? sentence('Your plan’s existing gap would grow to ', money(impact.planGap), ' after this payment.')
        : sentence('After this payment, your plan would still be ', `${money(impact.planGap)} short`, '.');
    }
    return sentence('This payment leaves you ', `${money(impact.planGap)} short`, ' for your plan.');
  }

  const coveredBefore = Math.min(impact.buffer, Math.max(0, before.available - before.planned));
  const used = Math.max(0, coveredBefore - impact.breathingRoomCovered);
  if (used > 0) return sentence('This payment uses ', money(used), ' of your breathing room.');
  if (impact.breathingRoomCovered < impact.buffer) {
    return sentence('After this payment, your breathing room would still be ', `${money(impact.buffer - impact.breathingRoomCovered)} short`, '.');
  }
  if (evaluation.historySignals?.length && typeof evaluation.reason === 'string' && evaluation.reason) {
    return sentence(evaluation.reason);
  }
  return sentence('You’d have ', money(impact.flexible), ` left after your plan${impact.buffer > 0 ? ' and breathing room' : ''}.`);
}
