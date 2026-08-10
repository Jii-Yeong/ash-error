type Point = {
  x: number;
  y: number;
};

export const getLaserMuzzlePosition = (
  origin: Point,
  facingLeft: boolean,
  forwardOffset: number,
  verticalOffset: number,
): Point => ({
  x: origin.x + (facingLeft ? -forwardOffset : forwardOffset),
  y: origin.y + verticalOffset,
});

export const getRotatedLaserMuzzlePosition = (
  origin: Point,
  angle: number,
  distance: number,
): Point => ({
  x: origin.x + Math.cos(angle) * distance,
  y: origin.y + Math.sin(angle) * distance,
});

/**
 * Facing, muzzle and aim angle for one shot, derived together.
 *
 * These three cannot be decided separately. Facing places the muzzle, the
 * muzzle is what the angle is measured from, and re-deriving facing from that
 * angle closes a loop: when the target stands between the body centre and the
 * muzzle — closer than `forwardOffset` — the angle points back across the boss
 * and flips the facing that produced it, which moves the muzzle to the far side
 * and leaves the beam pointing away from the target.
 *
 * So facing is fixed here from the target's side of the *body*, and everything
 * else follows from it. The caller must not recompute facing from the angle.
 */
export const getLaserAim = (
  origin: Point,
  target: Point,
  forwardOffset: number,
  verticalOffset: number,
) => {
  const facingLeft = target.x < origin.x;
  const muzzle = getLaserMuzzlePosition(
    origin,
    facingLeft,
    forwardOffset,
    verticalOffset,
  );

  return {
    facingLeft,
    muzzle,
    // Measured from the muzzle, so the beam that is drawn from the muzzle is
    // the beam that reaches the target — including point blank, where it
    // sweeps back over the boss.
    angle: Math.atan2(target.y - muzzle.y, target.x - muzzle.x),
  };
};

export const isPointInsideLaser = (
  start: Point,
  angle: number,
  range: number,
  width: number,
  point: Point,
  pointRadius = 0,
) => {
  const endX = start.x + Math.cos(angle) * range;
  const endY = start.y + Math.sin(angle) * range;
  const segmentX = endX - start.x;
  const segmentY = endY - start.y;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;

  if (segmentLengthSquared === 0) {
    return false;
  }

  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segmentX +
        (point.y - start.y) * segmentY) /
        segmentLengthSquared,
    ),
  );
  const nearestX = start.x + segmentX * projection;
  const nearestY = start.y + segmentY * projection;
  const hitRadius = width / 2 + pointRadius;

  return (
    (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2 <= hitRadius ** 2
  );
};
