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

The initial implementation uses Unity 6.3 LTS, C#, PhysX rigid-body physics, modular pure-C# simulation core logic, and a Unity physics adapter.

## Development model

Development is phase-based. Each phase must be implemented, tested, documented, and accepted before the next phase begins.

See:

- [`docs/ARCHITECTURE_v0.1.md`](docs/ARCHITECTURE_v0.1.md)
- [`docs/ROADMAP_v0.1.md`](docs/ROADMAP_v0.1.md)
- [`docs/PHASE0_KICKOFF.md`](docs/PHASE0_KICKOFF.md)
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- [`docs/LOGGING.md`](docs/LOGGING.md)

## Status

**Pre-alpha / Phase 0 foundation.**

The project currently prioritizes correct interfaces, modularity, causal correctness, and testability over visual fidelity or content volume.
