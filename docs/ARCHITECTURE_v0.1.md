# Morphodyne Architecture v0.1

## 1. Project definition

Morphodyne is a physics-first god sandbox built around universal world rules, composable physical structures, optional embodied autonomous agents, structural damage, perception, learning, and emergent behavior.

Core experience:

**Create → Observe → Intervene → Let the world produce consequences through its own rules.**

The first version is not intended to be content-rich. Its purpose is to prove that the simulation foundation is coherent, modular, testable, and extensible.

---

## 2. Foundational principles

### 2.1 Capability emerges from structure

**Entities have no predefined abilities. Capability emerges from structure.**

Core simulation code must not use game-style properties such as:

- `canWalk`
- `canFly`
- `canBite`
- `attackPower`
- `biteDamage`
- `moveSpeed`

Capability is a dynamic consequence of:

**Physical potential × learned control × current state × environment.**

### 2.2 Function emerges from physical relationships

Structure has no predefined function. Function emerges from material, geometry, connections, actuation, and physical interaction.

A tooth penetrates because geometry, hardness, contact area, force, and target material permit penetration, not because it carries a `toothAttack` flag.

### 2.3 Physics has final authority

The world recognizes physical outcomes, not game semantics.

Agents may generate intent. Skills may produce control policies. Actuators may produce force or torque. The final result is decided by:

**Physics + structure + material + environment.**

### 2.4 Damage changes structure

Damage is not HP subtraction. Damage modifies material, geometry, connection integrity, load capacity, signal flow, or actuator output.

Initial generic damage forms:

- Deformation
- Fracture
- Tear
- Crush
- Separation
- Thermal Damage

Functional loss must follow from structural change.

### 2.5 Simplification may not bypass core rules

**Non-core systems may use low-fidelity models, but they may not bypass core rules to manufacture results.**

Examples:

- Water may use simplified drag and buoyancy, but not `enterWater => speed -50%`.
- Rain may alter friction and sensor reliability, but not apply an arbitrary accuracy debuff.

### 2.6 Shared interfaces, different mechanisms

Biological and mechanical entities may share interfaces without being forced into identical internal mechanisms.

Muscles and motors may both implement an actuator interface while retaining different energy, thermal, fatigue, and failure models.

### 2.7 World first; Agent is optional

Morphodyne is a world and construction simulation first. An Agent is an optional subsystem that some Entities may possess.

A rock, beam, door, machine, detached structure, vehicle, sensor platform, or autonomous creature must all be valid first-class Entities without requiring a Brain, Drive, Goal, Skill, or Learning system.

The current quadruped is a **validation Blueprint**, not the architectural center of Morphodyne. Core abstractions must not evolve around assumptions that all useful Entities are quadrupeds, animals, locomoting bodies, or autonomous agents.

When a new core rule is added, prefer validating it across multiple structurally different cases, such as:

- a passive physical object;
- an actuated machine without an Agent;
- a sensor-bearing structure without a Brain;
- an autonomous Agent.

If a proposed rule only makes sense because the current quadruped exists, review the abstraction before adding it to Core.

### 2.8 Phase 6 course correction

Phases 4–6 intentionally used the active quadruped to prove the Sensor → Perception → Brain → Skill → Adaptation chain. That proof is now sufficient for v0.1.

Until World, Environment, and Construction reach comparable maturity, Brain and Skill-learning expansion is frozen except for fixes required by active integration work. Do not add richer planning, LLM/Jev control, reinforcement learning, social behavior, or quadruped-specific locomotion improvements during this correction period.

The development center now returns to:

**World → Structure → Construction → Environment → Interaction.**

---

## 3. Technical direction

Initial stack:

- TypeScript
- Three.js for rendering and debug visualization
- Rapier 3D for rigid-body physics, colliders, joints, forces, impulses, and CCD
- Vite for local development and production builds
- Browser runtime with WebGL/WebGPU selected by the rendering layer as appropriate
- Fixed-step simulation owned by Morphodyne

