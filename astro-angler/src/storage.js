// Tiny localStorage wrapper. Storage may be unavailable (private mode,
// blocked site data), so every access is guarded and the game works without it.

const KEY = 'astro-angler/v1';

export function load(defaults) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        log: raw.log && typeof raw.log === 'object' ? raw.log : {},
        stats: { ...defaults.stats, ...(raw.stats || {}) },
        settings: { ...defaults.settings, ...(raw.settings || {}) },
        hasSettings: !!raw.settings,
      };
    }
  } catch { /* ignore */ }
  return { log: {}, stats: { ...defaults.stats }, settings: { ...defaults.settings }, hasSettings: false };
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ log: data.log, stats: data.stats, settings: data.settings }));
  } catch { /* ignore */ }
}
