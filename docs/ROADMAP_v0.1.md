# Morphodyne Roadmap v0.1

## Development model

Each phase follows:

**Implement → focused validation → phase report → acceptance → next phase.**

Phase 8 intentionally combines Construction Runtime, God Sandbox UI, and final v0.1 validation into one delivery to reduce coordination overhead. Codex may use internal milestones, but should not create extra user handoff points unless materially necessary.

Development environment:

- **Mac mini**: Codex, Git, primary development, tests, browser validation, and documentation.
- **Windows PC**: optional later cross-platform and performance validation.
- Git is the source of truth.
- Phase 0 must be fully executable on the Mac without Unity.

---

## Phase 0 — Project Foundation

### Goal

Create a minimal engineering foundation that does not constrain later architecture.

### Implement

- Vite + TypeScript project foundation.
- Three.js rendering boundary.
- Rapier 3D physics boundary.
- Modular directories for Core, PhysicsAdapter, Rendering, Simulation, and Tools.
- Framework-independent TypeScript Core.
- Unit-test infrastructure.
- Minimal Rapier Physics Adapter boundary.
- Standard Node/Vite `.gitignore`.
- Basic logging conventions.
- Mac build/typecheck/test/dev workflow.
- A minimal browser smoke scene proving Three.js ↔ Rapier synchronization.

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

- Core has no Three.js or Rapier runtime dependency.
- Core unit tests execute on Mac.
- `npm run build` and `npm run typecheck` succeed on Mac.
- The browser smoke scene runs locally.
- Module dependency direction is documented and enforced where practical.

---

## Phase 1 — Structural Physics

### Goal

Prove that Blueprint structure maps cleanly to a physical body.

### Implement

- PhysicsBody abstraction.
- Rapier rigid-body adapter.
- Primitive / Convex physics geometry.
- Part → Rapier rigid-body/collider mapping.
- Connection → Rapier fixed/revolute/prismatic joint mapping.
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

## Direction correction after Phase 6

Phases 4–6 successfully proved the Agent sensing, decision, Skill, and adaptation chain, but they used one active quadruped as the main validation fixture. That fixture must not become the implicit center of the simulation.

For the remainder of v0.1:

- treat the active quadruped as one test Blueprint, not the default ontology;
- freeze new Brain / learning features except integration fixes;
- prioritize World, Entity lifecycle, Environment, and Construction;
- validate new core mechanisms on structurally different Entity classes where relevant;
- never require an Entity to own a Brain, Skill, or locomotion controller.

A useful generality gate is:

1. passive object;
2. actuated machine without an Agent;
3. sensor-bearing structure without a Brain;
4. autonomous Agent.

A core world rule should affect these through the same underlying abstractions whenever the rule is applicable.

---

## Phase 6.5 — Generality & World Foundation

### Goal

Prove that Morphodyne is a universal world/structure simulator rather than an active-quadruped simulator, and establish the minimal runtime ownership needed for later construction.

### Implement

- Minimal WorldRuntime / world-state owner.
- Entity registry and lifecycle.
- Spawn and remove Entity at runtime.
- World-owned access to physical Entity instances without leaking backend semantics into Core.
- Minimal structural operations needed to support future construction boundaries.
- Explicit treatment of detached structures so they can become independently inspectable/manipulable world objects or structural components.
- Generality fixtures:
  - passive object;
  - articulated/actuated machine without Brain;
  - sensor-bearing non-Agent structure;
  - existing quadruped Agent.

Do not add new Brain, planner, Skill-learning, Jev/LLM, RL, or richer quadruped locomotion features.

### Acceptance

- Passive and non-Agent Entities are first-class runtime citizens.
- The world can contain multiple structurally different Entities at once.
- Spawning/removing an Entity does not require Agent concepts.
- At least one actuated non-Agent machine produces a physical result through the same Actuator → Physics chain.
- Existing Agent behavior still works without becoming the WorldRuntime API.
- No new core field such as isAnimal, isWheel, isLeg, canWalk, or equivalent is introduced.
- The next Environment and Construction phases can depend on WorldRuntime rather than on main.ts scene-specific wiring.

---

## Phase 7 — World & Environment

### Goal

Make Environment a first-class part of the world and prove that environmental effects emerge from generic physical/sensory rules rather than Agent debuffs.

### Implement

