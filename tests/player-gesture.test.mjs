import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('a CD tap returns, while dragging, tapping the player body and cancelled gestures do not', () => {
  const source = readFileSync(new URL('../src/components/cd-case/CaseStage.js', import.meta.url), 'utf8');
  const handlers = source.slice(source.indexOf('  const onMove ='), source.indexOf("  container.addEventListener('pointermove'"));
  const st = { player: true, journey: 3.4 };
  const grab = { active: false, x: 0, y: 0, moved: 0 };
  let returned = 0;
  let opened = 0;
  const controls = [];
  const context = { st, grab, item: {}, pointer: {},
    container: { style: {}, setPointerCapture() {}, hasPointerCapture: () => false },
    toNdc: (event) => [event.clientX, event.clientY], caseAt: () => true, discAt: (x) => x < 60,
    controlAt: (x) => x >= 260 ? 'eject' : x >= 200 ? 'play' : undefined,
    onControl: (action) => controls.push(action),
    performance: { now: () => 1000 }, GRAB_RATE: .008, GRAB_YAW: .9, GRAB_TILT: .45, TAP_SLOP: 6,
    clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
    onReturn: () => returned++, toggleOpen: () => opened++,
  };
  runInNewContext(`${handlers}\nthis.down = onDown; this.move = onMove; this.up = onUp;`, context);
  const event = (x, type = 'pointerup') => ({ clientX: x, clientY: 0, button: 0, pointerId: 1, type });
  context.down(event(0)); context.up(event(0));
  assert.equal(returned, 1);
  context.down(event(0)); context.move(event(20)); context.up(event(20));
  assert.equal(returned, 1, 'dragging the CD does not put it away');
  assert.ok(grab.y > 0, 'dragging rotates the player');
  context.down(event(100)); context.up(event(100));
  assert.equal(returned, 1, 'tapping the shell does not put the CD away');
  context.down(event(0)); context.up(event(0, 'pointercancel'));
  assert.equal(returned, 1);
  context.down(event(200));
  const controlAt = context.controlAt;
  context.controlAt = () => undefined;
  context.up(event(200));
  context.controlAt = controlAt;
  assert.deepEqual(controls, ['play'], 'the swaying player cannot move a pressed button out of its own tap');
  context.down(event(200)); context.move(event(220)); context.up(event(220));
  assert.deepEqual(controls, ['play'], 'dragging a control does not activate it');
  context.down(event(260)); context.up(event(260));
  assert.deepEqual(controls, ['play', 'eject']);
  st.player = false; st.journey = 1;
  context.down(event(0));
  assert.equal(grab.active, false, 'the transfer animation cannot be grabbed');
  st.journey = 0;
  context.down(event(0)); context.up(event(0));
  assert.equal(opened, 1, 'the case still opens on tap');
});


test('the front panel has exactly six controls, three on either side of the display', () => {
  const source = readFileSync(new URL('../src/components/cd-case/CaseStage.js', import.meta.url), 'utf8');
  const declaration = source.match(/const PLAYER_BUTTONS = [\s\S]*?;/)[0];
  const buttons = runInNewContext(`${declaration} PLAYER_BUTTONS;`);
  assert.equal(buttons.length, 6);
  assert.equal(buttons.filter(([x]) => x < 0).length, 3);
  assert.equal(buttons.filter(([x]) => x > 0).length, 3);
  assert.equal(buttons.map(([, action]) => action).join(','), 'power,eject,play,back,next,stop');
  for (let i = 1; i < buttons.length; i++) assert.ok(buttons[i][0] - buttons[i - 1][0] > 10.4, 'button hit areas do not overlap');
});
