# Phase 12 — Capability Emergence Validation

## Scope and measurement

This Phase adds integration experiments and the observed-capability architecture rule. It adds no production capability field or new Physics system. Every trial creates validated Blueprints through `ConstructionRuntime`, advances `WorldRuntime` by fixed ticks, and reads real Rapier Part poses, contacts, connection loads, structural state, and `EnergyRuntime` consumption. The machine has external control and finite energy but no Agent. The payload is a separate passive Entity. A task result is a measurement in test code, never an input to production runtime.

All reported heights are the maximum rise of the payload's center from its initial center during 50 fixed steps (0.833 s); they do not claim a sustained static lift. Connection loads are the existing Phase 9 momentum-balance estimates, not solver-exact reactions. The source of quantitative results is `src/tools/phase12Capability.test.ts` and `src/tools/phase12Grip.test.ts`.

## Experiment A — attachment geometry changes lifting

Two otherwise identical two-Part lever machines have a 100 kg base, 2 kg arm, one revolute hinge, and one 100 N Tension Actuator. Each starts with the same independent 1 kg box payload resting above the arm. Both use identical Part/material geometry, payload pose, static support, friction 0.8, control signal 1, 1000 J energy capacity, 1000 W shared power ceiling, efficiency 1, and 50 ticks. **Changed variable:** only the arm-local X coordinate of the tension attachment, −0.3 m versus +0.3 m. The actuator still applies the same bounded force; Rapier resolves the resulting moment arm and contact with the payload.

| Arm attachment X | Maximum payload rise | Energy consumed | Peak hinge force | Peak hinge torque | Damage |
| ---: | ---: | ---: | ---: | ---: | --- |
| −0.3 m | 0.000 m | 0.131 J | 102.796 N | 26.277 N·m | none; connected |
| +0.3 m | 1.488 m | 94.923 J | 98.015 N | 17.068 N·m | none; connected |

The +0.3 m case makes contact during 25 ticks and accelerates the payload upward; the −0.3 m case never raises it above its starting height. Different energy draw is an output of the different motion, not a changed energy setting.

## Experiment B — two-sided contact and friction

The gripper is a non-Agent Entity with a 100 kg frame, two 2 kg spherical jaws on opposed prismatic connections, and one 12 N Joint Actuator per jaw. The 1 kg box payload is an independent passive Entity, never a gripper Part. Each trial starts at the same pose above a static floor. The two jaws close under identical signals, then continue pressing for a 30-tick settling period and a 150-tick (2.5 s) hold window. The payload is counted as jaw-held only when its center remains above 1.85 m and physical contact is observed on **both** opposing sides; that height is above the frame's passive support surface. The frame, jaw geometry, jaw material friction 0.1, masses, actuator output, 1000 J / 1000 W energy, floor, control, and step count are fixed. **Changed variable:** only payload material friction, 1.2 versus 0.01.

| Payload friction | Consecutive two-sided contact in hold window | Maximum payload drop | Energy consumed | Peak jaw-connection force | Peak jaw-connection torque | Damage |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1.2 | 150 / 150 ticks = 2.50 s | 0.252 m | 3.737 J | 212.359 N | 1.535 N·m | none |
| 0.01 | 0 / 150 ticks = 0 s | 0.657 m | 4.744 J | 212.359 N | 0.216 N·m | none |

The high-friction payload remains above the passive frame support and has two-sided jaw contact throughout the hold window. The low-friction payload slides below the defined suspended region and comes to rest on the frame, so mere proximity to the gripper is not counted as a grip. Normal contact, tangential friction, and gravity produce the difference; no target attachment or hold flag exists.

## Experiment C — Construction creates an observed lift

The initial lever Blueprint has the same Parts, hinge, material, and 1 kg passive payload as Experiment A, but has no Actuator. One trial runs it unchanged. In the other, `ConstructionRuntime.addActuator` adds the same 100 N Tension Actuator at arm-local X = +0.3 m before the task begins. The edited machine keeps Entity ID `machine`; reconstruction does not create a replacement identity. Energy specification, control, payload, environment, and 50-tick window are otherwise identical. **Changed variable:** presence of the actuator declaration and its physical output, added through Construction.

| Structure | Maximum payload rise | Energy consumed | Peak hinge force | Peak hinge torque | Damage |
| --- | ---: | ---: | ---: | ---: | --- |
| No Actuator | 0.000 m | 0.000 J | 336.640 N | 55.825 N·m | none; connected |
| Actuator added through Construction | 1.478 m | 94.782 J | 98.003 N | 17.071 N·m | none; connected |

