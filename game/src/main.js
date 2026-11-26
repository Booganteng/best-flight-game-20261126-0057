// Sky Harbour — Island Run: the game loop, the screens, and the wiring between
// input, aircraft, missions and the renderer. One frame: read the pilot,
// step the world, play the sounds, draw.
import { GAME, VIEW, STEP, MISSIONS, PLANE } from './config.js';
import { buildWorld } from './terrain.js';
import { createAircraft, stepAircraft } from './aircraft.js';
import { createMission, currentTarget, stepMission, onLanding, missionProgress } from './missions.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer3D } from './render3d.js';
import { stageShot } from './shots.js';
import { clamp } from './random.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 7);
const shotName = params.get('shot') || '';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

const world = buildWorld(seed);
const input = createInput(canvas);
input.attach();
const audio = createAudio();
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });

const game = {
  world,
  plane: createAircraft(world),
  mission: createMission('rings', world),
  screen: 'title', // title | play | paused | complete | crashed | failed
  time: 0,
  flash: null,
  crashReason: '',
  summaryLine: '',
  hoverCard: -1,
  cockpit: false,
  missionCards: MISSIONS.map((m) => ({ key: m.key, name: m.name, tag: m.tag, timeLimit: `${Math.floor(m.timeLimit / 60)} min` })),
  best: 0,
};

// The 3D renderer owns the canvas + the HUD overlay; title cards call back here.
const renderer3D = createRenderer3D(canvas, world, { onStartMission: (id) => startMission(id) });

function resize() {
  renderer3D.resize();
}
window.addEventListener('resize', resize);

function setFlash(text, sub, color) {
  game.flash = { text, sub: sub || '', color: color || '#ffffff', at: game.time };
  statusEl.textContent = `${text} ${sub || ''}`;
}

function startMission(id) {
  game.plane = createAircraft(world);
  game.mission = createMission(id, world);
  game.screen = 'play';
  game.time = 0;
  game.flash = null;
  game.crashReason = '';
  game.summaryLine = '';
  audio.click();
  setFlash(game.mission.name, 'Throttle up — hold SHIFT, pull up gently to lift off', '#cfeeff');
}

function endSortie(reason, screen) {
  game.screen = screen;
  game.crashReason = reason;
  game.best = Math.max(game.best, game.mission.score);
}

