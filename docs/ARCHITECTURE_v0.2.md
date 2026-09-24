# Morphodyne Architecture v0.2 — Structural Load

This document extends [Architecture v0.1](ARCHITECTURE_v0.1.md) for Phase 9. Its world, construction, Agent, and rendering boundaries remain in force.

## Missing v0.1 abstraction

v0.1 Damage accepted only a scalar Part impact impulse. It could not represent a connection carrying weight, sustained pull, or resisted actuator torque. Treating a force sample as a new impulse every tick would falsely damage a structure under ordinary static load.

## Causal path and ownership

`Part / Connection / Actuator → Rapier step → PhysicsAdapter connection load → Core Damage → separation → WorldRuntime component ownership`

- Rapier is authoritative for motion, contact, and physical response. It does not decide structural failure.
- PhysicsAdapter reports per-connection, per-completed-step nonnegative load magnitudes. The initial backend is a documented momentum-balance approximation because Rapier 0.20.0's public `ImpulseJoint` API does not expose solver reaction force or torque.
- Core's existing `applyConnectionLoad` accepts impulse, sustained force, sustained torque, and elapsed time. It owns material and connection thresholds, persistent deformation, fracture, and separation.
- WorldRuntime calls Damage after its fixed physics step and reconciles separated components. UI and fixture Blueprints only supply structure and inspection.
- The same path accepts passive structures, actuated machines without Brain, sensor structures, and Agents. There are no semantic ability or Entity-type switches.

## Units and response

| Quantity | Unit | Meaning |
| --- | --- | --- |
| `impulseNs` | N·s | One-step impact impulse, retained from v0.1 |
| `forceN` | N | Current connection force magnitude during the last physics step |
| `torqueNm` | N·m | Current connection torque magnitude during the last physics step |
| `seconds` | s | Duration of the measured sustained sample |
| `accumulatedOverloadSeconds` | normalized s | Integral of time × excess load ratio; reaches 1 after 1 s at twice yield |

Material and Connection may declare `yieldForceN`, `ultimateForceN`, `yieldTorqueNm`, and `ultimateTorqueNm`. A Connection override takes precedence; otherwise its weaker endpoint material supplies the threshold. Omitted sustained thresholds are unbounded, preserving older Blueprints. A sample below yield adds no damage regardless of tick count. Above yield, the largest force or torque excess ratio accumulates with elapsed time. An ultimate load or an integral of 1 separates the connection. The original impulse threshold and cumulative impulse path remain active in the same Damage state.

The overload integral is a first-order structural proxy, not a fatigue or finite-element model. It requires physically measured load and cannot create failure from a fixture name, mass branch, or actuator command alone.

## Backend approximation boundary

The adapter estimates transmitted load using the rigid bodies' observed momentum change and known applied forces, gravity, and actuator output. Contact state guides which endpoint can provide a clean reaction estimate. The estimate is most reliable for a single load path, such as the two-Part Phase 9 experiments. In multi-connection assemblies, exact per-joint load attribution remains unavailable from the installed public Rapier API. Contact impulse remains a separate impact channel. The approximation must never be interpreted as finite-element stress, internal bending distribution, or a solver-exact joint reaction.

## Phase 10 — Tension Actuator

The original Actuator declaration and runtime accepted only a Connection ID and submitted joint force or torque. It could not express a force applied between two Part-local mounting points. `Blueprint.actuators` now accepts a Joint Actuator (legacy declaration or `kind: 'joint'`) or `kind: 'tension'`. Both consume the same `ControlSignal` and pass through one `ActuatorRuntime` during WorldRuntime's fixed step.

A Tension Actuator names two distinct Parts, a local attachment point on each, `maxOutput` in newtons, and optional `responseTimeSeconds`. Part-local coordinates are metres relative to the Part pose, rotating and translating with that Part. Each step the adapter transforms them to world positions. For separation vector `d = to - from`, the runtime applies `+F d/|d|` at the from point and `-F d/|d|` at the to point. Rapier therefore resolves both linear force and the torque from each physical moment arm. The actuator never sets a joint coordinate, target, torque, or damage state. At separation below `10⁻⁶ m`, the pull direction is undefined and both point forces are zero for that step. The output remains bounded by `maxOutput` at all other separations.

For Tension Actuators, `ControlSignal.value` in `[0, 1]` requests zero through maximum active tension. Values in `[-1, 0)` request zero tension; they never reverse the force. The existing first-order response time ramps force toward the requested value, including release. Joint Actuators retain their existing signed signal meaning and joint output units. A Tension Actuator may span separate structural components within one Entity; control is associated with its `fromPartId` component while both Parts remain live. Its force does not itself redefine structural connectivity.

In Phase 10, the `EnergySource.availablePowerWatts` ceiling was shared across both actuator kinds. For tension, the first mechanical power estimate was `force × max(0, -d(length)/dt)` in watts, where attachment-point velocities come from Rapier. Active shortening requests positive power; stalled tension and lengthening contribute zero positive mechanical work in this idealized model. Phase 11 replaces the infinite source behind that ceiling with finite stored energy.

