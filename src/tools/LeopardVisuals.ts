import type { Vector3 } from '../core/model';
import type { PartVisual, VisualPiece } from '../rendering/PartVisual';

const v = (x: number, y: number, z: number): Vector3 => ({ x, y, z });

const palette = {
  body: 0xc88735,
  bodyLight: 0xe2a74b,
  bodyDark: 0x9b5d25,
  belly: 0xe7c477,
  spots: 0x2b1b16,
  nose: 0x211616,
  eye: 0x11100c,
  eyeGlow: 0xcfae38,
  ear: 0x5d3025,
  pawPad: 0x3a211b,
  claw: 0xe8d3a0,
} as const;

function box(
  size: Vector3,
  position: Vector3,
  color: number,
  metalness = 0.05,
  roughness = 0.78,
): VisualPiece {
  return { shape: { kind: 'box', size }, position, color, metalness, roughness };
}

function sphere(
  radius: number,
  position: Vector3,
  color: number,
  metalness = 0.02,
  roughness = 0.82,
): VisualPiece {
  return { shape: { kind: 'sphere', radius }, position, color, metalness, roughness };
}

function ellipsoid(radii: Vector3, position: Vector3, color: number): VisualPiece {
  return { shape: { kind: 'ellipsoid', radii }, position, color, metalness: 0.02, roughness: 0.84 };
}

function cylinder(
  radius: number,
  depth: number,
  position: Vector3,
  color: number,
  rotation = v(0, 0, 0),
  metalness = 0.02,
  roughness = 0.82,
): VisualPiece {
  return { shape: { kind: 'cylinder', radius, depth }, position, rotation, color, metalness, roughness };
}

function cone(
  radius: number,
  height: number,
  position: Vector3,
  color: number,
  metalness = 0.02,
  roughness = 0.82,
): VisualPiece {
  return { shape: { kind: 'cone', radius, height }, position, color, metalness, roughness };
}

/**
 * These assemblies are deliberately local to one Blueprint Part. The +X end
 * is always the leopard's head/front; Y is up and Z is the left/right axis.
 */
const leopardChest: PartVisual = { pieces: [
  ellipsoid(v(0.70, 0.29, 0.37), v(0, 0, 0), palette.body),
  cylinder(0.22, 0.12, v(-0.66, 0, 0), palette.body, v(0, 0, Math.PI / 2)),
  ellipsoid(v(0.53, 0.12, 0.30), v(0, -0.15, 0), palette.belly),
  ellipsoid(v(0.23, 0.24, 0.34), v(0.45, 0.01, 0), palette.bodyLight),
  // Side spots stay flush with the body silhouette instead of becoming
  // decorative geometry that changes the apparent collision envelope.
  ellipsoid(v(0.07, 0.045, 0.012), v(0.25, 0.03, -0.35), palette.spots),
  ellipsoid(v(0.065, 0.045, 0.012), v(-0.12, 0.06, -0.36), palette.spots),
  ellipsoid(v(0.07, 0.045, 0.012), v(-0.30, -0.07, -0.32), palette.spots),
  ellipsoid(v(0.07, 0.045, 0.012), v(0.25, 0.03, 0.35), palette.spots),
  ellipsoid(v(0.065, 0.045, 0.012), v(-0.12, 0.06, 0.36), palette.spots),
  ellipsoid(v(0.07, 0.045, 0.012), v(-0.30, -0.07, 0.32), palette.spots),
] };

const leopardPelvis: PartVisual = { pieces: [
  ellipsoid(v(0.51, 0.29, 0.39), v(0, 0, 0), palette.bodyDark),
  cylinder(0.22, 0.12, v(0.46, 0, 0), palette.bodyDark, v(0, 0, Math.PI / 2)),
  ellipsoid(v(0.40, 0.12, 0.30), v(0, -0.15, 0), palette.belly),
  sphere(0.095, v(0.21, 0.03, -0.19), palette.bodyLight),
  sphere(0.095, v(0.21, 0.03, 0.19), palette.bodyLight),
  ellipsoid(v(0.065, 0.045, 0.012), v(0.16, 0.08, -0.37), palette.spots),
  ellipsoid(v(0.06, 0.04, 0.012), v(-0.18, 0.05, -0.37), palette.spots),
  ellipsoid(v(0.065, 0.045, 0.012), v(0.16, 0.08, 0.37), palette.spots),
  ellipsoid(v(0.06, 0.04, 0.012), v(-0.18, 0.05, 0.37), palette.spots),
] };

