/* Device appearance is kept separately from account and money records. Runs before styles paint. */
(function (root) {
  'use strict';
  const key = 'lumo-appearance-v1';
  const valid = value => ['system', 'light', 'dark'].includes(value);
  const read = () => { try { const value = root.localStorage.getItem(key); return valid(value) ? value : 'dark'; } catch { return 'dark'; } };
  const query = root.matchMedia?.('(prefers-color-scheme: light)');
  const listeners = new Set();
  let preference = read(), theme;
  function apply() {
    theme = preference === 'system' ? (query?.matches ? 'light' : 'dark') : preference;
    const html = root.document.documentElement;
    html.dataset.theme = theme;
    html.dataset.appearance = preference;
    html.style.colorScheme = theme;
    const meta = root.document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f3f4f1' : '#191a22';
    listeners.forEach(listener => listener({ preference, theme }));
  }
  root.LumoAppearance = Object.freeze({
    getPreference: () => preference,
    getTheme: () => theme,
    setPreference(value) {
      if (!valid(value)) return { ok: false, saved: false };
      let saved = false;
      try { root.localStorage.setItem(key, value); saved = true; } catch {}
      preference = value;
      apply();
      return { ok: true, saved };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  });
  const systemChanged = () => { if (preference === 'system') apply(); };
  if (query?.addEventListener) query.addEventListener('change', systemChanged);
  else query?.addListener?.(systemChanged);
  root.addEventListener('storage', event => { if (event.key === key || event.key === null) { preference = read(); apply(); } });
  apply();
})(window);