Not part of the initial implementation:

- React or other UI frameworks unless Phase 8 needs them
- ECS
- Full soft-body simulation
- FEM
- deep reinforcement learning
- LLM-driven control
- high-fidelity weather
- large-scale ecosystem simulation

### 3.1 Layering

```text
God Sandbox UI / Debug Tools
            ↓
World / Construction Runtime
            ↓
Morphodyne Simulation Core
            ↓
Physics Adapter
            ↓
Rapier 3D

Optional Agent systems observe and act through Core interfaces:
Sensor → Perception → Brain → Skill → Actuator

Rendering observes the world through:
Morphodyne World State → Render Adapter → Three.js
```

The Simulation Core must remain framework-independent TypeScript wherever practical. It must not depend directly on Three.js scene objects or Rapier runtime objects.

Three.js owns presentation. Rapier executes physics. Morphodyne owns simulation semantics, structural rules, causal state, and agent logic.

This separation is deliberate so a future renderer or physics backend can be replaced without rewriting the world model.

### 3.2 World, Construction, and Physics ownership

- **WorldRuntime** owns stable Entity IDs, spawn/remove, fixed-step scheduling, runtime composition, and the current ownership of connected structural components. A detached component receives its own world ID and separation provenance while retaining its source Entity and existing physical Parts.
- **Construction Runtime** (Phase 8A) will own intentional structure edits: attach, detach, add/remove/modify Part or Connection, validation, and the corresponding reconstruction path. It will request lifecycle changes through WorldRuntime rather than treating UI or scene code as structural truth.
- **PhysicsAdapter** creates, steps, and removes the physical representation of current structure. Rapier handles remain backend references, never Entity or component identity. Physical separation removes a joint; WorldRuntime then projects the resulting Core connection state into component ownership.

This Phase 6.5 component model does not synthesize a new Blueprint or reset physical velocity when a connection fails. Reattachment will require an explicit Construction operation and a defined physics update path.

---

## 4. Core concepts

Initial concepts:

```text
Material
Part
Connection
Actuator
Energy
Sensor
Entity
Agent
Skill
Event
Blueprint
Environment
```

### 4.1 Entity

**Entity represents who; structure determines what it is.**

Entity is a persistently tracked world object. It does not intrinsically mean animal, robot, weapon, food, or other game category.

Suggested minimal shape:

```text
Entity
- Id
- Components
- Relationships
- HistoryReference
```

A rock, autonomous creature, machine, detached limb, loose component, or assembled structure may all be Entities.

Entity lifecycle and structural membership must remain explicit. Structural separation in the physics backend is not by itself sufficient world semantics: the World/Construction layer must eventually support detached structures becoming independently inspectable, removable, attachable, and re-attachable without species-specific logic.

### 4.2 Part

Part is a structural unit.

Suggested initial data:

```text
Part
- Geometry
- Material
- Mass
- Temperature
- DamageState
- Connections
```

Part must not contain semantic ability flags such as `isLeg` or `isWeapon` for core simulation decisions.

### 4.3 Material

Initial useful properties include:

```text
Density
Hardness
Elasticity
Toughness
Friction
TensileStrength
CompressionStrength
ShearStrength
HeatLimit
```

Material properties drive load response, friction, deformation, fracture, tearing, and penetration.

### 4.4 Connection

Connection represents real structural connectivity.

Initial generic forms:

```text
Rigid
Joint
Flexible
Tension
Flow
Signal
```

Function arises from complete dependency networks rather than part labels.

### 4.5 Actuator

**An actuator has output, not actions.**

Suggested interface concepts:

```text
InputEnergy
MaxOutput
ResponseSpeed
Efficiency
OperatingRange
FatigueOrWear
Temperature
ControlSignal
Attachments
```

