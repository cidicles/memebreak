export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouseDown = false;
    this.mousePressed = false;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.sensitivity = 0.0022;
    this.enabled = false;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && (e.code === 'Space' || e.code === 'Tab')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || !document.pointerLockElement) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.mouseDown = true;
      this.mousePressed = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    addEventListener(
      'wheel',
      (e) => {
        if (this.enabled) this.wheel += e.deltaY;
      },
      { passive: true },
    );
  }

  down(code) {
    return this.enabled && this.keys.has(code);
  }

  pressed(code) {
    return this.enabled && this.pressedKeys.has(code);
  }

  endFrame() {
    this.pressedKeys.clear();
    this.mousePressed = false;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
