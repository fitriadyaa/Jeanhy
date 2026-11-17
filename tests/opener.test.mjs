import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../src/pages/index.js', import.meta.url), 'utf8');
const sticker = readFileSync(new URL('../public/holographic-sticker.html', import.meta.url), 'utf8');

test('sticker precedes a scrollable CD case without visible guidance', () => {
  assert.ok(page.indexOf('src="/holographic-sticker.html"') < page.indexOf('id="cd-case"'));
  assert.doesNotMatch(page, /Scroll to listen/);
  assert.doesNotMatch(sticker, /Drag to tilt · Pull an edge to peel/);
  assert.match(page, /\.cd \{[^}]*position: relative;[^}]*height: 100svh;/);
  assert.match(sticker, /touch-action:pan-y pinch-zoom/);
  assert.match(page, /touch-action: pan-y pinch-zoom/);
  assert.match(page, /viewport-fit=cover/);
  assert.match(sticker, /canvas\.addEventListener\('pointerdown'/);
});

test('autumn leaves stay decorative behind the sticker and respect mobile and reduced motion', () => {
  assert.equal((sticker.match(/class="autumn-leaf"/g) || []).length, 7);
  assert.match(sticker, /class="autumn-leaves" aria-hidden="true"/);
  assert.match(sticker, /\.autumn-leaves\{[^}]*pointer-events:none/);
  assert.match(sticker, /alpha:true/);
  assert.match(sticker, /renderer\.setClearColor\(0xffffff,0\)/);
  assert.match(sticker, /prefers-reduced-motion:reduce\)\{\.autumn-leaves\{display:none/);
  assert.match(sticker, /nth-child\(n\+5\)\{display:none/);
  const leaf = readFileSync(new URL('../public/autumn-leaf.svg', import.meta.url), 'utf8');
  assert.match(leaf, /linearGradient id="foil"/);
});

test('birthday marquee loops continuously and reacts to scrolling with reduced-motion support', () => {
  assert.match(page, /\['HAPPY BIRTHDAY', 'OUR AUTUMN GIRL', 'OUR GUITAR HERO'\]/);
  assert.match(page, /animation: birthday-drift 24s linear infinite/);
  assert.match(page, /animation-timeline: --birthday/);
  assert.match(page, /\.birthday-scroll, \.birthday-track \{ animation: none; transform: none; \}/);
  assert.match(page, /animation-direction: reverse/);
  assert.match(page, /position: sticky/);
});

test('mobile player reserves space for controls in portrait and short landscape', () => {
  const controls = readFileSync(new URL('../src/components/cd-case/PlayerControls.js', import.meta.url), 'utf8');
  assert.match(page, /\.birthday-scroll \{ width: 100%; min-width: 0;/);
  assert.match(page, /\.cd\[data-player\] \.cd-stage \{ bottom: calc\(200px \+ env\(safe-area-inset-bottom\)\);/);
  for (const source of [page, controls]) {
    assert.match(source, /@media \(max-height: 500px\) and \(min-width: 480px\)/);
  }
  assert.match(controls, /max-width: calc\(100% - 32px\)/);
  assert.match(controls, /right: max\(16px, env\(safe-area-inset-right\)\); transform: translateY\(-50%\); width: 268px;/);
});

test('foil follows pointer, clamps outside coordinates, and respects reduced motion', () => {
  const properties = {};
  let reduced = false;
  const context = {
    window: { matchMedia: () => ({ matches: reduced }) },
    foilRef: { current: {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
      style: { setProperty: (key, value) => { properties[key] = value; } },
    } },
  };
  const handler = page.slice(page.indexOf('  function moveFoil('), page.indexOf('  function resetFoil('));
  runInNewContext(`${handler}; moveFoil({ clientX: 110, clientY: 70 });`, context);
  assert.equal(properties['--foil-x'], '50%');
  assert.equal(properties['--foil-y'], '50%');
  runInNewContext('moveFoil({ clientX: -100, clientY: 500 });', context);
  assert.equal(properties['--foil-x'], '0%');
  assert.equal(properties['--foil-y'], '100%');
  reduced = true;
  runInNewContext('moveFoil({ clientX: 110, clientY: 70 });', context);
  assert.equal(properties['--foil-x'], '0%');
});
