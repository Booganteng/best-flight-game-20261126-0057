// SKY HARBOUR: AIRPLANE RUN — bootstrap, loop, physics, scoring, states.
// Fresh code written in this session.

import * as THREE from 'three';
import { GAME, PLANES, QUALITY, STORE_KEYS, ENVIRONMENTS } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildPlane } from './aircraft.js';
import { createWorld } from './world.js';
import { createMissions } from './missions.js';
import { createUI } from './ui.js';
import { getShotParams, createPilot } from './shots.js';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

const params = getShotParams();
const input = createInput();
const audio = createAudio();
const missions = createMissions();

// ---- persisted player data ----
let coins = load(STORE_KEYS.coins, 0);
let best = load(STORE_KEYS.best, 0);
let owned = load(STORE_KEYS.planes, ['prop']);
let selectedPlane = load(STORE_KEYS.plane, 'prop');
let paint = load('sh_paint', null);
let qualityName = load(STORE_KEYS.quality, 'high');
let muted = load(STORE_KEYS.muted, false);
let sensitivity = load('sh_sens', 1.0);
let board = load(STORE_KEYS.board, []);

function planeDef() {
  const base = PLANES.find((p) => p.id === selectedPlane) || PLANES[0];
  return paint === null ? base : { ...base, color: paint };
}

// ---- three setup ----
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 4, 11);

const world = createWorld(scene);
let planeGroup = null;
let propParts = [];
let flameMesh = null;

function rebuildPlane() {
  if (planeGroup) {
    scene.remove(planeGroup);
    planeGroup.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); }
    });
  }
  planeGroup = buildPlane(planeDef());
  propParts = [];
  flameMesh = null;
  planeGroup.traverse((o) => {
    if (o.name === 'prop' || o.name === 'prop2') propParts.push(o);
    if (o.name === 'flame') flameMesh = o;
  });
  scene.add(planeGroup);
}
rebuildPlane();

function applyQuality() {
  const q = QUALITY[qualityName] || QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  renderer.shadowMap.enabled = q.shadows;
  world.setCloudBudget(q.clouds);
  world.setEnvironment(world.envIndex(), q);
  save(STORE_KEYS.quality, qualityName);
}
applyQuality();
audio.setMuted(muted);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- game state ----
let state = 'menu'; // menu | playing | paused | over
let px = 0; let py = 12;
let vx = 0; let vy = 0;
let speed = 0;
let distance = 0;
let score = 0;
let runCoins = 0;
let runRings = 0;
let fuel = GAME.maxFuel;
let health = GAME.maxHealth;
let turbo = GAME.maxFuel; // turbo meter 0..100 (reuses 100 scale)
let magnetT = 0; let shieldT = 0; let turboT = 0;
let invulnT = 0;
let cleanTime = 0;
let simTime = 0;
let timeScale = 1;
let crashT = 0;
let shakeT = 0;
let camX = 0; let camY = 4;
let smokeT = 0;
let menuAngle = 0;

const pilot = createPilot();
let shotMode = params.mode; // normal | shot | test
let shotTarget = 0;
let shotDone = false;
let testDone = false;

const ui = createUI({
  currentPlane: () => planeDef(),
  onPlay: () => startRun(),
  onShowPlanes: () => { ui.renderPlanes(coins, owned, selectedPlane); ui.show('planes'); },
  onShowGarage: () => { ui.renderGarage(paint === null ? planeDef().color : paint); ui.show('garage'); },
  onShowMissions: () => { ui.renderMissions(missions.list(), () => missions.dailyMission(), (id) => missions.isDone(id)); ui.show('missions'); },
  onShowSettings: () => { ui.renderSettings(qualityName, muted, sensitivity); ui.show('settings'); },
  onShowBoard: () => { ui.renderBoard(board); ui.show('board'); },
  onBack: () => { ui.renderMenu(best, coins); ui.show('menu'); },
  onSelectPlane: (id) => {
    selectedPlane = id;
    save(STORE_KEYS.plane, id);
    rebuildPlane();
    audio.click();
    ui.renderPlanes(coins, owned, selectedPlane);
    ui.toast(`${planeDef().name} dipilih.`);
  },
  onBuyPlane: (id) => {
    const p = PLANES.find((x) => x.id === id);
    if (!p) return;
    if (coins < p.price) { ui.toast('Koin tidak cukup!'); return; }
    coins -= p.price;
    owned.push(id);
    selectedPlane = id;
    save(STORE_KEYS.coins, coins);
    save(STORE_KEYS.planes, owned);
    save(STORE_KEYS.plane, id);
    rebuildPlane();
    audio.unlockJingle();
    ui.renderPlanes(coins, owned, selectedPlane);
    ui.toast(`${p.name} dibeli!`);
  },
  onPaint: (color) => {
    paint = color;
    save('sh_paint', color);
    rebuildPlane();
    audio.click();
    ui.renderGarage(color);
  },
  onQuality: (q) => {
    qualityName = q;
    applyQuality();
    ui.toast(`Kualitas: ${q}`);
  },
  onMute: (m) => {
    muted = m;
    audio.setMuted(m);
    save(STORE_KEYS.muted, m);
  },
  onMuteToggle: () => {
    muted = !muted;
    audio.setMuted(muted);
    save(STORE_KEYS.muted, muted);
    ui.toast(muted ? 'Suara mati' : 'Suara hidup');
  },
  onSensitivity: (v) => {
    sensitivity = v;
    save('sh_sens', v);
  },
  onPause: () => pauseGame(),
  onResume: () => resumeGame(),
  onRestart: () => startRun(),
  onQuit: () => toMenu(),
});

