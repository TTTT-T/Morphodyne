# Morphodyne

> **Entities have no predefined abilities. Capability emerges from structure.**

Morphodyne is a physics-first god sandbox focused on embodied agents, structural simulation, damage, perception, learning, and emergent behavior.

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
- [`docs/PHASE0_KICKOFF.md`](docs/PHASE0_KICKOFF.md)

## Status

**Pre-alpha / Phase 0 foundation — Three.js/Rapier technical pivot.**

The project currently prioritizes correct interfaces, modularity, causal correctness, and testability over visual fidelity or content volume.


## Quick start

```bash
git clone https://github.com/TTTT-T/Morphodyne.git
cd Morphodyne
npm ci
npm run dev
```

The Phase 0 smoke scene intentionally stays minimal: a Rapier-driven rigid body rendered by Three.js. Its overlay shows the simulation tick and cube height. The cube should settle near y=0.5 on the ground. It proves adapter wiring, while Blueprint-to-body mapping remains Phase 1 work.

Run `npm test`, `npm run typecheck`, and `npm run build` for the Mac acceptance checks. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for module boundaries and bootstrap scripts.
