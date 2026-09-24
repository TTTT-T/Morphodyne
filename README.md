# Morphodyne

> **Entities have no predefined abilities. Capability emerges from structure.**

Morphodyne is a physics-first god sandbox focused on universal world rules, composable structures, physical interaction, and optional embodied agents.

The project is built around one central idea: entities do not receive game-style abilities such as `canWalk`, `attackPower`, or `biteDamage`. Their capabilities emerge from body structure, materials, connections, actuators, learned control, current condition, and the environment.

## Core principles

- **Capability emerges from structure.**
- **Physics has final authority over outcomes.**
- **Damage changes structure instead of subtracting HP.**
- **Agents act on perception and belief, not world truth.**
- **Skills are reusable control strategies, not canned animations.**
- **Non-core systems may be simplified, but may not bypass core rules to manufacture outcomes.**
- **Biological and mechanical entities share interfaces, not forced identical mechanisms.**

## v0.1 goal

The first milestone is not a rich ecosystem or polished game. It is a small, testable simulation foundation that proves the following chain works:

`Structure → Capability → Perception → Decision → Control → Physics → Damage → Learning`

The initial implementation uses TypeScript, Three.js, Rapier 3D, and Vite. Three.js is the rendering layer; Rapier is the physics execution backend; Morphodyne owns the simulation semantics and universal rules.

## Development model

Development is phase-based. Each phase must be implemented, tested, documented, and accepted before the next phase begins.

See:

- [`docs/ARCHITECTURE_v0.1.md`](docs/ARCHITECTURE_v0.1.md)
- [`docs/ROADMAP_v0.1.md`](docs/ROADMAP_v0.1.md)
- [`NEXT_TASK.md`](NEXT_TASK.md) — current Codex handoff
- [`docs/PHASE0_KICKOFF.md`](docs/PHASE0_KICKOFF.md)

## Status

**v0.1 simulation foundation validated. Phase 8 Construction + God Sandbox + Core Validation complete.**

The v0.1 foundation now includes WorldRuntime, Environment, runtime construction/recomposition, God Sandbox tooling, optional Agent systems, structural damage, sensing, and adaptation. The active quadruped remains a validation Blueprint, not the architectural center of the project.


## Quick start

```bash
git clone https://github.com/TTTT-T/Morphodyne.git
cd Morphodyne
npm ci
npm run dev
```

The browser scene renders an active Blueprint from Rapier poses. Its overlay shows sensor status, range returns, contact measurements, and structural separation. The controller receives proprioception through the perception view; the debug renderer remains a direct view of physical state.

Run `npm test`, `npm run typecheck`, and `npm run build` for the Mac acceptance checks. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for module boundaries and bootstrap scripts.