function startRun() {
  audio.unlock();
  audio.startMusic();
  world.reset(params.mode === 'normal' ? (Math.random() * 1e9) | 0 : params.seed);
  world.setEnvironment(0, QUALITY[qualityName] || QUALITY.high);
  px = 0; py = 12; vx = 0; vy = 0;
  speed = GAME.baseSpeed;
  distance = 0; score = 0; runCoins = 0; runRings = 0;
  fuel = GAME.maxFuel;
  health = GAME.maxHealth;
  turbo = 100;
  magnetT = 0; shieldT = 0; turboT = 0;
  invulnT = 0; cleanTime = 0; simTime = 0;
  timeScale = 1; crashT = 0; shakeT = 0;
  planeGroup.visible = true;
  state = 'playing';
  ui.show('hud');
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  audio.engineOff();
  ui.show('pause');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  ui.show('hud');
}

function toMenu() {
  state = 'menu';
  distance = 0;
  audio.engineOff();
  audio.stopMusic();
  world.reset((Math.random() * 1e9) | 0);
  ui.renderMenu(best, coins);
  ui.show('menu');
}

function endRun(crashed) {
  state = 'over';
  audio.engineOff();
  const stats = { distance, rings: runRings, coins: runCoins, cleanTime };
  const fresh = missions.applyRun(stats);
  let reward = 0;
  for (const m of fresh) reward += m.reward;
  coins += runCoins + reward;
  save(STORE_KEYS.coins, coins);
  const newBest = score > best;
  if (newBest) { best = Math.floor(score); save(STORE_KEYS.best, best); }
  board.push({ score: Math.floor(score), distance: Math.floor(distance), date: new Date().toISOString().slice(0, 10) });
  board.sort((a, b) => b.score - a.score);
  board = board.slice(0, 5);
  save(STORE_KEYS.board, board);
  if (fresh.length) ui.toast(`Misi selesai: +🪙 ${reward}`);
  ui.renderOver({
    score, best, distance, coins: runCoins, rings: runRings,
    reward, newBest,
  });
  ui.show('over');
}

// ---- shot / test setup ----
if (shotMode === 'shot') {
  if (params.shot === 'start') {
    ui.renderMenu(best, coins);
    ui.show('menu');
    shotTarget = 2.5;
  } else if (params.shot === 'play') {
    startRun();
    shotTarget = 7;
  } else if (params.shot === 'rings') {
    startRun();
    shotTarget = 14;
  } else if (params.shot === 'end') {
    startRun();
    shotTarget = 40; // or until crash, whichever first
  }
} else if (shotMode === 'test') {
  startRun();
  shotTarget = params.seconds;
} else {
  ui.renderMenu(best, coins);
  ui.show('menu');
}

function writeTestOut(result) {
  const el = document.getElementById('testout');
  if (el) el.textContent = JSON.stringify(result);
  document.title = `TEST ${result.ok ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}`;
  window.__testResult = result;
}

