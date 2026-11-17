import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);

test('the separate clear player has valid shell geometry and its own wider footprint', () => {
  const { transformSync } = require('next/dist/build/swc');
  const { code } = transformSync(readFileSync(new URL('../src/components/cd-case/caseGeometry.js', import.meta.url), 'utf8'), {
    filename: 'caseGeometry.js', jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
  });
  const exports = {};
  runInNewContext(code, { exports, require });
  const player = exports.playerGeometry();
  player.rods.computeBoundingBox();
  assert.ok(player.rods.boundingBox.min.z <= -25, 'the chassis has the depth of a physical player');
  assert.ok(player.lidRods && player.lidSheets, 'the player has a separate hinged lid');
  for (const geometry of Object.values(player)) {
    const positions = geometry.attributes.position;
    assert.ok(positions.count > 0);
    assert.ok([...positions.array].every(Number.isFinite));
    assert.ok([...geometry.index.array].every((index) => index < positions.count));
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.max.x > exports.HALF, 'the player is a distinct housing, not the case tray');
    geometry.dispose();
  }
});
