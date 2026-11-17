import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyPose, JOURNEY_DURATION } from '../src/components/cd-case/journey.mjs';

test('the lid opens before the disc lifts, then the player receives the disc', () => {
  assert.deepEqual(journeyPose(0), { hinge: 0, lift: 0, transfer: 0, exit: 0, player: 0 });
  assert.equal(journeyPose(1).lift, 0);
  assert.ok(journeyPose(1.85).hinge === 1 && journeyPose(1.85).lift > 0);
  assert.equal(journeyPose(1.85).transfer, 0);
  assert.deepEqual(journeyPose(JOURNEY_DURATION), { hinge: 1, lift: 1, transfer: 1, exit: 1, player: 1 });
  assert.equal(journeyPose(2.85).player, 1, 'the separate player arrives before the disc lands');
  assert.ok(journeyPose(2.85).transfer < 1);
  let previous = journeyPose(0);
  for (let t = 0.01; t <= JOURNEY_DURATION; t += 0.01) {
    const next = journeyPose(t);
    for (const key of Object.keys(next)) {
      assert.ok(next[key] >= previous[key] && next[key] <= 1);
      assert.ok(next[key] - previous[key] < .02, `${key} moves continuously`);
    }
    previous = next;
  }
});
