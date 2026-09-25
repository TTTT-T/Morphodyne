import type { Vector3 } from '../core/model';
import type { PartVisual, VisualPiece } from '../rendering/PartVisual';

const v = (x: number, y: number, z: number): Vector3 => ({ x, y, z });
const box = (size: Vector3, position: Vector3, color: number, metalness = 0.55): VisualPiece =>
  ({ shape: { kind: 'box', size }, position, color, metalness, roughness: 0.48 });
const cylinder = (radius: number, depth: number, position: Vector3, color: number): VisualPiece =>
  ({ shape: { kind: 'cylinder', radius, depth }, position, rotation: v(Math.PI / 2, 0, 0),
    color, metalness: 0.55, roughness: 0.45 });

const rammer = {
  shell: 0xa84330, armor: 0xd46a40, edge: 0xefb16c, dark: 0x27313a,
  iron: 0x667783, light: 0xffc273,
};
const gripper = {
  shell: 0x1e7894, armor: 0x42b6c1, edge: 0x94e2dd, dark: 0x203844,
  iron: 0x617e89, light: 0x8bf4df,
};

function wheel(accent: number): PartVisual {
  return { pieces: [
    { shape: { kind: 'sphere', radius: 0.275 }, color: 0x20262b, roughness: 0.87 },
    cylinder(0.22, 0.35, v(0, 0, 0), 0x343e45),
    cylinder(0.15, 0.022, v(0, 0, -0.25), 0x71818b),
    cylinder(0.15, 0.022, v(0, 0, 0.25), 0x71818b),
    cylinder(0.085, 0.022, v(0, 0, -0.265), accent),
    cylinder(0.085, 0.022, v(0, 0, 0.265), accent),
  ] };
}

const rammerChassis: PartVisual = { pieces: [
  box(v(1.07, 0.34, 0.66), v(0, 0, 0), rammer.dark),
  box(v(0.91, 0.085, 0.58), v(0.03, 0.19, 0), rammer.shell),
  box(v(0.79, 0.025, 0.50), v(0.02, 0.24, 0), rammer.armor),
  box(v(0.68, 0.12, 0.055), v(0, 0.12, -0.31), rammer.armor),
  box(v(0.68, 0.12, 0.055), v(0, 0.12, 0.31), rammer.armor),
  box(v(0.12, 0.18, 0.42), v(0.49, 0.01, 0), rammer.iron),
  box(v(0.31, 0.045, 0.39), v(-0.32, 0.26, 0), rammer.dark),
  box(v(0.46, 0.07, 0.07), v(-0.08, 0.25, -0.26), rammer.edge),
  box(v(0.46, 0.07, 0.07), v(-0.08, 0.25, 0.26), rammer.edge),
  box(v(0.04, 0.12, 0.12), v(0.50, 0.16, -0.23), rammer.edge),
  box(v(0.04, 0.12, 0.12), v(0.50, 0.16, 0.23), rammer.edge),
  { shape: { kind: 'sphere', radius: 0.045 }, position: v(0.53, 0.17, -0.23),
    color: rammer.light, emissive: rammer.light, emissiveIntensity: 1.2 },
  { shape: { kind: 'sphere', radius: 0.045 }, position: v(0.53, 0.17, 0.23),
    color: rammer.light, emissive: rammer.light, emissiveIntensity: 1.2 },
] };

const rammerNose: PartVisual = { pieces: [
  box(v(0.40, 0.20, 0.39), v(-0.06, 0, 0), rammer.dark),
  box(v(0.30, 0.19, 0.38), v(-0.09, 0, 0), rammer.iron),
  box(v(0.09, 0.22, 0.38), v(0.10, 0, 0), rammer.armor),
  { shape: { kind: 'cone', radius: 0.082, height: 0.23 }, position: v(0.15, 0, -0.105),
    rotation: v(0, 0, -Math.PI / 2), color: 0xd1b791, metalness: 0.7, roughness: 0.34 },
  { shape: { kind: 'cone', radius: 0.082, height: 0.23 }, position: v(0.15, 0, 0.105),
    rotation: v(0, 0, -Math.PI / 2), color: 0xd1b791, metalness: 0.7, roughness: 0.34 },
  box(v(0.07, 0.18, 0.05), v(-0.23, 0, -0.14), rammer.edge),
  box(v(0.07, 0.18, 0.05), v(-0.23, 0, 0.14), rammer.edge),
] };

const gripperChassis: PartVisual = { pieces: [
  box(v(1.06, 0.34, 0.66), v(0, 0, 0), gripper.dark),
  box(v(0.90, 0.085, 0.56), v(0, 0.19, 0), gripper.shell),
  box(v(0.71, 0.025, 0.48), v(0.07, 0.24, 0), gripper.armor),
  box(v(0.56, 0.08, 0.055), v(0.03, 0.13, -0.31), gripper.armor),
  box(v(0.56, 0.08, 0.055), v(0.03, 0.13, 0.31), gripper.armor),
  box(v(0.17, 0.16, 0.31), v(-0.45, 0.02, 0), gripper.iron),
  box(v(0.30, 0.05, 0.07), v(-0.28, 0.20, -0.30), gripper.edge),
  box(v(0.30, 0.05, 0.07), v(-0.28, 0.20, 0.30), gripper.edge),
  box(v(0.035, 0.06, 0.20), v(-0.54, 0.11, 0), gripper.edge),
  { shape: { kind: 'sphere', radius: 0.045 }, position: v(-0.54, 0.16, -0.18),
    color: gripper.light, emissive: gripper.light, emissiveIntensity: 1.35 },
  { shape: { kind: 'sphere', radius: 0.045 }, position: v(-0.54, 0.16, 0.18),
    color: gripper.light, emissive: gripper.light, emissiveIntensity: 1.35 },
] };

function jaw(side: 'left' | 'right'): PartVisual {
  const inside = side === 'left' ? 1 : -1;
  return { pieces: [
    box(v(0.52, 0.24, 0.19), v(0, 0, 0), gripper.dark),
    box(v(0.42, 0.045, 0.18), v(0, 0.11, 0), gripper.armor),
    box(v(0.41, 0.15, 0.04), v(-0.02, 0, -inside * 0.07), gripper.shell),
    box(v(0.43, 0.12, 0.025), v(-0.02, -0.01, inside * 0.083), gripper.edge),
    box(v(0.06, 0.18, 0.18), v(-0.22, 0, 0), gripper.iron),
    box(v(0.05, 0.04, 0.11), v(0.21, 0.065, 0), gripper.edge),
    cylinder(0.055, 0.09, v(0.17, 0.08, 0), gripper.iron),
  ] };
}

/** Fixture IDs select only appearance; all movement and failure still come from physical Parts. */
export function arenaPartVisual(partId: string): PartVisual | undefined {
  switch (partId) {
    case 'rammer-chassis': return rammerChassis;
    case 'rammer-nose': return rammerNose;
    case 'gripper-chassis': return gripperChassis;
    case 'gripper-left-jaw': return jaw('left');
    case 'gripper-right-jaw': return jaw('right');
    case 'rammer-left-wheel':
    case 'rammer-right-wheel': return wheel(rammer.armor);
    case 'gripper-left-wheel':
    case 'gripper-right-wheel': return wheel(gripper.armor);
    default: return undefined;
  }
}
