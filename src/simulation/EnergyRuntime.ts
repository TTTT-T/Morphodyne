import { validateEnergySourceSpec, type EnergySourceSpec } from '../core/actuation';

export interface EnergyState {
  readonly capacityJ: number;
  readonly remainingEnergyJ: number;
  readonly consumedEnergyJ: number;
  readonly maxPowerWatts: number;
  readonly efficiency: number;
  /** Mechanical power available during the most recent fixed step. */
  readonly stepPowerLimitWatts: number;
  readonly stepMechanicalPowerWatts: number;
  readonly stepEnergyDrawJ: number;
}

/** Owns finite stored energy, one shared step budget, and consumption accounting. */
export class EnergyRuntime {
  private readonly spec: EnergySourceSpec;
  private remainingJ: number;
  private consumedJ = 0;
  private powerLimitWatts = 0;
  private mechanicalPowerWatts = 0;
  private energyDrawJ = 0;

  constructor(spec: EnergySourceSpec) {
    const errors = validateEnergySourceSpec(spec);
    if (errors.length) throw new Error(errors.join('; '));
    this.spec = { ...spec };
    this.remainingJ = spec.initialEnergyJ ?? spec.capacityJ;
  }

  get state(): EnergyState {
    return {
      capacityJ: this.spec.capacityJ,
      remainingEnergyJ: this.remainingJ,
      consumedEnergyJ: this.consumedJ,
      maxPowerWatts: this.spec.maxPowerWatts,
      efficiency: this.spec.efficiency,
      stepPowerLimitWatts: this.powerLimitWatts,
      stepMechanicalPowerWatts: this.mechanicalPowerWatts,
      stepEnergyDrawJ: this.energyDrawJ,
    };
  }

  /** Allocate positive mechanical power proportionally across one requested actuator batch. */
  allocate(requestedMechanicalPowerWatts: number, seconds: number): number {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Energy step must be positive and finite');
    if (!Number.isFinite(requestedMechanicalPowerWatts) || requestedMechanicalPowerWatts < 0) {
      throw new Error('Requested mechanical power must be finite and nonnegative');
    }
    this.powerLimitWatts = Math.min(this.spec.maxPowerWatts, this.remainingJ * this.spec.efficiency / seconds);
    const scale = this.powerLimitWatts === 0 ? 0
      : requestedMechanicalPowerWatts === 0 ? 1
        : Math.min(1, this.powerLimitWatts / requestedMechanicalPowerWatts);
    this.mechanicalPowerWatts = requestedMechanicalPowerWatts * scale;
    this.energyDrawJ = Math.min(this.remainingJ, this.mechanicalPowerWatts * seconds / this.spec.efficiency);
    this.remainingJ -= this.energyDrawJ;
    this.consumedJ += this.energyDrawJ;
    return scale;
  }
}
