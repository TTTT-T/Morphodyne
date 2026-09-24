import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { Geometry, Pose, Vector3 } from '../core/model';

/** Presentation status supplied by the world-facing caller for debug overlays. */
export type DebugVisualStatus =
  | 'normal'
  | 'connected'
  | 'active'
  | 'inactive'
  | 'damaged'
  | 'separated'
  | 'selected';

interface DebugVisualStyle {
  readonly color: number;
  readonly opacity: number;
}

interface TensionDebugVisual {
  readonly line: THREE.Line;
  readonly fromMarker: THREE.Mesh;
  readonly toMarker: THREE.Mesh;
}

/** Presentation only: no physics stepping or world-rule decisions. */
export class ThreeSmokeRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly debugRays = new Map<string, THREE.Line>();
  private readonly debugConnections = new Map<string, THREE.Line>();
  private readonly debugActuators = new Map<string, THREE.Line>();
  private readonly tensionDebugVisuals = new Map<string, TensionDebugVisual>();
  private readonly environmentMeshes = new Map<string, THREE.Mesh>();
  private readonly highlightedParts = new Set<number>();
  private daylight = -1;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x15191f);
    this.camera.position.set(5, 4, 7);
    this.camera.lookAt(0, 1, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(4, 8, 4);
    this.scene.add(sun);
    addEventListener('resize', () => this.resize());
  }

  addBox(handle: number, halfExtents: Vector3, color: number): void {
    this.addMesh(
      handle,
      new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
      color,
    );
  }

  /** Render an Environment-owned surface as presentation of its current spec. */
  addEnvironmentSurface(id: string, halfExtents: Vector3, pose: Pose, color: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    mesh.position.set(pose.position.x, pose.position.y, pose.position.z);
    mesh.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
    this.addEnvironmentMesh(id, mesh);
  }

  /** Water is a translucent visual volume; physics behavior comes from EnvironmentRuntime. */
  addWaterVolume(id: string, min: Vector3, max: Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(max.x - min.x, max.y - min.y, max.z - min.z),
      new THREE.MeshStandardMaterial({ color: 0x299ac2, transparent: true, opacity: 0.3, roughness: 0.35 }),
    );
    mesh.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    this.addEnvironmentMesh(id, mesh);
  }

  setDaylightFactor(value: number): void {
    const factor = Math.max(0, Math.min(1, value));
    if (Math.abs(factor - this.daylight) < 1e-4) return;
    this.daylight = factor;
    this.scene.background = new THREE.Color(0x15191f).lerp(new THREE.Color(0x9ac8e5), factor * 0.72);
    this.scene.traverse((object) => {
      if (object instanceof THREE.HemisphereLight) object.intensity = 0.3 + factor * 2.2;
      if (object instanceof THREE.DirectionalLight) object.intensity = 0.15 + factor * 1.85;
    });
  }

  /** Add the presentation shape for one runtime Part. Physics owns its pose. */
  addPart(handle: number, geometry: Geometry, color: number): void {
    let threeGeometry: THREE.BufferGeometry;
    switch (geometry.kind) {
      case 'box':
        threeGeometry = new THREE.BoxGeometry(
          geometry.halfExtents.x * 2,
          geometry.halfExtents.y * 2,
          geometry.halfExtents.z * 2,
        );
        break;
      case 'sphere':
        threeGeometry = new THREE.SphereGeometry(geometry.radius, 24, 16);
        break;
      case 'capsule':
        threeGeometry = new THREE.CapsuleGeometry(geometry.radius, geometry.halfHeight * 2, 8, 16);
        break;
      case 'convex':
        threeGeometry = new ConvexGeometry(
          geometry.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
        );
        break;
    }
    this.addMesh(handle, threeGeometry, color);
  }

  setPose(handle: number, pose: Pose): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) throw new Error(`No mesh for body handle: ${handle}`);
    mesh.position.set(pose.position.x, pose.position.y, pose.position.z);
    mesh.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
  }

  removePart(handle: number): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else mesh.material.dispose();
    this.meshes.delete(handle);
    this.highlightedParts.delete(handle);
  }

  /** Highlight one Part mesh supplied by the world-to-render mapping. */
  setSelectedPart(handle: number | undefined): void {
    for (const previous of this.highlightedParts) {
      if (previous === handle) continue;
      this.highlightedParts.delete(previous);
      this.setPartHighlight(previous, false);
    }
    if (handle === undefined) return;
    this.highlightedParts.add(handle);
    this.setPartHighlight(handle, true);
  }

  /** Set or clear a Part highlight without changing which other Parts are selected. */
  setPartHighlight(handle: number, highlighted: boolean): void {
    if (highlighted) this.highlightedParts.add(handle);
    else this.highlightedParts.delete(handle);
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.emissive.setHex(highlighted ? 0xffd166 : 0x000000);
      material.emissiveIntensity = highlighted ? 0.8 : 0;
    }
  }

  /** Display a sensor sample supplied by the simulation. Rendering never performs a query. */
  setDebugRay(id: string, origin: Vector3, end: Vector3, active: boolean): void {
    const previous = this.debugRays.get(id);
    if (previous) {
      const positions = previous.geometry.getAttribute('position') as THREE.BufferAttribute;
      positions.setXYZ(0, origin.x, origin.y, origin.z);
      positions.setXYZ(1, end.x, end.y, end.z);
      positions.needsUpdate = true;
      (previous.material as THREE.LineBasicMaterial).color.setHex(active ? 0x63d7ac : 0x6b727c);
      return;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: active ? 0x63d7ac : 0x6b727c }));
    this.debugRays.set(id, line);
    this.scene.add(line);
  }

  /** Draw a structural Connection between world-space anchor points. */
  setDebugConnection(id: string, from: Vector3, to: Vector3, status: DebugVisualStatus): void {
    this.setDebugLine(this.debugConnections, id, from, to, status, 0x7f8997);
  }

  removeDebugConnection(id: string): void {
    this.removeDebugLine(this.debugConnections, id);
  }

  /** Draw an actuator's world-space output span; the caller supplies its current status. */
  setDebugActuator(id: string, from: Vector3, to: Vector3, status: DebugVisualStatus): void {
    this.setDebugLine(this.debugActuators, id, from, to, status, 0xb98dff);
  }

  removeDebugActuator(id: string): void {
    this.removeDebugLine(this.debugActuators, id);
  }

  /**
   * Draw a Tension Actuator span and its two world-space attachment markers.
   * Rendering receives endpoint positions from the simulation; it never resolves them.
   */
  setTensionAttachmentPoints(id: string, from: Vector3, to: Vector3, status: DebugVisualStatus): void {
    const style = this.debugStyle(status, 0x5fcbe8);
    const existing = this.tensionDebugVisuals.get(id);
    if (existing) {
      this.updateLine(existing.line, from, to, style);
      this.updateMarker(existing.fromMarker, from, style);
      this.updateMarker(existing.toMarker, to, style);
      return;
    }

    const line = this.createLine(from, to, style);
    const fromMarker = this.createMarker(from, style);
    const toMarker = this.createMarker(to, style);
    this.tensionDebugVisuals.set(id, { line, fromMarker, toMarker });
    this.scene.add(line, fromMarker, toMarker);
  }

  removeTensionAttachmentPoints(id: string): void {
    const visual = this.tensionDebugVisuals.get(id);
    if (!visual) return;
    this.scene.remove(visual.line, visual.fromMarker, visual.toMarker);
    visual.line.geometry.dispose();
    (visual.line.material as THREE.Material).dispose();
    visual.fromMarker.geometry.dispose();
    (visual.fromMarker.material as THREE.Material).dispose();
    visual.toMarker.geometry.dispose();
    (visual.toMarker.material as THREE.Material).dispose();
    this.tensionDebugVisuals.delete(id);
  }

  setMountedSensorRay(id: string, partPose: Pose, localPose: Pose, forward: Vector3, range: number, active: boolean): void {
    const partRotation = new THREE.Quaternion(partPose.rotation.x, partPose.rotation.y, partPose.rotation.z, partPose.rotation.w);
    const localRotation = new THREE.Quaternion(localPose.rotation.x, localPose.rotation.y, localPose.rotation.z, localPose.rotation.w);
    const origin = new THREE.Vector3(partPose.position.x, partPose.position.y, partPose.position.z)
      .add(new THREE.Vector3(localPose.position.x, localPose.position.y, localPose.position.z).applyQuaternion(partRotation));
    const end = origin.clone().add(new THREE.Vector3(forward.x, forward.y, forward.z)
      .normalize().applyQuaternion(localRotation).applyQuaternion(partRotation).multiplyScalar(range));
    this.setDebugRay(id, origin, end, active);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  private addMesh(handle: number, geometry: THREE.BufferGeometry, color: number): void {
    const previous = this.meshes.get(handle);
    if (previous) {
      this.scene.remove(previous);
      previous.geometry.dispose();
      if (Array.isArray(previous.material)) {
        previous.material.forEach((material) => material.dispose());
      } else {
        previous.material.dispose();
      }
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
    if (this.highlightedParts.has(handle)) this.setMeshHighlight(mesh, true);
    this.meshes.set(handle, mesh);
    this.scene.add(mesh);
  }

  private setMeshHighlight(mesh: THREE.Mesh, highlighted: boolean): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.emissive.setHex(highlighted ? 0xffd166 : 0x000000);
      material.emissiveIntensity = highlighted ? 0.8 : 0;
    }
  }

  private setDebugLine(
    lines: Map<string, THREE.Line>,
    id: string,
    from: Vector3,
    to: Vector3,
    status: DebugVisualStatus,
    baseColor: number,
  ): void {
    const style = this.debugStyle(status, baseColor);
    const existing = lines.get(id);
    if (existing) {
      this.updateLine(existing, from, to, style);
      return;
    }
    const line = this.createLine(from, to, style);
    lines.set(id, line);
    this.scene.add(line);
  }

  private createLine(from: Vector3, to: Vector3, style: DebugVisualStyle): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const material = new THREE.LineBasicMaterial({
      color: style.color,
      opacity: style.opacity,
      transparent: style.opacity < 1,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 10;
    return line;
  }

  private updateLine(line: THREE.Line, from: Vector3, to: Vector3, style: DebugVisualStyle): void {
    const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    const material = line.material as THREE.LineBasicMaterial;
    material.color.setHex(style.color);
    material.opacity = style.opacity;
    material.transparent = style.opacity < 1;
  }

  private createMarker(position: Vector3, style: DebugVisualStyle): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshBasicMaterial({
        color: style.color,
        opacity: style.opacity,
        transparent: style.opacity < 1,
        depthTest: false,
        depthWrite: false,
      }),
    );
    marker.position.set(position.x, position.y, position.z);
    marker.renderOrder = 11;
    return marker;
  }

  private updateMarker(marker: THREE.Mesh, position: Vector3, style: DebugVisualStyle): void {
    marker.position.set(position.x, position.y, position.z);
    const material = marker.material as THREE.MeshBasicMaterial;
    material.color.setHex(style.color);
    material.opacity = style.opacity;
    material.transparent = style.opacity < 1;
  }

  private removeDebugLine(lines: Map<string, THREE.Line>, id: string): void {
    const line = lines.get(id);
    if (!line) return;
    this.scene.remove(line);
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
    lines.delete(id);
  }

  private debugStyle(status: DebugVisualStatus, baseColor: number): DebugVisualStyle {
    switch (status) {
      case 'active':
        return { color: 0x63d7ac, opacity: 1 };
      case 'selected':
        return { color: 0xffd166, opacity: 1 };
      case 'damaged':
        return { color: 0xffa64d, opacity: 1 };
      case 'separated':
        return { color: 0xef6a6a, opacity: 0.9 };
      case 'inactive':
        return { color: 0x6b727c, opacity: 0.65 };
      case 'normal':
      case 'connected':
        return { color: baseColor, opacity: 0.9 };
    }
  }

  private addEnvironmentMesh(id: string, mesh: THREE.Mesh): void {
    const previous = this.environmentMeshes.get(id);
    if (previous) {
      this.scene.remove(previous);
      previous.geometry.dispose();
      const material = previous.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
    this.environmentMeshes.set(id, mesh);
    this.scene.add(mesh);
  }
}
