import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import './style.css';

async function main(): Promise<void> {
  await RAPIER.init();

  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root element.');

  const status = document.createElement('div');
  status.className = 'status';
  status.textContent = 'Morphodyne v0.1 · Three.js + Rapier';
  app.append(status);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(6, 5, 8);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  app.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
  const directional = new THREE.DirectionalLight(0xffffff, 2);
  directional.position.set(4, 8, 4);
  scene.add(directional);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(8, 0.1, 8), groundBody);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x333333 }),
  );
  ground.position.y = -0.1;
  scene.add(ground);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 4, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), body);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }),
  );
  scene.add(cube);

  const clock = new THREE.Clock();
  let accumulator = 0;
  const fixedDt = 1 / 60;

  function frame(): void {
    requestAnimationFrame(frame);

    accumulator += Math.min(clock.getDelta(), 0.1);
    while (accumulator >= fixedDt) {
      world.timestep = fixedDt;
      world.step();
      accumulator -= fixedDt;
    }

    const position = body.translation();
    const rotation = body.rotation();
    cube.position.set(position.x, position.y, position.z);
    cube.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    renderer.render(scene, camera);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  frame();
}

void main();