game.step = function step(dt, pilotInput, silent) {
  const prev = { x: game.plane.x, y: game.plane.y, z: game.plane.z };
  const result = stepAircraft(game.plane, pilotInput, world, dt);
  const plane = game.plane;

  for (const event of result.events) {
    if (event === 'takeoff') {
      setFlash('AIRBORNE', 'Gear up — fly the rings, mind your fuel', '#7dff9a');
      audio.land();
    } else if (event === 'landed' || event === 'landed-smooth') {
      const smooth = event === 'landed-smooth';
      const landingEvents = onLanding(game.mission, plane, result.runway, smooth);
      plane.fuel = PLANE.fuelCapacity;
      audio.land();
      if (landingEvents.includes('complete')) {
        game.summaryLine = `Score ${game.mission.score} — rings, landing and time bonus.`;
        game.screen = 'complete';
        setFlash('MISSION COMPLETE', '', '#7dff9a');
      } else if (landingEvents.includes('leg-done')) {
        setFlash('LEG COMPLETE', `Next: ${currentTarget(game.mission, world)?.label || ''} — fuel topped up`, '#7dff9a');
      } else if (landingEvents.includes('wrong-runway')) {
        setFlash('WRONG RUNWAY', 'That strip is not your destination — take off again', '#ffcf5e');
      } else {
        setFlash(smooth ? 'SMOOTH LANDING' : 'LANDED', smooth ? `+${PLANE.landingScore + PLANE.smoothBonus} — textbook touchdown` : 'Refuelled — take off again', '#7dff9a');
      }
    } else if (event === 'rough') {
      setFlash('ROUGH LANDING', 'Off the runway — the airframe took damage', '#ffcf5e');
      audio.crash();
    } else if (event === 'ditched') {
      endSortie('Ditched in the sea — the sortie is over.', 'failed');
      audio.crash();
    } else if (event === 'crashed') {
      endSortie('The aircraft hit the ground too hard.', 'crashed');
      audio.crash();
    } else if (event === 'turnback') {
      setFlash('EDGE OF THE CHART', 'Turning back toward the islands', '#ffcf5e');
    }
  }

  // Mission progress: rings, stars, and the clock.
  for (const event of stepMission(game.mission, plane, world, dt, prev)) {
    if (event === 'ring') {
      setFlash(`RING ${game.mission.ringsPassed}/${game.mission.rings.length}`, `+${PLANE.ringScore} — fuel +${PLANE.fuelRingBonus}`, '#ffc93c');
      audio.ring();
    } else if (event === 'ring-clip') {
      setFlash('RING CLIPPED', 'You brushed the rim — damage taken', '#ff6b5e');
      audio.crash();
    } else if (event === 'star') {
      setFlash(`STAR ${game.mission.starsCollected}/${game.mission.target}`, `+${PLANE.starScore}`, '#ffc93c');
      audio.ring();
    } else if (event === 'complete') {
      game.summaryLine = `Score ${game.mission.score} — all goals flown, time bonus included.`;
      game.screen = 'complete';
      setFlash('MISSION COMPLETE', '', '#7dff9a');
    } else if (event === 'time-up') {
      endSortie('Out of time — the sortie is over.', 'failed');
    }
  }

  // Fuel out: the engine quits and the pilot glides.
  if (plane.fuel <= 0 && plane.flying && !plane.onGround && !silent) {
    if (!game.fuelWarned) {
      game.fuelWarned = true;
      setFlash('FUEL EMPTY', 'Engine out — glide to a runway', '#ff6b5e');
    }
  } else if (plane.fuel > 5) {
    game.fuelWarned = false;
  }

  // Damage writes the aircraft off.
  if (plane.damage >= PLANE.maxDamage && game.screen === 'play') {
    endSortie('Damage reached 100% — the airframe gave up.', 'crashed');
    audio.crash();
  }
  audio.engine(plane.throttle, plane.flying);
};

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const W = window.innerWidth;
  const H = window.innerHeight;

  // Title screen keys and clicks (cards are DOM buttons now; canvas clicks do nothing).
  if (game.screen === 'title') {
    for (const card of MISSIONS) {
      if (input.consume(`Digit${card.key}`) || input.consume(`Numpad${card.key}`)) {
        startMission(card.id);
      }
    }
    input.mouse.clicked = false;
  }

  if (input.consume('KeyC')) {
    game.cockpit = !game.cockpit;
    renderer3D.setCockpit(game.cockpit);
  }

  if (input.consume('KeyP') && (game.screen === 'play' || game.screen === 'paused')) {
    game.screen = game.screen === 'play' ? 'paused' : 'play';
  }
  if (input.consume('KeyR') && game.screen !== 'title') {
    startMission(game.mission.id);
  }
  if (input.consume('Escape') && game.screen !== 'title') {
    game.screen = 'title';
    game.plane = createAircraft(world);
    game.mission = createMission('rings', world);
  }

  if (game.screen === 'play') {
    acc += dt;
    while (acc >= STEP) {
      game.time += STEP;
      game.step(STEP, input.control(), false);
      acc -= STEP;
      if (game.screen !== 'play') {
        acc = 0;
        break;
      }
    }
  }

  // What the HUD shows about the mission right now.
  const target = currentTarget(game.mission, world);
  game.mission.objectiveLabel = target ? target.label : 'Fly free';
  game.mission.progressLabel = missionProgress(game.mission);

  renderer3D.drawFrame(game, W, H, game.time);
  document.title = `${GAME.title} — ${game.mission.name} · ${game.mission.score} pts`;
}

// A deterministic screenshot scene: run the game forward with the autopilot,
// then paint one frame. No animation loop — the shot is the frame.
if (shotName) {
  game.mission = createMission('rings', world);
  stageShot(shotName, game);
  game.mission.objectiveLabel = currentTarget(game.mission, world)?.label || 'Fly free';
  game.mission.progressLabel = missionProgress(game.mission);
  renderer3D.drawFrame(game, window.innerWidth, window.innerHeight, game.time);
  document.title = `shot:${shotName}`;
} else {
  requestAnimationFrame(frame);
}
