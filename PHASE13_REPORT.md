# Phase 13 Report — Playable Construction Sandbox

## Delivery and boundary

The browser now opens a paused workbench with a basic Tension mechanism. Users can choose a Joint, Tension, or Gripper Blueprint, edit Parts, materials, Connections, and either actuator kind through Chinese controls, set finite energy for a new spawn, enter run mode, control actuators, inspect physics and damage, apply an impulse, repair, and reset. The Gripper payload is an independent passive Entity. JSON remains under Advanced.

`GodSandboxPanel → ConstructionRuntime / WorldRuntime / ManualControlSource → ControlSignal → ActuatorRuntime → EnergyRuntime → Rapier → StructuralDamageRuntime` is the operative path. The UI never sets physical pose, velocity, force output, damage state, lift, or grip. The manual source stores only normalized actuator requests; Joint accepts `[-1,1]`, Tension `[0,1]`. No Agent drives these structures. Reconstruction, repair, and reset use Construction/World lifecycle. Read-only World inspection supplies Part pose, velocity, contacts, Connection load, damage, and Energy. Three.js highlights the selected Part and locates Connections, actuators, and Tension mounting points from observed world poses.

Edit mode pauses physics and locks the structural editor during run mode. Manual signals can be preset while paused and adjusted while running. A separated Joint actuator is marked inactive; its stale request is cleared. Energy capacity, power, and efficiency are chosen before generation or reset, with a new finite store only on new spawn. The advanced Blueprint import also gets a finite store and manual source.

## Browser smoke (Mac, Playwright CLI, actual page)

- **Tension structure/edit/control:** Started the default template with neutral control, then ran `tension-pull=1` for about 2.5 seconds. The arm reached `X=-1.51 m`; Energy consumed `130.34 J`. Paused, reset the template, changed its first local attachment Y through the UI from `+0.55` to `-0.55 m`, applied the actuator edit, and ran the same signal. The arm reached `X=-0.29 m`; Energy consumed `36.14 J`. The change persisted in the UI after reconstruction. These are observed browser values, not a computed capability or a success flag.
- **Physical damage and repair:** On a Joint template, edited the Connection's impulse capacity to `1 N·s`, applied a `2 N·s` X impulse to the arm, and single-stepped. The Connection showed separated and no current load; with a requested Joint signal it consumed `0.00 J` while detached. God Repair reconnected it through Construction; after issuing the same signal again, it remained connected, showed `8.70 N` current load, and consumed `60.22 J` over about one second. A separate Tension trial with low material force thresholds also separated under impact; immediate repair before significant drift stayed connected under control, while repair after a long detached drift immediately separated again under load. The latter is a physical/reassembly limitation, not a scripted repair outcome.
- **Gripper/friction:** Spawned the Gripper and its independent passive payload. Preset left/right Jaw Joint signals to `+1/-1` and ran about 2.8 seconds. With payload friction `1.2`, its position was `Y=2.01 m` with eight contact points; the gripper showed `4.68 J` consumed and `12.00 N` current Connection load. Regenerated the scene, changed only payload friction through the material editor to `0.01`, repeated the signals, and observed payload `Y=1.60 m` (four contact points when paused). No grip outcome was supplied to physics.
- **Mode guard:** In run mode the Part edit button matched browser `:disabled`, while the gripper's manual sliders remained enabled. The initial control values were zero. The final page load and WebGL scene completed without console errors.

Browser timings use wall-clock waits, so exact physical tick counts may differ with rendering load. The positional comparisons are qualitative acceptance evidence; Phase 12 deterministic fixtures remain the tighter controlled physics evidence.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | 39 files, 153 tests passed, including Phase 9–12 regressions and new Phase 13 tests |
| `npm run typecheck` | passed |
| `npm run build` | passed; Vite emitted its existing large-chunk advisory |
| `npm run check:boundaries` | passed (45 TypeScript files) |

New tests cover signal-only manual control and range clamping, fresh validated template Blueprints and independent payload, Tension attachment round trip through Construction, finite Energy inspection/preservation across reconstruction, and fresh supply on World removal/spawn reset. Browser smoke covers the DOM edit/run guard and the full UI flow.

## v0.2 anti-cheat audit

Scanned production `src` for `canWalk`, `canLift`, `canGrip`, `attackPower`, `moveSpeed`, `liftCapacity`, `gripStrength`, and `EntityKind`: **no hits**. The only forbidden-name hits in the complete tree are literal strings in the pre-existing `phase12Capability.test.ts` assertion that rejects such Blueprint fields.

Scanned `src/main.ts` and non-test `src/tools` for `applyJointOutput`, `applyForceAtPoint`, direct impulse/transform/velocity setters, Damage state assignment, and Energy state assignment: **no hits**. `GodSandboxPanel` calls only `ConstructionRuntime.applyImpact`, which delegates to WorldRuntime for a physical impulse. Direct adapter force/output methods occur in `ActuatorRuntime` and PhysicsAdapter implementation/tests, where they belong. `setTranslation`, `setLinvel`, and `setAngvel` occur in Rapier body creation/reconstruction to preserve physical state, not in UI code. Energy limits the actuator batch in `ActuatorRuntime`; it does not set movement outcomes. Damage remains calculated by Core from measured contact and Connection load.

The browser bootstrap constructs `RapierPhysicsAdapter` and the presentation loop reads Part handles/poses through `WorldRuntime.getPhysicsBody`; it makes no direct Rapier mutation. The panel's runtime reads (`inspectEnergy`, `readConnectionLoad`, `readPartContacts`, `readPartVelocity`) are debug truth only and never enter an Agent control source. Test files deliberately exercise adapter APIs directly.

## Limits and review

- Connection load is the Phase 9 momentum-balance estimate, not solver-exact joint reaction. A separated Connection has no current load sample.
- Repair reconstructs the declared joint at current physical poses. Widely drifted or still overloaded pieces can separate again; the workbench does not teleport them together.
- Energy models positive mechanical work; static holding at zero sampled velocity may consume little or no stored energy. The gripper's small measured draw reflects this model.
- Numeric form editing is the current construction interface. There is no CAD drag handle, general Undo history, or authored goal success logic.
- The former quadruped/Agent debug scene is no longer the default browser page. Its Core fixtures and automated coverage remain in the repository; the workbench has no autonomous Agent control.
- Validated on Mac browser and automated suite. Windows was not required for this Phase and was not run.

Phase 13 is submitted for final v0.2 review; v0.3 work has not started.
