// Keyboard + touch input. One shared state object the game loop reads.
// Arrow keys / WASD steer, Shift turbo, P pause, M mute.

export function createInput() {
  const state = {
    left: false, right: false, up: false, down: false,
    turbo: false, pausePressed: false, mutePressed: false,
    // Touch joystick: -1..1 on each axis (x = steer, y = climb/dive).
    joyX: 0, joyY: 0, joyTurbo: false,
  };
  const keys = new Set();

  const down = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    sync();
    if (e.key === 'p' || e.key === 'P') state.pausePressed = true;
    if (e.key === 'm' || e.key === 'M') state.mutePressed = true;
  };
  const up = (e) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    sync();
  };
  function sync() {
    state.left = keys.has('ArrowLeft') || keys.has('a');
    state.right = keys.has('ArrowRight') || keys.has('d');
    state.up = keys.has('ArrowUp') || keys.has('w');
    state.down = keys.has('ArrowDown') || keys.has('s');
    state.turbo = keys.has('Shift');
  }
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => { keys.clear(); sync(); });

  // Touch joystick: a circle the thumb drags inside #stick-zone.
  const zone = document.getElementById('stick-zone');
  const knob = document.getElementById('stick-knob');
  let touchId = null;
  function zoneCenter() {
    const r = zone.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2 };
  }
  function moveTouch(t) {
    const c = zoneCenter();
    let dx = (t.clientX - c.x) / c.rad;
    let dy = (t.clientY - c.y) / c.rad;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    state.joyX = dx;
    state.joyY = -dy; // up on screen = climb
    knob.style.transform = `translate(${dx * 34}px, ${-dy * 34}px)`;
  }
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    moveTouch(t);
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === touchId) moveTouch(t);
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) {
        touchId = null;
        state.joyX = 0; state.joyY = 0;
        knob.style.transform = 'translate(0px, 0px)';
      }
    }
  };
  zone.addEventListener('touchend', endTouch);
  zone.addEventListener('touchcancel', endTouch);

  const turboBtn = document.getElementById('btn-turbo');
  turboBtn.addEventListener('touchstart', (e) => { e.preventDefault(); state.joyTurbo = true; }, { passive: false });
  turboBtn.addEventListener('touchend', () => { state.joyTurbo = false; });
  turboBtn.addEventListener('touchcancel', () => { state.joyTurbo = false; });

  return {
    state,
    consumePause() {
      const p = state.pausePressed;
      state.pausePressed = false;
      return p;
    },
    consumeMute() {
      const m = state.mutePressed;
      state.mutePressed = false;
      return m;
    },
    // Combined axes: keyboard wins, joystick adds.
    axes() {
      const x = (state.right ? 1 : 0) - (state.left ? 1 : 0) + state.joyX;
      const y = (state.up ? 1 : 0) - (state.down ? 1 : 0) + state.joyY;
      return {
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
        turbo: state.turbo || state.joyTurbo,
      };
    },
  };
}