- Environment ownership in WorldRuntime.
- Surface.
- Medium / Volume.
- Field.
- differing friction surfaces.
- slopes.
- simple water volumes.
- simple day/night.
- Clear / Rain.

Use low-fidelity models where appropriate, but route effects through physics, materials, sensors, or other universal mechanisms.

### Acceptance

Validate applicable environment rules across structurally different cases, not only the quadruped.

Examples:

- passive box + machine + Agent respond to surface friction through the same contact/material path;
- passive/active structures entering water respond to the same buoyancy/drag model;
- slope behavior follows gravity/contact geometry;
- Rain changes physical or sensory conditions rather than applying a semantic movement/accuracy penalty.

No inWater => speed multiplier, rain => accuracy penalty, or Agent-only environmental shortcuts.

---

## Phase 8 — Construction, God Sandbox & Core Validation

### Goal

Finish the v0.1 foundation in one integrated delivery instead of splitting Construction Runtime, God Sandbox UI, and final validation into separate handoffs.

This is one Phase, one branch, one pull request, and one acceptance review. Codex may divide the work internally into implementation milestones, but it should not stop for user relay between them unless blocked by permissions or an architectural decision that cannot be resolved from the repository.

### Internal milestone A — Construction Runtime

Implement the runtime structural editing boundary:

- Create / spawn Blueprint-backed Entity.
- Add / remove Part where runtime-safe.
- Modify geometry/material/mass through an explicit reconstruction path.
- Create / remove Connection.
- Attach / detach / reattach structures.
- Add / remove Actuator.
- Add / remove Sensor.
- Inspect structure.
- Save / load Blueprint.
- Blueprint Validator.
- Clear detached-component and Entity/assembly ownership rules.

Changing structure must change physical behavior through reconstruction/physics, never through capability flags.

### Internal milestone B — God Sandbox UI

Build the first usable shell on top of Construction Runtime:

- Spawn Blueprint.
- Select / inspect Entity.
- Inspect Part.
- Inspect Connection.
- Modify through Construction Runtime.
- Attach / detach / reattach.
- Damage / God Repair where currently supported.
- Pause.
- Step Tick.
- Slow Motion.
- Save / Load Blueprint.
- Blueprint validation feedback.

The UI must call World/Construction APIs. It must not own world or structure semantics.

UI quality remains secondary to observability and correctness.

### Internal milestone C — Core Validation

Before opening the Phase 8 PR, run the final v0.1 core experiments in the same branch.

#### Experiment 1 — Structure Creates Capability

Create multiple structurally different Entities, including at least one non-Agent machine and one Agent-bearing body.

For a focused comparison, create two similar-looking structures with meaningful internal differences.

Do not give them speed/capability stats.

Their physical and controlled performance should differ because of structure, actuation, material, and control rather than type labels.

#### Experiment 2 — Damage Creates Functional Loss

Apply localized structural damage.

Do not invoke canned injury animation or debuff logic.

Functional degradation must emerge from altered structure.

#### Experiment 3 — Environment Changes Capability

Run passive, actuated non-Agent, and Agent-bearing structures across applicable friction, slope, and medium conditions.

Behavior should change through physical/environmental effects shared by the world rules.

#### Experiment 4 — Agent Acts on Belief

Hide or remove a sensed target from the Agent's current perception.

The Agent must act from Sensor + World Model information rather than authoritative coordinates.

Expected phenomena may include losing track, stale/incorrect estimation, and rediscovery.

#### Experiment 5 — Adaptation

Damage or weaken one limb/structural path.

Existing Skill performance should degrade.

After experience-based adjustment, the Agent should change control and recover some capability without a pre-authored disability gait.

### Phase 8 acceptance

The Phase is complete only when:

- Construction Runtime can build and modify passive, non-Agent actuated, sensor-bearing, and Agent-bearing structures through the same generic model.
- Detached structure can be intentionally detached/re-attached or reconstructed through an explicit construction path.
- God Sandbox UI exercises the Construction Runtime rather than duplicating semantics.
- The five core validation experiments pass with concise evidence.
- The generality gate remains intact.
- No semantic ability/type shortcuts are introduced.
- tests, typecheck, build, browser smoke, and Phase report pass.

Deliverables:

- implementation;
- concise `PHASE8_REPORT.md`;
- one Phase 8 branch;
- one PR targeting `main`;
- stop at final v0.1 review.

---

# v0.1 success condition

If the core experiments succeed **and the generality gate remains intact**, the simulation foundation is considered validated.

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
