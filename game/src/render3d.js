// Sky Harbour — Island Run: the 3D renderer (Three.js, vendored locally).
// Visual theme "Golden Hour" (theme-factory): warm sunset light, blue sky
// above, vivid green fields, ocean-blue sea, one coherent palette across
// sky, sea, land, aircraft livery and HUD. The look follows the five
// references tuan muda sent (MSFS-style): a white single-engine prop tourer
// with a blue cheatline and red tail, flying over a winding river, green
// fields, a small red-roof town, dramatic layered clouds, and above a sea
// of clouds; the cockpit (key C) is a glass cockpit with glowing screens.
// Everything is built from the world state each frame; no images, no
// network, no pasted photos — all real-time 3D, all screenshots from real
// gameplay. Shapes are smooth and organic (extruded rounded wings, gable
// roofs, faceted mounds) — never raw unshaded blocks.
import * as THREE from '../vendor/three/three.module.min.js';
import { VIEW, WORLD, MISSIONS } from './config.js';
import { clamp, lerp, headingDeg, compassPoint, formatTime, mulberry32, range } from './random.js';
import { SUN } from './terrain.js';

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Ref 3 palette (final push, tuan muda: match the PHOTO's colours, not a
// deep-orange sunset): pale soft blue sky, a horizon that is only faintly
// warm gold toward the sun and pale cool blue away from it, pale blue-grey
// haze the distant sea melts into, warm-white cloud tops, soft blue-grey
// cloud valleys, deep calm blue sea. Golden Hour stays warm, but soft and
// pale blue-white — never saturated orange.
const DAY = {
  skyTop: 0x1e6fc4,
  skyMid: 0x5ea0d8,
  skyHorizon: 0xe9c795,
  skyHorizonCool: 0xdce8ee,
  skyBelow: 0x93a7ba,
  fog: 0xd3dde8,
  sea: 0x20598a,
  sand: 0xe8d29a,
  grassA: 0x55853f,
  grassB: 0x74a854,
  grassDark: 0x46743a,
  rock: 0x6b6f66,
  forest: 0x2e5230,
  wallA: 0xf2e8d5,
  wallB: 0xe8dcc0,
  roofA: 0xc23b30,
  roofB: 0xa93226,
  roofC: 0xd84a3c,
  trunk: 0x6b4a2f,
  palm: 0x2e6b34,
  pine: 0x2a5230,
  runway: 0x54595f,
  runwayEdge: 0xe8e8e8,
  river: 0x3f7ea8,
  ringGold: 0xffc93c,
  ringGreen: 0x7dff9a,
  starGold: 0xffe27a,
  planeWhite: 0xf4f6f7,
  planeBlue: 0x1e5aa8,
  planeRed: 0xc23b30,
  planeBlack: 0x1a1a1a,
  glass: 0x3d7ea6,
};

function hexRGB(hex) {
  return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}

function lerpHex(a, b, t) {
  const ca = hexRGB(a);
  const cb = hexRGB(b);
  return [lerp(ca.r, cb.r, t), lerp(ca.g, cb.g, t), lerp(ca.b, cb.b, t)];
}

// The river across the east side of Harbour island: a winding band the
// terrain flattens for and a blue ribbon sits in.
function riverZ(x) {
  return 55 * Math.sin((x - 270) * 0.028) + 18 * Math.sin((x - 270) * 0.011);
}
function nearRiver(x, z, margin) {
  return x > 255 && x < 425 && Math.abs(z - riverZ(x)) < margin;
}

// A low-poly island mound: radial rings, seeded height jitter, flat shading,
// vertex colours (sand rim, green facets, rock cap). The runway corridor is
// flattened exactly like terrain.js groundHeight so the strip sits level,
// and the river band is cut to a shallow channel on Harbour's east side.
function buildIslandGeometry(island, seed, world) {
  const NR = 7;
  const NS = 28;
  const positions = [];
  const colors = [];
  const indices = [];
  const rng = mulberry32(seed + Math.floor(island.x) + Math.floor(island.z) + 77);

  const colourAt = (t, h) => {
    if (t > 0.93) return lerpHex(DAY.sand, DAY.sand, 0);
    if (h > island.h * 0.78 && island.h > 70) return lerpHex(DAY.rock, DAY.rock, 0);
    const n = rng();
    const base = lerpHex(DAY.grassDark, DAY.grassB, n);
    if (n > 0.82) return lerpHex(base[0] * 255, DAY.forest, 0.5);
    return [base[0], base[1], base[2]];
  };

  const heightAt = (x, z, t) => {
    let h = island.h * smooth(1 - t);
    h += (rng() - 0.5) * island.h * 0.1 * Math.sin(Math.PI * t);
    if (island.runway) {
      const dx = x - island.x;
      const dz = z - island.z;
      const along = Math.abs(dx * Math.sin(island.runway.heading) + dz * Math.cos(island.runway.heading));
      const across = Math.abs(dx * Math.cos(island.runway.heading) - dz * Math.sin(island.runway.heading));
      if (along < island.runway.length / 2 + 320 && across < island.runway.width / 2 + 60) {
        h = Math.min(h, 6);
      }
    }
    if (island.name === 'Harbour' && nearRiver(x, z, 13)) {
      h = Math.min(h, 1.2);
    }
    if (t >= 1) h = 0;
    return h;
  };

  // Centre vertex.
  positions.push(island.x, island.h + (rng() - 0.5) * island.h * 0.03, island.z);
  colors.push(...lerpHex(DAY.grassA, DAY.grassB, rng()));
  for (let i = 1; i < NR; i += 1) {
    const t = i / (NR - 1);
    for (let j = 0; j < NS; j += 1) {
      const a = (j / NS) * Math.PI * 2;
      const r = t * island.r;
      const x = island.x + Math.cos(a) * r;
      const z = island.z + Math.sin(a) * r;
      const h = heightAt(x, z, t);
      positions.push(x, h, z);
      const c = colourAt(t, h);
      colors.push(c[0], c[1], c[2]);
    }
  }
  // Centre fan.
  for (let j = 0; j < NS; j += 1) {
    indices.push(0, 1 + ((j + 1) % NS), 1 + j);
  }
  // Quads between rings.
  for (let i = 1; i < NR - 1; i += 1) {
    for (let j = 0; j < NS; j += 1) {
      const a = 1 + (i - 1) * NS + j;
      const b = 1 + (i - 1) * NS + ((j + 1) % NS);
      const c = 1 + i * NS + j;
      const d = 1 + i * NS + ((j + 1) % NS);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// A tapered wing with a rounded tip, extruded with a small bevel so the edge
// reads smooth, never a raw box.
function wingGeometry(span, rootChord, tipChord) {
  const s = new THREE.Shape();
  s.moveTo(0, -rootChord / 2);
  s.lineTo(span * 0.88, -tipChord / 2);
  s.quadraticCurveTo(span, -tipChord * 0.35, span, 0);
  s.quadraticCurveTo(span, tipChord * 0.35, span * 0.88, tipChord / 2);
  s.lineTo(0, rootChord / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.26, bevelEnabled: true, bevelThickness: 0.13, bevelSize: 0.13, bevelSegments: 3, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.13, 0);
  return g;
}

export function createRenderer3D(canvas, world, hooks) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  // Warm haze: the sea (radius 5600) is fully fogged out before its edge,
  // so the horizon is haze, not a hard disc edge. The cloud deck grid
  // reaches ±3000 m, and at that range the fog has nearly swallowed it,
  // so the deck melts into the haze instead of ending in a straight line.
  scene.fog = new THREE.Fog(DAY.fog, 800, 3600);

  // Gradient sky dome: deep blue zenith, warm gold horizon toward the sun,
  // pale cool horizon away from it — the Golden Hour look from every angle.
  // The horizon band blends by azimuth so the sky is gold where the sun
  // hangs and cool blue on the far side, like ref 1.
  {
    const skyGeo = new THREE.SphereGeometry(9000, 24, 12);
    const pos = skyGeo.attributes.position;
    const cols = [];
    const top = hexRGB(DAY.skyTop);
    const mid = hexRGB(DAY.skyMid);
    const horWarm = hexRGB(DAY.skyHorizon);
    const horCool = hexRGB(DAY.skyHorizonCool);
    const below = hexRGB(DAY.skyBelow);
    const sunAz = Math.atan2(
      Math.sin(SUN.azimuth) * Math.cos(SUN.elevation),
      Math.cos(SUN.azimuth) * Math.cos(SUN.elevation),
    );
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) / 9000;
      const az = Math.atan2(pos.getX(i), pos.getZ(i));
      const warm = Math.pow(0.5 + 0.5 * Math.cos(az - sunAz), 1.4);
      const hor = [
        lerp(horCool.r, horWarm.r, warm),
        lerp(horCool.g, horWarm.g, warm),
        lerp(horCool.b, horWarm.b, warm),
      ];
      let c;
      if (y > 0.18) c = lerpHex(DAY.skyMid, DAY.skyTop, (y - 0.18) / 0.42);
      else if (y > 0.02) c = [lerp(hor[0], mid.r, (y - 0.02) / 0.16), lerp(hor[1], mid.g, (y - 0.02) / 0.16), lerp(hor[2], mid.b, (y - 0.02) / 0.16)];
      else if (y > -0.08) c = [lerp(below.r, hor[0], (y + 0.08) / 0.1), lerp(below.g, hor[1], (y + 0.08) / 0.1), lerp(below.b, hor[2], (y + 0.08) / 0.1)];
      else c = [below.r, below.g, below.b];
      cols.push(c[0], c[1], c[2]);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
    }));
    sky.renderOrder = -1;
    scene.add(sky);
  }

  const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.5, 12000);
  scene.add(camera);

  // One warm sun direction for everything, low and golden, plus a cool fill
  // from the east so white surfaces never fall flat grey.
  const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x66788a, 1.05);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xbfd9ff, 0.55);
  fill.position.set(800, 500, 600);
  scene.add(fill);
  const sunDir = new THREE.Vector3(
    Math.sin(SUN.azimuth) * Math.cos(SUN.elevation),
    Math.sin(SUN.elevation),
    Math.cos(SUN.azimuth) * Math.cos(SUN.elevation),
  );
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -480;
  sun.shadow.camera.right = 480;
  sun.shadow.camera.top = 480;
  sun.shadow.camera.bottom = -480;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // A visible sun disc + warm glow low in the west, so the sunset shot
  // (2-play, facing the sun) reads as Golden Hour instead of pale haze.
  // The glow is a soft radial-gradient sprite (no hard edge); the disc is
  // a small bright circle. Both sit inside the sky dome (8400 < 9000) and
  // terrain still occludes them.
  {
    const sunPos = sunDir.clone().multiplyScalar(8400);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(130, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff8d0, fog: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    disc.position.copy(sunPos);
    disc.lookAt(camera.position);
    disc.renderOrder = -0.5;
    scene.add(disc);
    const gc = document.createElement('canvas');
    gc.width = 256;
    gc.height = 256;
    const g = gc.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 216, 150, 0.5)');
    grad.addColorStop(0.35, 'rgba(255, 206, 140, 0.28)');
    grad.addColorStop(0.7, 'rgba(255, 200, 130, 0.1)');
    grad.addColorStop(1, 'rgba(255, 200, 130, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(gc);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, fog: false, depthWrite: false }));
    glow.position.copy(sunPos);
    glow.scale.set(4600, 4600, 1);
    glow.renderOrder = -0.6;
    scene.add(glow);
  }

  // Sea: one big disc to the horizon.
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(5600, 48),
    new THREE.MeshStandardMaterial({ color: DAY.sea, roughness: 0.85, metalness: 0.05 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.receiveShadow = true;
  scene.add(sea);

  // Whitecaps + a sun-glint path: the sea is not one flat blue sheet.
  // Subtle instanced white flecks over open water, plus ONE soft specular
  // streak running toward the low sun (ref 1) — a long warm gradient band
  // on the water, not scattered flecks.
  {
    const dummy = new THREE.Object3D();
    const rng = mulberry32(world.seed + 777);
    const capGeo = new THREE.CircleGeometry(1, 8);
    const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false });
    const caps = [];
    let guard = 0;
    while (caps.length < 300 && guard < 3000) {
      guard += 1;
      const x = range(rng, -2100, 2100);
      const z = range(rng, -2100, 2100);
      if (world.groundHeight(x, z) > 4) continue;
      caps.push({ x, z, s: range(rng, 4, 12) });
    }
    const capMesh = new THREE.InstancedMesh(capGeo, capMat, caps.length);
    caps.forEach((p, i) => {
      dummy.position.set(p.x, 0.4, p.z);
      dummy.rotation.set(-Math.PI / 2, 0, rng() * Math.PI);
      dummy.scale.set(p.s, p.s * 0.45, 1);
      dummy.updateMatrix();
      capMesh.setMatrixAt(i, dummy.matrix);
    });
    capMesh.instanceMatrix.needsUpdate = true;
    scene.add(capMesh);
    // Sun-glint path: two long, soft, overlapping streaks on the water
    // toward the sun azimuth. The texture is one wide radial gradient
    // stretched along the streak, so it fades out at both ends and edges.
    const sc = document.createElement('canvas');
    sc.width = 512;
    sc.height = 128;
    const sg = sc.getContext('2d');
    const sgrad = sg.createRadialGradient(256, 64, 0, 256, 64, 256);
    sgrad.addColorStop(0, 'rgba(255, 222, 160, 0.4)');
    sgrad.addColorStop(0.45, 'rgba(255, 212, 150, 0.2)');
    sgrad.addColorStop(1, 'rgba(255, 212, 150, 0)');
    sg.fillStyle = sgrad;
    sg.fillRect(0, 0, 512, 128);
    // Elliptical edge mask: the streak must fade at its long edges too,
    // or it reads as a hard gold ribbon with a straight cut.
    sg.globalCompositeOperation = 'destination-in';
    sg.save();
    sg.translate(256, 64);
    sg.scale(1, 0.5);
    const smask = sg.createRadialGradient(0, 0, 0, 0, 0, 256);
    smask.addColorStop(0, 'rgba(255, 255, 255, 1)');
    smask.addColorStop(0.6, 'rgba(255, 255, 255, 0.85)');
    smask.addColorStop(1, 'rgba(255, 255, 255, 0)');
    sg.fillStyle = smask;
    sg.fillRect(-256, -256, 512, 512);
    sg.restore();
    sg.globalCompositeOperation = 'source-over';
    const streakTex = new THREE.CanvasTexture(sc);
    const streakMat = new THREE.MeshBasicMaterial({
      map: streakTex, transparent: true, depthWrite: false, opacity: 0.85,
    });
    // The streak runs along the sun direction (sunDir points at the sun);
    // rotate the plane so its long axis lines up with that azimuth.
    const streakAngle = Math.atan2(sunDir.z, sunDir.x);
    const streaks = [
      { along: -1500, len: 3400, wid: 620, op: 0.5 },
      { along: -1300, len: 2600, wid: 220, op: 0.75 },
    ];
    for (const st of streaks) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(st.len, st.wid), streakMat.clone());
      streak.material.opacity = st.op;
      streak.rotation.x = -Math.PI / 2;
      streak.rotation.z = -streakAngle;
      streak.position.set(sunDir.x * -st.along, 0.5, sunDir.z * -st.along);
      streak.renderOrder = 0.5;
      scene.add(streak);
    }
  }

  // Islands.
  const islandMat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0,
  });
  for (const island of world.islands) {
    const mesh = new THREE.Mesh(buildIslandGeometry(island, world.seed, world), islandMat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
  }

  // The winding river on Harbour's east side, a reflective ribbon in its channel.
  {
    const pts = [];
    for (let x = 272; x <= 408; x += 8) pts.push({ x, z: riverZ(x) });
    const positions = [];
    const indices = [];
    pts.forEach((p, i) => {
      positions.push(p.x, 1.7, p.z - 7.5, p.x, 1.7, p.z + 7.5);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const river = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: DAY.river, roughness: 0.25, metalness: 0.35, side: THREE.DoubleSide,
    }));
    river.receiveShadow = true;
    scene.add(river);
  }

  // Villages on EVERY island: the chase shots fly the ring corridor between
  // islands, and a village that only exists on Harbour is behind the plane
  // — invisible. Houses are bigger now and clustered tight, so a village
  // reads as a red-roof town from 300 m up, not scattered dots.
  const villageSpots = [];
  {
    const rng = mulberry32(world.seed + 4242);
    for (const island of world.islands) {
      const count = island === world.islands[0] ? 20 : 13;
      let placed = 0;
      let guard = 0;
      while (placed < count && guard < 300) {
        guard += 1;
        const a = rng() * Math.PI * 2;
        const d = island.r * (0.2 + rng() * 0.38);
        const x = island.x + Math.cos(a) * d;
        const z = island.z + Math.sin(a) * d;
        if (island.runway) {
          const dx = x - island.x;
          const dz = z - island.z;
          const along = Math.abs(dx * Math.sin(island.runway.heading) + dz * Math.cos(island.runway.heading));
          const across = Math.abs(dx * Math.cos(island.runway.heading) - dz * Math.sin(island.runway.heading));
          if (along < island.runway.length / 2 + 70 && across < island.runway.width / 2 + 70) continue;
        }
        if (island.name === 'Harbour' && nearRiver(x, z, 26)) continue;
        villageSpots.push({ x, z, y: world.groundHeight(x, z), w: 9 + rng() * 4, h: 5.5 + rng() * 2.5, d: 8 + rng() * 3, rot: rng() * Math.PI });
        placed += 1;
      }
    }
  }
  {
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, villageSpots.length);
    // Gable roof: a 3-sided cylinder is a triangular prism.
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.translate(0, 0.5, 0);
    const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
    const roofs = new THREE.InstancedMesh(roofGeo, roofMat, villageSpots.length);
    // Windows + doors: one instanced mesh, dark glass / brown, per-instance.
    const trimGeo = new THREE.BoxGeometry(1, 1, 1);
    const trimMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
    const trims = new THREE.InstancedMesh(trimGeo, trimMat, villageSpots.length * 3);
    const wallCols = [DAY.wallA, DAY.wallB, 0xffffff];
    const roofCols = [DAY.roofA, DAY.roofB, DAY.roofC];
    villageSpots.forEach((s, i) => {
      dummy.position.set(s.x, s.y + s.h / 2, s.z);
      dummy.rotation.set(0, s.rot, 0);
      dummy.scale.set(s.w, s.h, s.d);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
      col.setHex(wallCols[i % wallCols.length]);
      walls.setColorAt(i, col);
      // Roof prism: length along the house depth, ridge up, slight overhang.
      dummy.position.set(s.x, s.y + s.h, s.z);
      dummy.rotation.set(0, s.rot, 0);
      dummy.scale.set(s.d + 1.2, 3.8 / 1.5, (s.w + 1.2) / 1.732);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
      col.setHex(roofCols[i % roofCols.length]);
      roofs.setColorAt(i, col);
      // Two windows + a door on the front face.
      const cos = Math.cos(s.rot);
      const sin = Math.sin(s.rot);
      const put = (lx, ly, lz, sx, sy, color) => {
        const idx = i * 3 + (lx === 0 ? 2 : (lx < 0 ? 0 : 1));
        dummy.position.set(s.x + lx * cos + lz * sin, s.y + ly, s.z - lx * sin + lz * cos);
        dummy.rotation.set(0, s.rot, 0);
        dummy.scale.set(sx, sy, 0.12);
        dummy.updateMatrix();
        trims.setMatrixAt(idx, dummy.matrix);
        col.setHex(color);
        trims.setColorAt(idx, col);
      };
      put(-s.w * 0.25, 1.9, s.d / 2 + 0.06, 1.6, 1.2, 0x1d3a4a);
      put(s.w * 0.25, 1.9, s.d / 2 + 0.06, 1.6, 1.2, 0x1d3a4a);
      put(0, 1.3, s.d / 2 + 0.06, 1.4, 2.6, 0x5a3a22);
    });
    walls.castShadow = true;
    walls.receiveShadow = true;
    roofs.castShadow = true;
    trims.castShadow = false;
    walls.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    trims.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    if (trims.instanceColor) trims.instanceColor.needsUpdate = true;
    scene.add(walls);
    scene.add(roofs);
    scene.add(trims);
  }

  // Trees: palms from the seeded spots + extra conifers, all instanced.
  {
    const dummy = new THREE.Object3D();
    const palmSpots = [];
    for (const island of world.islands) {
      for (const p of island.palmSpots) {
        palmSpots.push({ x: island.x + p.dx, z: island.z + p.dz, s: p.s });
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 8, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: DAY.trunk, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    const canopyGeo = new THREE.IcosahedronGeometry(4.3, 0);
    const canopyMat = new THREE.MeshStandardMaterial({ color: DAY.palm, roughness: 1, flatShading: true });
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
    palmSpots.forEach((p, i) => {
      const y = world.groundHeight(p.x, p.z);
      dummy.position.set(p.x, y + 4 * p.s, p.z);
      dummy.rotation.set(0, 0, (i % 5 - 2) * 0.05);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, y + (8 * p.s + 2.4 * p.s), p.z);
      dummy.scale.set(p.s, p.s * 0.55, p.s);
      dummy.updateMatrix();
      canopies.setMatrixAt(i, dummy.matrix);
    });
    // Trees do not cast shadows: with the sun low, their long shadows fell
    // across the open sea as dark stains (seen in 3-rings cycle 2). The
    // plane and the houses still cast, so ground contact still reads.
    trunks.castShadow = false;
    canopies.castShadow = false;
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    scene.add(trunks);
    scene.add(canopies);

    const coniferSpots = [];
    const rng = mulberry32(world.seed + 991);
    for (const island of world.islands) {
      for (let i = 0; i < 14; i += 1) {
        const a = rng() * Math.PI * 2;
        const d = island.r * (0.25 + rng() * 0.55);
        const x = island.x + Math.cos(a) * d;
        const z = island.z + Math.sin(a) * d;
        if (island.runway) {
          const dx = x - island.x;
          const dz = z - island.z;
          const along = Math.abs(dx * Math.sin(island.runway.heading) + dz * Math.cos(island.runway.heading));
          const across = Math.abs(dx * Math.cos(island.runway.heading) - dz * Math.sin(island.runway.heading));
          if (along < island.runway.length / 2 + 30 && across < island.runway.width / 2 + 30) continue;
        }
        if (island.name === 'Harbour' && nearRiver(x, z, 20)) continue;
        coniferSpots.push({ x, z, s: 1.0 + rng() * 1.0 });
      }
    }
    const cTrunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 3.5, 5);
    const cTrunks = new THREE.InstancedMesh(cTrunkGeo, trunkMat, coniferSpots.length);
    const coneGeo = new THREE.ConeGeometry(4.2, 12, 6);
    const coneMat = new THREE.MeshStandardMaterial({ color: DAY.pine, roughness: 1, flatShading: true });
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, coniferSpots.length);
    coniferSpots.forEach((p, i) => {
      const y = world.groundHeight(p.x, p.z);
      dummy.position.set(p.x, y + 1.7 * p.s, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      cTrunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, y + (3.5 * p.s + 4.5 * p.s), p.z);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
    });
    cTrunks.castShadow = false;
    cones.castShadow = false;
    cTrunks.instanceMatrix.needsUpdate = true;
    cones.instanceMatrix.needsUpdate = true;
    scene.add(cTrunks);
    scene.add(cones);
  }

  // Runways: dark strip + centreline dashes + threshold bars + edge lights.
  const runwayMat = new THREE.MeshStandardMaterial({ color: DAY.runway, roughness: 0.9 });
  const lineMat = new THREE.MeshStandardMaterial({ color: DAY.runwayEdge, roughness: 0.8 });
  const lightPositions = [];
  for (const island of world.islands) {
    if (!island.runway) continue;
    const rw = island.runway;
    const group = new THREE.Group();
    group.position.set(island.x, 6.35, island.z);
    group.rotation.y = rw.heading;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(rw.width, rw.length), runwayMat);
    strip.rotation.x = -Math.PI / 2;
    strip.receiveShadow = true;
    group.add(strip);
    for (let d = -rw.length / 2 + 24; d < rw.length / 2 - 12; d += 26) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 13), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.15, d + 6.5);
      group.add(dash);
    }
    for (const end of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(rw.width * 0.8, 3), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(0, 0.15, end * (rw.length / 2 - 8));
      group.add(bar);
    }
    scene.add(group);
    // Amber edge lights, just off the strip.
    const sin = Math.sin(rw.heading);
    const cos = Math.cos(rw.heading);
    for (let d = -rw.length / 2 + 10; d <= rw.length / 2 - 10; d += 30) {
      for (const side of [-1, 1]) {
        lightPositions.push({
          x: island.x + sin * d + cos * side * (rw.width / 2 + 2.5),
          y: 7.0,
          z: island.z + cos * d - sin * side * (rw.width / 2 + 2.5),
        });
      }
    }
  }
  {
    const dummy = new THREE.Object3D();
    const lightGeo = new THREE.SphereGeometry(0.9, 8, 6);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
    const lights = new THREE.InstancedMesh(lightGeo, lightMat, lightPositions.length);
    lightPositions.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      lights.setMatrixAt(i, dummy.matrix);
    });
    lights.instanceMatrix.needsUpdate = true;
    scene.add(lights);
  }

  // Cloud sea (ref 3 = the minimum bar: above a sea of clouds). The old
  // system read as discrete white cotton blobs because every cloud was a
  // hard-edged icosahedron cluster. Everything here is one shared soft
  // texture instead: a canvas of overlapping radial gradients, white with
  // feathered alpha edges and a faint cool shadow tint, so a single quad
  // reads as a lumpy cloud with no hard outline at all.
  function makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    const trng = mulberry32(world.seed + 5150);
    const blobs = [];
    // Blobs spread over the canvas but LEAVE REAL GAPS: fewer, smaller
    // blobs, so each deck quad carries transparent blue gaps between the
    // puffs instead of full-coverage white. (Ground-visible pass, tuan muda:
    // "biar pemandangan bawahnya kelihatan" — the sea, islands and villages
    // below must read through the gaps, like ref 3. Only 8 small blobs
    // with a lower peak alpha, so a quad is mostly transparent sky/sea
    // with scattered white billows, not a white sheet.)
    for (let i = 0; i < 8; i += 1) {
      blobs.push({
        x: 40 + trng() * 432,
        y: 40 + trng() * 432,
        r: range(trng, 70, 130),
      });
    }
    // Cool shadow under-lumps first, then the white tops.
    for (const b of blobs) {
      const grad = g.createRadialGradient(b.x, b.y + 14, 0, b.x, b.y + 14, b.r);
      grad.addColorStop(0, 'rgba(158, 178, 198, 0.2)');
      grad.addColorStop(1, 'rgba(158, 178, 198, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 512);
    }
    for (const b of blobs) {
      const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0, 'rgba(255, 253, 246, 0.85)');
      grad.addColorStop(0.6, 'rgba(252, 250, 246, 0.7)');
      grad.addColorStop(1, 'rgba(252, 250, 246, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 512);
    }
    // Edge mask: fade the whole texture to transparent at the canvas
    // borders, so a quad or sprite never shows a hard rectangular edge.
    // (Cycle 3: blobs near the canvas edge kept alpha ~0.7 at the border,
    // so every deck quad and sky sprite read as a white rectangle, and
    // the lanes between quads showed as hard blue diagonal bands.)
    g.globalCompositeOperation = 'destination-in';
    const mask = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    mask.addColorStop(0, 'rgba(255, 255, 255, 1)');
    mask.addColorStop(0.55, 'rgba(255, 255, 255, 0.9)');
    mask.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = mask;
    g.fillRect(0, 0, 512, 512);
    g.globalCompositeOperation = 'source-over';
    return new THREE.CanvasTexture(c);
  }
  const cloudTex = makeCloudTexture();

  // The deck: one InstancedMesh of large flat soft-textured quads at
  // y 32-42. GROUND-VISIBLE pass (tuan muda: "biar pemandangan bawahnya
  // kelihatan"): the deck is a thin, holey layer now — opacity 0.55,
  // spacing 290 with quads 220-320 (gaps wider than the quads, so the blue
  // sea + islands + villages below read clearly between the puffs), and
  // 0.7 skipped outside the ring corridor. The deck sits LOW so the
  // red-roof villages (25-46 m up the island slopes) poke through it
  // instead of drowning under it, and it is cleared around the three
  // runway islands so takeoffs and landings stay in clear air. Densest in
  // the ring corridor (Harbour -> Coral -> Turtle).
  // The deck is static (a sea does not drift); only the sprites above it
  // drift, via the `clouds` list the frame loop already animates.
  const clouds = [];
  {
    const rng = mulberry32(world.seed + 31337);
    const deckGeo = new THREE.PlaneGeometry(1, 1);
    const deckMat = new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, depthWrite: false, opacity: 0.55,
    });
    const clearOfRunways = (x, z) => {
      for (const [cx, cz, cr] of [[0, 0, 540], [1250, 700, 500], [-1250, 950, 500]]) {
        if (Math.hypot(x - cx, z - cz) < cr) return false;
      }
      return true;
    };
    const spots = [];
    for (let gx = -3000; gx <= 3000; gx += 290) {
      for (let gz = -3000; gz <= 3000; gz += 290) {
        const inCorridor = gx > -1900 && gx < 400 && gz > -1900 && gz < 400;
        if (!inCorridor && rng() < 0.7) continue;
        const x = gx + range(rng, -70, 70);
        const z = gz + range(rng, -70, 70);
        if (!clearOfRunways(x, z)) continue;
        if (world.groundHeight(x, z) > 18) continue;
        spots.push({
          x, z, y: 32 + rng() * 10, s: range(rng, 220, 320), rot: rng() * Math.PI,
        });
      }
    }
    const deck = new THREE.InstancedMesh(deckGeo, deckMat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(-Math.PI / 2, 0, p.rot);
      dummy.scale.set(p.s, p.s * range(rng, 0.7, 1), 1);
      dummy.updateMatrix();
      deck.setMatrixAt(i, dummy.matrix);
    });
    deck.instanceMatrix.needsUpdate = true;
    deck.renderOrder = 2;
    scene.add(deck);

    // Puff layer (ice-rock fix): the solid mound domes are GONE — as solid
    // shaded 3D shapes they read as ice rocks / boulders, not clouds
    // ("batu es"). The billow comes back from soft texture only: a second
    // flat deck of smaller feathered quads riding 10-20 m above the base
    // deck, denser in the ring corridor. A flat quad has no solid
    // silhouette and no shaded flank, so from the chase camera it reads as
    // a soft puff, and overlapping puffs at two heights give the sea its
    // rolling relief. Same clearances as the base deck so islands +
    // villages still poke through instead of drowning. GROUND-VISIBLE
    // pass: opacity 0.45, spacing 280, smaller quads 150-260, sparser
    // outside the corridor — the puffs are scattered billows with wide
    // blue gaps between them, not a second white sheet.
    const puffGeo = new THREE.PlaneGeometry(1, 1);
    const puffMat = new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, depthWrite: false, opacity: 0.45,
    });
    const puffSpots = [];
    for (let gx = -3000; gx <= 3000; gx += 280) {
      for (let gz = -3000; gz <= 3000; gz += 280) {
        const inCorridor = gx > -1900 && gx < 400 && gz > -1900 && gz < 400;
        if (!inCorridor && rng() < 0.75) continue;
        const x = gx + range(rng, -70, 70);
        const z = gz + range(rng, -70, 70);
        if (!clearOfRunways(x, z)) continue;
        if (world.groundHeight(x, z) > 18) continue;
        puffSpots.push({
          x, z, y: 42 + rng() * 12, s: range(rng, 150, 260), rot: rng() * Math.PI,
        });
      }
    }
    const puffs = new THREE.InstancedMesh(puffGeo, puffMat, puffSpots.length);
    puffSpots.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(-Math.PI / 2, 0, p.rot);
      dummy.scale.set(p.s, p.s * range(rng, 0.7, 1), 1);
      dummy.updateMatrix();
      puffs.setMatrixAt(i, dummy.matrix);
    });
    puffs.instanceMatrix.needsUpdate = true;
    puffs.renderOrder = 3;
    scene.add(puffs);
  }

  // High clouds: soft billboard sprites with the same feathered texture —
  // big, few, drifting slowly — instead of hard icosahedron clusters.
  // Kept modest in size so the upper sky stays a deep blue band (ref 3)
  // instead of filling white.
  for (const c of world.clouds) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85,
    }));
    spr.position.set(c.x, c.y, c.z);
    spr.scale.set(c.s * 3.2, c.s * 1.7, 1);
    scene.add(spr);
    clouds.push({ group: spr, baseX: c.x, drift: c.drift });
  }
  // Soft lumps riding on the deck itself, for billowy relief in the chase
  // view; plus four towering cumulus columns for the layered sky.
  // GROUND-VISIBLE pass: 60 -> 35 lumps, opacity 0.8 -> 0.6 — fewer,
  // lighter billows so the ground below stays visible through the gaps.
  {
    const rng = mulberry32(world.seed + 7777);
    for (let i = 0; i < 35; i += 1) {
      let x;
      let z;
      if (rng() < 0.65) {
        x = range(rng, -1500, 300);
        z = range(rng, -1300, 300);
      } else {
        x = range(rng, -1900, 1900);
        z = range(rng, -1900, 1900);
      }
      if (world.groundHeight(x, z) > 18) continue;
      if (Math.hypot(x, z) < 540) continue;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, depthWrite: false, opacity: 0.6,
      }));
      spr.position.set(x, 46 + rng() * 18, z);
      spr.scale.set(range(rng, 120, 240), range(rng, 60, 110), 1);
      scene.add(spr);
      clouds.push({ group: spr, baseX: x, drift: range(rng, 1.5, 4) });
    }
    for (let i = 0; i < 4; i += 1) {
      const cx = range(rng, -1700, 1700);
      const cz = range(rng, -1700, 1700);
      const drift = range(rng, 1.5, 3);
      const stack = [[130, 200, 110], [195, 160, 85], [255, 115, 60]];
      for (const [y, w, h] of stack) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: cloudTex, transparent: true, depthWrite: false, opacity: 0.88,
        }));
        spr.position.set(cx, y, cz);
        spr.scale.set(w, h, 1);
        scene.add(spr);
        clouds.push({ group: spr, baseX: cx, drift });
      }
    }
  }

  // Birds: three flocks on slow deterministic loops, wings flapping.
  // Flock A rides the corridor toward the first ring so the chase-view shot
  // catches birds in frame; B hangs over home for the title shot; C tours
  // the east islands. Positions are a pure function of (seed, time).
  const flocks = [
    { cx: -420, cy: 110, cz: -480, r: 230, n: 6, speed: 0.05, phase: 0 },
    { cx: 180, cy: 125, cz: 320, r: 190, n: 5, speed: 0.045, phase: 2.1 },
    { cx: 950, cy: 105, cz: -650, r: 210, n: 5, speed: 0.055, phase: 4.2 },
    { cx: -950, cy: 120, cz: -800, r: 220, n: 5, speed: 0.05, phase: 5.3 },
  ];
  const birds = [];
  {
    const bodyGeo = new THREE.ConeGeometry(1.1, 4.6, 6);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
    const wingGeo = new THREE.BoxGeometry(4.8, 0.12, 1.8);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 });
    for (const flock of flocks) {
      for (let i = 0; i < flock.n; i += 1) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);
        const wingL = new THREE.Group();
        wingL.position.set(-0.4, 0.1, 0);
        const wl = new THREE.Mesh(wingGeo, wingMat);
        wl.position.set(-2.4, 0, 0);
        wingL.add(wl);
        group.add(wingL);
        const wingR = new THREE.Group();
        wingR.position.set(0.4, 0.1, 0);
        const wr = new THREE.Mesh(wingGeo, wingMat);
        wr.position.set(2.4, 0, 0);
        wingR.add(wr);
        group.add(wingR);
        scene.add(group);
        birds.push({
          group, wingL, wingR, flock,
          a0: (i / flock.n) * Math.PI * 2 + flock.phase,
          flap: 6.5 + (i % 3) * 0.7,
          bob: Math.sin(i * 2.3) * 6,
        });
      }
    }
  }

  // The tourer: white with a blue cheatline and red tail, TBM-style —
  // sleek low-wing single-prop, smooth extruded wings and fin, three-blade
  // prop. The visual model sits 1.9 m above the physics origin so the gear
  // meets the ground when parked.
  const PLANE_LIFT = 1.9;
  const planeGroup = new THREE.Group();
  let propGroup;
  let propMat;
  let gearGroup;
  let strobe;
  {
    const white = new THREE.MeshStandardMaterial({ color: DAY.planeWhite, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide });
    const blue = new THREE.MeshStandardMaterial({ color: DAY.planeBlue, roughness: 0.4, metalness: 0.15 });
    const red = new THREE.MeshStandardMaterial({ color: DAY.planeRed, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide });
    const black = new THREE.MeshStandardMaterial({ color: DAY.planeBlack, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: DAY.glass, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.95,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 });

    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 5.2, 8, 24), white);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;
    planeGroup.add(fuselage);
    // Blue cheatline along each flank — thick and long, running from the
    // nose all the way back into the red tail band, so the livery reads
    // from any angle.
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 7.0), blue);
      stripe.position.set(side * 1.0, 0.05, 0.2);
      planeGroup.add(stripe);
    }
    // Red band around the tail.
    const tailBand = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.55, 24), red);
    tailBand.rotation.x = Math.PI / 2;
    tailBand.position.set(0, 0, -3.3);
    planeGroup.add(tailBand);
    // Long sleek nose.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.92, 1.9, 24), white);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 4.5);
    nose.castShadow = true;
    planeGroup.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.7, 24), white);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, 0, -4.3);
    tail.castShadow = true;
    planeGroup.add(tail);
    // Low wings, tapered with rounded tips, slight dihedral.
    const wingGeoR = wingGeometry(7.2, 2.4, 1.4);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeoR, white);
      wing.position.set(side * 0.3, -0.55, 0.6);
      if (side < 0) wing.rotation.y = Math.PI;
      wing.rotation.z = side * 0.06;
      wing.castShadow = true;
      planeGroup.add(wing);
      // Red wingtip caps — the blue cheatline's counterpart at the tips.
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.0), red);
      tip.position.set(side * 7.2, -0.55, 0.6);
      planeGroup.add(tip);
      const tailplane = new THREE.Mesh(wingGeometry(2.9, 1.15, 0.8), white);
      tailplane.position.set(side * 0.2, 0.3, -4.4);
      if (side < 0) tailplane.rotation.y = Math.PI;
      tailplane.castShadow = true;
      planeGroup.add(tailplane);
    }
    // Fin: tall, swept-back, extruded shape with a rounded top, red with
    // a black band — a real aircraft silhouette, not a stub. The sweep
    // runs back along the tail so the fin reads tall from the rear chase
    // view and from the title hero shot.
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0, 2.5);
    finShape.quadraticCurveTo(0.15, 2.85, 0.7, 2.75);
    finShape.lineTo(1.9, 0.3);
    finShape.quadraticCurveTo(1.95, 0.1, 1.7, 0);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.2, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 3,
    });
    finGeo.translate(0, 0, -0.1);
    const fin = new THREE.Mesh(finGeo, red);
    fin.rotation.y = Math.PI / 2;
    fin.position.set(0, 0.45, -3.55);
    fin.castShadow = true;
    planeGroup.add(fin);
    const finBand = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 1.0), black);
    finBand.position.set(0, 1.1, -4.35);
    planeGroup.add(finBand);
    for (const side of [-1, 1]) {
      const roundel = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 20),
        new THREE.MeshStandardMaterial({ color: 0xfff3c4, roughness: 0.6 }),
      );
      roundel.position.set(side * 0.13, 1.6, -4.4);
      roundel.rotation.y = side * Math.PI / 2;
      planeGroup.add(roundel);
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.24, 16),
        new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.6 }),
      );
      dot.position.set(side * 0.14, 1.6, -4.4);
      dot.rotation.y = side * Math.PI / 2;
      planeGroup.add(dot);
    }
    // Canopy glass: bigger and glossier — a proper bubble canopy that
    // catches the sun, not a small dark dome.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
    canopy.scale.set(1.15, 0.85, 2.1);
    canopy.position.set(0, 0.5, 1.2);
    planeGroup.add(canopy);
    // Propeller: three slim pale blades spinning around the nose axis.
    // Thin + light grey on purpose: the old thick dark-grey blades read as
    // a black starburst against the bright cloud sea in the title shot.
    propGroup = new THREE.Group();
    propGroup.position.set(0, 0, 5.55);
    const hub = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 16), dark);
    hub.rotation.x = Math.PI / 2;
    propGroup.add(hub);
    propMat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.55 });
    for (let b = 0; b < 3; b += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 4.6, 0.06), propMat);
      blade.rotation.z = (b / 3) * Math.PI * 2;
      propGroup.add(blade);
    }
    // No translucent prop disc: with the closer chase camera (round 2) the
    // disc read as a giant grey balloon / radar dish behind the fuselage.
    // The three blades + hub alone read fine at speed.
    planeGroup.add(propGroup);
    // Landing gear.
    gearGroup = new THREE.Group();
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), dark);
      strut.position.set(side * 0.9, -1.25, 1.2);
      gearGroup.add(strut);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 20), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.9, -1.5, 1.2);
      gearGroup.add(wheel);
    }
    planeGroup.add(gearGroup);
    // Wingtip lights: red left, green right, white strobe on the tail.
    const tipL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff2020, emissiveIntensity: 1.4 }));
    tipL.position.set(-7.4, -0.55, 0.6);
    planeGroup.add(tipL);
    const tipR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: 0x4dff88, emissive: 0x20ff60, emissiveIntensity: 1.4 }));
    tipR.position.set(7.4, -0.55, 0.6);
    planeGroup.add(tipR);
    strobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }));
    strobe.position.set(0, 0.4, -5.2);
    planeGroup.add(strobe);
  }
  scene.add(planeGroup);

  // Rings + stars: rebuilt whenever the mission object changes.
  const ringMat = new THREE.MeshStandardMaterial({
    color: DAY.ringGold, emissive: 0x8a6d00, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.4,
  });
  // A ring already flown is faint green, not a solid wall: the chase camera
  // passes right through it a moment later, and a solid torus that close
  // fills the whole frame with a green arch (seen in 2-play cycle 1).
  const ringDoneMat = new THREE.MeshStandardMaterial({
    color: DAY.ringGreen, emissive: 0x1d5c2e, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.4,
    transparent: true, opacity: 0.2,
  });
  const ringGeo = new THREE.TorusGeometry(13, 0.9, 10, 42);
  const starGeo = new THREE.OctahedronGeometry(2.4);
  const starMat = new THREE.MeshStandardMaterial({
    color: DAY.starGold, emissive: 0x8a6d00, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.5,
  });
  let ringGroup = null;
  let starGroup = null;
  let lastMission = null;
  let lastRingStates = '';

  function rebuildGoals(mission) {
    if (ringGroup) { scene.remove(ringGroup); ringGroup = null; }
    if (starGroup) { scene.remove(starGroup); starGroup = null; }
    if (mission.id === 'rings') {
      ringGroup = new THREE.Group();
      for (const ring of mission.rings) {
        const mesh = new THREE.Mesh(ringGeo, ring.passed ? ringDoneMat : ringMat);
        mesh.position.set(ring.x, ring.y, ring.z);
        mesh.rotation.y = Math.atan2(world.home.x - ring.x, world.home.z - ring.z);
        mesh.userData.ring = ring;
        ringGroup.add(mesh);
      }
      scene.add(ringGroup);
    }
    if (mission.id === 'free') {
      starGroup = new THREE.Group();
      for (const star of mission.starList) {
        if (star.taken) continue;
        const mesh = new THREE.Mesh(starGeo, starMat);
        mesh.position.set(star.x, star.y, star.z);
        starGroup.add(mesh);
      }
      scene.add(starGroup);
    }
  }

  // Cockpit: a glass cockpit. Two glowing screens (PFD + ND) drawn live on
  // canvas textures ride with the camera, plus a dark glareshield.
  const dash = new THREE.Group();
  const pfdCanvas = document.createElement('canvas');
  pfdCanvas.width = 256;
  pfdCanvas.height = 160;
  const pfdCtx = pfdCanvas.getContext('2d');
  const pfdTex = new THREE.CanvasTexture(pfdCanvas);
  pfdTex.colorSpace = THREE.SRGBColorSpace;
  const ndCanvas = document.createElement('canvas');
  ndCanvas.width = 256;
  ndCanvas.height = 160;
  const ndCtx = ndCanvas.getContext('2d');
  const ndTex = new THREE.CanvasTexture(ndCanvas);
  ndTex.colorSpace = THREE.SRGBColorSpace;
  {
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.85 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.35), panelMat);
    panel.position.set(0, -0.62, -1.35);
    dash.add(panel);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.45), panelMat);
    shield.position.set(0, -0.34, -1.3);
    dash.add(shield);
    const screenMatPFD = new THREE.MeshBasicMaterial({ map: pfdTex });
    const screenMatND = new THREE.MeshBasicMaterial({ map: ndTex });
    const pfd = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), screenMatPFD);
    pfd.position.set(-0.38, -0.35, -1.15);
    pfd.rotation.x = -0.25;
    dash.add(pfd);
    const nd = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), screenMatND);
    nd.position.set(0.38, -0.35, -1.15);
    nd.rotation.x = -0.25;
    dash.add(nd);
    const gaugeMat = new THREE.MeshStandardMaterial({ color: 0x0a0f14, roughness: 0.4, emissive: 0x1d4a68, emissiveIntensity: 0.6 });
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 20), gaugeMat);
    gauge.rotation.x = Math.PI / 2 - 0.35;
    gauge.position.set(0, -0.35, -1.28);
    dash.add(gauge);
    dash.visible = false;
  }
  camera.add(dash);

  function drawPFD(plane, mission) {
    const c = pfdCtx;
    const W = 256;
    const H = 160;
    c.fillStyle = '#0a0f14';
    c.fillRect(0, 0, W, H);
    // Attitude ball, centre-left.
    const ax = 78;
    const ay = 80;
    const ar = 62;
    c.save();
    c.beginPath();
    c.arc(ax, ay, ar, 0, Math.PI * 2);
    c.clip();
    c.translate(ax, ay);
    c.rotate(-plane.bank);
    c.translate(0, plane.pitch * 60);
    c.fillStyle = '#2f6fb2';
    c.fillRect(-ar - 4, -ar - 80, ar * 2 + 8, ar + 80);
    c.fillStyle = '#7a5230';
    c.fillRect(-ar - 4, 0, ar * 2 + 8, ar + 80);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-ar, 0);
    c.lineTo(ar, 0);
    c.stroke();
    c.restore();
    c.strokeStyle = '#8cd8ff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(ax, ay, ar, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#ffcf5e';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(ax - 24, ay);
    c.lineTo(ax + 24, ay);
    c.stroke();
    // Speed tape (left) and altitude tape (right).
    const spdKt = Math.round(plane.speed * 1.94384);
    const altFt = Math.round(plane.y * 3.28084);
    c.font = '700 13px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillStyle = '#8cd8ff';
    c.fillText('SPD', 152, 24);
    c.fillStyle = '#ffffff';
    c.fillText(`${spdKt} kt`, 152, 44);
    c.fillStyle = '#8cd8ff';
    c.fillText('ALT', 152, 72);
    c.fillStyle = '#ffffff';
    c.fillText(`${altFt} ft`, 152, 92);
    c.fillStyle = '#8cd8ff';
    c.fillText('HDG', 152, 120);
    c.fillStyle = '#ffffff';
    c.fillText(`${String(Math.round(headingDeg(plane.heading))).padStart(3, '0')}°`, 152, 140);
    // Fuel bar.
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(14, 146, 120, 8);
    c.fillStyle = plane.fuel < 20 ? '#ff6b5e' : '#7dff9a';
    c.fillRect(14, 146, 120 * clamp(plane.fuel / 100, 0, 1), 8);
  }

  function drawND(state) {
    const c = ndCtx;
    const W = 256;
    const H = 160;
    const { plane, mission, world } = state;
    c.fillStyle = '#0a1420';
    c.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2 + 8;
    const scale = 150 / (WORLD.size + 400);
    c.strokeStyle = 'rgba(140,220,255,0.35)';
    c.lineWidth = 1;
    for (const r of [28, 56]) {
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
    }
    for (const island of world.islands) {
      c.fillStyle = '#4d7a3e';
      c.beginPath();
      c.arc(cx + island.x * scale, cy + island.z * scale, Math.max(2, island.r * scale), 0, Math.PI * 2);
      c.fill();
    }
    if (mission.id === 'rings') {
      c.fillStyle = '#ffc93c';
      mission.rings.forEach((ring, i) => {
        if (ring.passed) return;
        c.beginPath();
        c.arc(cx + ring.x * scale, cy + ring.z * scale, i === mission.ringsPassed ? 4 : 2.5, 0, Math.PI * 2);
        c.fill();
      });
    }
    c.save();
    c.translate(cx + plane.x * scale, cy + plane.z * scale);
    c.rotate(Math.PI - plane.heading);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 6);
    c.lineTo(-5, 6);
    c.closePath();
    c.fill();
    c.restore();
    c.fillStyle = '#8cd8ff';
    c.font = '700 12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(`${mission.name}  ·  ${mission.progressLabel || ''}`, cx, 16);
  }

  // ---- HUD (DOM) ----
  const hud = document.getElementById('hud');
  const $ = (id) => document.getElementById(id);
  const tape = $('tape');
  const tapeCtx = tape.getContext('2d');
  const minimap = $('minimap');
  const mmCtx = minimap.getContext('2d');
  const attitude = $('attitude');
  const attCtx = attitude.getContext('2d');

  // Title cards: one real button per mission.
  const cardsEl = $('cards');
  const cardButtons = [];
  let hoverCard = -1;
  MISSIONS.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.innerHTML = `<span class="press">PRESS ${m.key}</span>`
      + `<span class="name">${m.name}</span>`
      + `<span class="tag">${m.tag}</span>`
      + `<span class="meta">Time limit ${Math.floor(m.timeLimit / 60)} min &nbsp;·&nbsp; Fuel &amp; damage matter</span>`;
    b.addEventListener('click', () => hooks.onStartMission(m.id));
    b.addEventListener('mouseenter', () => { hoverCard = i; });
    b.addEventListener('mouseleave', () => { hoverCard = -1; });
    cardsEl.appendChild(b);
    cardButtons.push(b);
  });
  let lastScreen = '';
  let cockpit = false;

  function drawTape(W, plane) {
    tape.width = W;
    tape.height = 46;
    const c = tapeCtx;
    c.clearRect(0, 0, W, 46);
    c.fillStyle = 'rgba(8, 18, 30, 0.55)';
    c.fillRect(0, 0, W, 46);
    const hdg = headingDeg(plane.heading);
    const degPerPx = 0.22;
    c.font = '600 13px system-ui, sans-serif';
    c.textAlign = 'center';
    for (let d = -160; d <= 160; d += 5) {
      const deg = Math.round((hdg + d) / 5) * 5;
      const x = W / 2 + (deg - hdg) / degPerPx;
      if (x < -20 || x > W + 20) continue;
      const major = ((deg % 45) + 360) % 360 === 0;
      c.strokeStyle = major ? 'rgba(140,220,255,0.85)' : 'rgba(140,220,255,0.4)';
      c.lineWidth = major ? 2 : 1;
      c.beginPath();
      c.moveTo(x, major ? 22 : 28);
      c.lineTo(x, 40);
      c.stroke();
      if (major) {
        c.fillStyle = '#cfeeff';
        c.fillText(deg % 90 === 0 ? compassPoint(((deg % 360) + 360) % 360) : String(((deg % 360) + 360) % 360), x, 18);
      }
    }
    c.fillStyle = '#ffcf5e';
    c.beginPath();
    c.moveTo(W / 2 - 7, 40);
    c.lineTo(W / 2 + 7, 40);
    c.lineTo(W / 2, 48);
    c.closePath();
    c.fill();
  }

  function drawMinimap(state) {
    const c = mmCtx;
    const S = 148;
    const scale = S / (WORLD.size + 400);
    const cx = S / 2;
    const cy = S / 2;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#2f6f9e';
    c.fillRect(0, 0, S, S);
    const { world, plane, mission } = state;
    for (const island of world.islands) {
      c.fillStyle = '#4d7a3e';
      c.beginPath();
      c.arc(cx + island.x * scale, cy + island.z * scale, Math.max(2, island.r * scale), 0, Math.PI * 2);
      c.fill();
      if (island.runway) {
        c.strokeStyle = '#e8e8e8';
        c.lineWidth = 1.5;
        c.beginPath();
        const hx = Math.sin(island.runway.heading) * island.runway.length * 0.5 * scale;
        const hz = Math.cos(island.runway.heading) * island.runway.length * 0.5 * scale;
        c.moveTo(cx + island.x * scale - hx, cy + island.z * scale - hz);
        c.lineTo(cx + island.x * scale + hx, cy + island.z * scale + hz);
        c.stroke();
      }
    }
    if (mission.id === 'rings') {
      mission.rings.forEach((ring, i) => {
        const x = cx + ring.x * scale;
        const y = cy + ring.z * scale;
        if (ring.passed) {
          c.fillStyle = '#7dff9a';
        } else if (i === mission.ringsPassed) {
          c.fillStyle = '#ffc93c';
          c.beginPath();
          c.arc(x, y, 5, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#ffc93c';
          c.beginPath();
          c.arc(x, y, 8, 0, Math.PI * 2);
          c.stroke();
          return;
        } else {
          c.fillStyle = 'rgba(255, 201, 60, 0.7)';
        }
        c.beginPath();
        c.arc(x, y, 3, 0, Math.PI * 2);
        c.fill();
      });
    }
    if (mission.id === 'free') {
      c.fillStyle = '#ffe27a';
      for (const star of mission.starList) {
        if (star.taken) continue;
        c.beginPath();
        c.arc(cx + star.x * scale, cy + star.z * scale, 2.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    // The aircraft: a white triangle pointing along its heading.
    const px = cx + plane.x * scale;
    const py = cy + plane.z * scale;
    c.save();
    c.translate(px, py);
    c.rotate(Math.PI - plane.heading);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4.5, 5);
    c.lineTo(-4.5, 5);
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawAttitude(plane) {
    const c = attCtx;
    const S = 124;
    const gx = S / 2;
    const gy = S / 2;
    const gr = 52;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(gx, gy, gr, 0, Math.PI * 2);
    c.clip();
    c.translate(gx, gy);
    c.rotate(-plane.bank);
    c.translate(0, plane.pitch * 90);
    c.fillStyle = '#2f6fb2';
    c.fillRect(-gr - 4, -gr - 110, gr * 2 + 8, gr + 110);
    c.fillStyle = '#7a5230';
    c.fillRect(-gr - 4, 0, gr * 2 + 8, gr + 110);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-gr, 0);
    c.lineTo(gr, 0);
    c.stroke();
    for (const [dy, w] of [[-22, 22], [22, 22], [-44, 14], [44, 14]]) {
      c.beginPath();
      c.moveTo(-w, dy);
      c.lineTo(w, dy);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(140,220,255,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(gx, gy, gr, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#ffcf5e';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(gx - 22, gy);
    c.lineTo(gx + 22, gy);
    c.moveTo(gx, gy - 4);
    c.lineTo(gx, gy + 4);
    c.stroke();
  }

  function updateHUD(state, W, H, time) {
    const { plane, mission } = state;
    const altFt = Math.round(plane.y * 3.28084);
    const spdKt = Math.round(plane.speed * 1.94384);
    const vsFpm = Math.round(plane.verticalSpeed * 196.85);
    const hdg = Math.round(headingDeg(plane.heading));
    $('v-alt').textContent = `${altFt.toLocaleString('en-US')} ft`;
    $('v-spd').textContent = `${spdKt} kt`;
    $('v-vs').textContent = `${vsFpm >= 0 ? '+' : ''}${vsFpm} fpm`;
    $('v-hdg').textContent = `${String(hdg).padStart(3, '0')}° ${compassPoint(hdg)}`;
    $('stall').textContent = plane.speed < 27 && plane.flying && Math.floor(time * 3) % 2 === 0 ? 'STALL!' : '';
    $('v-mname').textContent = mission.name;
    $('v-obj').textContent = mission.objectiveLabel || '';
    $('v-score').textContent = String(mission.score);
    $('v-time').textContent = formatTime(mission.timeLeft);
    $('v-time').style.color = mission.timeLeft < 60 ? '#ff6b5e' : '#cfeeff';
    $('v-prog').textContent = mission.progressLabel || '';
    $('bar-fuel').style.width = `${clamp(plane.fuel, 0, 100)}%`;
    $('bar-fuel').style.background = plane.fuel < 20 ? '#ff6b5e' : plane.fuel < 45 ? '#ffcf5e' : '#7dff9a';
    $('bar-thr').style.width = `${clamp(plane.throttle, 0, 100)}%`;
    $('v-gear').textContent = plane.gearDown ? 'GEAR DOWN' : 'GEAR UP';
    $('v-dmg').textContent = plane.damage > 0 ? `DAMAGE ${Math.round(plane.damage)}%` : '';
    $('v-dmg').style.color = plane.damage > 60 ? '#ff6b5e' : '#ffcf5e';

    drawTape(W, plane);
    drawMinimap(state);
    drawAttitude(plane);

    const flashEl = $('flash');
    if (state.flash && time - state.flash.at < 2.4) {
      flashEl.style.display = 'block';
      $('flash-text').textContent = state.flash.text;
      $('flash-text').style.color = state.flash.color || '#ffffff';
      $('flash-sub').textContent = state.flash.sub || '';
    } else {
      flashEl.style.display = 'none';
    }
    $('pullup').style.display = plane.flying && plane.y < 42 && plane.verticalSpeed < -1
      && Math.floor(time * 4) % 2 === 0 ? 'block' : 'none';

    // Cockpit: the glass screens in 3D are the instruments (the DOM dial
    // strip was removed — it covered the screens).
    if (cockpit && state.screen === 'play') {
      drawPFD(plane, mission);
      drawND(state);
      pfdTex.needsUpdate = true;
      ndTex.needsUpdate = true;
    }

    // Title + end screens.
    const titleEl = $('title');
    const panelEl = $('panel');
    if (state.screen === 'title') {
      titleEl.style.display = 'block';
      panelEl.style.display = 'none';
      cardButtons.forEach((b, i) => b.classList.toggle('hover', i === hoverCard || i === state.hoverCard));
    } else {
      titleEl.style.display = 'none';
    }
    if (state.screen === 'paused' || state.screen === 'complete' || state.screen === 'crashed' || state.screen === 'failed') {
      panelEl.style.display = 'block';
      if (lastScreen !== state.screen) {
        const lines = [];
        if (state.screen === 'paused') {
          lines.push(['PAUSED', 'big', '#ffffff'], ['Press P to keep flying — or R to restart the sortie', 'head', '#dfeeff']);
        } else if (state.screen === 'complete') {
          lines.push(['MISSION COMPLETE', 'big', '#7dff9a'], [state.summaryLine || '', 'head', '#dfeeff'], [`Final score: ${mission.score}  ·  Press R to fly again`, 'head', '#dfeeff']);
        } else if (state.screen === 'crashed') {
          lines.push(['CRASHED', 'big', '#ff6b5e'], [state.crashReason || 'The aircraft is a write-off.', 'head', '#dfeeff'], [`Score: ${mission.score}  ·  Press R to try again`, 'head', '#dfeeff']);
        } else {
          lines.push(['SORTIE OVER', 'big', '#ffcf5e'], [state.crashReason || '', 'head', '#dfeeff'], [`Score: ${mission.score}  ·  Press R to try again`, 'head', '#dfeeff']);
        }
        $('panel-title').textContent = lines[0][0];
        $('panel-title').style.color = lines[0][2];
        const box = $('panel-lines');
        box.innerHTML = '';
        for (const line of lines.slice(1)) {
          const p = document.createElement('p');
          p.textContent = line[0];
          p.className = 'head';
          p.style.color = line[2];
          box.appendChild(p);
        }
      }
    } else if (state.screen !== 'title') {
      panelEl.style.display = 'none';
    }
    lastScreen = state.screen;

    // HUD panels show only while flying (not on the title screen).
    // In cockpit view the 3D glass screens are the instruments, so the DOM
    // attitude, minimap and fuel panels hide to leave them unobstructed.
    const showHud = state.screen !== 'title';
    const inCockpit = cockpit && state.screen === 'play';
    for (const id of ['hud-left', 'hud-mission', 'hud-right', 'hud-map', 'hud-att', 'hud-fuel']) {
      const hidden = inCockpit && (id === 'hud-map' || id === 'hud-att' || id === 'hud-fuel');
      $(id).style.display = showHud && !hidden ? 'block' : 'none';
    }
    tape.style.display = showHud ? 'block' : 'none';
    hud.style.display = 'block';
  }

  function makeCamera(plane, titleView, cockpitView) {
    const h = plane.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    if (cockpitView) {
      // From the canopy, looking ahead along the nose.
      const pos = {
        x: plane.x + fx * 1.2,
        y: plane.y + PLANE_LIFT + 0.7,
        z: plane.z + fz * 1.2,
      };
      const look = {
        x: plane.x + fx * 80,
        y: plane.y + PLANE_LIFT + Math.sin(plane.pitch) * 40 - 1,
        z: plane.z + fz * 80,
      };
      return { pos, look };
    }
    if (titleView) {
      // Hero shot (title only): the camera sits ahead and to the side, low,
      // looking BACK at the plane as it climbs away from home — the plane
      // is BIG in the foreground now (camera ~22 m out instead of ~33 m,
      // so the livery, canopy and tall fin actually read), its home island
      // + red-roof village + runway behind it, cloud sea below, sunset
      // sky above. The chase camera below is untouched.
      const pos = {
        x: plane.x + fx * 18 + Math.cos(h) * 13,
        y: plane.y + 3,
        z: plane.z + fz * 18 - Math.sin(h) * 13,
      };
      const look = { x: plane.x, y: plane.y + 1, z: plane.z };
      return { pos, look };
    }
    // Ref 3 composition: the chase camera sits higher and looks DOWN at the
    // cloud sea instead of level at the horizon — the frame is mostly cloud
    // sea below with the plane, the horizon rides at the very top like the
    // photo, and the rings (at flight height, ahead) stay in frame near
    // the top. The camera never drops near the terrain.
    const back = 16;
    const camUp = 11;
    const ahead = 26;
    const side = 0;
    const pos = {
      x: plane.x - fx * back + Math.cos(h) * side,
      y: plane.y + camUp,
      z: plane.z - fz * back - Math.sin(h) * side,
    };
    const look = {
      x: plane.x + fx * ahead,
      y: plane.y - 8,
      z: plane.z + fz * ahead,
    };
    return { pos, look };
  }

  let sizeW = 0;
  let sizeH = 0;

  function drawFrame(state, W, H, time) {
    const { plane, mission, world } = state;
    const titleView = state.screen === 'title';
    const cockpitView = cockpit && state.screen === 'play';

    if (W !== sizeW || H !== sizeH) {
      sizeW = W;
      sizeH = H;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }

    // Title dressing: richer Golden Hour on the hero shot only — a warmer,
    // stronger sun and a touch more exposure so the plane glows against the
    // cloud sea. Chase/cockpit rendering is untouched.
    renderer.toneMappingExposure = titleView ? 1.28 : 1.12;
    sun.intensity = titleView ? 3.6 : 2.8;

    // Goals follow the current mission.
    const ringStates = mission.id === 'rings' ? mission.rings.map((r) => (r.passed ? '1' : '0')).join('') : '';
    if (mission !== lastMission || ringStates !== lastRingStates) {
      rebuildGoals(mission);
      lastMission = mission;
      lastRingStates = ringStates;
    }

    // Clouds drift west to east.
    for (const cloud of clouds) {
      cloud.group.position.x = cloud.baseX + time * cloud.drift * 0.12;
    }

    // Birds on their loops, wings flapping.
    for (const bird of birds) {
      const { flock } = bird;
      const a = bird.a0 + time * flock.speed;
      const x = flock.cx + Math.cos(a) * flock.r;
      const z = flock.cz + Math.sin(a) * flock.r;
      const y = flock.cy + bird.bob * Math.sin(time * 0.3 + bird.a0);
      bird.group.position.set(x, y, z);
      bird.group.rotation.y = -a;
      const flap = Math.sin(time * bird.flap + bird.a0) * 0.55;
      bird.wingL.rotation.z = 0.25 + flap;
      bird.wingR.rotation.z = -0.25 - flap;
    }

    // Rings pulse; stars spin.
    if (ringGroup) {
      for (const mesh of ringGroup.children) {
        const ring = mesh.userData.ring;
        const pulse = 1 + Math.sin(time * 3 + ring.index) * 0.04;
        mesh.scale.setScalar(pulse);
      }
    }
    if (starGroup) {
      for (const mesh of starGroup.children) {
        mesh.rotation.y = time * 0.8;
      }
    }

    // The aircraft (visual model rides 1.9 m above the physics origin).
    planeGroup.position.set(plane.x, plane.y + PLANE_LIFT, plane.z);
    planeGroup.rotation.set(-plane.pitch, plane.heading, -plane.bank, 'YXZ');
    // Title (hero) shot only: park the prop — one blade straight up,
    // smaller and paler, so it never reads as a black starburst against the
    // bright cloud sea. The title camera looks straight at the nose, which
    // is why the spinning dark prop dominated 1-start. Chase views keep
    // the spinning prop untouched (thin X from behind).
    if (titleView) {
      propGroup.rotation.z = 0;
      propGroup.scale.setScalar(0.72);
      propMat.color.setHex(0xb0b0b0);
    } else {
      propGroup.rotation.z = plane.propAngle;
      propGroup.scale.setScalar(1);
      propMat.color.setHex(0x8f8f8f);
    }
    gearGroup.visible = plane.gearDown;
    strobe.visible = Math.floor(time * 1.4) % 2 === 0;

    // The sun's shadow frustum follows the aircraft.
    sun.position.set(plane.x + sunDir.x * 900, plane.y + sunDir.y * 900 + 120, plane.z + sunDir.z * 900);
    sun.target.position.set(plane.x, plane.y, plane.z);
    sun.target.updateMatrixWorld();

    // Camera.
    const cam = makeCamera(plane, titleView, cockpitView);
    camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    camera.lookAt(cam.look.x, cam.look.y, cam.look.z);
    dash.visible = cockpitView;

    renderer.render(scene, camera);
    updateHUD(state, W, H, time);
  }

  function resize() {
    sizeW = 0;
    sizeH = 0;
  }

  return {
    drawFrame,
    resize,
    setCockpit(v) { cockpit = v; },
    get cockpit() { return cockpit; },
  };
}