const leopardNeck: PartVisual = { pieces: [
  ellipsoid(v(0.165, 0.19, 0.21), v(0, 0, 0), palette.body),
  cylinder(0.14, 0.10, v(-0.12, 0, 0), palette.body, v(0, 0, Math.PI / 2)),
  box(v(0.08, 0.07, 0.014), v(0.02, 0.08, -0.147), palette.spots),
  box(v(0.07, 0.06, 0.014), v(-0.08, -0.03, 0.147), palette.spots),
] };

const leopardHead: PartVisual = { pieces: [
  ellipsoid(v(0.29, 0.21, 0.23), v(0, 0, 0), palette.body),
  ellipsoid(v(0.15, 0.10, 0.15), v(0.12, -0.06, 0), palette.bodyLight),
  // Small upright cones read as ears while remaining close to the head Part.
  cone(0.045, 0.10, v(-0.065, 0.095, -0.090), palette.bodyDark),
  cone(0.045, 0.10, v(-0.065, 0.095, 0.090), palette.bodyDark),
  cone(0.026, 0.060, v(-0.065, 0.104, -0.090), palette.ear),
  cone(0.026, 0.060, v(-0.065, 0.104, 0.090), palette.ear),
  sphere(0.019, v(0.145, 0.055, -0.198), palette.eye, 0.0, 0.42),
  sphere(0.019, v(0.145, 0.055, 0.198), palette.eye, 0.0, 0.42),
  sphere(0.009, v(0.162, 0.058, -0.213), palette.eyeGlow, 0.0, 0.35),
  sphere(0.009, v(0.162, 0.058, 0.213), palette.eyeGlow, 0.0, 0.35),
  sphere(0.026, v(0.26, -0.07, 0), palette.nose),
] };

const leopardJaw: PartVisual = { pieces: [
  box(v(0.68, 0.10, 0.39), v(0, 0, 0), palette.bodyDark),
  box(v(0.42, 0.06, 0.30), v(0.11, -0.025, 0), palette.bodyLight),
  box(v(0.34, 0.016, 0.28), v(0.15, 0.042, 0), palette.spots),
  sphere(0.025, v(0.31, -0.01, 0), palette.nose),
  // These tiny teeth are presentation hints only and sit inside the jaw Part.
  cone(0.012, 0.038, v(0.28, 0.03, -0.064), palette.claw),
  cone(0.012, 0.038, v(0.28, 0.03, 0.064), palette.claw),
] };

function tailVisual(radius: number, depth: number, stripeX: number): PartVisual {
  return { pieces: [
    cylinder(radius, depth, v(0, 0, 0), palette.body, v(0, 0, Math.PI / 2)),
    cylinder(radius + 0.002, 0.025, v(stripeX, 0, 0), palette.spots, v(0, 0, Math.PI / 2)),
    sphere(radius * 0.82, v(-depth * 0.43, 0, 0), palette.bodyDark),
  ] };
}

const leopardTail1 = tailVisual(0.085, 0.34, 0.105);
const leopardTail2 = tailVisual(0.067, 0.30, 0.090);
const leopardTail3: PartVisual = { pieces: [
  cylinder(0.052, 0.25, v(0, 0, 0), palette.bodyDark, v(0, 0, Math.PI / 2)),
  cylinder(0.055, 0.025, v(0.085, 0, 0), palette.spots, v(0, 0, Math.PI / 2)),
  sphere(0.046, v(0.115, 0, 0), palette.spots),
] };

type LegSide = 'left' | 'right';
type LegSegment = 'upper' | 'lower' | 'paw';

