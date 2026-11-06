/** A cancellable visual delay only; this does not verify an identity. */
export function createVerificationAnimation({
  schedule = (callback, delay) => setTimeout(callback, delay),
  unschedule = timer => clearTimeout(timer),
  onStage = () => {},
  onComplete = () => {},
} = {}) {
  let generation = 0, running = false, disposed = false;
  const timers = new Set();
  const current = token => !disposed && running && token === generation;

  function clearTimers() {
    const pending = [...timers];
    timers.clear();
    for (const timer of pending) unschedule(timer);
  }

  function cancel() {
    generation += 1;
    running = false;
    clearTimers();
  }

  function later(token, delay, callback) {
    let timer;
    timer = schedule(() => {
      timers.delete(timer);
      if (!current(token)) return;
      try { callback(); }
      catch (error) {
        if (generation === token) cancel();
        throw error;
      }
    }, delay);
    timers.add(timer);
  }

  function start() {
    if (disposed) return false;
    cancel();
    const token = generation;
    running = true;
    try {
      onStage(0);
      // A callback may have cancelled or replaced this run itself.
      if (!current(token)) return token;
      later(token, 900, () => onStage(1));
      later(token, 1800, () => onStage(2));
      later(token, 2800, () => {
        running = false;
        clearTimers();
        onComplete();
      });
    } catch (error) {
      if (generation === token) cancel();
      throw error;
    }
    return token;
  }

  return {
    start,
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel(); },
    get running() { return running; },
  };
}
