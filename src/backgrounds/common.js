// Общее для фонов: мягкая светящаяся точка, звёзды под каждым фоном
// и приглушение цвета к концу сета.
import * as THREE from 'three'

// Мягкая круглая точка: края тают, при сложении светится сильнее
export const SOFT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, smoothstep(0.5, 0.08, d) * vAlpha);
}`

// свет складывается: пересечения ярче, на чёрном и на подложке видно одинаково
export function glowMaterial(uniforms, vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: fragmentShader || SOFT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  })
}

// насыщенность: к концу сета цвет уходит в ледяной
export const PALETTE_GLSL = /* glsl */ `
vec3 calm(vec3 color, vec3 ice, float saturation) {
  return mix(ice * 0.85, color, saturation);
}`

const STAR_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uDim;
uniform vec3 uColor;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.3 + aSeed) + aSeed * 40.0);
  vColor = uColor;
  vAlpha = (0.15 + 0.35 * aSeed) * twinkle * uDim;
  gl_PointSize = (1.4 + aSeed * 1.4) * uPixel;
  gl_Position = projectionMatrix * view;
}`

// Звёзды: точки на оболочке вокруг камеры фона, мерцают, космос под нейронами
export function createStars(renderer, colors, count) {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const direction = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    direction
      .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize()
      .multiplyScalar(60 + Math.random() * 40)
      .toArray(positions, i * 3)
    seeds[i] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  const uniforms = {
    uTime: { value: 0 },
    uPixel: { value: renderer.getPixelRatio() },
    uDim: { value: 1 },
    uColor: { value: colors.ice.clone().lerp(colors.signal, 0.35) }
  }
  const points = new THREE.Points(geometry, glowMaterial(uniforms, STAR_VERTEX))
  points.frustumCulled = false
  function update(clock, dim) {
    uniforms.uTime.value = clock
    uniforms.uDim.value = dim
    points.rotation.y = -clock * 0.004
  }
  return { points, update }
}
