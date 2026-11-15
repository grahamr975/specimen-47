'use strict';
// Keyboard + mouse state. `down` = held right now, `hit` = pressed this frame.

const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: VIEW_W / 2, y: VIEW_H / 2, down: false, clicked: false, rightDown: false, rightClicked: false },

  init(canvas) {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      Sfx.init();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    const toView = e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * VIEW_W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * VIEW_H;
    };
    window.addEventListener('mousemove', toView);
    canvas.addEventListener('mousedown', e => {
      toView(e);
      if (e.button === 2) { this.mouse.rightDown = true; this.mouse.rightClicked = true; }
      else { this.mouse.down = true; this.mouse.clicked = true; }
      Sfx.init();
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 2) this.mouse.rightDown = false; else this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  down(...ks) { return ks.some(k => this.keys.has(k)); },
  hit(...ks) { return ks.some(k => this.pressed.has(k)); },

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
  },
};