The passive payload's fall in the first trial and rise in the second are Rapier outcomes; Construction never writes a lift property or payload pose.

## Experiment D — physical damage, loss, and repair

This uses the lifting lever and 1 kg payload. Hinge ultimate torque is 30 N·m, above the intact task's observed 17.068 N·m peak. Before the task, an external −0.8 N·m·s angular impulse on the arm produces a real connection overload; Core records `separated` with deformation 1 and a positive overload integral (0.0142 normalized s). In two pulse-identical trials, one runs the task with the hinge separated and the other calls `ConstructionRuntime.repair('machine', 'hinge')` at the explicit repair boundary before running it. The payload is spawned only after the damage/repair stage, at the same initial pose. The actuator, energy, payload, control, and 50-tick task are identical. The intact reference runs the same 30 N·m hinge without the damaging impulse.

| Structural state for task | Maximum payload rise | Energy consumed | Peak live-hinge force | Peak live-hinge torque | Damage |
| --- | ---: | ---: | ---: | ---: | --- |
| Intact reference | 1.488 m | 94.923 J | 98.015 N | 17.068 N·m | none |
| Separated after impulse | 1.144 m | 95.023 J | unavailable after separation | unavailable after separation | hinge separated |
| Repaired after same impulse | 1.500 m | 80.848 J | 121.888 N | 23.168 N·m | restored hinge connected |

Damage reduces maximum rise by 0.344 m relative to the intact reference. Repair raises it by 0.356 m relative to the pulse-identical damaged trial while preserving Entity ID. Loss is partial: the tension element can still pull between the separated components, so the result is not a binary “cannot lift” state. Rapier/WorldRuntime removes a broken joint within the damage step; a post-step load read is zero and cannot reconstruct the failure-step peak. The recorded separated state and positive overload integral establish that the structural load path fired. The repaired case's distinct energy use reflects its different physical trajectory after the same impulse; energy settings are held fixed.

## Generality, limitations, and anti-cheat review

- The experiment set includes passive payload Entities, actuated non-Agent machines, and a machine intentionally modified through Construction. The quadruped Agent is not part of these trials.
- The measurements use Blueprint geometry/material/actuator declarations, finite Energy, physical contacts, Rapier motion, and Core damage. No production code branches on a fixture ID, experiment name, payload mass, damaged flag, or semantic ability.
- The payload is never welded, parented, attached to the machine Blueprint, frozen, made kinematic, teleported, or assigned pose/velocity to obtain a result. The only external intervention in Experiment D is a real angular impulse before the task.
- `src/core`, `src/physics`, and `src/simulation` were scanned for Phase 12 or fixture names, `canX`/capacity fields, semantic multipliers, and result branches. This Phase changes none of those production directories.
- The lever can briefly launch its payload; maximum rise is therefore an outcome of this finite-window task, not a general-purpose lift rating. The structural-load estimate remains approximate, especially for multi-connection assemblies; the grip case must be read as its measured fixed-window contact result, not a universal grasp property.

**If all capability semantic labels are removed, do these results still hold?** Yes. The fixtures' labels and test names only describe and measure outcomes. Structure, force, energy, contact, and damage produce the physical states being measured.

## Validation

Mac, 2026-09-24, branch `codex/phase-12-capability-emergence`, based on `main` at `9770b1d`:

| Command | Result |
| --- | --- |
| `npm test` | Passed: 36 test files, 142 tests; includes Phase 9 Structural Load, Phase 10 Tension, Phase 11 Energy, and Phase 12 integration tests. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed. Vite reported the existing large-chunk advisory; no production bundle code changed in this Phase. |
| `npm run check:boundaries` | Passed: 45 TypeScript files. |
| `git diff --check` | Passed. |
| Anti-cheat `rg` scans of `src/core`, `src/physics`, `src/simulation` and the two Phase 12 tests | No forbidden production fixture/capability names or test-side pose/velocity/constraint shortcuts found. |

Windows validation was not required for this test-only Phase and was not run. No architecture deviation or production runtime change was needed. The exact Phase branch and PR are recorded below after publication.

## Review handoff

- Files: `src/tools/phase12Capability.test.ts`, `src/tools/phase12Grip.test.ts`, `docs/ARCHITECTURE_v0.2.md`, and this report.
- Branch: `codex/phase-12-capability-emergence` → `main`.
- Commit and PR: recorded after the PR is created.
