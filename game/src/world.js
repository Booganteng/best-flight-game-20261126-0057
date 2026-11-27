// The endless sky: environments, scrolling chunks, obstacles, rings,
// coins, fuel, power-ups, clouds, ground props and particles.
// The plane stays near z=0; the world scrolls toward +z.

import * as THREE from 'three';
import { ENVIRONMENTS, GAME } from './config.js';
import { makeRng, range, pick, chance } from './random.js';

const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.8, ...opts }));
  }
  return matCache.get(key);
}
function basic(color) {
  const key = `b${color}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color }));
  return matCache.get(key);
}

function cloudPuff(color) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(2.0 + Math.random() * 2.6, 8, 6), mat(color, { transparent: true, opacity: 0.92, emissive: 0xffffff, emissiveIntensity: 0.45 }));
    s.position.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 2);
    s.scale.y = 0.55;
    g.add(s);
  }
  return g;
}

function makeBalloon(rng) {
  const g = new THREE.Group();
  const colors = [0xe84a5f, 0x2e7fe8, 0xffd23e, 0x37b268, 0x9b59d0];
  const c = pick(rng, colors);
  const env = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), mat(c));
  env.scale.y = 1.15;
  g.add(env);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), mat(0x7a5230));
  basket.position.y = -2.9;
  g.add(basket);
  return { mesh: g, r: 2.4 };
}

function makeTower(rng) {
  const g = new THREE.Group();
  const h = 9 + rng() * 8;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 8), mat(0x8a8f98));
  pole.position.y = h / 2;
  g.add(pole);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mat(0xd23e2e));
  dish.position.y = h + 0.6;
  dish.scale.y = 0.5;
  g.add(dish);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), basic(0xff2222));
  light.position.y = h + 1.4;
  g.add(light);
  return { mesh: g, r: 1.6, tall: true, baseY: 0 };
}

function makeBuilding(rng) {
  const g = new THREE.Group();
  const w = 4 + rng() * 4;
  const h = 8 + rng() * 14;
  const d = 4 + rng() * 4;
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(pick(rng, [0x5a6b7d, 0x7d8a99, 0x4a5a6a, 0x8a7a5a])));
  b.position.y = h / 2;
  g.add(b);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.2, d * 0.4), mat(0xd23e2e));
  top.position.y = h + 0.6;
  g.add(top);
  // Lit windows: tiny emissive boxes on the face.
  const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.7, 0.05), basic(0xffe9a0));
  win.position.set(0, h / 2, d / 2 + 0.03);
  g.add(win);
  return { mesh: g, r: Math.max(w, d) * 0.62, tall: true, baseY: 0 };
}

function makeMountain(rng) {
  const g = new THREE.Group();
  const h = 14 + rng() * 16;
  const m = new THREE.Mesh(new THREE.ConeGeometry(7 + rng() * 5, h, 7), mat(pick(rng, [0x6b7a8a, 0x7d6a55, 0x8a8f98])));
  m.position.y = h / 2 - 6;
  g.add(m);
  const snow = new THREE.Mesh(new THREE.ConeGeometry(2.6, h * 0.28, 7), mat(0xffffff));
  snow.position.y = h - 6 - h * 0.14 + h * 0.14;
  snow.position.y = h * 0.86 - 6;
  g.add(snow);
  return { mesh: g, r: 6.5, tall: true, baseY: -6 };
}

function makeHeli(rng) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mat(pick(rng, [0xd23e2e, 0x2e7fe8, 0xffd23e])));
  body.scale.set(1, 0.8, 1.8);
  g.add(body);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.08, 0.4), mat(0x222222));
  rotor.position.y = 1.1;
  rotor.name = 'rotor';
  g.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2.6), mat(0x333333));
  tail.position.set(0, 0.2, 2.2);
  g.add(tail);
  return { mesh: g, r: 1.8, spin: rotor };
}

function makePlaneTraffic(rng) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.5, 10), mat(0xe8e8ec));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.15, 1.6), mat(0x2e7fe8));
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.9), mat(0x2e7fe8));
  tail.position.z = 2.1;
  g.add(tail);
  return { mesh: g, r: 2.2 };
}

function makeDebris(rng) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.8 + rng(), 0.5 + rng() * 0.6, 0.8 + rng()), mat(pick(rng, [0x6a6a72, 0x8a6a4a, 0x4a5a6a])));
    s.position.set((rng() - 0.5) * 3, (rng() - 0.5) * 3, (rng() - 0.5) * 3);
    s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    g.add(s);
  }
  return { mesh: g, r: 2.2, tumble: true };
}

function makeStormCell(rng) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(2.2 + rng() * 1.6, 8, 6), mat(0x3a3f4d, { transparent: true, opacity: 0.95 }));
    s.position.set((rng() - 0.5) * 6, (rng() - 0.5) * 2.5, (rng() - 0.5) * 3);
    s.scale.y = 0.6;
    g.add(s);
  }
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5, 0.18), basic(0xfff2a0));
  bolt.position.set(1.5, -4.5, 0);
  bolt.rotation.z = 0.25;
  g.add(bolt);
  return { mesh: g, r: 3.4 };
}

function makeRing() {
  const g = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.35, 10, 28), mat(0xffd23e, { emissive: 0xaa7700, emissiveIntensity: 0.7 }));
  g.add(torus);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.12, 8, 28), basic(0xfff6c0));
  g.add(inner);
  return g;
}

function makeCoin() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 18), mat(0xffc93e, { metalness: 0.8, roughness: 0.25, emissive: 0x664400, emissiveIntensity: 0.4 }));
  c.rotation.x = Math.PI / 2;
  g.add(c);
  return g;
}

function makeCrystal() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), mat(0x37e6c8, { metalness: 0.4, roughness: 0.15, emissive: 0x0a5a4a, emissiveIntensity: 0.8, transparent: true, opacity: 0.95 }));
  g.add(c);
  return g;
}

function makeFuel() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.8), mat(0xd23e2e));
  g.add(can);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), mat(0x222222));
  cap.position.y = 1.0;
  g.add(cap);
  const label = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.05), basic(0xffffff));
  label.position.z = 0.43;
  g.add(label);
  return g;
}

function makePower(kind) {
  const g = new THREE.Group();
  const colors = { magnet: 0xe84a5f, shield: 0x37b268, turbo: 0xff9a2e };
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.28, 10, 24), mat(colors[kind] || 0xffffff, { emissive: colors[kind] || 0xffffff, emissiveIntensity: 0.6 }));
  g.add(ring);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), basic(colors[kind] || 0xffffff));
  g.add(core);
  return g;
}

export function createWorld(scene) {
  let rng = makeRng(1337);
  const objects = []; // {mesh, kind, x, y, z, r, passed, spin, tumble}
  const clouds = [];
  const particles = [];
  let envIndex = 0;
  let cloudBudget = 26;
  let nextSpawnZ = -60;
  let nextRingAt = 200;
  let nextCoinAt = 120;
  let spawnDistance = 0;
  let stormTimer = 0;

  // Lights.
  const sun = new THREE.DirectionalLight(0xfff2c0, 1.6);
  sun.position.set(40, 60, -80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 260;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xbfd9e8, 0.9);
  scene.add(ambient);

  // Ground: one huge disc far below; props scroll with the chunks.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 32), mat(0x2fa36b));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -14;
  scene.add(ground);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 32), mat(0x1e6f9e));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -14.2;
  sea.visible = false;
  scene.add(sea);

  scene.background = new THREE.Color(ENVIRONMENTS[0].sky);
  scene.fog = new THREE.Fog(ENVIRONMENTS[0].fog, 60, 420);

  function addCloud(x, y, z, color) {
    const c = cloudPuff(color);
    c.position.set(x, y, z);
    c.userData.drift = 0.4 + Math.random() * 0.8;
    scene.add(c);
    clouds.push(c);
    return c;
  }

  function setEnvironment(i, quality) {
    if (!ENVIRONMENTS[i]) return; // defensive: never crash on a bad index
    envIndex = i;
    const e = ENVIRONMENTS[i];
    scene.background.set(e.sky);
    scene.fog.color.set(e.fog);
    scene.fog.far = quality.far;
    sun.color.set(e.sun);
    sun.position.set(e.sunPos[0], e.sunPos[1], e.sunPos[2]);
    ambient.color.set(e.ambient);
    ground.material = mat(e.ground);
    sea.visible = e.groundKind === 'ocean';
    ground.visible = e.groundKind !== 'ocean';
    clouds.forEach((c) => {
      c.children.forEach((s) => { s.material = mat(e.cloud, { transparent: true, opacity: 0.92, emissive: 0xffffff, emissiveIntensity: 0.45 }); });
    });
  }

  function spawnGroundProp(z, env) {
    const r = rng();
    const x = (rng() - 0.5) * 130;
    let prop = null;
    if (env.groundKind === 'islands') {
      prop = new THREE.Mesh(new THREE.ConeGeometry(6 + rng() * 8, 4 + rng() * 5, 7), mat(0x2a7a4a));
      prop.position.set(x, -15, z);
      prop.rotation.x = Math.PI;
    } else if (env.groundKind === 'city') {
      const h = 6 + rng() * 16;
      prop = new THREE.Mesh(new THREE.BoxGeometry(5 + rng() * 5, h, 5 + rng() * 5), mat(0x5a6b7d));
      prop.position.set(x, -14 + h / 2, z);
    } else if (env.groundKind === 'peaks') {
      const h = 12 + rng() * 18;
      prop = new THREE.Mesh(new THREE.ConeGeometry(8 + rng() * 6, h, 6), mat(0x8a8f98));
      prop.position.set(x, -14 + h / 2 - 4, z);
    } else if (env.groundKind === 'dunes') {
      prop = new THREE.Mesh(new THREE.SphereGeometry(9 + rng() * 8, 10, 6), mat(0xd9a45b));
      prop.scale.y = 0.25;
      prop.position.set(x, -15, z);
    }
    if (prop && r < 0.55) {
      prop.userData.prop = true;
      scene.add(prop);
      objects.push({ mesh: prop, kind: 'prop', x: prop.position.x, y: prop.position.y, z, r: 1, passed: false });
    }
  }

  function spawnRow(z, distance, difficulty) {
    const env = ENVIRONMENTS[envIndex];
    spawnGroundProp(z, env);
    const roll = rng();
    if (roll < 0.42) {
      // Obstacle cluster: 1-3 obstacles, always leaving a flyable gap.
      const lanes = [-11, -5.5, 0, 5.5, 11];
      const gapLane = Math.floor(rng() * lanes.length);
      const count = 1 + Math.floor(rng() * (difficulty > 0.5 ? 3 : 2));
      const used = new Set([gapLane]);
      for (let i = 0; i < count; i++) {
        let lane = Math.floor(rng() * lanes.length);
        if (used.has(lane)) continue;
        used.add(lane);
        const y = range(rng, 5, 26);
        const kind = pick(rng, env.groundKind === 'city'
          ? ['building', 'tower', 'heli', 'traffic', 'balloon']
          : env.storm
            ? ['storm', 'debris', 'heli', 'balloon', 'traffic']
            : ['balloon', 'tower', 'mountain', 'heli', 'traffic', 'debris']);
        let built = null;
        if (kind === 'balloon') built = makeBalloon(rng);
        else if (kind === 'tower') built = makeTower(rng);
        else if (kind === 'building') built = makeBuilding(rng);
        else if (kind === 'mountain') built = makeMountain(rng);
        else if (kind === 'heli') built = makeHeli(rng);
        else if (kind === 'traffic') built = makePlaneTraffic(rng);
        else if (kind === 'debris') built = makeDebris(rng);
        else built = makeStormCell(rng);
        built.mesh.position.set(lanes[lane], built.tall ? (built.baseY || 0) + 0 : y, z + range(rng, -6, 6));
        if (built.tall) built.mesh.position.y = built.baseY || 0;
        scene.add(built.mesh);
        objects.push({
          mesh: built.mesh, kind: 'obstacle', x: built.mesh.position.x,
          y: built.tall ? 12 : y, z: built.mesh.position.z, r: built.r,
          passed: false, spin: built.spin || null, tumble: built.tumble || false,
        });
      }
    } else if (roll < 0.66) {
      // Coin line across a few lanes.
      const y = range(rng, 6, 24);
      const lane = pick(rng, [-8, -4, 0, 4, 8]);
      for (let i = 0; i < 7; i++) {
        const m = makeCoin();
        m.position.set(lane, y, z - i * 3.5);
        scene.add(m);
        objects.push({ mesh: m, kind: 'coin', x: lane, y, z: z - i * 3.5, r: 1.2, passed: false });
      }
    } else if (roll < 0.78) {
      // Coin arc over an obstacle-free lane.
      const lane = pick(rng, [-8, -4, 0, 4, 8]);
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const m = makeCoin();
        m.position.set(lane, 6 + Math.sin(t * Math.PI) * 12, z - i * 3.5);
        scene.add(m);
        objects.push({ mesh: m, kind: 'coin', x: lane, y: m.position.y, z: z - i * 3.5, r: 1.2, passed: false });
      }
    } else if (roll < 0.84) {
      // Crystal (big points).
      const m = makeCrystal();
      const x = range(rng, -10, 10);
      const y = range(rng, 8, 22);
      m.position.set(x, y, z);
      scene.add(m);
      objects.push({ mesh: m, kind: 'crystal', x, y, z, r: 1.4, passed: false });
    } else if (roll < 0.92) {
      // Fuel can.
      const m = makeFuel();
      const x = range(rng, -10, 10);
      const y = range(rng, 6, 22);
      m.position.set(x, y, z);
      scene.add(m);
      objects.push({ mesh: m, kind: 'fuel', x, y, z, r: 1.6, passed: false });
    } else {
      // Power-up.
      const kind = pick(rng, ['magnet', 'shield', 'turbo']);
      const m = makePower(kind);
      const x = range(rng, -10, 10);
      const y = range(rng, 8, 22);
      m.position.set(x, y, z);
      scene.add(m);
      objects.push({ mesh: m, kind, x, y, z, r: 1.8, passed: false });
    }
  }

  function spawnRing(z) {
    const m = makeRing();
    const x = range(rng, -11, 11);
    const y = range(rng, 7, 24);
    m.position.set(x, y, z);
    scene.add(m);
    objects.push({ mesh: m, kind: 'ring', x, y, z, r: 3.4, passed: false });
  }

  // Round soft sprite so particle bursts read as sparks, not squares.
  const dotTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();

  function burst(x, y, z, color, n, speed) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel.push(new THREE.Vector3((Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.5, transparent: true, opacity: 1, map: dotTex, alphaTest: 0.02, depthWrite: false }));
    pts.userData.vel = vel;
    pts.userData.life = 0.7;
    scene.add(pts);
    particles.push(pts);
  }

  function reset(seed) {
    for (const o of objects) scene.remove(o.mesh);
    objects.length = 0;
    for (const p of particles) scene.remove(p);
    particles.length = 0;
    for (const c of clouds) scene.remove(c);
    clouds.length = 0;
    rng = makeRng(seed);
    nextSpawnZ = -60;
    nextRingAt = 200;
    nextCoinAt = 120;
    spawnDistance = 0;
    stormTimer = 0;
    // Seed the sky with clouds (up to the ultra budget; budget hides extras).
    for (let i = 0; i < 42; i++) {
      const c = addCloud(range(rng, -70, 70), range(rng, -4, 42), range(rng, -260, 40), ENVIRONMENTS[0].cloud);
      c.visible = i < cloudBudget;
    }
  }

  return {
    objects,
    setEnvironment,
    setCloudBudget(n) {
      cloudBudget = n;
      clouds.forEach((c, i) => { c.visible = i < cloudBudget; });
    },
    reset,
    burst,
    // Advance the world; returns collision/pickup events for the plane at (px, py).
    update(dt, speed, distance, px, py, planeR, magnetOn) {
      const events = [];
      const difficulty = Math.min(1, distance / 6000);
      const gap = Math.max(GAME.obstacleGapMin, GAME.obstacleGapStart - difficulty * 22);
      spawnDistance = distance;
      // Environment changes every ~700 m.
      const wantEnv = Math.floor(distance / 700) % ENVIRONMENTS.length;
      if (wantEnv !== envIndex) {
        // setEnvironment is applied by main via envIndex change; keep it here too.
        setEnvironment(wantEnv, { far: scene.fog.far });
      }
      // Spawn ahead.
      while (nextSpawnZ > -320) {
        spawnRow(nextSpawnZ, distance, difficulty);
        nextSpawnZ -= gap + rng() * 14;
      }
      if (distance >= nextRingAt) {
        spawnRing(-300);
        nextRingAt += GAME.ringEveryM + rng() * 120;
      }
      // Move everything toward the plane.
      const dz = speed * dt;
      for (let i = objects.length - 1; i >= 0; i--) {
        const o = objects[i];
        o.z += dz;
        o.mesh.position.z = o.z;
        if (o.spin) o.spin.rotation.y += dt * 9;
        if (o.tumble) {
          o.mesh.rotation.x += dt * 1.4;
          o.mesh.rotation.y += dt * 1.1;
        }
        if (o.kind === 'coin' || o.kind === 'crystal' || o.kind === 'fuel') {
          o.mesh.rotation.y += dt * 3;
          o.mesh.position.y = o.y + Math.sin((o.z + distance) * 0.08) * 0.4;
        }
        if (o.kind === 'ring') o.mesh.rotation.z += dt * 0.5;
        if (o.kind === 'magnet' || o.kind === 'shield' || o.kind === 'turbo') {
          o.mesh.rotation.y += dt * 2;
        }
        // Magnet pulls coins toward the plane.
        if (magnetOn && (o.kind === 'coin' || o.kind === 'crystal')) {
          const dx = px - o.x;
          const dy = py - o.y;
          const d = Math.hypot(dx, dy);
          if (d < 26 && d > 0.5) {
            o.x += (dx / d) * 26 * dt;
            o.y += (dy / d) * 26 * dt;
            o.mesh.position.x = o.x;
            o.mesh.position.y = o.y;
          }
        }
        // Passed the plane?
        if (!o.passed && o.z > 2) {
          o.passed = true;
          if (o.kind === 'obstacle') {
            const dx = px - o.x;
            const dy = py - o.y;
            const rr = o.r + planeR;
            if (dx * dx + dy * dy < rr * rr) events.push({ type: 'hit', obj: o });
          } else if (o.kind === 'ring') {
            const dx = px - o.x;
            const dy = py - o.y;
            if (Math.hypot(dx, dy) < 2.7) events.push({ type: 'ring', obj: o });
          } else if (o.kind === 'coin' || o.kind === 'crystal' || o.kind === 'fuel' || o.kind === 'magnet' || o.kind === 'shield' || o.kind === 'turbo') {
            const dx = px - o.x;
            const dy = py - o.y;
            if (Math.hypot(dx, dy) < 3.0) events.push({ type: o.kind, obj: o });
          }
        }
        // Recycle behind.
        if (o.z > 30) {
          scene.remove(o.mesh);
          objects.splice(i, 1);
        }
      }
      // Clouds drift and recycle.
      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i];
        c.position.z += dz * 0.55 + c.userData.drift * dt;
        c.position.x += Math.sin(distance * 0.01 + i) * dt * 0.4;
        if (c.position.z > 50) {
          c.position.z = -320;
          c.position.x = range(rng, -70, 70);
          c.position.y = range(rng, -4, 42);
        }
      }
      // Storm lightning: random flicker of the sun in storm skies.
      if (ENVIRONMENTS[envIndex].storm) {
        stormTimer -= dt;
        if (stormTimer <= 0) {
          stormTimer = 2 + rng() * 5;
          sun.intensity = 2.6;
          setTimeout(() => { sun.intensity = 1.6; }, 90);
        }
      }
      // Particles.
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.life -= dt;
        if (p.userData.life <= 0) {
          scene.remove(p);
          p.geometry.dispose();
          particles.splice(i, 1);
          continue;
        }
        const pos = p.geometry.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          const v = p.userData.vel[j];
          pos.array[j * 3] += v.x * dt;
          pos.array[j * 3 + 1] += v.y * dt;
          pos.array[j * 3 + 2] += v.z * dt + dz * 0.5;
        }
        pos.needsUpdate = true;
        p.material.opacity = p.userData.life / 0.7;
      }
      return events;
    },
    envName() { return ENVIRONMENTS[envIndex].name; },
    envIndex() { return envIndex; },
  };
}
