import * as THREE from 'three';
import { createWaterMaterial } from './waterShader.js';

export const TERRAIN_SIZE = 48;
export const TERRAIN_SEGMENTS = 120;
export const WATER_LEVEL = 0;

export function islandHeight(x, z) {
  const radius = Math.hypot(x, z);
  const shore = 10.8;
  const centerHeight = 5.4;
  const beachHeight = centerHeight * (1 - Math.pow(Math.min(radius, shore) / shore, 1.72)) - 0.08;
  const underwaterSlope = THREE.MathUtils.smoothstep(radius, shore, 16.2);
  const radialHeight = THREE.MathUtils.lerp(beachHeight, -4.3, underwaterSlope);
  const ridge = 0.55 * Math.exp(-Math.pow((radius - 4.7) / 2.4, 2));
  const detail = 0.13 * Math.sin(x * 0.72) * Math.cos(z * 0.63)
    + 0.055 * Math.sin(x * 1.47 + z * 0.8);
  return Math.max(-4.3, radialHeight + ridge + detail);
}

function createTerrainGeometry() {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const wetSand = new THREE.Color('#c7b89d');
  const warmSand = new THREE.Color('#f0dfc0');
  const sunlitSand = new THREE.Color('#fff5e3');
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = islandHeight(x, z);
    positions.setY(i, height);
    const color = wetSand.clone().lerp(warmSand, THREE.MathUtils.smoothstep(height, -2.5, 0.1))
      .lerp(sunlitSand, THREE.MathUtils.smoothstep(height, 0.8, 3.8) * 0.72);
    const grain = Math.sin(x * 0.31 + Math.sin(z * 0.22)) * Math.cos(z * 0.27 - x * 0.12) * 0.035;
    color.offsetHSL(grain * 0.12, 0, grain);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createSandTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = Math.random() * 18;
    image.data[i] = 238 + grain;
    image.data[i + 1] = 224 + grain;
    image.data[i + 2] = 199 + grain;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.anisotropy = 8;
  return texture;
}

function makeLeafMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.76,
    side: THREE.DoubleSide,
    flatShading: true,
  });
}

