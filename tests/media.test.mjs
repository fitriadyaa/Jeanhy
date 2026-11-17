import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);

test('the music controls follow YouTube playback and keep an early track selection', () => {
  const { transformSync } = require('next/dist/build/swc');
  const source = readFileSync(new URL('../src/components/cd-case/MediaPlayer.js', import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    filename: 'MediaPlayer.js',
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  const hooks = [];
  let cursor = 0;
  let mount;
  const ref = {};
  const playback = [];
  const host = { replaceChildren() {} };
  let instance;
  class Player {
    constructor(target, options) { this.options = options; this.state = -1; instance = this; }
    cueVideoById(id) { this.video = id; }
    loadVideoById(id) { this.video = id; this.state = 3; this.options.events.onStateChange({ data: 3 }); }
    getPlayerState() { return this.state; }
    playVideo() { this.state = 1; this.options.events.onStateChange({ data: 1 }); }
    pauseVideo() { this.state = 2; this.options.events.onStateChange({ data: 2 }); }
    destroy() { this.destroyed = true; }
  }
  const react = {
    forwardRef: (component) => component,
    useRef(value) { const index = cursor++; return hooks[index] ||= { current: index === 0 ? host : value }; },
    useState(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = value;
      return [hooks[index], (next) => { hooks[index] = next; }]; },
    useEffect(effect) { if (!mount) mount = effect; },
    useImperativeHandle(target, makeHandle) { target.current = makeHandle(); },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(code, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      throw new Error(`Unexpected import: ${name}`);
    },
    window: { YT: { Player }, location: { origin: 'http://localhost:9283' } },
    document: { createElement: () => ({}), getElementById: () => null },
  });
  const render = () => { cursor = 0; return exports.default({ onPlaying: (playing) => playback.push(playing) }, ref); };
  const buttons = (node) => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(buttons);
    return [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)];
  };
  const tree = render();
  const cleanup = mount();
  buttons(tree)[1].props.onClick();
  instance.options.events.onReady();
  assert.equal(instance.video, 'Qu0wtz6Z5RY');
  render();
  ref.current.toggle();
  assert.equal(playback.at(-1), true);
  ref.current.toggle();
  assert.equal(playback.at(-1), false);
  buttons(render())[2].props.onClick();
  assert.equal(instance.video, '1B5FZbg3SOM');
  assert.equal(playback.at(-1), false, 'buffering does not spin the disc');
  instance.playVideo();
  instance.options.events.onError();
  assert.equal(playback.at(-1), false, 'a failed video stops disc rotation');
  instance.options.events.onStateChange({ data: 0 });
  assert.equal(playback.at(-1), false, 'the end of a video stops disc rotation');
  cleanup();
  assert.equal(instance.destroyed, true);
});
