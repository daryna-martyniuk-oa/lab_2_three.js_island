import * as THREE from 'three';
import { Timer } from 'three/addons/misc/Timer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { createIsland, islandHeight } from './island.js';
import { createItemSpawner, createPhysicsWorld } from './physics.js';

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Interactive cinematic Hawaiian sunset island');
renderer.domElement.style.touchAction = 'none';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const sunsetHorizon = new THREE.Color('#ff9e7d');
scene.background = sunsetHorizon.clone();
scene.fog = new THREE.FogExp2(sunsetHorizon, 0.012);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 8, 24);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 13;
controls.maxDistance = 32;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.update();

const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uSunDirection: { value: new THREE.Vector3(-0.45, 0.22, -0.86).normalize() },
    uSunColor: { value: new THREE.Color('#ffb15e') },
    uHorizonColor: { value: new THREE.Color('#ff9e7d') },
  },
  vertexShader: `
    varying vec3 vDirection;
    void main() {
      vDirection = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uHorizonColor;
    varying vec3 vDirection;
    void main() {
      float height = normalize(vDirection).y;
      vec3 horizon = uHorizonColor;
      vec3 peach = vec3(1.0, 0.59, 0.36);
      vec3 upper = vec3(0.20, 0.30, 0.48);
      vec3 sky = mix(horizon, peach, smoothstep(-0.2, 0.2, height));
      sky = mix(sky, upper, smoothstep(0.12, 0.85, height));
      float sunDisc = pow(max(dot(normalize(vDirection), normalize(uSunDirection)), 0.0), 420.0);
      float sunHalo = pow(max(dot(normalize(vDirection), normalize(uSunDirection)), 0.0), 12.0);
      sky += uSunColor * (sunDisc * 3.2 + sunHalo * 0.34);
      gl_FragColor = vec4(sky, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
  fog: false,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 24), skyMaterial);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1;
scene.add(skyDome);

const hemisphere = new THREE.HemisphereLight('#ffa552', '#0f3854', 1.25);
scene.add(hemisphere);
const ambientFill = new THREE.AmbientLight('#d4ddeb', 0.68);
scene.add(ambientFill);
const bounceLight = new THREE.DirectionalLight('#ffe3c3', 0.62);
bounceLight.position.set(1, 0.7, 1);
scene.add(bounceLight);

const sun = new THREE.DirectionalLight('#ffaa44', 2.8);
sun.position.set(-25, 12, -35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -23;
sun.shadow.camera.right = 23;
sun.shadow.camera.top = 23;
sun.shadow.camera.bottom = -23;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
sun.shadow.bias = -0.00018;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 4;
scene.add(sun);
scene.add(sun.target);

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(1.35, 32, 24),
  new THREE.MeshBasicMaterial({ color: '#fff0bd', toneMapped: false }),
);
scene.add(sunDisc);

const glowCanvas = document.createElement('canvas');
glowCanvas.width = 128;
glowCanvas.height = 128;
const glowContext = glowCanvas.getContext('2d');
const glowGradient = glowContext.createRadialGradient(64, 64, 2, 64, 64, 64);
glowGradient.addColorStop(0, 'rgba(255, 227, 170, 0.9)');
glowGradient.addColorStop(0.2, 'rgba(255, 174, 105, 0.35)');
glowGradient.addColorStop(1, 'rgba(255, 125, 85, 0)');
glowContext.fillStyle = glowGradient;
glowContext.fillRect(0, 0, 128, 128);
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: new THREE.CanvasTexture(glowCanvas),
  color: '#ffd49a',
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
}));
sunGlow.scale.set(14, 14, 1);
scene.add(sunGlow);

const { terrain, terrainGeometry, water, waterUniforms, palmGroups, sceneryColliders } = createIsland(scene);
const { world } = createPhysicsWorld(terrainGeometry, sceneryColliders);
const spawner = createItemSpawner(world, scene);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerDown = new THREE.Vector2();
const timer = new Timer();

const settings = {
  timeOfDay: 17.5,
  sunAngle: -35,
  waveSpeed: 0.62,
  waveHeight: 0.22,
  fogDensity: 0.012,
  dropBeachBall: () => {
    const position = randomShorePosition();
    spawner.spawn(new THREE.Vector3(position.x, position.y + 12, position.z));
  },
  clearItems: () => spawner.clear(),
};

function randomShorePosition() {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * 8.6;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return { x, z, y: Math.max(islandHeight(x, z), 0.1) };
}

const gui = new GUI({ title: 'Sunset settings' });
const atmosphere = gui.addFolder('Atmosphere');
atmosphere.add(settings, 'timeOfDay', 16, 20, 0.05).name('Time of day').onChange(updateSunset);
atmosphere.add(settings, 'sunAngle', -80, 80, 1).name('Sun angle').onChange(updateSunset);
atmosphere.add(settings, 'fogDensity', 0.002, 0.04, 0.001).name('Fog density').onChange((value) => {
  scene.fog.density = value;
  waterUniforms.uFogDensity.value = value;
});
atmosphere.open();
const ocean = gui.addFolder('Ocean');
ocean.add(settings, 'waveHeight', 0.04, 0.65, 0.01).name('Wave height').onChange((value) => {
  waterUniforms.uWaveHeight.value = value;
});
ocean.add(settings, 'waveSpeed', 0.08, 1.8, 0.01).name('Wave speed').onChange((value) => {
  waterUniforms.uWaveSpeed.value = value;
});
ocean.open();
gui.add(settings, 'dropBeachBall').name('Drop a surprise');
gui.add(settings, 'clearItems').name('Clear physics items');

const skyWarm = new THREE.Color('#ff9e7d');
const skyRose = new THREE.Color('#e77c79');
const sunGold = new THREE.Color('#ffaa44');
const sunRose = new THREE.Color('#ff7d69');

function updateSunset() {
  const hourBlend = THREE.MathUtils.smoothstep(settings.timeOfDay, 16, 20);
  const skyColor = skyWarm.clone().lerp(skyRose, hourBlend * 0.72);
  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor);
  waterUniforms.uFogColor.value.copy(skyColor);
  sun.color.copy(sunGold).lerp(sunRose, hourBlend * 0.78);
  const elevation = 0.03 + 0.25 * Math.sin(((settings.timeOfDay - 16) / 4) * Math.PI);
  const azimuth = THREE.MathUtils.degToRad(settings.sunAngle);
  const horizontalDistance = 43;
  sun.position.set(
    Math.sin(azimuth) * horizontalDistance,
    elevation * horizontalDistance,
    -Math.cos(azimuth) * horizontalDistance,
  );
  sunDisc.position.copy(sun.position).multiplyScalar(0.78);
  sunGlow.position.copy(sunDisc.position);
  waterUniforms.uSunDirection.value.copy(sun.position).normalize();
  waterUniforms.uSunColor.value.copy(sun.color);
  skyMaterial.uniforms.uSunDirection.value.copy(sun.position).normalize();
  skyMaterial.uniforms.uSunColor.value.copy(sun.color);
  skyMaterial.uniforms.uHorizonColor.value.copy(skyColor);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.18, 0.92, hourBlend);
  hemisphere.intensity = THREE.MathUtils.lerp(1.25, 0.92, hourBlend);
}
updateSunset();

function pointerToNdc(event, target) {
  target.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  );
}

function onPointerDown(event) {
  if (event.button !== 0 || event.target !== renderer.domElement) return;
  pointerDown.set(event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (event.button !== 0 || event.target !== renderer.domElement) return;
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  if (moved > 5) return;
  pointerToNdc(event, pointer);
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects([terrain, water], false);
  if (!intersections.length) return;
  const hit = intersections[0].point;
  spawner.spawn(new THREE.Vector3(hit.x, hit.y + 12, hit.z));
}
renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointerup', onPointerUp);

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const delta = Math.min(timer.getDelta(), 1 / 30);
  const elapsed = timer.getElapsed();
  controls.update();
  waterUniforms.uTime.value = elapsed;
  waterUniforms.uWaveHeight.value = settings.waveHeight;
  waterUniforms.uWaveSpeed.value = settings.waveSpeed;
  waterUniforms.uCameraPosition.value.copy(camera.position);
  for (const palm of palmGroups) {
    for (const frond of palm.userData.fronds) {
      const phase = frond.userData.windPhase;
      frond.rotation.z = frond.userData.baseTilt + Math.sin(elapsed * 1.05 + phase) * 0.055;
      frond.rotation.x = Math.cos(elapsed * 0.78 + phase * 1.4) * 0.038;
    }
  }
  spawner.step(delta);
  skyDome.position.copy(camera.position);
  renderer.render(scene, camera);
}
animate();

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', onResize);

window.addEventListener('beforeunload', () => {
  renderer.domElement.removeEventListener('pointerdown', onPointerDown);
  renderer.domElement.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('resize', onResize);
  controls.dispose();
  gui.destroy();
  timer.dispose();
  renderer.dispose();
});
