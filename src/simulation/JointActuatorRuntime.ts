import type { Blueprint } from '../core/model';
import type { ControlSignal, EnergySource } from '../core/actuation';
import { validateControlSignal } from '../core/actuation';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';

/** Converts bounded control signals into physical output at each fixed step. */
export class JointActuatorRuntime {
  private readonly lastOutput = new Map<string, number>();

  constructor(
    private readonly blueprint: Blueprint,
    private readonly physics: PhysicsAdapter,
    private readonly body: PhysicsBody,
    private readonly energy: EnergySource,
  ) {}

  step(signals: readonly ControlSignal[], seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Actuator step must be positive and finite');
    const power = this.energy.availablePowerWatts;
    if (!Number.isFinite(power) || power < 0) throw new Error('Available power must be nonnegative and finite');
    const commands = new Map<string, number>();
    for (const signal of signals) {
      const errors = validateControlSignal(signal);
      if (errors.length) throw new Error(errors.join('; '));
      if (commands.has(signal.actuatorId)) throw new Error(`Duplicate actuator signal: ${signal.actuatorId}`);
      commands.set(signal.actuatorId, signal.value);
    }

    const actuators = this.blueprint.actuators ?? [];
    const known = new Set(actuators.map((actuator) => actuator.id));
    for (const id of commands.keys()) if (!known.has(id)) throw new Error(`Unknown actuator: ${id}`);

    const outputs = actuators.map((actuator) => {
      const target = (commands.get(actuator.id) ?? 0) * actuator.maxOutput;
      const previous = this.lastOutput.get(actuator.id) ?? 0;
      const response = actuator.responseTimeSeconds;
      const output = response === undefined ? target : previous + (target - previous) * seconds / (response + seconds);
      this.lastOutput.set(actuator.id, output);
      return { actuator, output, speed: Math.abs(this.physics.readJointVelocity(this.body, actuator.connectionId)) };
    });

    // Idealized source: a power ceiling, without fuel storage or thermal rules yet.
    const demandedWatts = outputs.reduce((sum, entry) => sum + Math.abs(entry.output) * entry.speed, 0);
    const powerScale = power === 0 ? 0 : demandedWatts > power ? power / demandedWatts : 1;
    for (const { actuator, output } of outputs) {
      this.physics.applyJointOutput(this.body, actuator.connectionId, output * powerScale);
    }
  }
}
