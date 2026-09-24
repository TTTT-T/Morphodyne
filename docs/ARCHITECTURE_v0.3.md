# Morphodyne Architecture v0.3 — External Contact Material Damage

This extends [v0.1](ARCHITECTURE_v0.1.md) and [v0.2](ARCHITECTURE_v0.2.md) for Phase 14. The simulation still owns material and structural semantics; Rapier only measures and resolves physical interactions.

## Why v0.2 was insufficient

`readPartImpactImpulse` combined contact-force event impulse with a directly applied test impulse. `StructuralDamageRuntime` divided that value among incident Connections and called `applyConnectionLoad`, which changed both the Connection and its endpoint Parts. A single Part with no Connection had no route to material damage. Sending the same contact to a new Part path without changing that distribution would charge one measurement to Part damage twice.

## Load paths

1. **External Part contact:** Rapier contact-force events report force magnitude in N. `PhysicsAdapter.readPartContactLoad` exposes per-Part `forceN` and `impulseNs = forceN × Δt`; it excludes freely applied impulses. The simulation sends this once to Core `applyPartLoad` for that Part. Both colliding Parts may receive a load because each physically experiences the contact.
2. **Internal Connection reaction:** `readConnectionLoad` estimates transmitted force/torque from endpoint momentum balance, as in v0.2. The runtime calls `applyConnectionLoad` with `loadEndpoints: false`: this changes the Connection state only. Material at the endpoints still sets the Connection's effective threshold, and Part integrity still limits its residual capacity. This avoids repeating the external contact in endpoint Part damage. The approximation does not establish exact stress conservation across multiple joints.
3. **Direct test impulse compatibility:** A free impulse submitted with `applyImpulse` remains visible through the legacy `readPartImpactImpulse` total and a distinct `readPartAppliedImpulse` channel. Only the latter retains the old equal distribution among live incident Connections and endpoint material response. It contains no contact-force event, even when an applied impulse and a collision occur in the same step. Internal measured reactions remain available in either case.

`applyPartLoad` uses the existing `DamageState` and material thresholds. An impact begins the impulse channel with `max(0, Iₜ − Iₜ₋₁)` N·s. This first-order rising-edge rule prevents a constant support force's `F × Δt` from becoming a fresh impact every tick. The sustained channel uses the measured `forceN` each step. For yield `Y`, its increment is `Δt × max(0, F/Y − 1)` normalized seconds; an integral of 1 or `F ≥ ultimateForceN` fractures the Part. The impulse channel uses the existing excess-over-yield accumulation, residual capacity, and toughness rule. These are distinct response modes to one measured contact, not two copies of its impulse added together. A sub-yield constant force adds no damage regardless of duration. A Material omitting all four relevant impulse/force thresholds has no newly inferred direct-contact brittleness, preserving older Blueprints.

Direct Part fracture changes its existing material state to `fractured`, then separates every live incident Connection. The physics adapter removes those joints, and WorldRuntime derives new component ownership from the changed structure. The Part's rigid body remains in the world; Phase 14 does not synthesize fragments or alter mesh geometry. Functional changes remain consequences of motion, contact, and structure, not a capability flag.

## Limits

Contact-force events provide force magnitude over a fixed step, not local pressure, contact area, stress tensor, or solver-exact impulse partition. The rising-edge impulse rule is a low-fidelity transient detector and can miss a second strike before the previous contact has fully relaxed. The force integral is a material overload proxy, not fatigue, fracture mechanics, or soft-body simulation. `readConnectionLoad` retains v0.2's momentum-balance limits around multiple contact and joint paths. None of these estimates may use fixture names, semantic roles, or actuator commands to determine damage.
