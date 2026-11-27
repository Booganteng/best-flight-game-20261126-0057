// Missions + daily challenge, tracked in localStorage.
// Progress is per-stat (distance/rings/coins/cleanTime) and pays coins once.

import { MISSIONS, STORE_KEYS } from './config.js';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full/blocked */ }
}

export function createMissions() {
  let done = load(STORE_KEYS.missions, {});
  let daily = load(STORE_KEYS.daily, null);

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function dailyMission() {
    const key = todayKey();
    if (!daily || daily.date !== key) {
      // Deterministic-ish daily pick from the date string.
      let h = 0;
      for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const pool = [
        { id: 'daily-d', text: 'Tantangan harian: terbang 1.500 m', target: 1500, stat: 'distance', reward: 120 },
        { id: 'daily-r', text: 'Tantangan harian: lewati 8 cincin', target: 8, stat: 'rings', reward: 120 },
        { id: 'daily-c', text: 'Tantangan harian: kumpulkan 30 koin', target: 30, stat: 'coins', reward: 120 },
      ];
      daily = { ...pool[h % pool.length], date: key, claimed: false };
      save(STORE_KEYS.daily, daily);
    }
    return daily;
  }

  return {
    list() { return MISSIONS; },
    dailyMission,
    isDone(id) { return !!done[id]; },
    // Feed end-of-run stats; returns newly completed missions (for rewards + toasts).
    applyRun(stats) {
      const fresh = [];
      const check = (m) => {
        if (done[m.id]) return;
        const v = stats[m.stat] || 0;
        if (v >= m.target) {
          done[m.id] = true;
          fresh.push(m);
        }
      };
      MISSIONS.forEach(check);
      const d = dailyMission();
      if (!d.claimed && (stats[d.stat] || 0) >= d.target) {
        d.claimed = true;
        fresh.push({ ...d });
        save(STORE_KEYS.daily, d);
      }
      if (fresh.length) save(STORE_KEYS.missions, done);
      return fresh;
    },
  };
}
