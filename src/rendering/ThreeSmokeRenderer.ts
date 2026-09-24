import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { Geometry, Pose, Vector3 } from '../core/model';

/** Presentation only: no physics stepping or world-rule decisions. */
export class ThreeSmokeRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly debugRays = new Map<string, THREE.Line>();

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x15191f);
    this.camera.position.set(10, 7, 13);
    this.camera.lookAt(0, 0.8, 0);
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
    this.meshes.set(handle, mesh);
    this.scene.add(mesh);
  }
}