Muscles, motors, and hydraulic mechanisms may implement this differently.

### 4.6 Energy

Use a shared high-level interface while allowing different internal mechanisms.

Possible high-level values:

```text
AvailablePower
SustainablePower
BurstPower
ResourceRemaining
ThermalMargin
```

Do not collapse biological and mechanical energy into one simplistic percentage if doing so destroys meaningful differences.

---

## 5. Physics body and geometry

Initial representation:

**Rigid-body skeleton + joint constraints + simplified soft-structure proxies.**

Maintain distinct representations for:

```text
Visual Geometry
Physics Geometry
Damage Geometry
```

Initial physics geometry should primarily use:

- Sphere
- Capsule
- Box
- Cylinder
- Convex Hull

Simplified soft structures may use:

- Tension Element
- Spring / Damper Element
- Soft Volume Proxy

Initial biological approximations:

- Muscle = Actuator + Soft Volume Proxy
- Skin = thin Damage Proxy
- Organ = Volume Proxy

Full soft-body physics should remain an extension point rather than a v0.1 dependency.

**Physical accuracy should prioritize causal correctness over geometric realism.**

---

## 6. Capability and affordance

### 6.1 Capability

Capability is dynamically inferred, not stored as a game stat.

Conceptually:

```text
Capability =
Physical Potential
× Learned Skill
× Current State
× Environment
```

Agents must not directly read authoritative capability values as ground truth.

### 6.2 Affordance

Affordance means what an object or environment currently permits an agent to attempt given its body and state.

A rock is not intrinsically a weapon. It may be pushable, graspable, climbable, movable, or capable of causing damage when accelerated.

**Tool use is discovered use, not an item category.**

---

## 7. Skill

Skill is a reusable body-control strategy, not an animation or guaranteed action.

Initial hierarchy:

```text
Motor Primitive
Skill
Skill Composition
```

A Skill produces an attempt. Physics decides the outcome.

A body change may reduce or invalidate an existing Skill. Adaptation should modify or relearn control rather than switch to a hard-coded disability animation.

Initial learning may use:

- parameter adjustment
- strategy weights
- experience cache
- simple optimization

Deep online neural training is not required for v0.1.

---

## 8. Minimal agent brain

The Agent Brain is optional. Passive objects and non-autonomous machines do not require this layer.

Initial autonomous loop:

```text
Sensor
↓
Perception
↓
Self Model + World Model
↓
Drive
↓
Goal
↓
Planning
↓
Affordance
↓
Skill
↓
Actuator
↓
Physics
↓
Result
↓
Learning
↺
```

Initial Drives only:

- Maintain
- Avoid
- Acquire
- Explore

Goal describes a desired state change, not a prescribed action.

Planning should initially be short-horizon and rolling rather than a complex long-range planner.

---

## 9. Self Model and World Model

Agents do not possess world truth.

Self Model is the agent's estimate of its own body and current capability.

World Model is the agent's estimate of the surrounding world based on sensor input.

Both may be:

- wrong
- noisy
- stale
- incomplete

Learning should use prediction error:

**Prediction → real outcome → discrepancy → model update.**

---

## 10. Sensor and perception

All world information must enter an Agent through sensors.

Initial generic sensor families:

- Visual
- Acoustic
- Chemical
- Contact
- Internal / Proprioception

Shared sensor concepts:

```text
Range
Sensitivity
Resolution
Noise
Latency
DamageState
```

Sensor provides signal. Perception provides interpretation.

Core logic must not inject Entity identity, exact authoritative position, or hidden world state directly into the Agent.

---

## 11. Damage and functional dependency

Functional capability should emerge from dependency networks that transmit:

- Force
- Energy
- Material
- Signal
- Information

Partial degradation must be supported. Systems should not be limited to binary working/broken states.

Damage may redistribute load and produce secondary failure naturally.

v0.1:

- Damage: implement
- Natural Repair: defer
- God Repair: allow
- Repair interface: reserve

