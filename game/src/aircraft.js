// Plane models built from Three.js primitives — one builder per kind.
// Returns a THREE.Group whose nose points toward -Z (direction of flight).

import * as THREE from 'three';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5, ...opts });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  return m;
}

function cone(r, h, color, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  m.position.set(x, y, z);
  return m;
}

function sphere(r, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat(color));
  m.position.set(x, y, z);
  return m;
}

// Shared airframe: fuselage + main wing + tail. `cfg` carries colors.
function airframe(color, accent, long = false) {
  const g = new THREE.Group();
  const body = cyl(0.55, 0.42, long ? 4.6 : 3.6, color, 0, 0, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = cone(0.55, 1.1, accent, 0, 0, long ? -2.85 : -2.35);
  nose.rotation.x = -Math.PI / 2;
  g.add(nose);
  const tail = cone(0.42, 0.9, color, 0, 0, long ? 2.7 : 2.2);
  tail.rotation.x = Math.PI / 2;
  g.add(tail);
  const wing = box(6.4, 0.14, 1.5, accent, 0, -0.05, 0.1);
  g.add(wing);
  const hStab = box(2.4, 0.1, 0.9, accent, 0, 0.15, long ? 2.45 : 1.95);
  g.add(hStab);
  const fin = box(0.12, 1.0, 0.9, accent, 0, 0.55, long ? 2.45 : 1.95);
  g.add(fin);
  const canopy = sphere(0.42, 0x1c2f4a, 0, 0.42, -0.9);
  canopy.scale.set(1, 0.7, 1.6);
  g.add(canopy);
  return g;
}

function addProp(g, color) {
  const hub = sphere(0.22, color, 0, 0, -3.0);
  g.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.14, 1.5, 0.06);
  const blade = new THREE.Mesh(bladeGeo, mat(0x222222));
  blade.position.set(0, 0, -3.05);
  blade.name = 'prop';
  g.add(blade);
  const blade2 = blade.clone();
  blade2.rotation.z = Math.PI / 2;
  blade2.name = 'prop2';
  g.add(blade2);
}

export function buildPlane(planeDef) {
  const g = new THREE.Group();
  const { color, accent, kind } = planeDef;
  if (kind === 'prop') {
    g.add(airframe(color, accent));
    addProp(g, accent);
  } else if (kind === 'stunt') {
    g.add(airframe(color, accent));
    const topWing = box(5.2, 0.12, 1.1, accent, 0, 0.95, 0.1);
    g.add(topWing);
    const strutL = box(0.1, 0.9, 0.1, color, -1.9, 0.5, 0.1);
    const strutR = box(0.1, 0.9, 0.1, color, 1.9, 0.5, 0.1);
    g.add(strutL, strutR);
    addProp(g, accent);
    // Smoke tips for the stunt plane.
    const tipL = sphere(0.12, 0xffffff, -3.2, -0.05, 0.1);
    const tipR = sphere(0.12, 0xffffff, 3.2, -0.05, 0.1);
    g.add(tipL, tipR);
  } else if (kind === 'jet') {
    g.add(airframe(color, accent, true));
    const intakeL = cyl(0.3, 0.3, 1.2, 0x333344, -0.9, -0.15, -0.6);
    intakeL.rotation.x = Math.PI / 2;
    const intakeR = cyl(0.3, 0.3, 1.2, 0x333344, 0.9, -0.15, -0.6);
    intakeR.rotation.x = Math.PI / 2;
    g.add(intakeL, intakeR);
    const flame = cone(0.28, 1.0, 0xff9a2e, 0, 0, 3.1);
    flame.rotation.x = Math.PI / 2;
    flame.name = 'flame';
    flame.visible = false;
    g.add(flame);
    // Swept wings: narrower, angled back.
    const wing = g.children.find((c) => c.geometry && c.geometry.type === 'BoxGeometry' && c.scale.x === 1);
    void wing;
  } else {
    // future: delta wing, glowing trim, twin tail.
    const body = cyl(0.5, 0.3, 4.2, color, 0, 0, 0);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const nose = cone(0.5, 1.4, accent, 0, 0, -2.8);
    nose.rotation.x = -Math.PI / 2;
    g.add(nose);
    const delta = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 4), mat(color));
    delta.rotation.x = Math.PI / 2;
    delta.rotation.y = Math.PI / 4;
    delta.scale.set(1.4, 1, 0.32);
    delta.position.set(0, 0, 1.1);
    g.add(delta);
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    glow.position.set(0, 0, -2.2);
    g.add(glow);
    const finL = box(0.1, 1.1, 0.8, accent, -0.8, 0.5, 2.3);
    const finR = box(0.1, 1.1, 0.8, accent, 0.8, 0.5, 2.3);
    g.add(finL, finR);
    const flame = cone(0.3, 1.3, 0x37e6c8, 0, 0, 2.9);
    flame.rotation.x = Math.PI / 2;
    flame.name = 'flame';
    flame.visible = false;
    g.add(flame);
    const canopy = sphere(0.36, 0x0a1a2a, 0, 0.4, -0.9);
    canopy.scale.set(1, 0.6, 1.7);
    g.add(canopy);
  }
  g.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; }
  });
  return g;
}
