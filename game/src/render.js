// The renderer: a chase camera over the archipelago, the aircraft in frame,
// and the instruments. Everything is canvas 2D, no images, no network — the
// whole look is drawn from the world state each frame.
import { VIEW, PALETTE } from './config.js';
import { clamp, lerp, headingDeg, compassPoint, formatTime } from './random.js';
import { SUN } from './terrain.js';

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function makeCamera(plane, titleView) {
  const h = plane.heading;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  // The title screen pulls the camera back, up and to the side: a three-quarter
  // establishing shot of the strip, the field and the sea, instead of a face
  // full of grass or a runway filling the frame.
  const back = titleView ? 34 : VIEW.cameraBack;
  const camUp = titleView ? 18 : VIEW.cameraUp;
  const ahead = titleView ? 60 : VIEW.cameraLookAhead;
  const side = titleView ? 58 : 0;
  const pos = {
    x: plane.x - fx * back + Math.cos(h) * side,
    y: plane.y + camUp,
    z: plane.z - fz * back - Math.sin(h) * side,
  };
  const look = {
    x: plane.x + fx * (titleView ? 12 : ahead),
    // On the title screen look almost level, so the horizon, the sea and the
    // far islands are in frame instead of a face full of grass.
    y: plane.y + (titleView ? 10 : -2.5),
    z: plane.z + fz * (titleView ? 12 : ahead),
  };
  const fwd = { x: look.x - pos.x, y: look.y - pos.y, z: look.z - pos.z };
  const fl = Math.sqrt(dot(fwd, fwd));
  fwd.x /= fl; fwd.y /= fl; fwd.z /= fl;
  // Right = forward x world-up, normalised; up = right x forward.
  let right = { x: fwd.z, y: 0, z: -fwd.x };
  const rl = Math.sqrt(dot(right, right)) || 1;
  right = { x: right.x / rl, y: 0, z: right.z / rl };
  const up = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };
  return { pos, fwd, right, up };
}

function project(cam, x, y, z, W, H) {
  const dx = x - cam.pos.x;
  const dy = y - cam.pos.y;
  const dz = z - cam.pos.z;
  const cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  if (cz < 1.5) return null;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const s = VIEW.focal / cz;
  return { x: W / 2 + cx * s, y: H / 2 - cy * s, s, cz };
}

function horizonY(cam, W, H) {
  const p = project(cam, cam.pos.x + cam.fwd.x * 10000, cam.pos.y + cam.fwd.y * 10000, cam.pos.z + cam.fwd.z * 10000, W, H);
  return p ? p.y : H * 0.42;
}

