import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);

test('playback, seeking, end, failure and returning follow the actual audio', async () => {
  const { transformSync } = require('next/dist/build/swc');
  const { code } = transformSync(readFileSync(new URL('../src/components/cd-case/PlayerControls.js', import.meta.url), 'utf8'), {
    filename: 'PlayerControls.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const hooks = [];
  let cursor = 0;
  let tree;
  const ref = {};
  const playback = [];
  let returned = false;
  let blocked = false;
  const audio = { paused: true, duration: 186, currentTime: 0,
    async play() { if (blocked) throw Error('blocked'); this.paused = false; find('audio').props.onPlay(); },
    pause() { this.paused = true; find('audio').props.onPause(); },
  };
  const react = {
    forwardRef: (component) => component,
    useEffect() {},
    useRef(value) { const index = cursor++; return hooks[index] ||= { current: index === 0 ? audio : value }; },
    useState(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = value; return [hooks[index], (next) => { hooks[index] = next; }]; },
    useImperativeHandle(target, make) { target.current = make(); },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(code, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    throw Error(name);
  } });
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  const find = (type) => nodes(tree).find((node) => node.type === type);
  function render(active = true) { cursor = 0; tree = exports.default({ disc: { name: 'Original artwork' }, active, onPlaying: (value) => playback.push(value), onReturn: () => { returned = true; } }, ref); }
  render(false);
  assert.equal(nodes(tree).find((node) => node.props?.className === 'cd-disc-return').props.hidden, true);
  await ref.current.toggle();
  assert.equal(audio.paused, true);
  render();
  await ref.current.toggle();
  assert.equal(playback.at(-1), true);
  find('audio').props.onTimeUpdate({ currentTarget: { currentTime: 12, duration: 186 } });
  render();
  assert.equal(find('input').props.max, 186, 'duration recovers even when metadata arrived before hydration');
  assert.equal(find('input').props.value, 12);
  find('input').props.onChange({ target: { value: '70.5' } });
  assert.equal(audio.currentTime, 70.5);
  await ref.current.toggle();
  assert.equal(playback.at(-1), false);
  blocked = true;
  await ref.current.toggle();
  render();
  assert.ok(nodes(tree).some((node) => node.props?.children === 'The track could not play. Please try again.'));
  find('audio').props.onEnded();
  assert.equal(playback.at(-1), false);
  nodes(tree).find((node) => node.props?.className === 'cd-player-return').props.onClick();
  assert.equal(returned, true);
  assert.equal(audio.paused, true);
  returned = false;
  audio.paused = false;
  const discButton = nodes(tree).find((node) => node.props?.className === 'cd-disc-return');
  assert.equal(discButton.props.hidden, false);
  discButton.props.onClick();
  assert.equal(returned, true, 'tapping the CD uses the same return action as the back button');
  assert.equal(audio.paused, true, 'tapping the CD also stops playback');
  blocked = false;
  ref.current.control('unknown');
  assert.equal(audio.currentTime, 70.5);
  ref.current.control('back');
  assert.equal(audio.currentTime, 60.5);
  ref.current.control('next');
  assert.equal(audio.currentTime, 70.5);
  audio.currentTime = 2; ref.current.control('back');
  assert.equal(audio.currentTime, 0);
  audio.currentTime = 180; ref.current.control('next');
  assert.equal(audio.currentTime, 186);
  await ref.current.control('power');
  assert.equal(audio.paused, false);
  ref.current.control('stop');
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
  returned = false; ref.current.control('eject');
  assert.equal(returned, true);
  assert.equal(exports.formatTime(186), '3:06');
});
