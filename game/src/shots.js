// Shot & test autopilot: drives the plane toward coins/rings and away from
// obstacles, so ?shot= renders and ?test= play-tests headlessly.
// URL: ?shot=start|play|rings|end&seed=N  or  ?test=SECONDS&seed=N

export function getShotParams() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  const test = q.get('test');
  const seed = parseInt(q.get('seed') || '1', 10) || 1;
  if (test !== null) return { mode: 'test', seconds: parseFloat(test) || 30, seed };
  if (shot) return { mode: 'shot', shot, seed };
  return { mode: 'normal', seed: (Math.random() * 1e9) | 0 };
}

// The pilot looks at the world objects ahead and picks a target lane/height.
export function createPilot() {
  return {
    // Returns {x, y, turbo} in -1..1, given the game snapshot.
    axes(snap) {
      const { px, py, objects, speed } = snap;
      let tx = px;
      let ty = py;
      let danger = null;
      let bestScore = -1;
      // Prefer the nearest coin/ring ahead.
      for (const o of objects) {
        if (o.z > -60 || o.z < -300) continue;
        if (o.kind === 'coin' || o.kind === 'crystal' || o.kind === 'ring') {
          const score = 100 - Math.abs(o.z + 60) - Math.abs(o.x - px) * 2 - Math.abs(o.y - py) * 2;
          if (score > bestScore) { bestScore = score; tx = o.x; ty = o.y; }
        }
      }
      // Dodge the nearest obstacle on our path.
      for (const o of objects) {
        if (o.kind !== 'obstacle') continue;
        if (o.z > -55 || o.z < -140) continue;
        const dx = o.x - px;
        const dy = o.y - py;
        const rr = o.r + 2.2;
        if (Math.abs(dx) < rr && Math.abs(dy) < rr) { danger = o; break; }
      }
      if (danger) {
        // Steer to the side with more room, and climb/dive away.
        tx = px + (danger.x >= px ? -9 : 9);
        ty = py + (danger.y >= py ? -7 : 7);
      }
      const x = Math.max(-1, Math.min(1, (tx - px) / 6));
      const y = Math.max(-1, Math.min(1, (ty - py) / 5));
      return { x, y, turbo: speed < 40 };
    },
  };
}
