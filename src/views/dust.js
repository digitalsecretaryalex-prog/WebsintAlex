// Мягкие точки и фоновая пыль: общие для всех видов.
import * as THREE from 'three'

// Мягкая круглая точка: края тают, при сложении светится сильнее
const SOFT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * vAlpha);
}
`

// Пыль: мелкие точки постоянного размера, медленно мерцают
const DUST_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform vec3 uColor;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.3 + aSeed) + aSeed * 40.0);
  vColor = uColor;
  vAlpha = (0.08 + 0.22 * aSeed) * twinkle;
  gl_PointSize = (0.8 + aSeed * 1.2) * uPixel;
  gl_Position = projectionMatrix * view;
}
`

export function softMaterial(uniforms, vertexShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: SOFT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
}

// Фон: мелкая пыль на сфере вокруг center, как звёзды в глубине.
// update(time) мерцание и медленный снос вправо
export function createDust({ renderer, colors }, center, count = 1600) {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize()
    direction.multiplyScalar(16 + Math.random() * 14)
    direction.toArray(positions, i * 3)
    seeds[i] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  const uniforms = {
    uTime: { value: 0 },
    uPixel: { value: renderer.getPixelRatio() },
    uColor: { value: colors.ice.clone().lerp(colors.signal, 0.35) }
  }
  const points = new THREE.Points(geometry, softMaterial(uniforms, DUST_VERTEX))
  points.position.copy(center)
  points.frustumCulled = false

  function update(time, motion) {
    uniforms.uTime.value = time
    points.rotation.y = -time * 0.004 * motion
  }
  return { points, update }
}
