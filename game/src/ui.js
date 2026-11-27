// All DOM screens: menu, aircraft select, garage (paint), missions,
// settings, leaderboard, HUD, pause, game over. Every button does something.

import { PLANES, QUALITY } from './config.js';

const SCREENS = ['menu', 'planes', 'garage', 'missions', 'settings', 'board', 'pause', 'over', 'hud'];

export function createUI(hooks) {
  const $ = (id) => document.getElementById(id);
  let toastTimer = null;

  function show(name) {
    for (const s of SCREENS) {
      const el = $(`screen-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    }
    const hud = $('hud');
    if (hud) hud.classList.toggle('hidden', !(name === 'hud'));
  }

  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function hearts(n, max) {
    let s = '';
    for (let i = 0; i < max; i++) s += i < n ? '♥' : '♡';
    return s;
  }

  function updateHUD(s) {
    $('hud-score').textContent = String(Math.floor(s.score));
    $('hud-coins').textContent = String(s.coins);
    $('hud-dist').textContent = `${Math.floor(s.distance)} m`;
    $('hud-speed').textContent = `${Math.round(s.speed * 3.6)} km/h`;
    $('hud-fuel').style.width = `${Math.max(0, s.fuel)}%`;
    $('hud-fuel').classList.toggle('low', s.fuel < 25);
    $('hud-health').textContent = hearts(s.health, 3);
    $('hud-health').classList.toggle('low', s.health === 1);
    $('hud-env').textContent = s.envName;
    $('hud-turbo').style.width = `${Math.max(0, Math.min(100, s.turbo))}%`;
    $('hud-turbo').classList.toggle('ready', s.turbo >= 99);
  }

  function renderMenu(best, coins) {
    $('menu-best').textContent = best > 0 ? `Skor terbaik: ${best.toLocaleString('id-ID')}` : 'Belum ada penerbangan';
    $('menu-coins').textContent = `🪙 ${coins.toLocaleString('id-ID')}`;
    $('menu-plane').textContent = hooks.currentPlane().name;
  }

  function renderPlanes(coins, owned, selected) {
    const list = $('plane-list');
    list.innerHTML = '';
    for (const p of PLANES) {
      const has = owned.includes(p.id);
      const div = document.createElement('div');
      div.className = 'card' + (selected === p.id ? ' selected' : '');
      div.innerHTML = `
        <div class="card-name">${p.name}</div>
        <div class="card-desc">${p.desc}</div>
        <div class="card-stats">Kecepatan ×${p.speed.toFixed(2)} · Handling ×${p.handling.toFixed(2)}</div>
        <button class="btn small">${has ? (selected === p.id ? 'Dipakai ✓' : 'Pilih') : `Beli · 🪙 ${p.price}`}</button>`;
      div.querySelector('button').addEventListener('click', () => {
        if (has) hooks.onSelectPlane(p.id);
        else hooks.onBuyPlane(p.id);
      });
      list.appendChild(div);
    }
    $('planes-coins').textContent = `🪙 ${coins.toLocaleString('id-ID')}`;
  }

  const PAINTS = [
    { name: 'Merah', color: 0xe8442e }, { name: 'Biru', color: 0x2e7fe8 },
    { name: 'Emas', color: 0xffc93e }, { name: 'Hijau', color: 0x37b268 },
    { name: 'Ungu', color: 0x9b59d0 }, { name: 'Hitam', color: 0x23232e },
  ];

  function renderGarage(paint) {
    const list = $('garage-list');
    list.innerHTML = '';
    for (const p of PAINTS) {
      const div = document.createElement('div');
      div.className = 'swatch' + (paint === p.color ? ' selected' : '');
      div.style.background = `#${p.color.toString(16).padStart(6, '0')}`;
      div.title = p.name;
      div.addEventListener('click', () => hooks.onPaint(p.color));
      list.appendChild(div);
    }
    $('garage-plane').textContent = `Cat ${hooks.currentPlane().name}`;
    $('garage-note').textContent = 'Cat langsung diterapkan ke pesawatmu dan tersimpan.';
  }

  function renderMissions(missions, daily, isDone) {
    const list = $('mission-list');
    list.innerHTML = '';
    const d = daily();
    const dRow = document.createElement('div');
    dRow.className = 'mission' + (d.claimed ? ' done' : '');
    dRow.innerHTML = `<span>${d.text}</span><b>${d.claimed ? 'Selesai ✓' : `Hadiah 🪙 ${d.reward}`}</b>`;
    list.appendChild(dRow);
    for (const m of missions) {
      const row = document.createElement('div');
      row.className = 'mission' + (isDone(m.id) ? ' done' : '');
      row.innerHTML = `<span>${m.text}</span><b>${isDone(m.id) ? 'Selesai ✓' : `Hadiah 🪙 ${m.reward}`}</b>`;
      list.appendChild(row);
    }
  }

  function renderBoard(board) {
    const list = $('board-list');
    list.innerHTML = '';
    if (!board.length) {
      list.innerHTML = '<div class="empty">Belum ada skor. Terbang dan catat skormu!</div>';
      return;
    }
    board.forEach((b, i) => {
      const row = document.createElement('div');
      row.className = 'board-row';
      row.innerHTML = `<span>#${i + 1}</span><span>${b.score.toLocaleString('id-ID')}</span><span>${Math.floor(b.distance)} m · ${b.date}</span>`;
      list.appendChild(row);
    });
  }

  function renderSettings(quality, muted, sensitivity) {
    const sel = $('quality-select');
    sel.innerHTML = '';
    for (const q of Object.keys(QUALITY)) {
      const o = document.createElement('option');
      o.value = q;
      o.textContent = q[0].toUpperCase() + q.slice(1);
      if (q === quality) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => hooks.onQuality(sel.value);
    $('mute-toggle').checked = muted;
    $('mute-toggle').onchange = (e) => hooks.onMute(e.target.checked);
    $('sens-range').value = sensitivity;
    $('sens-value').textContent = `${sensitivity.toFixed(1)}×`;
    $('sens-range').oninput = (e) => {
      const v = parseFloat(e.target.value);
      $('sens-value').textContent = `${v.toFixed(1)}×`;
      hooks.onSensitivity(v);
    };
  }

  function renderOver(result) {
    $('over-score').textContent = Math.floor(result.score).toLocaleString('id-ID');
    $('over-best').textContent = Math.floor(result.best).toLocaleString('id-ID');
    $('over-dist').textContent = `${Math.floor(result.distance)} m`;
    $('over-coins').textContent = `🪙 ${result.coins}`;
    $('over-rings').textContent = `${result.rings} cincin`;
    $('over-reward').textContent = result.reward > 0 ? `+🪙 ${result.reward} dari misi` : 'Tidak ada hadiah misi';
    $('over-newbest').classList.toggle('hidden', !result.newBest);
  }

  // Wire every button once.
  $('btn-play').addEventListener('click', () => hooks.onPlay());
  $('btn-planes').addEventListener('click', () => hooks.onShowPlanes());
  $('btn-garage').addEventListener('click', () => hooks.onShowGarage());
  $('btn-missions').addEventListener('click', () => hooks.onShowMissions());
  $('btn-settings').addEventListener('click', () => hooks.onShowSettings());
  $('btn-board').addEventListener('click', () => hooks.onShowBoard());
  $('btn-mute-menu').addEventListener('click', () => hooks.onMuteToggle());
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.addEventListener('click', () => hooks.onBack());
  });
  $('btn-resume').addEventListener('click', () => hooks.onResume());
  $('btn-restart-pause').addEventListener('click', () => hooks.onRestart());
  $('btn-quit-pause').addEventListener('click', () => hooks.onQuit());
  $('btn-restart').addEventListener('click', () => hooks.onRestart());
  $('btn-menu').addEventListener('click', () => hooks.onQuit());
  $('btn-pause').addEventListener('click', () => hooks.onPause());

  return {
    show, toast, updateHUD, renderMenu, renderPlanes, renderGarage,
    renderMissions, renderBoard, renderSettings, renderOver,
  };
}
