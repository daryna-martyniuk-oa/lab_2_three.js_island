import * as THREE from 'three';

const vertexShader = `
  uniform float uTime;
  uniform float uWaveHeight;
  uniform float uWaveSpeed;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWaveHeight;

  float waveAt(vec2 p, float time) {
    float wave = 0.0;
    wave += sin(dot(p, normalize(vec2(1.0, 0.34)) * 0.24) + time * 0.62) * 0.48;
    wave += cos(dot(p, normalize(vec2(-0.4, 1.0)) * 0.37) - time * 0.82) * 0.27;
    wave += sin(dot(p, normalize(vec2(1.0, -0.72)) * 0.54) + time * 1.06) * 0.12;
    wave += cos(dot(p, normalize(vec2(-0.82, -1.0)) * 0.72) - time * 1.28) * 0.055;
    return wave;
  }

  void main() {
    vec3 displaced = position;
    float time = uTime * uWaveSpeed;
    float wave = waveAt(position.xz, time) * uWaveHeight;
    displaced.y += wave;

    float epsilon = 0.12;
    float dx = waveAt(position.xz + vec2(epsilon, 0.0), time)
      - waveAt(position.xz - vec2(epsilon, 0.0), time);
    float dz = waveAt(position.xz + vec2(0.0, epsilon), time)
      - waveAt(position.xz - vec2(0.0, epsilon), time);
    vec3 localNormal = normalize(vec3(-dx * uWaveHeight, 2.0 * epsilon, -dz * uWaveHeight));
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);

    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vWaveHeight = wave;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uCameraPosition;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWaveHeight;

  void main() {
    vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
    vec3 normal = normalize(vWorldNormal);
    vec3 sunDirection = normalize(uSunDirection);

    float distanceFromIsland = length(vWorldPosition.xz);
    float depth = smoothstep(7.5, 28.0, distanceFromIsland);
    vec3 shallowColor = vec3(0.014, 0.597, 0.305);
    vec3 deepColor = vec3(0.004, 0.043, 0.133);
    vec3 waterColor = mix(shallowColor, deepColor, depth);

    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
    vec3 halfVector = normalize(viewDirection + sunDirection);
    float sunGlint = pow(max(dot(normal, halfVector), 0.0), 48.0);
    float broadReflection = pow(max(dot(normal, halfVector), 0.0), 9.0) * 0.12;
    float ripple = sin(vWorldPosition.x * 2.7 + uTime * 0.9)
      * cos(vWorldPosition.z * 2.2 - uTime * 0.72);
    float foamNoise = sin(vWorldPosition.x * 0.68 + uTime * 0.34)
      * cos(vWorldPosition.z * 0.57 - uTime * 0.27);
    float shoreDistance = distanceFromIsland - (10.55 + ripple * 0.32);
    float foamBand = 1.0 - smoothstep(0.12, 0.82, abs(shoreDistance + vWaveHeight * 0.45));
    float foamBreakup = smoothstep(-0.72, 0.72, foamNoise + vWaveHeight * 0.7);
    float foam = foamBand * foamBreakup * (1.0 - depth * 0.42);

    waterColor += fresnel * vec3(0.12, 0.24, 0.31);
    waterColor += broadReflection * uSunColor * 0.5;
    waterColor += sunGlint * uSunColor * 0.85;
    waterColor = mix(waterColor, vec3(0.94, 0.82, 0.67), foam * 0.78);
    float cameraDistance = length(uCameraPosition - vWorldPosition);
    float fogFactor = 1.0 - exp2(-uFogDensity * uFogDensity * cameraDistance * cameraDistance * 1.442695);
    waterColor = mix(waterColor, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(waterColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWaterMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uWaveHeight: { value: 0.22 },
    uWaveSpeed: { value: 0.62 },
    uSunDirection: { value: new THREE.Vector3(-0.45, 0.32, -0.82).normalize() },
    uSunColor: { value: new THREE.Color('#ffb15e') },
    uCameraPosition: { value: new THREE.Vector3() },
    uFogColor: { value: new THREE.Color('#ff9e7d') },
    uFogDensity: { value: 0.012 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: false,
  });
  return { material, uniforms };
}
