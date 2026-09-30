import type { Blueprint, Vector3 } from '../core/model';
import type { ControlSignal, StructuralActuator, TensionActuator } from '../core/actuation';
import { validateControlSignal } from '../core/actuation';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';
import type { EnergyRuntime } from './EnergyRuntime';

interface Output {
  readonly actuator: StructuralActuator;
  readonly output: number;
  /** Signed physical velocity along the output axis; tension uses contraction speed. */
  readonly speed: number;
  readonly direction?: Vector3;
  readonly fromPoint?: Vector3;
  readonly toPoint?: Vector3;
}

function dot(a: Vector3, b: Vector3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

/** One ControlSignal → physical-output path for every actuator kind. */
export class ActuatorRuntime {
  private readonly lastOutput = new Map<string, number>();

  constructor(
    private readonly blueprint: Blueprint,
    private readonly physics: PhysicsAdapter,
    private readonly body: PhysicsBody,
    private readonly energy: EnergyRuntime,
  ) {}

  step(signals: readonly ControlSignal[], seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Actuator step must be positive and finite');
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

    const outputs = actuators.map((actuator): Output => {
      // Tension is contraction only. Negative input releases toward zero; it never pushes.
      const signal = commands.get(actuator.id) ?? 0;
      const target = (actuator.kind === 'tension' ? Math.max(0, signal) : signal) * actuator.maxOutput;
      const previous = this.lastOutput.get(actuator.id) ?? 0;
      const response = actuator.responseTimeSeconds;
      const output = response === undefined ? target : previous + (target - previous) * seconds / (response + seconds);
      this.lastOutput.set(actuator.id, output);
      if (actuator.kind !== 'tension') {
        const speed = actuator.axis === undefined
          ? this.physics.readJointVelocity(this.body, actuator.connectionId)
          : this.physics.readJointVelocity(this.body, actuator.connectionId, actuator.axis);
        return {
          actuator,
          output,
          speed,
        };
      }
      return this.tensionOutput(actuator, output);
    });

    // Positive mechanical work only. Joint velocity is signed; tension speed
    // is positive only while the attachment span contracts.
    const demandedWatts = outputs.reduce((sum, entry) => sum + Math.max(0, entry.output * entry.speed), 0);
    const powerScale = this.energy.allocate(demandedWatts, seconds);
    for (const entry of outputs) {
      const { actuator, output } = entry;
      if (actuator.kind !== 'tension') {
        if (actuator.axis === undefined) {
          this.physics.applyJointOutput(this.body, actuator.connectionId, output * powerScale);
        } else {
          this.physics.applyJointOutput(this.body, actuator.connectionId, output * powerScale, actuator.axis);
        }
        continue;
      }
      if (!entry.direction || !entry.fromPoint || !entry.toPoint || output <= 0 || powerScale === 0) continue;
      const force = {
        x: entry.direction.x * output * powerScale,
        y: entry.direction.y * output * powerScale,
        z: entry.direction.z * output * powerScale,
      };
      this.physics.applyForceAtPoint(this.body.partHandles.get(actuator.fromPartId)!, force, entry.fromPoint);
      this.physics.applyForceAtPoint(this.body.partHandles.get(actuator.toPartId)!,
        { x: -force.x, y: -force.y, z: -force.z }, entry.toPoint);
    }
  }

  private tensionOutput(actuator: TensionActuator, output: number): Output {
    const fromHandle = this.body.partHandles.get(actuator.fromPartId);
    const toHandle = this.body.partHandles.get(actuator.toPartId);
    if (fromHandle === undefined || toHandle === undefined) return { actuator, output, speed: 0 };
    const fromPoint = this.physics.readWorldPoint(fromHandle, actuator.fromAttachment);
    const toPoint = this.physics.readWorldPoint(toHandle, actuator.toAttachment);
    const dx = toPoint.x - fromPoint.x;
    const dy = toPoint.y - fromPoint.y;
    const dz = toPoint.z - fromPoint.z;
    const distance = Math.hypot(dx, dy, dz);
    // At coincident or near-coincident points there is no defined pull axis.
    if (distance < 1e-6) return { actuator, output, speed: 0 };
    const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
    const fromVelocity = this.physics.readPointVelocity(fromHandle, actuator.fromAttachment);
    const toVelocity = this.physics.readPointVelocity(toHandle, actuator.toAttachment);
    const relative = { x: toVelocity.x - fromVelocity.x, y: toVelocity.y - fromVelocity.y, z: toVelocity.z - fromVelocity.z };
    const speed = Math.max(0, -dot(relative, direction));
    return { actuator, output, speed, direction, fromPoint, toPoint };
  }
}
