/** Shared current-rule terms. Reading these never enables a rule or moves money. */
export function renderSavingsHackTerms() {
  return `
    <p class="planning-help"><strong>What counts as spare?</strong><br>Money already in Everyday after the payment and its fee, your remaining plan, uncovered IOUs due within your plan period, and breathing room. Expected allowance, money owed to you and Money Boxes do not count. Any minimum Everyday balance you set is protected too.</p>
    <p class="planning-help"><strong>Which payments count?</strong><br>Payment-based hacks run only after a confirmed successful Lumo, MoMo, bank or service payment. Pending and failed payments do not trigger them. Demo card purchases, group contributions and transfers between your own accounts are excluded. Percentage rules use the payment amount, excluding its fee.</p>
    <p class="planning-help"><strong>What if it won’t fit?</strong><br>The contribution is skipped, with no catch-up charge later. Rules also skip while paused, during an active recovery plan, or after the goal is reached. Savings stop at your target and any monthly cap you set. Saved and skipped moves appear in Rule activity.</p>
    <p class="planning-help"><strong>Other saving styles</strong><br>An income rule uses confirmed money added to Everyday, never an expected allowance. In this prototype, scheduled rules run when you choose Check scheduled savings. Missed dates are not charged repeatedly. No live standing order is created.</p>
    <p class="planning-help"><strong>You stay in control</strong><br>Open Money Boxes → Savings options → All saving rules, then choose your box to Edit, Pause or Cancel its rule. Cancelling stops future contributions; money already saved stays in the box.</p>
    <p class="planning-help"><strong>Moving saved money back</strong><br>Reversing a payment does not undo a Savings Hack already saved. Use Take money out on the Money Box to move it back. Any goal lock or partner approval still applies.</p>
    <p class="planning-help"><strong>Fees</strong><br>This prototype applies no fee to the internal Savings Hack move. Payment fees are separate. Live charges, if any, must be confirmed and shown before activation.</p>`;
}

/** A compact introduction followed by optional, expandable saving-rule terms. */
export function renderSavingsHackDisclosure() {
  return `<div data-savings-hack-disclosure><p class="planning-help muted">Your plan comes first. If there’s not enough spendable money, the contribution is skipped.</p><details class="planning-details"><summary style="min-height:44px;cursor:pointer;padding:12px 0">How this works</summary>${renderSavingsHackTerms()}
  </details></div>`;
}
