// Фон за всеми видами: своя сцена, рисуется первой той же камерой.
// dust: мелкая пыль, как звёзды в глубине.
// calcium: клетки вспыхивают и медленно гаснут, как на кальциевой съёмке.
// tracts: длинные волокна белого вещества, по ним бегут волны.
import * as THREE from 'three'

export const BACKGROUNDS = ['dust', 'calcium', 'tracts']

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

// Клетка на кальциевой съёмке: светится кольцо, ядро темнее
const CELL_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float ring = smoothstep(0.5, 0.32, d) - 0.55 * smoothstep(0.24, 0.08, d);
  gl_FragColor = vec4(vColor, ring * vAlpha);
}
`

const DUST_VERTEX = /* glsl */ `
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
  vAlpha = (0.2 + 0.4 * aSeed) * twinkle * uDim;
  gl_PointSize = (1.6 + aSeed * 1.6) * uPixel;
  gl_Position = projectionMatrix * view;
}
`

// фаза растёт с разной скоростью у каждой клетки; на переходе через 1
// клетка вспыхивает и гаснет по экспоненте
const CALCIUM_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uDim;
uniform vec3 uColor;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float phase = fract(uTime * (0.06 + 0.14 * aSeed) + aSeed * 13.0);
  float flash = exp(-phase * 7.0);
  vColor = uColor;
  vAlpha = (0.14 + 0.7 * flash) * uDim;
  gl_PointSize = (5.0 + aSeed * 6.0) * uPixel;
  gl_Position = projectionMatrix * view;
}
`

// aT: место на волокне от 0 до 1; голова волны и хвост за ней
const TRACT_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uDim;
attribute float aSeed;
attribute float aT;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float wave = fract(aT - uTime * (0.03 + 0.04 * aSeed) + aSeed * 7.0);
  float head = pow(1.0 - wave, 10.0);
  vColor = aColor;
  vAlpha = (0.24 + 0.9 * head) * uDim;
  gl_PointSize = 2.2 * uPixel;
  gl_Position = projectionMatrix * view;
}
`

export function softMaterial(uniforms, vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: fragmentShader || SOFT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
}

function randomDirection() {
  return new THREE.Vector3(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1
  ).normalize()
}

// точки на сфере вокруг начала координат, радиус 16-30
function shellPoints(count) {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    randomDirection()
      .multiplyScalar(16 + Math.random() * 14)
      .toArray(positions, i * 3)
    seeds[i] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  return geometry
}

// волокно: дуга по сфере с лёгким изгибом, цвет по направлению,
// как на картах трактов, но в палитре инструмента
function tractPoints(colors, fibres = 320, length = 160) {
  const count = fibres * length
  const positions = new Float32Array(count * 3)
  const tint = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const along = new Float32Array(count)
  const point = new THREE.Vector3()
  const color = new THREE.Color()
  for (let f = 0; f < fibres; f++) {
    const start = randomDirection()
    const axis = randomDirection().cross(start).normalize()
    const arc = 0.5 + Math.random() * 0.9
    const radius = 18 + Math.random() * 8
    const wobble = Math.random() * 6.28
    const seed = Math.random()
    const tangent = new THREE.Vector3().crossVectors(axis, start)
    color
      .setRGB(
        Math.abs(tangent.x) * 0.6,
        Math.abs(tangent.y) * 0.8,
        Math.abs(tangent.z)
      )
      .lerp(colors.ice, 0.55)
      .lerp(colors.signal, 0.2)
    for (let k = 0; k < length; k++) {
      const t = k / length
      const i = f * length + k
      point
        .copy(start)
        .applyAxisAngle(axis, (t - 0.5) * arc)
        .multiplyScalar(radius + Math.sin(t * 6 + wobble) * 0.8)
      point.toArray(positions, i * 3)
      color.toArray(tint, i * 3)
      seeds[i] = seed
      along[i] = t
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(tint, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aT', new THREE.BufferAttribute(along, 1))
  return geometry
}

export function createBackdrop({ renderer, colors }, kind) {
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const uniforms = {
    uTime: { value: 0 },
    uPixel: { value: renderer.getPixelRatio() },
    uDim: { value: 1 },
    uColor: { value: colors.ice.clone().lerp(colors.signal, 0.35) }
  }
  let points
  if (kind === 'calcium') {
    uniforms.uColor.value = colors.layers[1].clone().lerp(colors.ice, 0.3)
    points = new THREE.Points(
      shellPoints(2400),
      softMaterial(uniforms, CALCIUM_VERTEX, CELL_FRAGMENT)
    )
  } else if (kind === 'tracts') {
    points = new THREE.Points(
      tractPoints(colors),
      softMaterial(uniforms, TRACT_VERTEX)
    )
  } else {
    points = new THREE.Points(
      shellPoints(5000),
      softMaterial(uniforms, DUST_VERTEX)
    )
  }
  points.frustumCulled = false
  scene.add(points)

  // clock: время с поправкой на энергию музыки, фон живёт медленнее к концу сета
  let clock = 0
  function update(dt, look, motion) {
    clock += dt * (0.5 + look.energy) * motion
    uniforms.uTime.value = clock
    uniforms.uDim.value = look.dim * (0.6 + 0.4 * look.saturation)
    points.rotation.y = -clock * 0.004
  }
  return { scene, update }
}
