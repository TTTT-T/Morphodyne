# Arena v0.1.1 — visual model review

## Visual structure

- **Rammer:** a low dark frame carries layered copper armor, side rails, two small front lights, wheel hubs, and a compact two-tip ram. The ram is parented to the existing `rammer-nose` Part. Its visible tips remain inside that Part's box collider (local front X ≤ 0.265 m versus collider limit 0.27 m), so the shape does not promise a longer strike.
- **Gripper:** a teal framed body has a differentiated upper shell, lit front, spherical-tire wheel assemblies and two independent clamp housings. Each jaw's inner pad, cap, and bolt belong to its own existing prismatic jaw Part; the open gap and closing direction are visible from the Arena camera. The pads stay inside the jaw box collider.
- The floor has a central line, boundary stripes, and two color-coded spawn rings. A closer oblique camera shows the opposing profiles and both jaw arms. Fighter cards use the same two colors. These are presentation only.
- Intact Parts retain their palette. `degraded` Parts shift toward orange; `fractured` or `separated` Parts darken and show red emission. This reads the existing `DamageState` and never writes to it.

## Rendering boundary

`PartVisual` describes local decorative pieces and materials in `src/rendering`; `ArenaVisuals` maps Arena fixture Part IDs to those descriptors in `src/tools`. `ThreeSmokeRenderer` stores one Three.js group per physical Part handle. Every frame the group root receives that Part's Rapier pose through the existing world-facing body view. No assembly is parented to a chassis unless its whole visual belongs to that chassis Part. Removing or resetting a Part disposes all geometry and materials in its group. A fractured or detached jaw therefore carries its entire appearance with its real physical body.

The renderer's default primitive path remains available for the God Sandbox. Visual descriptors are absent from Core, Blueprint, PhysicsAdapter, and WorldRuntime. The Arena visual change touched no Part mass or collider, Connection anchor/type/limit, Actuator, Energy, Material threshold, opponent controller, or damage rule. The diff of `src/core`, `src/physics`, `src/simulation`, `src/tools/ArenaFixtures.ts`, and `src/tools/ArenaOpponent.ts` is empty.

## Verification

- `npm test`: 42 files, 164 tests passed, including the existing Arena contact, damage, reset, and opponent tests.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite retained its existing large-chunk advisory.
- `npm run check:boundaries`: passed, 46 TypeScript files checked.
- Browser at `http://127.0.0.1:5173/#arena`: both mechanical bodies, jaw gap, wheel hubs, ram, spawn markings, and HUD colors inspected at the initial pose. In a live run Gripper reached two fractured Parts and two separated Connections; its detached jaw visuals moved with the separated Parts. Reset restored two intact Fighters at their original positions and paused time 0.0 s. Browser error log was empty.
- Windows validation was not run. This pass changes Three.js presentation only.