function legVisual(side: LegSide, segment: LegSegment, hind: boolean): PartVisual {
  const outward = side === 'left' ? -1 : 1;
  const upperColor = hind ? palette.bodyDark : palette.body;
  const lowerColor = hind ? palette.body : palette.bodyLight;
  const spotZ = outward * (segment === 'paw' ? 0.072 : 0.086);

  if (segment === 'upper') {
    return { pieces: [
      ellipsoid(v(0.13, 0.19, 0.095), v(0, 0, 0), upperColor),
      sphere(0.070, v(0, 0.13, 0), palette.bodyDark),
      box(v(0.065, 0.07, 0.014), v(0.03, 0.04, spotZ), palette.spots),
    ] };
  }

  if (segment === 'lower') {
    return { pieces: [
      ellipsoid(v(0.11, 0.15, 0.095), v(0, 0, 0), lowerColor),
      sphere(0.056, v(0, -0.12, 0), palette.bodyLight),
      box(v(0.055, 0.06, 0.014), v(0.01, 0.05, spotZ), palette.spots),
    ] };
  }

  return { pieces: [
    box(v(0.18, 0.10, 0.16), v(0.035, -0.035, 0), palette.bodyDark),
    box(v(0.13, 0.018, 0.11), v(0.045, -0.087, 0), palette.pawPad),
    box(v(0.050, 0.016, 0.022), v(0.105, -0.090, outward * 0.045), palette.claw),
    box(v(0.050, 0.016, 0.022), v(0.105, -0.090, outward * 0.005), palette.claw),
  ] };
}

const leopardFrontLeftUpper = legVisual('left', 'upper', false);
const leopardFrontLeftLower = legVisual('left', 'lower', false);
const leopardFrontLeftPaw = legVisual('left', 'paw', false);
const leopardFrontRightUpper = legVisual('right', 'upper', false);
const leopardFrontRightLower = legVisual('right', 'lower', false);
const leopardFrontRightPaw = legVisual('right', 'paw', false);
const leopardHindLeftUpper = legVisual('left', 'upper', true);
const leopardHindLeftLower = legVisual('left', 'lower', true);
const leopardHindLeftPaw = legVisual('left', 'paw', true);
const leopardHindRightUpper = legVisual('right', 'upper', true);
const leopardHindRightLower = legVisual('right', 'lower', true);
const leopardHindRightPaw = legVisual('right', 'paw', true);

/** All physical Part IDs that receive a leopard visual assembly. */
export const LEOPARD_PART_IDS = [
  'leopard-chest', 'leopard-pelvis', 'leopard-neck', 'leopard-head', 'leopard-jaw',
  'leopard-tail-1', 'leopard-tail-2', 'leopard-tail-3',
  'leopard-front-left-upper', 'leopard-front-left-lower', 'leopard-front-left-paw',
  'leopard-front-right-upper', 'leopard-front-right-lower', 'leopard-front-right-paw',
  'leopard-hind-left-upper', 'leopard-hind-left-lower', 'leopard-hind-left-paw',
  'leopard-hind-right-upper', 'leopard-hind-right-lower', 'leopard-hind-right-paw',
] as const;

/** Rendering-only lookup. Part pose and all separation behavior remain physical. */
export function leopardPartVisual(partId: string): PartVisual | undefined {
  switch (partId) {
    case 'leopard-chest': return leopardChest;
    case 'leopard-pelvis': return leopardPelvis;
    case 'leopard-neck': return leopardNeck;
    case 'leopard-head': return leopardHead;
    case 'leopard-jaw': return leopardJaw;
    case 'leopard-tail-1': return leopardTail1;
    case 'leopard-tail-2': return leopardTail2;
    case 'leopard-tail-3': return leopardTail3;
    case 'leopard-front-left-upper': return leopardFrontLeftUpper;
    case 'leopard-front-left-lower': return leopardFrontLeftLower;
    case 'leopard-front-left-paw': return leopardFrontLeftPaw;
    case 'leopard-front-right-upper': return leopardFrontRightUpper;
    case 'leopard-front-right-lower': return leopardFrontRightLower;
    case 'leopard-front-right-paw': return leopardFrontRightPaw;
    case 'leopard-hind-left-upper': return leopardHindLeftUpper;
    case 'leopard-hind-left-lower': return leopardHindLeftLower;
    case 'leopard-hind-left-paw': return leopardHindLeftPaw;
    case 'leopard-hind-right-upper': return leopardHindRightUpper;
    case 'leopard-hind-right-lower': return leopardHindRightLower;
    case 'leopard-hind-right-paw': return leopardHindRightPaw;
    default: return undefined;
  }
}