// ---- main loop ----
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (input.consumePause()) {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (input.consumeMute()) {
    muted = !muted;
    audio.setMuted(muted);
    save(STORE_KEYS.muted, muted);
  }

  if (state === 'menu') {
    // Slow scenic drift behind the menu.
    menuAngle += dt * 0.12;
    world.update(dt, 7, distance, px, py, 1.1, false);
    planeGroup.position.set(-12, 13 + Math.sin(now * 0.001) * 0.4, 0);
    planeGroup.rotation.set(0, Math.sin(menuAngle) * 0.35, 0);
    camera.position.set(Math.sin(menuAngle) * 3 - 2, 15, 11);
    camera.lookAt(-6.5, 13, 0);
    for (const p of propParts) p.rotation.z += dt * 6;
    renderer.render(scene, camera);
    if (shotMode === 'shot' && params.shot === 'start') {
      simTime += dt;
      if (simTime >= shotTarget && !shotDone) {
        shotDone = true;
        window.__shotDone = true;
      }
    }
    return;
  }

  if (state === 'paused' || state === 'over') {
    renderer.render(scene, camera);
    return;
  }

  // ---- playing ----
  dt *= timeScale;
  simTime += dt;
  const axes = shotMode === 'normal' ? input.axes() : pilot.axes({
    px, py, objects: world.objects, speed,
  });
  const plane = planeDef();
  const handling = plane.handling * sensitivity;

  // Turbo.
  const wantTurbo = axes.turbo && turbo > 1;
  if (wantTurbo) turbo = Math.max(0, turbo - GAME.turboDrain * dt);
  else turbo = Math.min(100, turbo + GAME.turboRegen * dt);
  const turboActive = wantTurbo && turbo > 0;

  const targetSpeed = Math.min(
    GAME.maxSpeed,
    (GAME.baseSpeed + simTime * GAME.speedRamp) * plane.speed + (turboActive ? GAME.turboSpeed : 0),
  );
  speed += (targetSpeed - speed) * Math.min(1, dt * 0.8);
  distance += speed * dt;
  score += speed * dt;
  cleanTime += dt;
  fuel = Math.max(0, fuel - GAME.fuelDrain * dt);

  // Steering with smoothing.
  vx += (axes.x * GAME.lateralSpeed * handling - vx) * Math.min(1, dt * 6);
  vy += (axes.y * GAME.verticalSpeed * handling - vy) * Math.min(1, dt * 6);
  px = Math.max(-GAME.lateralRange, Math.min(GAME.lateralRange, px + vx * dt));
  py = Math.max(GAME.verticalMin, Math.min(GAME.verticalMax, py + vy * dt));
  if (px <= -GAME.lateralRange || px >= GAME.lateralRange) vx = 0;
  if (py <= GAME.verticalMin || py >= GAME.verticalMax) vy = 0;

  planeGroup.position.set(px, py, 0);
  planeGroup.rotation.z = THREE.MathUtils.lerp(planeGroup.rotation.z, -vx * 0.028, 0.2);
  planeGroup.rotation.x = THREE.MathUtils.lerp(planeGroup.rotation.x, -vy * 0.02, 0.2);
  planeGroup.rotation.y = THREE.MathUtils.lerp(planeGroup.rotation.y, -vx * 0.012, 0.2);
  for (const p of propParts) p.rotation.z += dt * (18 + speed * 0.4);
  if (flameMesh) {
    flameMesh.visible = turboActive;
    if (turboActive) flameMesh.scale.set(1, 1, 0.8 + Math.random() * 0.5);
  }

  // Power-up timers.
  magnetT = Math.max(0, magnetT - dt);
  shieldT = Math.max(0, shieldT - dt);
  turboT = Math.max(0, turboT - dt);
  invulnT = Math.max(0, invulnT - dt);
  planeGroup.visible = invulnT <= 0 || Math.floor(now / 120) % 2 === 0;

  // Smoke when hurt or fuel critical.
  smokeT -= dt;
  if ((health < GAME.maxHealth || fuel < 20) && smokeT <= 0) {
    smokeT = 0.12;
    world.burst(px, py - 0.4, 2.5, 0x888888, 2, 2);
  }

  // World + collisions.
  const events = world.update(dt, speed, distance, px, py, 1.1, magnetT > 0);
  for (const ev of events) {
    const o = ev.obj;
    if (ev.type === 'coin') {
      runCoins++;
      score += GAME.coinScore;
      audio.coin();
      world.burst(o.x, o.y, o.z, 0xffc93e, 10, 5);
    } else if (ev.type === 'crystal') {
      runCoins += 5;
      score += GAME.crystalScore;
      audio.crystal();
      world.burst(o.x, o.y, o.z, 0x37e6c8, 14, 6);
    } else if (ev.type === 'ring') {
      runRings++;
      score += GAME.ringScore;
      audio.ring();
      world.burst(o.x, o.y, o.z, 0xffd23e, 16, 7);
      ui.toast(`Cincin! +${GAME.ringScore}`);
    } else if (ev.type === 'fuel') {
      fuel = Math.min(GAME.maxFuel, fuel + GAME.fuelPickup);
      audio.fuel();
      ui.toast('Bahan bakar +34');
    } else if (ev.type === 'magnet') {
      magnetT = 9;
      audio.power();
      ui.toast('Magnet koin 9 detik!');
    } else if (ev.type === 'shield') {
      shieldT = 12;
      audio.power();
      ui.toast('Perisai 12 detik!');
    } else if (ev.type === 'turbo') {
      turbo = 100;
      audio.power();
      ui.toast('Turbo penuh!');
    } else if (ev.type === 'hit') {
      if (invulnT > 0) continue;
      if (shieldT > 0) {
        shieldT = 0;
        invulnT = 1.5;
        audio.hit();
        world.burst(px, py, 0, 0x37b268, 18, 8);
        ui.toast('Perisai menahan tabrakan!');
        continue;
      }
      health--;
      cleanTime = 0;
      invulnT = 1.5;
      shakeT = 0.5;
      audio.hit();
      world.burst(px, py, 0, 0xff6a3e, 22, 9);
      if (health <= 0) {
        crashT = 1.0;
        timeScale = 0.25;
        audio.crash();
        world.burst(px, py, 0, 0xff9a2e, 60, 16);
        world.burst(px, py, 0, 0x555555, 30, 10);
        planeGroup.visible = false;
      }
    }
  }

  // Fuel empty = forced descent, then crash.
  if (fuel <= 0 && health > 0) {
    py = Math.max(GAME.verticalMin, py - 14 * dt);
    if (py <= GAME.verticalMin + 0.1) {
      health = 0;
      crashT = 1.0;
      timeScale = 0.25;
      audio.crash();
      world.burst(px, py, 0, 0xff9a2e, 60, 16);
      planeGroup.visible = false;
    }
  }

  // 'end' screenshot: force a crash so the frame shows the real game-over screen.
  if (shotMode === 'shot' && params.shot === 'end' && simTime >= 18 && health > 0) {
    health = 0;
    crashT = 1.0;
    timeScale = 0.25;
    audio.crash();
    world.burst(px, py, 0, 0xff9a2e, 60, 16);
    planeGroup.visible = false;
  }

  // Camera: chase behind, banking with the plane, shake on hit.
  const targetCamX = px * 0.55;
  const targetCamY = py + 2.6;
  camX += (targetCamX - camX) * Math.min(1, dt * 4);
  camY += (targetCamY - camY) * Math.min(1, dt * 4);
  let shX = 0; let shY = 0;
  if (shakeT > 0) {
    shakeT -= dt;
    shX = (Math.random() - 0.5) * 0.7;
    shY = (Math.random() - 0.5) * 0.7;
  }
  camera.position.set(camX + shX, camY + shY, 10.5);
  camera.lookAt(px * 0.8, py + 0.4, -12);
  camera.rotation.z += -vx * 0.004;
  const targetFov = turboActive ? 72 : 62;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();

  // Audio follows speed.
  audio.engine(Math.min(1, speed / GAME.maxSpeed), turboActive);

  // HUD.
  ui.updateHUD({
    score, coins: runCoins, distance, speed,
    fuel, health, envName: world.envName(), turbo,
  });

  // Crash slow-mo then game over.
  if (health <= 0) {
    crashT -= dt / Math.max(timeScale, 0.001);
    if (crashT <= 0) {
      timeScale = 1;
      endRun(true);
    }
  }

  // Shot / test freeze + verdicts.
  if (shotMode === 'shot') {
    const done =
      (params.shot === 'end' && state === 'over') ||
      (params.shot === 'rings' && runRings >= 1) ||
      simTime >= shotTarget;
    if (done && !shotDone) {
      shotDone = true;
      window.__shotDone = true;
    }
  }
  if (shotMode === 'test') {
    if ((health <= 0 || simTime >= shotTarget) && !testDone) {
      testDone = true;
      const result = {
        ok: runCoins >= 1 && distance >= 400 && simTime >= 10,
        seconds: +simTime.toFixed(1),
        distance: Math.floor(distance),
        score: Math.floor(score),
        coins: runCoins,
        rings: runRings,
        survived: health > 0,
        crashed: health <= 0,
      };
      writeTestOut(result);
      // Freeze the loop's advance (keep rendering the last frame).
      shotMode = 'frozen';
    }
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