function createPalmTree(x, z, scale, rotation, materials) {
  const group = new THREE.Group();
  const groundY = islandHeight(x, z);
  group.position.set(x, groundY, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const lean = 0.28 + Math.sin(x * 0.8 + z) * 0.12;
  const trunkPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.04, 0.75, 0),
    new THREE.Vector3(lean * 0.35, 1.65, 0),
    new THREE.Vector3(lean * 0.72, 2.55, 0.04),
    new THREE.Vector3(lean, 3.35, 0.08),
  ];
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
  const trunkColliders = [];
  const trunkSegments = 12;
  for (let i = 0; i < trunkSegments; i += 1) {
    const t0 = i / trunkSegments;
    const t1 = (i + 1) / trunkSegments;
    const start = trunkCurve.getPoint(t0).multiplyScalar(scale);
    const end = trunkCurve.getPoint(t1).multiplyScalar(scale);
    const direction = new THREE.Vector3().subVectors(end, start);
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    trunkColliders.push({
      type: 'cylinder',
      position: start.clone().add(end).multiplyScalar(0.5).toArray(),
      radius: 0.19 * scale,
      height: direction.length() + 0.025 * scale,
      quaternion: quaternionArray(orientation),
    });
  }
  const trunk = new THREE.Mesh(
    new THREE.TubeGeometry(trunkCurve, 24, 0.19, 8, false),
    materials.trunk,
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const ringCount = 8;
  const ringGeometry = new THREE.TorusGeometry(0.175, 0.025, 4, 10);
  const rings = new THREE.InstancedMesh(ringGeometry, materials.barkRing, ringCount);
  const ringTransform = new THREE.Object3D();
  for (let i = 1; i <= ringCount; i += 1) {
    const point = trunkCurve.getPoint(i / 9);
    ringTransform.position.copy(point);
    ringTransform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), trunkCurve.getTangent(i / 9));
    ringTransform.scale.setScalar(1 - i * 0.035);
    ringTransform.updateMatrix();
    rings.setMatrixAt(i - 1, ringTransform.matrix);
  }
  rings.castShadow = true;
  rings.instanceMatrix.needsUpdate = true;
  group.add(rings);

  const crown = trunkPoints[trunkPoints.length - 1];
  const fronds = [];
  for (let layer = 0; layer < 2; layer += 1) {
    const frondCount = layer === 0 ? 9 : 5;
    for (let i = 0; i < frondCount; i += 1) {
      const angle = (i / frondCount) * Math.PI * 2 + layer * 0.24;
      const pivot = new THREE.Group();
      pivot.position.copy(crown);
      pivot.rotation.y = angle;
      pivot.rotation.z = -0.04 - layer * 0.1;
      pivot.userData.windPhase = i * 0.83 + layer * 1.7 + x * 0.3;
      pivot.userData.baseTilt = pivot.rotation.z;
      const length = (2.35 + (i % 3) * 0.15) * (layer === 0 ? 1 : 0.83);
      const droop = 0.68 + (i % 3) * 0.11;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.58 - layer * 0.12, -length * 0.5),
        new THREE.Vector3(0, -droop, -length),
      );
      const spine = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.035, 5, false), materials.rib);
      spine.castShadow = true;
      pivot.add(spine);

      const bladePositions = [];
      for (let j = 1; j <= 9; j += 1) {
        const t = j / 11;
        const base = curve.getPoint(t);
        const tangent = curve.getTangent(t);
        const bladeLength = Math.sin(t * Math.PI) * 0.78 + 0.1;
        for (const side of [-1, 1]) {
          const bladeRotation = side * Math.atan2(0.42, bladeLength);
          const bladeCurve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(side * bladeLength * 0.45, -0.055, -0.12),
            new THREE.Vector3(side * bladeLength, -0.16 + tangent.y * 0.08, -0.3),
          );
          const appendPoint = (point) => {
            const cos = Math.cos(bladeRotation);
            const sin = Math.sin(bladeRotation);
            bladePositions.push(
              base.x + point.x * cos + point.z * sin,
              base.y + point.y,
              base.z - point.x * sin + point.z * cos,
            );
          };
          const segments = 5;
          for (let segment = 0; segment < segments; segment += 1) {
            const a = bladeCurve.getPoint(segment / segments);
            const b = bladeCurve.getPoint((segment + 1) / segments);
            const widthA = Math.sin((segment / segments) * Math.PI) * 0.085 + 0.008;
            const widthB = Math.sin(((segment + 1) / segments) * Math.PI) * 0.085 + 0.004;
            appendPoint(new THREE.Vector3(a.x - widthA, a.y, a.z));
            appendPoint(new THREE.Vector3(a.x + widthA, a.y, a.z));
            appendPoint(new THREE.Vector3(b.x + widthB, b.y, b.z));
            appendPoint(new THREE.Vector3(a.x - widthA, a.y, a.z));
            appendPoint(new THREE.Vector3(b.x + widthB, b.y, b.z));
            appendPoint(new THREE.Vector3(b.x - widthB, b.y, b.z));
          }
        }
      }
      const bladeGeometry = new THREE.BufferGeometry();
      bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bladePositions, 3));
      bladeGeometry.computeVertexNormals();
      const leaflets = new THREE.Mesh(bladeGeometry, materials.leaves[(i + layer) % materials.leaves.length]);
      leaflets.castShadow = true;
      pivot.add(leaflets);
      group.add(pivot);
      fronds.push(pivot);
    }
  }
  group.userData.fronds = fronds;
  group.userData.physicsShapes = trunkColliders;
  return group;
}

function createRock(x, z, scale, material) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), material);
  rock.position.set(x, islandHeight(x, z) + scale * 0.62, z);
  rock.rotation.set(0.16, x * 0.3, 0.12);
  rock.scale.set(1.15, 0.72, 0.9);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function addBeam(group, start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.78, radius, direction.length(), 8),
    material,
  );
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  beam.castShadow = true;
  beam.receiveShadow = true;
  group.add(beam);
  return beam;
}

function createFabricSurface(points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((point) => point), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, material);
  surface.castShadow = true;
  surface.receiveShadow = true;
  return surface;
}

function quaternionArray(quaternion) {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function boxCollider(position, halfExtents, quaternion = new THREE.Quaternion()) {
  return {
    type: 'box',
    position: position.toArray(),
    halfExtents,
    quaternion: quaternionArray(quaternion),
  };
}

function beamBoxCollider(start, end, width, thickness = width) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return boxCollider(
    start.clone().add(end).multiplyScalar(0.5),
    [width, direction.length() * 0.5, thickness],
    orientation,
  );
}

