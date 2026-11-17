export const JOURNEY_DURATION = 3.4;

const ease = (time, start, end) => {
  const t = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export function journeyPose(time) {
  return {
    hinge: ease(time, 0, 1.15),
    lift: ease(time, 1.05, 1.95),
    transfer: ease(time, 1.85, 3.25),
    exit: ease(time, 2, 3.4),
    player: ease(time, 1.95, 2.85),
  };
}
