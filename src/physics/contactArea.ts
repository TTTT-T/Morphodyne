import type { Geometry, Vector3 } from '../core/model';

/** A 1 mm support layer models finite surface compliance, not Hertz elasticity. */
export const CONTACT_LAYER_M = 0.001;
export const MIN_CONTACT_AREA_M2 = 1e-8;
const dot = (a: Vector3, b: Vector3) => a.x*b.x + a.y*b.y + a.z*b.z;
const cross = (a: Vector3, b: Vector3): Vector3 => ({ x: a.y*b.z-a.z*b.y, y: a.z*b.x-a.x*b.z, z: a.x*b.y-a.y*b.x });
const unit = (v: Vector3): Vector3 => {
  const m = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(m) || m === 0) throw new RangeError('Contact normal must be finite and nonzero');
  return { x: v.x/m, y: v.y/m, z: v.z/m };
};

/** Project the convex support layer onto its tangent plane and take its hull. */
function polyhedralArea(points: readonly Vector3[], n: Vector3): number {
  const support = Math.max(...points.map(p => dot(p, n)));
  const cutoff = support - CONTACT_LAYER_M;
  const cap = points.filter(p => dot(p, n) >= cutoff);
  // All segments lie inside the hull. Including every pair contains every real
  // edge intersection and gives the same projected clipped hull without topology.
  for (let i = 0; i < points.length; i++) for (let j = i+1; j < points.length; j++) {
    const a = points[i], b = points[j], da = dot(a, n)-cutoff, db = dot(b, n)-cutoff;
    if (da*db >= 0) continue;
    const t = da/(da-db);
    cap.push({ x: a.x+t*(b.x-a.x), y: a.y+t*(b.y-a.y), z: a.z+t*(b.z-a.z) });
  }
  const u = unit(cross(n, Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }));
  const v = cross(n, u);
  const projected = cap.map(p => ({ x: dot(p, u), y: dot(p, v) })).sort((a,b) => a.x-b.x || a.y-b.y);
  const turn = (a: {x:number;y:number}, b: {x:number;y:number}, c: {x:number;y:number}) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half = (pts: typeof projected) => {
    const hull: typeof projected = [];
    for (const p of pts) {
      while (hull.length >= 2 && turn(hull[hull.length-2], hull[hull.length-1], p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  const hull = [...half(projected), ...half([...projected].reverse())];
  return Math.abs(hull.reduce((sum,p,i) => {
    const q = hull[(i+1)%hull.length];
    return sum+p.x*q.y-p.y*q.x;
  }, 0))/2;
}

/** Geometry-local outward normal. Returns m²; independent of IDs and materials. */
export function estimateContactAreaM2(geometry: Geometry, normal: Vector3): number {
  const n = unit(normal);
  let area: number;
  switch (geometry.kind) {
    case 'box': {
      const h = geometry.halfExtents;
      const points = [-1,1].flatMap(x => [-1,1].flatMap(y => [-1,1].map(z => ({ x:x*h.x, y:y*h.y, z:z*h.z }))));
      area = polyhedralArea(points, n);
      break;
    }
    case 'convex': area = polyhedralArea(geometry.points, n); break;
    case 'sphere': {
      const d = Math.min(CONTACT_LAYER_M, geometry.radius);
      area = Math.PI*(2*geometry.radius*d-d*d);
      break;
    }
    case 'capsule': {
      const d = Math.min(CONTACT_LAYER_M, geometry.radius);
      const capRadius = Math.sqrt(2*geometry.radius*d-d*d);
      // Rounded cap plus projected axial support within the same surface layer.
      const supportedLength = Math.abs(n.y) < 1e-12 ? 2*geometry.halfHeight
        : Math.min(2*geometry.halfHeight, d/Math.abs(n.y));
      area = Math.PI*capRadius*capRadius + 2*capRadius*supportedLength*Math.sqrt(Math.max(0, 1-n.y*n.y));
      break;
    }
  }
  return Math.max(MIN_CONTACT_AREA_M2, area);
}
