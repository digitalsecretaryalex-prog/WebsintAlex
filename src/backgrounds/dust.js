// «Пыль»: только космос. 5 000 мелких мерцающих точек вокруг камеры фона,
// ближе и гуще, чем звёзды под остальными фонами. Нота слоя чуть зажигает
// пылинки его цвета, панорама решает, с какой стороны.
import * as THREE from 'three'
import { glowMaterial } from './common.js'
import { LAYERS } from './hearing.js'

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uDim;
uniform vec3 uColor;
uniform vec3 uLayerColor[${LAYERS}];
uniform float uGlow[${LAYERS}];
uniform float uPan[${LAYERS}];
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.3 + aSeed) + aSeed * 40.0);
  int layer = int(aSeed * ${LAYERS}.0);
  // пылинки слоя со стороны его панорамы
  float side = 1.0 - smoothstep(0.0, 1.2, abs(normalize(position).x - uPan[layer] * 0.8));
  float lit = uGlow[layer] * side;
  vColor = mix(uColor, uLayerColor[layer], clamp(lit, 0.0, 1.0));
  vAlpha = (0.2 + 0.4 * aSeed + lit * 0.6) * twinkle * uDim;
  gl_PointSize = (1.6 + aSeed * 1.6 + lit * 1.5) * uPixel;
  gl_Position = projectionMatrix * view;
}`

export function createDust({ scene, camera, renderer, colors }) {
  const count = 5000
  const position = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const direction = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    direction
      .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize()
      .multiplyScalar(16 + Math.random() * 14)
      .toArray(position, i * 3)
    seed[i] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const uniforms = {
    uTime: { value: 0 },
    uPixel: { value: renderer.getPixelRatio() },
    uDim: { value: 1 },
    uColor: { value: colors.ice.clone().lerp(colors.signal, 0.35) },
    uLayerColor: { value: colors.layers.map((color) => color.clone()) },
    uGlow: { value: new Array(LAYERS).fill(0) },
    uPan: { value: new Array(LAYERS).fill(0) }
  }
  const points = new THREE.Points(geometry, glowMaterial(uniforms, VERTEX))
  points.frustumCulled = false
  // пыль вокруг камеры фона
  points.position.copy(camera.position)
  scene.add(points)

  function update({ clock, hearing, dim, look }) {
    uniforms.uTime.value = clock
    uniforms.uDim.value = dim * (0.6 + 0.4 * look.saturation)
    for (let i = 0; i < LAYERS; i++) {
      uniforms.uGlow.value[i] = Math.min(1, hearing.glow[i])
      uniforms.uPan.value[i] = hearing.knob('pan', i, 0)
    }
    points.rotation.y = -clock * 0.004
  }

  return { update }
}
