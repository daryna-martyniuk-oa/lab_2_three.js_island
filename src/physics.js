import * as CANNON from 'cannon-es';
import * as THREE from 'three';

const MAX_ITEMS = 36;
const WATER_LEVEL = 0;

export function createPhysicsWorld(terrainGeometry, sceneryColliders = []) {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
    allowSleep: true,
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 10;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.4;

  const ground = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
  ground.addShape(createTerrainShape(terrainGeometry));
  ground.name = 'island-ground';
  ground.material = new CANNON.Material('sand');
  world.addBody(ground);

  const sceneryMaterial = new CANNON.Material('scenery');
  for (const descriptor of sceneryColliders) {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: sceneryMaterial,
      position: new CANNON.Vec3(...descriptor.position),
    });
    if (descriptor.quaternion) body.quaternion.set(...descriptor.quaternion);
    for (const collider of descriptor.shapes) {
      let shape;
      if (collider.type === 'box') {
        shape = new CANNON.Box(new CANNON.Vec3(...collider.halfExtents));
      } else if (collider.type === 'cylinder') {
        shape = new CANNON.Cylinder(collider.radius, collider.radius, collider.height, 12);
      } else if (collider.type === 'sphere') {
        shape = new CANNON.Sphere(collider.radius);
      } else {
        throw new Error(`Unsupported scenery collider type: ${collider.type}`);
      }
      const offset = new CANNON.Vec3(...collider.position);
      const orientation = collider.quaternion
        ? new CANNON.Quaternion(...collider.quaternion)
        : new CANNON.Quaternion();
      body.addShape(shape, offset, orientation);
    }
    body.name = 'scenery-collider';
    world.addBody(body);
  }

  return { world, ground };
}

function createTerrainShape(geometry) {
  const positions = geometry.attributes.position;
  const vertices = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    vertices[i * 3] = positions.getX(i);
    vertices[i * 3 + 1] = positions.getY(i);
    vertices[i * 3 + 2] = positions.getZ(i);
  }
  return new CANNON.Trimesh(vertices, geometry.index.array);
}

function createBeachBallVisual() {
  const group = new THREE.Group();
  const colors = ['#fa725f', '#f7cd66', '#78c9a0', '#71aee8', '#f3eee1'];
  const ballGeometry = new THREE.SphereGeometry(0.52, 18, 14, 0, Math.PI * 2 / colors.length);
  for (let i = 0; i < colors.length; i += 1) {
    const wedge = new THREE.Mesh(
      ballGeometry,
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.38, metalness: 0.02 }),
    );
    wedge.rotation.y = i * Math.PI * 2 / colors.length;
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    group.add(wedge);
  }
  const capGeometry = new THREE.SphereGeometry(0.52, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.13);
  const capMaterial = new THREE.MeshStandardMaterial({ color: '#fff4d5', roughness: 0.43 });
  const topCap = new THREE.Mesh(capGeometry, capMaterial);
  const bottomCap = new THREE.Mesh(capGeometry, capMaterial);
  bottomCap.rotation.x = Math.PI;
  topCap.castShadow = true;
  bottomCap.castShadow = true;
  group.add(topCap, bottomCap);
  return group;
}

function createCoconutVisual() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.43, 16, 14),
    new THREE.MeshStandardMaterial({ color: '#80513a', roughness: 0.92, flatShading: true }),
  );
  shell.scale.set(1, 0.88, 1.08);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  for (let i = 0; i < 3; i += 1) {
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#382a25', roughness: 1 }),
    );
    mark.position.set((i - 1) * 0.105, 0.1, 0.405);
    group.add(mark);
  }
  return group;
}

export function createItemSpawner(world, scene) {
  const items = [];
  let spawnCount = 0;
  const ballMaterial = new CANNON.Material('beach-ball');
  const coconutMaterial = new CANNON.Material('coconut');

  const groundMaterial = world.bodies.find((body) => body.name === 'island-ground').material;
  world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
    friction: 0.4,
    restitution: 0.75,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(coconutMaterial, groundMaterial, {
    friction: 0.4,
    restitution: 0.35,
  }));
  const sceneryMaterial = world.bodies.find((body) => body.name === 'scenery-collider')?.material;
  if (sceneryMaterial) {
    world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, sceneryMaterial, {
      friction: 0.32,
      restitution: 0.66,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(coconutMaterial, sceneryMaterial, {
      friction: 0.46,
      restitution: 0.3,
    }));
  }

  function spawn(position) {
    if (items.length >= MAX_ITEMS) removeItem(items[0]);
    const isBall = spawnCount % 2 === 1;
    spawnCount += 1;
    const radius = isBall ? 0.52 : 0.43;
    const material = isBall ? ballMaterial : coconutMaterial;
    const body = new CANNON.Body({
      mass: isBall ? 0.62 : 1.35,
      material,
      shape: new CANNON.Sphere(radius),
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: isBall ? 0.13 : 0.2,
      angularDamping: isBall ? 0.16 : 0.28,
      allowSleep: true,
      sleepSpeedLimit: 0.12,
      sleepTimeLimit: 1.2,
    });
    body.name = isBall ? 'beach-ball' : 'coconut';
    body.velocity.set((Math.random() - 0.5) * 1.1, -0.4, (Math.random() - 0.5) * 1.1);
    body.angularVelocity.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
    world.addBody(body);
    const mesh = isBall ? createBeachBallVisual() : createCoconutVisual();
    mesh.position.copy(body.position);
    scene.add(mesh);
    items.push({ body, mesh, isBall });
    return body;
  }

  function removeItem(item) {
    if (!item) return;
    world.removeBody(item.body);
    scene.remove(item.mesh);
    item.mesh.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material.dispose();
      }
    });
    const index = items.indexOf(item);
    if (index !== -1) items.splice(index, 1);
  }

  function clear() {
    while (items.length) removeItem(items[items.length - 1]);
  }

  function sync() {
    for (const { body, mesh } of items) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  function step(delta) {
    for (const { body, isBall } of items) {
      if (!isBall || body.position.y >= WATER_LEVEL + 0.52) continue;
      const submerged = THREE.MathUtils.clamp((WATER_LEVEL + 0.52 - body.position.y) / 1.04, 0, 1);
      const lift = body.mass * 9.82 * submerged * 1.12;
      body.applyForce(new CANNON.Vec3(
        -body.velocity.x * body.mass * 2.4 * submerged,
        lift,
        -body.velocity.z * body.mass * 2.4 * submerged,
      ));
    }
    world.step(1 / 60, delta, 3);
    sync();
  }

  return { items, spawn, clear, step };
}
