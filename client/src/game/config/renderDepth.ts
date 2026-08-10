/**
 * The draw order of everything stacked on the player.
 *
 * These used to be bare numbers written at each call site, and the ordering
 * that resulted was accidental: rounds and the player body were both on 8, so
 * which one covered the other came down to creation order, and shot traces sat
 * on 9 alongside the weapon — meaning the rail rifle's 190px trace was drawn
 * over the gun that fired it.
 *
 * Fractions are deliberate. The surrounding scene numbers its layers in whole
 * steps and this stack has to slot between two of them without renumbering
 * anything else.
 */
/**
 * How the rig mirrors itself when the player turns around.
 *
 * Not `setFlipY`, and the difference is not cosmetic. Phaser's flip keeps the
 * sprite's bounding box where it is and mirrors the pixels inside it:
 *
 *   if (flipY) { y += -frame.realHeight + displayOriginY * 2 }
 *
 * That is a reflection about the box's centre, not about the origin. The two
 * only agree when the origin is centred, and none of the rig's are — so the
 * anchor point itself moves by `2 * (originY - 0.5) * height` the moment the
 * player faces left. The weapon's grip jumped 4px, the far arm's elbow 7px, and
 * the trigger arm's shoulder 0.7px, which is exactly why that one looked fine
 * while the other two did not.
 *
 * A negative scale is the same reflection without the box correction, so the
 * origin stays put and the mirror is true.
 */
export const mirrorScaleY = (mirrored: boolean) => (mirrored ? -1 : 1);

export const PLAYER_STACK_DEPTH = {
  /** 플레이어 뒤에 표시되는 장식 효과. */
  halo: 7.25,
  /**
   * The support arm — under the torso, because it is the far one.
   *
   * It used to sit above the body at 8.5, and the whole limb showed: a lit
   * forearm laid flat across the chest, elbow and all. A far arm is behind the
   * ribs, so the only part of it that should be visible is what reaches past
   * the near edge. Under the body that falls out for free, and it is also what
   * makes burying the elbow work — the buried end is meant to be hidden, not
   * drawn over the thing hiding it.
   */
  backArm: 7.5,
  /** The character. */
  body: 8,
  /** Rounds in flight: over the body, under everything the player holds. */
  projectile: 8.2,
  /** Fading streaks left by a shot. Same reason, and they last longer. */
  shotTrace: 8.3,
  /** The weapon. */
  weapon: 9,
  /**
   * The trigger arm, and the only thing over the weapon: the near hand wraps
   * the grip from the camera's side, so the gun passes behind it.
   */
  frontArm: 9.5,
} as const;
