# Arena v0.1 — review report

## Structures and motion

- **Rammer:** one low chassis, two spherical ground-contact wheels on revolute axle Connections, and one rigidly mounted front box. Both wheel actuators receive player `ControlSignal`s from `ManualControlSource`; their torque and floor friction move the body. There is no motor force on the chassis.
- **Gripper:** an independent chassis and wheel pair, plus two box jaws on opposed prismatic slides. A small opponent controller reads the two chassis poses for approximate direction, commands wheel joint output, and closes both jaw joints when near. It cannot declare contact or damage. Both fixtures use finite Energy and ordinary Blueprint Parts, materials, Connections, and Actuators.
- One World owns both Entities, a flat physical floor, and four static walls. `#arena` is a separate UI mode; it displays time and structural status, allows pause, manual end, restart, and a return to the construction sandbox. Restart creates a fresh Rapier adapter and WorldRuntime, resetting time, identities, Energy, and Damage.

## Measured confrontation

The deterministic Rapier + WorldRuntime trial began with chassis positions X = −2.3 m and +2.3 m. Player wheel signals advanced Rammer's chassis by 0.688 m over 4 s while the autonomous Gripper approached from the other side. At 1.5 s without player input, Gripper moved from X = +2.30 m to −1.32 m, and the distance between its jaws narrowed from 0.52 m to 0.223 m through its prismatic actuators.

In the driven two-body trial, Rammer's nose had four physical contact ticks and a peak measured contact force of 385.7 N. Gripper's left jaw had a peak of 284.5 N. At tick 99 the jaw was in physical contact above the floor, its existing Part material state fractured, and the left slide separated in the same tick. Gripper then had two structural components and three available actuators instead of four. No Arena code writes damage or chooses an attack outcome. This proves the contact → Part Damage → incident Connection separation → actuator loss chain; wheel motion after the collision is limited and should not be read as proof of robust locomotion.

Browser smoke on the local Vite page verified the Arena view with both entities, opponent movement, visible fracture/separation and Energy changes, pause, clean restart, and navigation to the sandbox and back. The independent browser run showed Gripper with two fractured Parts and two separated Connections after contact with a stationary Rammer. Manual end reports its reason through the read-only observer.

## Load flow and anti-cheat

`ControlSignal → ActuatorRuntime/EnergyRuntime → joint output → Rapier contact → readPartContactLoad → applyPartLoad` remains the only Arena material-damage path. Connection reaction continues through the separate structural path; a Part fracture breaks incident Connections. Arena adds no HP, attack stat, semantic damage multiplier, direct torso force/velocity/rotation, hidden reaction wheel, or test-only actuator injection. A scoped source scan for those routes returned no matches. The match observer only reads pose, Energy, structural state, and actuator availability; timeout, boundary, main-body fracture, and manual end are observations, not physics overrides.

## Three observed limits and next step

1. **Post-impact mobility:** At 4 s Rammer's chassis height had fallen from 0.47 m to 0.18 m, its horizontal speed was about 0.0002 m/s, yet its Parts and Connections were intact. The present wheelbase, ground clearance, and mass layout permit bottoming out after collision. This is the first problem to address, starting with fixture geometry and centre of mass rather than an artificial upright or drive force.
2. **Fracture representation:** A fractured jaw loses its Connection and actuator, but the Part keeps its rigid collider. Later contacts can therefore involve a detached, non-fragmented solid. This is a known low-fidelity structural limit, visible once the jaw separates.
3. **Contact locality:** Existing material response receives total force/impulse, without a contact-area or pressure measure. Arena produced meaningful damage anyway; it has not yet established that this limit blocks playability. Phase 15 remains paused until an actual broad-versus-narrow Arena comparison makes it necessary.

**Recommended next change:** adjust and compare physical wheelbase, ground clearance, and mass placement under the same post-impact trial. Do not add torso assistance or start Phase 15 without a measured blocker.

## Verification

- `npm test`: 42 files, 164 tests passed, including new Arena physical, reset, opponent, and observer checks; architecture boundaries passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing large-bundle advisory remains.
- `npm run check:boundaries`: passed.
- Browser smoke: Arena view, opponent motion, visible damage, pause, reset, and mode navigation passed.
- Windows validation: not run. No Core or PhysicsAdapter semantics changed.
