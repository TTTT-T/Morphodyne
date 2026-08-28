# Morphodyne Roadmap v0.1

## Development model

Each phase follows:

**Implement → automated tests → required Unity/Windows validation → phase report → acceptance → next phase.**

Do not skip ahead and bulk-implement later phases.

Development environment:

- **Mac mini**: Codex, Git, primary code development, pure-C# tests, documentation.
- **Windows PC**: Unity 6.3 LTS, PhysX integration, simulation runs, performance testing.
- Each machine keeps a local repository clone.
- Git synchronizes source.
- Do not run the Unity project directly from an SMB network share.

---

## Phase 0 — Project Foundation

### Goal

Create a minimal engineering foundation that does not constrain later architecture.

### Implement

- Unity project foundation.
- Modular directories/assemblies for Core, PhysicsAdapter, Simulation, and Tools.
- Pure C# Core assembly.
- Unit-test infrastructure.
- Empty/minimal Unity Physics Adapter boundary.
- Standard Unity `.gitignore`.
- Basic logging conventions.
- Mac build/test workflow.
- Windows Unity pull/open/run workflow.
- Mac → Windows LAN/SSH integration plan where practical.

Initial Core types should be minimal:

- EntityId
- Entity
- Material
- Part
- Connection
- Event
- Blueprint

### Explicitly do not implement

- Agent AI
- animals
- locomotion
- detailed Damage
- learning
- complex editor

### Acceptance

- Core has no UnityEngine dependency.
- Core unit tests execute on Mac.
- Windows can open and run the same Unity project revision.
- Module dependency direction is documented and enforced where practical.

---

## Phase 1 — Structural Physics

### Goal

Prove that Blueprint structure maps cleanly to a physical body.

### Implement

- PhysicsBody abstraction.
- Rigidbody adapter.
- Primitive / Convex physics geometry.
- Part → Rigidbody mapping.
- Connection → Fixed/Hinge/ConfigurableJoint mapping.
- Blueprint → runtime Entity construction.
- Simple generic quadruped-shaped passive test body.

No AI.

### Acceptance

Changing mass, material properties, joint range, or structural proportions changes physical behavior naturally.

No `moveSpeed` or equivalent ability properties.

---

## Phase 2 — Actuator & Active Body

### Goal

Allow physical bodies to produce motion through actuators.

### Implement

- Actuator interface.
- Joint actuator.
- Force / torque output.
- Minimal Energy interface.
- Motor Primitive.
- Basic balance control.
- Basic locomotion controller.
- Generic Quadruped active test body.

### Acceptance

The body can:

- stand
- move forward
- turn
- respond physically to external collision

Motion must emerge from actuator-driven physics, not transform animation.

---

## Phase 3 — Damage & Dependency

### Goal

Prove that structural damage naturally causes functional loss.

### Implement

- Damage Geometry.
- Material Damage State.
- Fracture.
- Tear.
- Separation.
- Actuator degradation.
- Connection degradation.
- Dependency propagation.
- Simplified contact-stress model.
- God Repair.

Natural healing remains deferred.

### Core acceptance experiment

Damage a leg actuator or connection.

Do not add a limp animation or disability debuff.

Expected causal chain:

**Damage → reduced structural/actuator capability → altered motion → altered stability.**

---

## Phase 4 — Sensor & Perception

### Goal

Remove god-mode world access from autonomous entities.

### Implement

- Sensor interface.
- Visual Sensor.
- Contact Sensor.
- Internal / Proprioception Sensor.
- Noise.
- Latency.
- Perception.
- Minimal World Model.
- Minimal Self Model.

Acoustic and Chemical sensors may be added later if this phase would otherwise grow too large.

### Acceptance

- Agent-side systems cannot directly read hidden target truth.
- Occlusion removes or degrades visual information.
- Body damage becomes known through internal sensory evidence rather than direct authoritative state injection.

---

## Phase 5 — Minimal Agent Brain

### Goal

Create the smallest universal autonomous loop.

### Implement

- Drive.
- Maintain.
- Avoid.
- Acquire.
- Explore.
- Goal.
- Minimal short-horizon Planner.
- Affordance.
- World Model.
- Self Model.
- Memory.
- Prediction.

Do not implement emotion, reproduction, social systems, culture, or LLM control.

### Acceptance

Without species-specific behavior scripts, an Agent can:

**perceive → form need → choose goal → use available Skill → act → observe outcome → replan.**

---

## Phase 6 — Skill & Adaptation

### Goal

Prove that an Agent can adapt control after its body changes.

### Implement

- Skill.
- Skill parameterization.
- Skill evaluation.
- Experience cache.
- Strategy weighting.
- Prediction-error learning.
- Minimal skill adaptation.

Deep reinforcement learning is not required.

### Core acceptance experiment

1. A four-legged Agent moves stably.
2. One leg is weakened or damaged.
3. Existing control performance degrades.
4. Experience-based adjustment recovers part of locomotion capability.

Forbidden shortcut:

`three_legged_walk`

---

## Phase 7 — Environment Interaction

### Goal

Prove that environment effects emerge from generic rules rather than debuffs.

### Implement

- Surface.
- Medium / Volume.
- Field.
- differing friction surfaces.
- slopes.
- simple water volumes.
- simple day/night.
- Clear / Rain.

### Acceptance

The same Agent behaves differently on:

- dry ground
- slippery ground
- slopes
- water

Differences must arise from physics and sensor/environment inputs.

---

## Phase 8 — God Sandbox Tools

### Goal

Create the first usable god-sandbox shell around the simulation.

### Implement minimal tools

- Spawn Blueprint.
- Inspect Entity.
- Inspect Part.
- Inspect Connection.
- Modify.
- Attach.
- Detach.
- Damage.
- Repair.
- Pause.
- Step Tick.
- Slow Motion.
- Save / Load Blueprint.
- Blueprint Validator.

UI quality is secondary to observability and correctness.

---

# Core Validation Milestone

After Phases 0–8, run five acceptance experiments.

## Experiment 1 — Structure Creates Capability

Create two similar-looking quadruped Entities with different internal structure.

Do not give them speed stats.

Their resulting motion performance should differ because of structure and control.

## Experiment 2 — Damage Creates Functional Loss

Apply localized structural damage.

Do not invoke canned injury animation or debuff logic.

Functional degradation must emerge from altered structure.

## Experiment 3 — Environment Changes Capability

Run the same Agent across different friction, slope, and medium conditions.

Behavior should change through physical/environmental effects.

## Experiment 4 — Agent Acts on Belief

Hide a target behind occlusion.

The Agent must act from Sensor + World Model information rather than authoritative coordinates.

Expected phenomena may include:

- losing track
- incorrect estimation
- rediscovery

## Experiment 5 — Adaptation

Damage or weaken one limb.

Existing Skill performance should degrade.

After experience-based adjustment, the Agent should recover some locomotion without a pre-authored disability gait.

---

# v0.1 success condition

If all five experiments succeed, the simulation foundation is considered validated.

Only then should the project seriously expand into areas such as:

- realistic animal Blueprints
- predator/prey behavior
- richer soft tissue
- ecology
- social behavior
- evolution
- bio-mechanical integration
- natural-language creation
- larger worlds

The foundation must be proven before content scale is increased.
