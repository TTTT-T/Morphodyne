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
