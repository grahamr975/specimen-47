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
    window.addEventListener('mousemove', e => { toView(e); this.padUsed = false; }); // the mouse takes over from a gamepad
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

  // --- Gamepad (the browser's Gamepad API, standard Xbox-style layout) ---------------
  // Polled once per update step and turned into the same inputs as keyboard + mouse:
  //   left stick / d-pad  move (held as virtual WASD)      right stick  aim + fire
  //   RT                  fire                              A / LB       dash (' ')
  //   RB / X              limb ability ('e')                hold Y       cocoon ('f')
  //   Start               pause ('p')                       Back         journal ('j')
  // Menus get 'pad:left' / 'pad:right' / 'pad:a' / 'pad:b' / 'pad:x' presses.
  // Input.pad = { mx, my, ax, ay, fire } while a pad is connected; padUsed = it was
  // the last thing touched (moving the mouse hands control back).
  pad: null, padUsed: false, padKeys: new Set(), padPrev: {},
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let g = null;
    for (const q of pads) if (q && q.connected) { g = q; break; }
    if (!g) { this.pad = null; this.padKeys.clear(); this.padPrev = {}; return; }
    const btn = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
    const stick = (x, y, dead) => { // radial deadzone, rescaled so it starts from 0 at the edge
      const l = Math.hypot(x, y);
      if (l < dead) return [0, 0];
      const k = Math.min(1, (l - dead) / (1 - dead)) / l;
      return [x * k, y * k];
    };
    const [mx, my] = stick(g.axes[0] || 0, g.axes[1] || 0, 0.22), [ax, ay] = stick(g.axes[2] || 0, g.axes[3] || 0, 0.3);
    const now = {
      a: btn(0), b: btn(1), x: btn(2), y: btn(3), lb: btn(4), rb: btn(5), rt: btn(7), back: btn(8), start: btn(9),
      up: btn(12), down: btn(13), left: btn(14), right: btn(15),
      sleft: mx < -0.6, sright: mx > 0.6, // the stick flicks through menus too
    };
    const prev = this.padPrev, edge = k => now[k] && !prev[k], press = k => this.pressed.add(k);
    if (Object.values(now).some(v => v) || mx || my || ax || ay) { if (!this.padUsed) this.padUsed = true; Sfx.init(); }
    if (edge('a') || edge('lb')) press(' ');
    if (edge('a')) press('pad:a');
    if (edge('b')) press('pad:b');
    if (edge('x')) press('pad:x');
    if (edge('rb') || edge('x')) press('e');
    if (edge('start')) press('p');
    if (edge('back')) press('j');
    if (edge('left') || edge('sleft')) press('pad:left');
    if (edge('right') || edge('sright')) press('pad:right');
    this.padKeys.clear();
    for (const [k, on] of [['w', now.up], ['s', now.down], ['a', now.left], ['d', now.right], ['f', now.y]]) if (on) this.padKeys.add(k);
    this.pad = { mx, my, ax, ay, fire: now.rt || Math.hypot(ax, ay) > 0.5 };
    this.padPrev = now;
  },

  down(...ks) { return ks.some(k => this.keys.has(k) || this.padKeys.has(k)); },
  hit(...ks) { return ks.some(k => this.pressed.has(k)); },

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
  },
};