The PhysicsAdapter owns generic world-point, point-velocity, and point-force operations. It records applied force and moment in the same wrench accounting used by the Phase 9 momentum-balance connection-load estimate. That measured post-step load flows through the existing StructuralDamageRuntime and Core threshold rules. The Phase 9 estimate remains approximate around contacts and multiple joints; Phase 10 does not add a direct actuator-to-damage path or claim exact solver joint reactions. Construction can add/remove either actuator kind; removing a Part removes tension declarations touching it, while removing a Connection removes only Joint Actuators dependent on that Connection.

## Phase 11 — Finite Energy and Shared Power

`EnergySourceSpec` declares finite capacity and optional initial stored energy in joules (`J`), a shared maximum mechanical power in watts (`W = J/s`), and efficiency `0 < η ≤ 1`. It belongs to World spawn composition, not to a semantic Entity type or Blueprint ability. `WorldRuntime` creates one `EnergyRuntime` per supplied Entity and preserves it when Construction reconstructs the physical body. `inspectEnergy` exposes a read-only snapshot of remaining and consumed joules, current step power limit, mechanical power, and step draw. A future Part or device may own a supply and route it to actuators without changing actuator declarations or physical-output APIs; Phase 11 does not implement such an energy network.

For a fixed step of `Δt` seconds, `ActuatorRuntime` samples physical velocities before applying output. Each Joint Actuator requests positive mechanical power `max(0, torque × angular velocity)` for a revolute joint or `max(0, force × linear joint velocity)` for a prismatic joint. Each Tension Actuator requests `tension × max(0, −d(span length)/dt)` from its two attachment-point velocities. Negative work and zero-speed force request zero positive mechanical power. The sum of all Joint and Tension requests from the same Entity enters one allocation, independent of actuator kind or declaration order.

The available mechanical power is `min(maxPowerWatts, remainingEnergyJ × η / Δt)`. When total request exceeds it, all requested outputs receive the same proportional scale. The step records `mechanicalWorkJ = allocatedPositivePowerWatts × Δt` and draws `energyDrawJ = mechanicalWorkJ / η`; remaining energy never falls below zero. An empty store or zero maximum power suppresses active output. The scaled outputs still go through joint torque/force or attachment-point forces, then Rapier, Structural Load, and Damage. Energy cannot set poses, velocities, capability, or damage directly. No production spawn uses an implicit infinite supply.

This is a first-order mechanical-work model sampled at the start of each fixed step. Force at zero sampled velocity is idealized as zero work for that step, including an initial acceleration from rest; a shorter step reduces this discretization error. Resisted static force has no modeled metabolic/electrical cost. Negative work does not recharge the store. Heat, motor losses beyond the scalar efficiency, regenerative braking, fuel chemistry, and muscle physiology remain outside this Phase.

## Phase 12 — Capability is observed, not declared

Structure is the world's actual Part, Material, Connection, and geometry state. Actuation supplies bounded physical force or torque through that structure. Energy limits the work and shared power available to those actuators. Capability is a measured outcome under a stated task and environment, such as a payload's height, displacement, or time held against gravity. It is not an intrinsic Entity field or authoritative value consumed by physics, Construction, or control.

The Phase 12 integration experiments use the existing `ConstructionRuntime → WorldRuntime → ActuatorRuntime → EnergyRuntime → Rapier → StructuralDamageRuntime` path. Construction changes declarative structure while preserving Entity identity; it never grants a capability. Physical contact, friction, load, and separation determine outcomes. Tests and debug tools may record task metrics, but those measurements do not feed back into production world rules. An Agent may form an uncertain estimate of what it can do from sensory experience; that belief remains separate from world truth.

Comparisons must name and hold their controls, change only the declared geometry, material property, or structural intervention, and report observed output together with energy and structural load. Phase 12 adds no capability registry, fixture-specific Core branch, or new Physics system. The current Rapier connection load remains the momentum-balance approximation described above; a broken connection is removed during the same fixed step, so a post-step query of that connection returns zero even though the damage state records the overload that caused separation.

## Phase 13 — Playable Construction Sandbox

The browser starts with a paused, editable workbench and a generic Tension Blueprint. Joint, Tension, and Gripper catalog entries are Blueprint factories, not Entity kinds. The gripper payload is spawned as a separate passive Entity. No Agent controls the workbench. A fresh finite EnergySourceSpec is supplied when an actuated structure is generated or reset; changing its capacity, power, or efficiency requires an explicit new spawn.

`GodSandboxPanel` submits structural edits through `ConstructionRuntime`, lifecycle and inspection through `WorldRuntime`, and normalized requests through a `ManualControlSource` implementing `WorldControlSource`. The source stores only actuator ID, kind, and requested value, then emits `ControlSignal`. The existing World step continues through `ActuatorRuntime → EnergyRuntime → PhysicsAdapter → StructuralDamageRuntime`. Pausing gates reconstruction controls; manual signals may be preset while paused and changed while running. Reset removes world Entities and spawns fresh Blueprints, bodies, and finite stores; it never sets pose or velocity to a desired outcome.

WorldRuntime exposes read-only debug snapshots for Energy, current connection load, Part contacts, pose, and velocity. These measurements are for the God Sandbox and renderer, not Agent input. The browser render loop maps World-owned Part handles and poses to Three.js meshes and draws selected Parts, Connections, and Tension mounting points. Renderer overlays express declared structure and observed damage; they never apply force, decide grip or lift, or set physics state. Impact uses `ConstructionRuntime.applyImpact`, which routes a physical impulse through WorldRuntime. Repair uses Construction reconstruction and the existing Core Damage reset path.
