// Keyboard and mouse input: one object the game loop reads each frame, plus
// the one-off key presses (mission pick, pause, restart) the screens consume.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys hit since the last consume()
  const input = {
    keys,
    pressed,
    mouse: { x: 0, y: 0, down: false, clicked: false },
    // Continuous control, -1..1: pitch (up/down), bank (left/right), throttle.
    control() {
      const pitch = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0)
        - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
      const bank = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0)
        - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const throttle = (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyE') ? 1 : 0)
        - (keys.has('ControlLeft') || keys.has('KeyQ') ? 1 : 0);
      // Mouse steering: holding the mouse steers toward the pointer, like a yoke.
      let mousePitch = 0;
      let mouseBank = 0;
      if (input.mouse.down) {
        const rect = canvas.getBoundingClientRect();
        const nx = (input.mouse.x - rect.left) / rect.width - 0.5;
        const ny = (input.mouse.y - rect.top) / rect.height - 0.5;
        mouseBank = Math.max(-1, Math.min(1, nx * 2.4));
        mousePitch = Math.max(-1, Math.min(1, -ny * 2.2));
      }
      return {
        pitch: Math.max(-1, Math.min(1, pitch + mousePitch)),
        bank: Math.max(-1, Math.min(1, bank + mouseBank)),
        throttle,
      };
    },
    // True once for a key pressed since the last call.
    consume(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    attach() {
      window.addEventListener('keydown', (event) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
          event.preventDefault();
        }
        if (!event.repeat) pressed.add(event.code);
        keys.add(event.code);
      });
      window.addEventListener('keyup', (event) => keys.delete(event.code));
      window.addEventListener('blur', () => keys.clear());
      canvas.addEventListener('pointerdown', (event) => {
        input.mouse.down = true;
        input.mouse.x = event.clientX;
        input.mouse.y = event.clientY;
      });
      window.addEventListener('pointermove', (event) => {
        input.mouse.x = event.clientX;
        input.mouse.y = event.clientY;
      });
      window.addEventListener('pointerup', (event) => {
        input.mouse.down = false;
        input.mouse.clicked = true;
        input.mouse.x = event.clientX;
        input.mouse.y = event.clientY;
      });
    },
  };
  return input;
}
