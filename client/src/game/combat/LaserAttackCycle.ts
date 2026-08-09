import type { LaserCannonPatternConfig } from '@/game/config/bossConfigTypes';
import {
  getLaserChargeWindow,
  getLaserPatternTuning,
} from '@/game/combat/laserPattern';

export type LaserAttackState = 'repositioning' | 'charging' | 'firing';

export class LaserAttackCycle {
  state: LaserAttackState = 'repositioning';
  private stateEndsAt: number;
  private chargeStartedAt = 0;
  private aimLocksAt = 0;
  private shotsRemaining = 0;

  constructor(
    private readonly pattern: LaserCannonPatternConfig,
    startTime: number,
  ) {
    this.stateEndsAt = startTime + pattern.firstAttackDelay;
  }

  isComplete(time: number) {
    return time >= this.stateEndsAt;
  }

  shouldTrackAim(time: number) {
    return this.state === 'charging' && time < this.aimLocksAt;
  }

  getChargeProgress(time: number) {
    if (this.state !== 'charging') {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        1,
        (time - this.chargeStartedAt) /
          (this.stateEndsAt - this.chargeStartedAt),
      ),
    );
  }

  beginVolley(time: number, enraged: boolean) {
    this.shotsRemaining = getLaserPatternTuning(
      this.pattern,
      enraged,
    ).volleySize;
    this.beginCharge(time, enraged, false);
  }

  beginFiring(time: number) {
    this.state = 'firing';
    this.stateEndsAt = time + this.pattern.fireDuration;
    this.shotsRemaining -= 1;
  }

  cancelCharge(time: number, enraged: boolean) {
    if (this.state !== 'charging') {
      return;
    }

    this.shotsRemaining = 0;
    this.state = 'repositioning';
    this.stateEndsAt =
      time + getLaserPatternTuning(this.pattern, enraged).recoveryDuration;
  }

  finishFiring(time: number, enraged: boolean) {
    if (this.shotsRemaining > 0) {
      this.beginCharge(time, enraged, true);
      return true;
    }

    this.state = 'repositioning';
    this.stateEndsAt =
      time + getLaserPatternTuning(this.pattern, enraged).recoveryDuration;
    return false;
  }

  private beginCharge(
    time: number,
    enraged: boolean,
    followUp: boolean,
  ) {
    const { duration, aimLockDuration } = getLaserChargeWindow(
      this.pattern,
      enraged,
      followUp,
    );

    this.state = 'charging';
    this.chargeStartedAt = time;
    this.stateEndsAt = time + duration;
    this.aimLocksAt = this.stateEndsAt - aimLockDuration;
  }
}