function createLounger(x, z, rotation, cushionMaterial, woodMaterial) {
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  const halfWidth = 0.48;
  const frontZ = 0.48;
  const seatBackZ = -0.3;
  const footSamples = [
    [-halfWidth, frontZ], [halfWidth, frontZ],
    [-halfWidth, seatBackZ], [halfWidth, seatBackZ],
  ].map(([localX, localZ]) => {
    const offset = new THREE.Vector3(localX, 0, localZ).applyQuaternion(yaw);
    return islandHeight(x + offset.x, z + offset.z);
  });
  const groundY = Math.max(...footSamples) - 0.08;
  const chair = new THREE.Group();
  chair.position.set(x, groundY, z);
  chair.rotation.y = rotation;
  const seatY = 0.43;
  const backTopZ = -0.98;
  const backTopY = 1.13;

  for (const side of [-1, 1]) {
    addBeam(chair, new THREE.Vector3(side * halfWidth, 0.08, frontZ), new THREE.Vector3(side * halfWidth, 0.56, -0.06), 0.038, woodMaterial);
    addBeam(chair, new THREE.Vector3(side * halfWidth, 0.08, seatBackZ), new THREE.Vector3(side * halfWidth, 0.56, -0.06), 0.038, woodMaterial);
    addBeam(chair, new THREE.Vector3(side * halfWidth, seatY, seatBackZ), new THREE.Vector3(side * halfWidth, seatY, frontZ), 0.035, woodMaterial);
    addBeam(chair, new THREE.Vector3(side * halfWidth, 0.56, -0.06), new THREE.Vector3(side * halfWidth, backTopY, backTopZ), 0.04, woodMaterial);
    addBeam(chair, new THREE.Vector3(side * halfWidth, 0.69, -0.2), new THREE.Vector3(side * halfWidth, 0.69, 0.16), 0.035, woodMaterial);
  }
  addBeam(chair, new THREE.Vector3(-halfWidth, seatY, seatBackZ), new THREE.Vector3(halfWidth, seatY, seatBackZ), 0.035, woodMaterial);
  addBeam(chair, new THREE.Vector3(-halfWidth, 0.56, -0.06), new THREE.Vector3(halfWidth, 0.56, -0.06), 0.035, woodMaterial);
  chair.add(createFabricSurface([
    [-0.39, seatY + 0.025, seatBackZ],
    [0.39, seatY + 0.025, seatBackZ],
    [0.39, seatY + 0.025, frontZ - 0.04],
    [-0.39, seatY + 0.025, frontZ - 0.04],
  ], cushionMaterial));
  chair.add(createFabricSurface([
    [-0.39, seatY + 0.035, seatBackZ],
    [0.39, seatY + 0.035, seatBackZ],
    [0.39, backTopY - 0.04, backTopZ],
    [-0.39, backTopY - 0.04, backTopZ],
  ], cushionMaterial));
  const colliders = [];
  for (const side of [-1, 1]) {
    colliders.push(beamBoxCollider(
      new THREE.Vector3(side * halfWidth, 0.04, frontZ),
      new THREE.Vector3(side * halfWidth, 0.56, -0.06),
      0.055,
    ));
    colliders.push(beamBoxCollider(
      new THREE.Vector3(side * halfWidth, 0.04, seatBackZ),
      new THREE.Vector3(side * halfWidth, 0.56, -0.06),
      0.055,
    ));
    colliders.push(beamBoxCollider(
      new THREE.Vector3(side * halfWidth, seatY, seatBackZ),
      new THREE.Vector3(side * halfWidth, seatY, frontZ),
      0.045,
    ));
    colliders.push(beamBoxCollider(
      new THREE.Vector3(side * halfWidth, 0.56, -0.06),
      new THREE.Vector3(side * halfWidth, backTopY, backTopZ),
      0.055,
    ));
    colliders.push(boxCollider(new THREE.Vector3(side * halfWidth, 0.37, 0.06), [0.045, 0.37, 0.045]));
  }
  colliders.push(boxCollider(new THREE.Vector3(0, seatY, 0.08), [0.41, 0.065, 0.42]));
  const backStart = new THREE.Vector3(0, seatY + 0.04, seatBackZ);
  const backEnd = new THREE.Vector3(0, backTopY - 0.04, backTopZ);
  colliders.push(beamBoxCollider(backStart, backEnd, 0.41, 0.065));
  chair.userData.physicsCollider = {
    position: [x, groundY, z],
    quaternion: quaternionArray(yaw),
    shapes: colliders,
  };
  return chair;
}