---

## 12. Environment

Initial universal abstractions:

```text
Surface
Medium / Volume
Field
Physical Object
```

Initial environment scope:

- gravity
- terrain slope
- differing surface friction
- obstacles
- simple water volumes
- simple temperature
- day/night
- Clear / Rain

Environmental effects must reach entities through physics, sensors, or material interactions rather than arbitrary game debuffs.

---

## 13. State, Event, Memory

Keep these concepts distinct:

- **State** = what exists now.
- **Event** = what changed.
- **Perception** = what an Agent sensed/interpreted.
- **Experience** = what the Agent retains.

Initial Event families:

- Contact
- Structural
- Transfer
- Perception
- Significant State Change

Events describe facts, not intent. Prefer "Part A contacted Part B with X force and caused structural change" over "Entity A attacked Entity B."

Important events may keep a simple `caused_by` chain for future causal inspection.

---

## 14. Simulation time

There is one authoritative world state, but systems may update at different frequencies.

Reference order:

```text
Environment
↓
Physics
↓
Damage / Structure
↓
Internal State
↓
Sensor
↓
Perception
↓
Self / World Model
↓
Drive / Goal / Planning
↓
Skill
↓
Actuator Command
↓
Event / Learning
```

Requirements:

- fixed-step simulation
- pause
- single-step tick
- slow motion
- seeded RNG

Agents control inputs, not outcomes. Physics has final authority.

Do not assume cross-platform bitwise determinism from the default Rapier build. Future replay/branching should use:

**World Snapshot + Event Stream + Seeded Agent RNG.**

---

## 15. Blueprint, runtime construction, and templates

Blueprint describes structure, not ability. Runtime construction must preserve the same rule: editing structure changes what the Entity physically is; it must not assign a game-style capability.

Initial operations:

- Create
- Attach
- Modify
- Detach
- Delete
- Save
- Load
- Validate

Template is only a prebuilt Blueprint.

Initial useful templates:

- Simple Object
- Simple Articulated Machine
- Generic Quadruped
- Generic Machine Quadruped

Species is not a core simulation type.

Natural-language creation should remain an interface extension and must not grant abilities directly.

---

## 16. First-version engineering philosophy

**Build a composable, testable, runnable universal simulation before building rich content.**

v0.1 must prioritize:

- World and Entity lifecycle
- Material / Part / Connection
- runtime construction and recomposition
- physics mapping
- Actuator
- Damage
- Environment
- Capability
- Sensor
- minimal optional Agent loop
- Skill
- adaptation after body-state change

Defer until the foundation is validated:

- realistic animal assets
- plant ecology
- reproduction
- development
- evolution
- disease
- natural healing
- complex society
- culture
- civilization
- very large worlds
- advanced weather
- natural-language creation
- full soft-body simulation

---

## 17. Dependency boundaries that must remain clear

Do not conflate:

- **Capability**: what the entity can currently achieve.
- **Affordance**: what the environment currently permits the entity to attempt.
- **Skill**: how the Agent has learned to control its body toward an outcome.

Do not conflate:

- **Connection**: real structural connection.
- **Relationship**: Entity-level relationship or interpretation.

Do not conflate:

- **Event**: world fact.
- **Memory**: Agent-retained experience.

---

## 18. Project rule for concrete content

Any animal, machine, scene, or future content must be expressed through universal rules wherever possible.

If a concrete requirement cannot be represented by the current universal abstractions:

**Review and extend the abstraction first, then implement the concrete object.**

Do not introduce species-specific core logic merely to obtain a faster demo.

The first milestone values **causal correctness over content volume and visual polish**.

A core mechanism is not considered sufficiently general merely because it works on the active quadruped. Where relevant, acceptance should demonstrate the same rule on passive structures, non-Agent machines, and Agent-bearing Entities without adding type-specific outcome logic.