function hazeColor(base, amount) {
  // Mix a colour toward the pale sky haze with distance.
  const n = parseInt(base.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const t = clamp(amount, 0, 0.75);
  const mix = (c) => Math.round(lerp(c, 178, t));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function drawSkySea(ctx, cam, W, H, time) {
  const hy = horizonY(cam, W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(0.55, PALETTE.skyMid);
  sky.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, Math.max(0, hy) + 1);
  const sea = ctx.createLinearGradient(0, hy, 0, H);
  sea.addColorStop(0, PALETTE.seaFar);
  sea.addColorStop(1, PALETTE.seaNear);
  ctx.fillStyle = sea;
  ctx.fillRect(0, Math.max(0, hy), W, H - Math.max(0, hy));

  // The low sun in the west, with a glitter path on the water below it.
  const sunDir = {
    x: Math.sin(SUN.azimuth) * Math.cos(SUN.elevation),
    y: Math.sin(SUN.elevation),
    z: Math.cos(SUN.azimuth) * Math.cos(SUN.elevation),
  };
  const sun = project(cam, cam.pos.x + sunDir.x * 9000, cam.pos.y + sunDir.y * 9000, cam.pos.z + sunDir.z * 9000, W, H);
  const sunUp = sun && sun.y < hy + 20;
  if (sunUp) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 150);
    glow.addColorStop(0, PALETTE.sunCore);
    glow.addColorStop(0.25, PALETTE.sunGlow);
    glow.addColorStop(1, 'rgba(255, 196, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 160, sun.y - 160, 320, 320);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fill();
    // Glitter on the sea under the sun.
    ctx.fillStyle = PALETTE.seaGlitter;
    for (let i = 0; i < 26; i += 1) {
      const gy = hy + 8 + ((i * 37 + Math.floor(time * 20)) % 220);
      const gw = 26 + (i % 5) * 14;
      const gx = sun.x + Math.sin(i * 2.7) * 90 * (1 + (gy - hy) / 160);
      ctx.fillRect(gx - gw / 2, gy, gw, 2.5);
    }
  }
}

function drawClouds(ctx, cam, world, W, H, time) {
  const sorted = [...world.clouds].sort((a, b) => {
    const da = (a.x - cam.pos.x) ** 2 + (a.z - cam.pos.z) ** 2;
    const db = (b.x - cam.pos.x) ** 2 + (b.z - cam.pos.z) ** 2;
    return db - da;
  });
  for (const cloud of sorted) {
    const cx = cloud.x + time * cloud.drift * 0.12;
    const p = project(cam, cx, cloud.y, cloud.z, W, H);
    if (!p || p.x < -260 || p.x > W + 260 || p.y < -80 || p.y > H + 80) continue;
    const r = cloud.s * p.s;
    if (r < 2) continue;
    // Flat, soft and translucent: a cloud reads at a glance, never as a blob.
    const alpha = clamp(0.62 - p.cz / 6000, 0.18, 0.55);
    ctx.fillStyle = `rgba(255, 252, 246, ${alpha})`;
    for (const [ox, oy, os] of [[0, 0, 1], [-0.85, 0.14, 0.62], [0.85, 0.12, 0.66], [-0.3, -0.22, 0.7], [0.4, -0.2, 0.62]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * r, p.y + oy * r, r * os, r * os * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawIslands(ctx, cam, world, W, H) {
  const sorted = [...world.islands].sort((a, b) => {
    const da = (a.x - cam.pos.x) ** 2 + (a.z - cam.pos.z) ** 2;
    const db = (b.x - cam.pos.x) ** 2 + (b.z - cam.pos.z) ** 2;
    return db - da;
  });
  for (const island of sorted) {
    let base = project(cam, island.x, 0, island.z, W, H);
    if (!base) {
      // The island's centre is behind the camera but the island is huge and
      // stretches far ahead of it: use the point on its shore nearest the
      // camera instead, or the whole island (and its runway) vanishes and the
      // aircraft looks as if it floats over the sea.
      const dx = cam.pos.x - island.x;
      const dz = cam.pos.z - island.z;
      const d = Math.hypot(dx, dz);
      if (d > island.r + 50) continue;
      const nx = island.x + (dx / d) * island.r * 0.85;
      const nz = island.z + (dz / d) * island.r * 0.85;
      base = project(cam, nx, 0, nz, W, H);
      if (!base) continue;
    }
    const dist = base.cz;
    if (dist > 3800 || base.x < -700 || base.x > W + 700) continue;
    const haze = clamp((dist - 700) / 2600, 0, 0.7);
    const rx = island.r * base.s;
    const ry = rx * 0.36;
    const peak = project(cam, island.x, island.h, island.z, W, H);
    // Sand is only a thin rim at the waterline; the island itself is green.
    ctx.fillStyle = hazeColor(PALETTE.sand, haze);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    // Grass footprint.
    ctx.fillStyle = hazeColor(dist > 1500 ? PALETTE.grassFar : PALETTE.grass, haze);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // The hill: a rounded mound rising from the footprint up to the peak, so
    // the island reads as land with height, not a flat disc. When the peak
    // projects at or below the base (an island right beside the camera) there
    // is no hill to draw — the footprint alone carries it.
    if (peak) {
      const hillCx = (base.x + peak.x) / 2;
      const hillCy = (base.y + peak.y) / 2;
      const hillRy = (base.y - peak.y) * 0.4 + ry * 0.1;
      if (hillRy > 1) {
        ctx.fillStyle = hazeColor(PALETTE.grassNear, haze);
        ctx.beginPath();
        ctx.ellipse(hillCx, hillCy, rx * 0.72, hillRy, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Rocky peak cap on the taller islands.
      if (island.h > 70) {
        ctx.fillStyle = hazeColor(PALETTE.rock, haze);
        ctx.beginPath();
        ctx.moveTo(peak.x - rx * 0.16, peak.y + ry * 0.22);
        ctx.quadraticCurveTo(peak.x, peak.y - ry * 0.12, peak.x + rx * 0.16, peak.y + ry * 0.22);
        ctx.quadraticCurveTo(peak.x, peak.y + ry * 0.42, peak.x - rx * 0.16, peak.y + ry * 0.22);
        ctx.fill();
      }
    }
    // Forest speckle on the near islands.
    if (dist < 1600) {
      ctx.fillStyle = hazeColor(PALETTE.forest, haze);
      for (const palm of island.palmSpots) {
        const pp = project(cam, island.x + palm.dx, 4, island.z + palm.dz, W, H);
        if (!pp || pp.x < -20 || pp.x > W + 20 || pp.y < 0 || pp.y > H + 20) continue;
        const pr = Math.max(1.2, 2.6 * pp.s * palm.s);
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (island.runway) drawRunway(ctx, cam, island, W, H, haze);
  }
}

function drawRunway(ctx, cam, island, W, H, haze) {
  const rw = island.runway;
  const hw = rw.width / 2;
  const hl = rw.length / 2;
  const sin = Math.sin(rw.heading);
  const cos = Math.cos(rw.heading);
  // Draw the strip in segments along its length, so a strip whose near end
  // is behind the camera still draws from the screen edge forward — a whole
  // runway skipped because one corner is behind the camera reads as the
  // aircraft floating over the sea.
  const segments = 8;
  ctx.fillStyle = hazeColor(PALETTE.runway, haze);
  for (let i = 0; i < segments; i += 1) {
    const a0 = -hl + (i * rw.length) / segments;
    const a1 = -hl + ((i + 1) * rw.length) / segments;
    const corners = [
      { a: a0, c: -hw }, { a: a1, c: -hw }, { a: a1, c: hw }, { a: a0, c: hw },
    ].map(({ a, c }) => project(cam, island.x + sin * a + cos * c, 1.2, island.z + cos * a - sin * c, W, H));
    if (corners.some((p) => p === null)) continue;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let j = 1; j < 4; j += 1) ctx.lineTo(corners[j].x, corners[j].y);
    ctx.closePath();
    ctx.fill();
  }
  // Centreline dashes and threshold bars.
  ctx.strokeStyle = hazeColor(PALETTE.runwayEdge, haze);
  for (let d = -hl + 18; d < hl - 10; d += 26) {
    const p1 = project(cam, island.x + sin * d, 1.4, island.z + cos * d, W, H);
    const p2 = project(cam, island.x + sin * (d + 13), 1.4, island.z + cos * (d + 13), W, H);
    if (!p1 || !p2) continue;
    ctx.lineWidth = Math.max(1, 1.6 * p1.s);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  // Island name, floating above the strip when close.
  const label = project(cam, island.x, island.h + 26, island.z, W, H);
  if (label && label.cz < 1200 && label.y > 24) {
    ctx.font = `600 ${Math.max(11, Math.round(13 * Math.min(1.4, label.s * 2)))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${island.name.toUpperCase()} FIELD`, label.x, label.y);
  }
}

function drawRings(ctx, cam, mission, W, H, time) {
  if (mission.id !== 'rings') return;
  const sorted = [...mission.rings].sort((a, b) => {
    const da = (a.x - cam.pos.x) ** 2 + (a.z - cam.pos.z) ** 2;
    const db = (b.x - cam.pos.x) ** 2 + (b.z - cam.pos.z) ** 2;
    return db - da;
  });
  for (const ring of sorted) {
    const p = project(cam, ring.x, ring.y, ring.z, W, H);
    if (!p || p.x < -160 || p.x > W + 160 || p.y < -120 || p.y > H + 120) continue;
    const rx = ring.r * p.s;
    if (rx < 2.5) continue;
    const ry = rx * 0.58;
    // A faint tether down to the sea so the pilot can read the ring's height.
    // Only when the sea below it is actually lower on screen than the ring:
    // a tether that climbs into the sky reads as a mistake.
    const gp = project(cam, ring.x, 0, ring.z, W, H);
    if (gp && !ring.passed && gp.y > p.y + ry) {
      ctx.strokeStyle = 'rgba(255, 201, 60, 0.28)';
      ctx.setLineDash([4, 7]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + ry * 0.4);
      ctx.lineTo(gp.x, gp.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (ring.passed) {
      ctx.strokeStyle = 'rgba(125, 255, 154, 0.55)';
      ctx.lineWidth = Math.max(1.5, rx * 0.06);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    const pulse = 1 + Math.sin(time * 3 + ring.index) * 0.05;
    ctx.strokeStyle = PALETTE.ringGlow;
    ctx.lineWidth = Math.max(3, rx * 0.22);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.ringGold;
    ctx.lineWidth = Math.max(2, rx * 0.09);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - ry * 0.28, rx * 0.16, ry * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (rx > 26) {
      ctx.font = `700 ${Math.round(Math.min(34, rx * 0.5))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff3c4';
      ctx.fillText(String(ring.index + 1), p.x, p.y - ry - 10);
    }
  }
}

function drawStars(ctx, cam, mission, W, H, time) {
  if (mission.id !== 'free') return;
  for (const star of mission.starList) {
    if (star.taken) continue;
    const p = project(cam, star.x, star.y, star.z, W, H);
    if (!p || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
    const r = Math.max(3, star.r * p.s * (1 + Math.sin(time * 4) * 0.12));
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.42;
      const px = p.x + Math.cos(a) * rr;
      const py = p.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}
// The aircraft, drawn in screen space: a built-looking single-prop tourer —
// tapered fuselage with a cheatline, glass canopy, dihedral wings, tail fin
// with a roundel, a spinning propeller disc and wingtip lights.
function drawAircraft(ctx, plane, W, H, time, titleView) {
  const cx = W / 2;
  const cy = (titleView ? H * 0.47 : H * 0.60) + plane.pitch * 90;
  const S = (W / 1280) * (titleView ? 1.12 : 1.0); // scale with the canvas
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank * 0.85);

  // Shadow on the ground when low, so landings read.
  // (Drawn by the caller in world space; here the aircraft itself.)

  // Tailplane.
  ctx.fillStyle = '#b8352c';
  ctx.beginPath();
  ctx.moveTo(-58 * S, -4 * S);
  ctx.lineTo(-92 * S, -16 * S);
  ctx.lineTo(-88 * S, -4 * S);
  ctx.lineTo(-92 * S, 8 * S);
  ctx.lineTo(-58 * S, 6 * S);
  ctx.closePath();
  ctx.fill();
  // Fin with roundel.
  ctx.fillStyle = '#c23b30';
  ctx.beginPath();
  ctx.moveTo(-64 * S, -6 * S);
  ctx.lineTo(-86 * S, -52 * S);
  ctx.lineTo(-66 * S, -52 * S);
  ctx.lineTo(-44 * S, -8 * S);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(-70 * S, -34 * S, 7 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e3a5f';
  ctx.beginPath();
  ctx.arc(-70 * S, -34 * S, 3.5 * S, 0, Math.PI * 2);
  ctx.fill();

  // Far wing (darker, behind the fuselage).
  ctx.fillStyle = '#8e2f26';
  ctx.beginPath();
  ctx.moveTo(6 * S, -10 * S);
  ctx.lineTo(96 * S, -34 * S);
  ctx.lineTo(104 * S, -26 * S);
  ctx.lineTo(18 * S, 2 * S);
  ctx.closePath();
  ctx.fill();

  // Fuselage: cream body, red cheatline, darker belly.
  ctx.fillStyle = '#e8d3a8';
  ctx.beginPath();
  ctx.moveTo(-78 * S, -2 * S);
  ctx.quadraticCurveTo(-40 * S, -20 * S, 30 * S, -16 * S);
  ctx.quadraticCurveTo(72 * S, -12 * S, 92 * S, -2 * S);
  ctx.quadraticCurveTo(72 * S, 10 * S, 30 * S, 13 * S);
  ctx.quadraticCurveTo(-40 * S, 15 * S, -78 * S, 2 * S);
  ctx.closePath();
  ctx.fill();
  // Cheatline.
  ctx.fillStyle = '#c23b30';
  ctx.beginPath();
  ctx.moveTo(-74 * S, -3 * S);
  ctx.quadraticCurveTo(0, -10 * S, 88 * S, -3 * S);
  ctx.lineTo(88 * S, 2 * S);
  ctx.quadraticCurveTo(0, -4 * S, -74 * S, 3 * S);
  ctx.closePath();
  ctx.fill();
  // Canopy glass with a sky highlight.
  const glass = ctx.createLinearGradient(18 * S, -18 * S, 52 * S, -4 * S);
  glass.addColorStop(0, '#9fd4ef');
  glass.addColorStop(0.5, '#3d7ea6');
  glass.addColorStop(1, '#1d4a68');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(14 * S, -14 * S);
  ctx.quadraticCurveTo(30 * S, -26 * S, 54 * S, -14 * S);
  ctx.quadraticCurveTo(56 * S, -6 * S, 44 * S, -5 * S);
  ctx.quadraticCurveTo(24 * S, -8 * S, 14 * S, -14 * S);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(34 * S, -16 * S, 9 * S, 3 * S, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Near wing (bright, in front).
  ctx.fillStyle = '#d84a3c';
  ctx.beginPath();
  ctx.moveTo(2 * S, 2 * S);
  ctx.lineTo(108 * S, 26 * S);
  ctx.lineTo(116 * S, 36 * S);
  ctx.lineTo(14 * S, 14 * S);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a93226';
  ctx.beginPath();
  ctx.moveTo(96 * S, 22 * S);
  ctx.lineTo(116 * S, 36 * S);
  ctx.lineTo(108 * S, 38 * S);
  ctx.lineTo(92 * S, 26 * S);
  ctx.closePath();
  ctx.fill();

  // Propeller: a spinning translucent disc and two blurred blades.
  const propX = 92 * S;
  ctx.fillStyle = 'rgba(40, 40, 40, 0.16)';
  ctx.beginPath();
  ctx.ellipse(propX, -2 * S, 6 * S, 46 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 30, 30, 0.55)';
  ctx.lineWidth = 3 * S;
  const pa = plane.propAngle;
  ctx.beginPath();
  ctx.moveTo(propX - Math.sin(pa) * 44 * S, -2 * S - Math.cos(pa) * 44 * S);
  ctx.lineTo(propX + Math.sin(pa) * 44 * S, -2 * S + Math.cos(pa) * 44 * S);
  ctx.stroke();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.arc(propX, -2 * S, 5 * S, 0, Math.PI * 2);
  ctx.fill();

  // Landing gear when slow or parked.
  if (plane.gearDown) {
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.moveTo(-6 * S, 12 * S);
    ctx.lineTo(-12 * S, 26 * S);
    ctx.moveTo(26 * S, 12 * S);
    ctx.lineTo(30 * S, 26 * S);
    ctx.stroke();
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(-13 * S, 28 * S, 5.5 * S, 0, Math.PI * 2);
    ctx.arc(31 * S, 28 * S, 5.5 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wingtip lights: red left, green right, white strobe blinking.
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath();
  ctx.arc(-92 * S, -8 * S, 2.6 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4dff88';
  ctx.beginPath();
  ctx.arc(112 * S, 32 * S, 2.6 * S, 0, Math.PI * 2);
  ctx.fill();
  if (Math.floor(time * 1.4) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-88 * S, 6 * S, 2.4 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A glass instrument panel: dark glass, cyan text, amber accents.
function glassPanel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudGlass;
  ctx.strokeStyle = 'rgba(140, 220, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function drawHUD(ctx, plane, mission, world, W, H, time) {
  const altFt = Math.round(plane.y * 3.28084);
  const spdKt = Math.round(plane.speed * 1.94384);
  const hdg = Math.round(headingDeg(plane.heading));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Compass tape across the top.
  const tapeY = 34;
  ctx.fillStyle = 'rgba(8, 18, 30, 0.55)';
  ctx.fillRect(0, 0, W, 46);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const degPerPx = 0.22;
  for (let d = -160; d <= 160; d += 5) {
    const deg = Math.round((headingDeg(plane.heading) + d) / 5) * 5;
    const x = W / 2 + (deg - headingDeg(plane.heading)) / degPerPx;
    if (x < -20 || x > W + 20) continue;
    const major = deg % 45 === 0;
    ctx.strokeStyle = major ? PALETTE.hudLine : 'rgba(140,220,255,0.4)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, major ? 22 : 28);
    ctx.lineTo(x, 40);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = PALETTE.hudText;
      ctx.fillText(deg % 90 === 0 ? compassPoint(deg) : String(deg), x, 18);
    }
  }
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 7, 40);
  ctx.lineTo(W / 2 + 7, 40);
  ctx.lineTo(W / 2, 48);
  ctx.closePath();
  ctx.fill();

  // Left cluster: ALT / SPD / HDG.
  glassPanel(ctx, 16, 60, 148, 108);
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(207, 238, 255, 0.7)';
  ctx.textAlign = 'left';
  ctx.fillText('ALTITUDE', 28, 80);
  ctx.fillText('AIRSPEED', 28, 116);
  ctx.fillText('HEADING', 28, 152);
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(`${altFt.toLocaleString('en-US')} ft`, 92, 82);
  ctx.fillText(`${spdKt} kt`, 92, 118);
  ctx.fillText(`${String(hdg).padStart(3, '0')}° ${compassPoint(hdg)}`, 92, 154);
  if (plane.speed < 27 && plane.flying) {
    ctx.fillStyle = PALETTE.hudRed;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(Math.floor(time * 3) % 2 === 0 ? 'STALL!' : '', 28, 196);
  }

  // Top centre: mission objective.
  const target = mission ? { label: mission.objectiveLabel || '' } : null;
  glassPanel(ctx, W / 2 - 210, 60, 420, 44);
  ctx.textAlign = 'center';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText(mission ? mission.name : '', W / 2, 78);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(target ? target.label : '', W / 2, 96);

  // Top right: score and clock.
  glassPanel(ctx, W - 164, 60, 148, 108);
  ctx.textAlign = 'left';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(207, 238, 255, 0.7)';
  ctx.fillText('SCORE', W - 152, 80);
  ctx.fillText('TIME LEFT', W - 152, 116);
  ctx.fillText('PROGRESS', W - 152, 152);
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(String(mission ? mission.score : 0), W - 92, 82);
  ctx.fillStyle = mission && mission.timeLeft < 60 ? PALETTE.hudRed : PALETTE.hudText;
  ctx.fillText(mission ? formatTime(mission.timeLeft) : '--:--', W - 92, 118);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(mission ? mission.progressLabel || '' : '', W - 92, 154);

  // Artificial horizon, bottom left.
  const gx = 92;
  const gy = H - 92;
  const gr = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(gx, gy, gr, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(gx, gy);
  ctx.rotate(-plane.bank);
  ctx.translate(0, plane.pitch * 130);
  ctx.fillStyle = '#2f6fb2';
  ctx.fillRect(-gr - 4, -gr - 130, gr * 2 + 8, gr + 130);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-gr - 4, 0, gr * 2 + 8, gr + 130);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-gr, 0);
  ctx.lineTo(gr, 0);
  ctx.stroke();
  for (const [dy, w] of [[-26, 26], [26, 26], [-52, 16], [52, 16]]) {
    ctx.beginPath();
    ctx.moveTo(-w, dy);
    ctx.lineTo(w, dy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(gx, gy, gr, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol over the horizon.
  ctx.strokeStyle = PALETTE.hudAmber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(gx - 26, gy);
  ctx.lineTo(gx + 26, gy);
  ctx.moveTo(gx, gy - 5);
  ctx.lineTo(gx, gy + 5);
  ctx.stroke();
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(207, 238, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', gx, gy + gr + 16);

  // Fuel and throttle, bottom right.
  const fx = W - 164;
  const fy = H - 128;
  glassPanel(ctx, fx, fy, 148, 112);
  ctx.textAlign = 'left';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(207, 238, 255, 0.7)';
  ctx.fillText('FUEL', fx + 12, fy + 20);
  ctx.fillText('THROTTLE', fx + 12, fy + 56);
  ctx.fillText(plane.gearDown ? 'GEAR DOWN' : 'GEAR UP', fx + 12, fy + 92);
  const fuelW = 124 * clamp(plane.fuel / 100, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(fx + 12, fy + 26, 124, 12);
  ctx.fillStyle = plane.fuel < 20 ? PALETTE.hudRed : plane.fuel < 45 ? PALETTE.hudAmber : PALETTE.hudGreen;
  ctx.fillRect(fx + 12, fy + 26, fuelW, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(fx + 12, fy + 62, 124, 12);
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillRect(fx + 12, fy + 62, 124 * clamp(plane.throttle / 100, 0, 1), 12);
  if (plane.damage > 0) {
    ctx.fillStyle = plane.damage > 60 ? PALETTE.hudRed : PALETTE.hudAmber;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`DAMAGE ${Math.round(plane.damage)}%`, fx + 12, fy + 108);
  }

  // Pull-up warning when low and sinking.
  if (plane.flying && plane.y < 42 && plane.verticalSpeed < -1) {
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = Math.floor(time * 4) % 2 === 0 ? PALETTE.hudRed : 'rgba(255,107,94,0.35)';
    ctx.fillText('PULL UP', W / 2, H * 0.34);
  }
}

function centreMessage(ctx, text, sub, W, H, color) {
  ctx.textAlign = 'center';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillStyle = color || '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 12;
  ctx.fillText(text, W / 2, H * 0.42);
  if (sub) {
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(sub, W / 2, H * 0.42 + 34);
  }
  ctx.shadowBlur = 0;
}

function panel(ctx, W, H, lines) {
  const pw = 620;
  const ph = 110 + lines.length * 30;
  const x = (W - pw) / 2;
  // High enough that the aircraft and the runway stay visible underneath.
  const y = Math.max(110, (H - ph) / 2 - 150);
  ctx.fillStyle = 'rgba(6, 14, 24, 0.82)';
  ctx.strokeStyle = 'rgba(140, 220, 255, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.font = line.big ? '800 34px Georgia, "Times New Roman", serif' : line.head ? '700 17px system-ui, sans-serif' : '600 15px system-ui, sans-serif';
    ctx.fillStyle = line.color || '#dfeeff';
    ctx.fillText(line.text, W / 2, y + (line.big ? 58 : 96 + i * 30));
  });
}

// The whole frame: world, aircraft, HUD, then whichever screen is showing.
export function drawFrame(ctx, state, W, H, time) {
  const { plane, mission, world } = state;
  const titleView = state.screen === 'title';
  const cam = makeCamera(plane, titleView);
  drawSkySea(ctx, cam, W, H, time);
  drawClouds(ctx, cam, world, W, H, time);
  drawIslands(ctx, cam, world, W, H);
  drawRings(ctx, cam, mission, W, H, time);
  drawStars(ctx, cam, mission, W, H, time);

  // The aircraft's shadow on the ground when it is low.
  if (plane.y < 90) {
    const ground = world.groundHeight(plane.x, plane.z);
    const sp = project(cam, plane.x, ground + 1, plane.z, W, H);
    if (sp && sp.cz > 0) {
      const sr = clamp(46 * sp.s * (1 - plane.y / 110), 2, 60);
      ctx.fillStyle = `rgba(10, 20, 30, ${clamp(0.35 * (1 - plane.y / 110), 0.05, 0.35)})`;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sr, sr * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawAircraft(ctx, plane, W, H, time, titleView);

  // Soft vignette so the HUD reads over any sky.
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(4, 10, 18, 0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (state.screen === 'title') {
    drawTitle(ctx, state, W, H);
    return;
  }
  drawHUD(ctx, plane, mission, world, W, H, time);
  if (state.flash && time - state.flash.at < 2.4) {
    centreMessage(ctx, state.flash.text, state.flash.sub, W, H, state.flash.color);
  }
  if (state.screen === 'paused') {
    panel(ctx, W, H, [
      { text: 'PAUSED', big: true },
      { text: 'Press P to keep flying — or R to restart the sortie', head: true },
    ]);
  } else if (state.screen === 'complete') {
    panel(ctx, W, H, [
      { text: 'MISSION COMPLETE', big: true, color: '#7dff9a' },
      { text: state.summaryLine || '', head: true },
      { text: `Final score: ${mission.score}  ·  Press R to fly again`, head: true },
    ]);
  } else if (state.screen === 'crashed') {
    panel(ctx, W, H, [
      { text: 'CRASHED', big: true, color: '#ff6b5e' },
      { text: state.crashReason || 'The aircraft is a write-off.', head: true },
      { text: `Score: ${mission.score}  ·  Press R to try again`, head: true },
    ]);
  } else if (state.screen === 'failed') {
    panel(ctx, W, H, [
      { text: 'SORTIE OVER', big: true, color: '#ffcf5e' },
      { text: state.crashReason || '', head: true },
      { text: `Score: ${mission.score}  ·  Press R to try again`, head: true },
    ]);
  }
}

function drawTitle(ctx, state, W, H) {
  const { missionCards } = state;
  ctx.fillStyle = 'rgba(4, 10, 18, 0.22)';
  ctx.fillRect(0, 0, W, 210);
  ctx.fillStyle = 'rgba(4, 10, 18, 0.45)';
  ctx.fillRect(0, H - 92, W, 92);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff3c4';
  ctx.font = '800 64px Georgia, "Times New Roman", serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 16;
  ctx.fillText('SKY HARBOUR', W / 2, 96);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#cfeeff';
  ctx.font = '600 22px Georgia, "Times New Roman", serif';
  ctx.fillText('— Island Run —', W / 2, 132);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = '#eaf6ff';
  ctx.fillText('Fly the rings, land the runways, mind your fuel. A complete flight game — throttle, turn and landing all matter.', W / 2, 168);

  // Mission cards.
  const cardW = 300;
  const cardH = 150;
  const gap = 26;
  const totalW = cardW * 3 + gap * 2;
  let x = (W - totalW) / 2;
  const y = H - 268;
  missionCards.forEach((card, i) => {
    ctx.fillStyle = 'rgba(8, 18, 30, 0.78)';
    ctx.strokeStyle = state.hoverCard === i ? '#ffcf5e' : 'rgba(140, 220, 255, 0.45)';
    ctx.lineWidth = state.hoverCard === i ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffcf5e';
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillText(`PRESS ${card.key}`, x + cardW / 2, y + 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 26px Georgia, "Times New Roman", serif';
    ctx.fillText(card.name, x + cardW / 2, y + 68);
    ctx.fillStyle = '#cfeeff';
    ctx.font = '600 13.5px system-ui, sans-serif';
    ctx.fillText(card.tag, x + cardW / 2, y + 96);
    ctx.fillStyle = 'rgba(207, 238, 255, 0.65)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`Time limit ${card.timeLimit}  ·  Fuel & damage matter`, x + cardW / 2, y + 122);
    x += cardW + gap;
  });

  ctx.fillStyle = '#dfeeff';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText('Fly: ↑ ↓ pitch · ← → bank & turn · SHIFT throttle up · CTRL throttle down · hold mouse to steer · P pause · R restart', W / 2, H - 58);
  ctx.fillStyle = 'rgba(223, 238, 255, 0.75)';
  ctx.fillText('Tip: climb costs speed, a steep bank sinks — fly the rings clean and land gently for the smooth bonus.', W / 2, H - 32);
}