function createBeachUmbrella(x, z, rotation, groundY, woodMaterial) {
  const umbrella = new THREE.Group();
  umbrella.position.set(x, groundY, z);
  umbrella.rotation.y = rotation;
  const poleTop = 3.0;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, poleTop, 12), woodMaterial);
  pole.position.y = poleTop * 0.5;
  pole.castShadow = true;
  umbrella.add(pole);
  const colliders = [
    {
      type: 'cylinder',
      position: [0, poleTop * 0.5, 0],
      radius: 0.075,
      height: poleTop,
    },
    {
      type: 'cylinder',
      position: [0, 2.77, 0],
      radius: 1.46,
      height: 0.5,
    },
  ];

  const colors = ['#e87460', '#f4d28d', '#4b9b8c', '#f7e8c9', '#d96354', '#efc77b', '#4b9b8c', '#f7e8c9'];
  const radius = 1.58;
  const peakY = 3.04;
  const rimY = 2.56;
  for (let i = 0; i < colors.length; i += 1) {
    const a0 = (i / colors.length) * Math.PI * 2;
    const a1 = ((i + 1) / colors.length) * Math.PI * 2;
    const am = (a0 + a1) * 0.5;
    const geometry = new THREE.BufferGeometry();
    const vertices = [
      0, peakY, 0,
      Math.cos(a0) * radius, rimY, Math.sin(a0) * radius,
      Math.cos(am) * radius, rimY - 0.13, Math.sin(am) * radius,
      Math.cos(a1) * radius, rimY, Math.sin(a1) * radius,
    ];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const canopy = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: colors[i],
      roughness: 0.82,
      side: THREE.DoubleSide,
    }));
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    umbrella.add(canopy);
    addBeam(
      umbrella,
      new THREE.Vector3(0, peakY - 0.02, 0),
      new THREE.Vector3(Math.cos(a0) * radius, rimY, Math.sin(a0) * radius),
      0.018,
      woodMaterial,
    );
  }
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 8), woodMaterial);
  finial.position.y = peakY + 0.04;
  umbrella.add(finial);
  umbrella.userData.physicsCollider = {
    position: [x, groundY, z],
    quaternion: quaternionArray(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation)),
    shapes: colliders,
  };
  return umbrella;
}

function createTropicalShrubs(scene, palms) {
  const shrubColors = ['#426d45', '#527d4b', '#66884b'].map((color) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    flatShading: true,
  }));
  const sphere = new THREE.SphereGeometry(0.36, 9, 7);
  const lobeMatrices = shrubColors.map(() => []);
  const transform = new THREE.Object3D();
  const lobeOffsets = [
    [0, 0.22, 0, 1.12],
    [0.28, 0.18, 0.05, 0.82],
    [-0.25, 0.16, 0.08, 0.88],
    [0.03, 0.15, 0.27, 0.78],
    [-0.04, 0.12, -0.25, 0.76],
  ];
  const shrubAnchors = [];
  for (const palm of palms) {
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2 + palm[3];
      shrubAnchors.push([
        palm[0] + Math.cos(angle) * (1.05 + (i % 2) * 0.22),
        palm[1] + Math.sin(angle) * (0.95 + (i % 3) * 0.12),
      ]);
    }
  }
  shrubAnchors.push([-3.6, 6.5], [3.8, 6.1], [-8.7, 0.8], [8.8, -0.6], [0.5, -8.3], [3.4, -7.5]);

  const colliders = [];
  shrubAnchors.forEach(([x, z], anchorIndex) => {
    const clusterShapes = [];
    const anchorY = islandHeight(x, z);
    for (let i = 0; i < lobeOffsets.length; i += 1) {
      const [offsetX, offsetY, offsetZ, size] = lobeOffsets[i];
      const worldX = x + offsetX;
      const worldZ = z + offsetZ;
      transform.position.set(worldX, islandHeight(worldX, worldZ) + offsetY, worldZ);
      transform.rotation.set(
        (anchorIndex % 3) * 0.08,
        anchorIndex * 1.7 + i,
        ((anchorIndex + i) % 4) * 0.06,
      );
      transform.scale.set(size, size * (0.76 + (i % 2) * 0.12), size);
      transform.updateMatrix();
      lobeMatrices[(anchorIndex + i) % shrubColors.length].push(transform.matrix.clone());
      clusterShapes.push({
        type: 'sphere',
        position: [offsetX, islandHeight(worldX, worldZ) + offsetY - anchorY, offsetZ],
        radius: 0.36 * size * 0.88,
      });
    }
    colliders.push({
      position: [x, anchorY, z],
      shapes: clusterShapes,
    });
  });

  lobeMatrices.forEach((matrices, materialIndex) => {
    const instances = new THREE.InstancedMesh(sphere, shrubColors[materialIndex], matrices.length);
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
    instances.castShadow = true;
    instances.receiveShadow = true;
    instances.instanceMatrix.needsUpdate = true;
    scene.add(instances);
  });
  return colliders;
}

