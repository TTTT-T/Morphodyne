import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { Geometry, Pose, Vector3 } from '../core/model';

/** Presentation only: no physics stepping or world-rule decisions. */
export class ThreeSmokeRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly meshes = new Map<number, THREE.Mesh>();

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x15191f);
    this.camera.position.set(6, 5, 8);
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