export function createIsland(scene) {
  const terrainGeometry = createTerrainGeometry();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({
    map: createSandTexture(),
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  }));
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  terrain.name = 'island-terrain';
  scene.add(terrain);

  const { material: waterMaterial, uniforms: waterUniforms } = createWaterMaterial();
  const waterGeometry = new THREE.PlaneGeometry(220, 220, 220, 220);
  waterGeometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.position.y = WATER_LEVEL;
  water.name = 'ocean-water';
  scene.add(water);

  const materials = {
    trunk: new THREE.MeshStandardMaterial({ color: '#855333', roughness: 0.9 }),
    barkRing: new THREE.MeshStandardMaterial({ color: '#bc8050', roughness: 0.92 }),
    rib: new THREE.MeshStandardMaterial({ color: '#b5c96a', roughness: 0.8, side: THREE.DoubleSide }),
    leaves: ['#638b4e', '#769d56', '#507c49', '#89a95d'].map(makeLeafMaterial),
  };
  const palms = [
    [-7.3, -1.6, 1.08, 0.2], [-5.7, 3.1, 0.82, 2.5],
    [6.8, 2.0, 1.08, 0.8], [5.1, -3.2, 0.88, 2.9],
    [0.2, 6.5, 0.82, 1.1], [-1.4, -6.2, 0.92, 0.2],
  ];
  const palmGroups = [];
  for (const [x, z, scale, rotation] of palms) {
    const palm = createPalmTree(x, z, scale, rotation, materials);
    scene.add(palm);
    palmGroups.push(palm);
  }
  const shrubCollider = createTropicalShrubs(scene, palms);
  const sceneryColliders = palmGroups.map((palm) => ({
    position: palm.position.toArray(),
    quaternion: quaternionArray(palm.quaternion),
    shapes: palm.userData.physicsShapes,
  }));
  sceneryColliders.push(...shrubCollider);

  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#97633e', roughness: 0.76 });
  const cushionMaterials = [
    '#d96d59',
    '#317d79',
    '#e6c477',
  ].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, side: THREE.DoubleSide }));
  const loungers = [
    [1.1, 3.6, -0.12],
    [2.8, 3.5, 0.14],
    [0.1, 5.0, -0.24],
  ];
  loungers.forEach(([x, z, rotation], index) => {
    const lounger = createLounger(x, z, rotation, cushionMaterials[index], frameMaterial);
    scene.add(lounger);
    sceneryColliders.push(lounger.userData.physicsCollider);
  });
  const umbrellaX = 4.75;
  const umbrellaZ = 3.1;
  const umbrella = createBeachUmbrella(
    umbrellaX,
    umbrellaZ,
    -0.25,
    islandHeight(umbrellaX, umbrellaZ) + 0.02,
    frameMaterial,
  );
  scene.add(umbrella);
  sceneryColliders.push(umbrella.userData.physicsCollider);

  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#b9a17c', roughness: 1 });
  const rocks = [
    [-10.2, -2.8, 0.48], [-9.7, -3.8, 0.3], [9.4, 1.4, 0.4],
    [8.8, 2.4, 0.26], [-3.6, 9.2, 0.38], [2.4, -9.4, 0.35],
  ];
  const rockColliders = [];
  for (const [x, z, scale] of rocks) {
    scene.add(createRock(x, z, scale, rockMaterial));
    rockColliders.push({
      type: 'sphere',
      position: [x, islandHeight(x, z) + scale * 0.62, z],
      radius: scale * 0.84,
    });
  }
  sceneryColliders.push({ position: [0, 0, 0], shapes: rockColliders });

  return { terrain, terrainGeometry, water, waterUniforms, palmGroups, sceneryColliders };
}
