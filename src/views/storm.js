// Режим «Ядро»: два плотных облака нейронов, популяция дышит,
// спайки расходятся от центра облака. Курсор раздвигает облако.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from '../visuals.js'
import { DOT_FRAGMENT } from './noise.js'
import {
  SPIKE_GLSL,
  createSpikeUniforms,
  writeSpikeUniforms
} from './spikes.js'

const PER_SIDE = 18000
const RADIUS = 0.5
const OFFSET = 0.66

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uBreath;
uniform float uSwirl;
uniform float uSize;
uniform float uDensity;
uniform float uSaturation;
uniform float uDim;
uniform float uAlive[6];
uniform vec3 uLayerColor[6];
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uRim;
uniform vec3 uCursor;
uniform float uActivity;
attribute float aSide;
attribute float aMix;
attribute float aNoise;
attribute float aScale;
attribute float aLayer;
attribute float aRank;
varying vec3 vColor;
varying float vAlpha;
${SPIKE_GLSL}
void main() {
  vec3 center = vec3(aSide < 0.5 ? -${OFFSET.toFixed(2)} : ${OFFSET.toFixed(2)}, 0.0, 0.0);
  vec3 p = position;
  // дыхание популяции: у полушарий разная фаза
  float t = uTime * uBreath + aNoise * 6.2831 + aSide * 1.7;
  p *= 1.0 + sin(t) * 0.07 * (0.4 + aMix);
  float angle = uTime * uSwirl * (1.0 - aSide * 2.0) + aNoise * 6.2831;
  p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;

  vec4 world = modelMatrix * vec4(center + p, 1.0);
  vec3 toPoint = world.xyz - uCursor;
  float fall = smoothstep(0.35, 0.0, length(toPoint));
  world.xyz += normalize(toPoint + vec3(0.0001)) * fall * 0.25 * uActivity;
  vec4 view = viewMatrix * world;

  int layer = int(aLayer);
  float alive = uAlive[layer];
  vec3 base = mix(uCore, uMid, smoothstep(0.25, 0.85, aMix));
  base = mix(base, uRim, clamp((aMix - 0.7) * 3.0, 0.0, 1.0));
  base = mix(base, uLayerColor[layer], alive * 0.6 * uSaturation);
  vColor = base * (0.55 + alive * 0.8) * uDim + spikeLight(center + p) * 0.8;
  vAlpha = aRank < uDensity ? 0.8 : 0.0;

  gl_PointSize = max(1.0, uSize * aScale / -view.z);
  gl_Position = projectionMatrix * view;
}
`

export function createStorm({ renderer, colors, reducedMotion, pointer }) {
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30)
  camera.position.set(0, 0.25, 1)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false

  const count = PER_SIDE * 2
  const positions = new Float32Array(count * 3)
  const attributes = {
    aSide: new Float32Array(count),
    aMix: new Float32Array(count),
    aNoise: new Float32Array(count),
    aScale: new Float32Array(count),
    aLayer: new Float32Array(count),
    aRank: new Float32Array(count)
  }
  for (let i = 0; i < count; i++) {
    // равномерная точка на сфере (Марсалья), радиус смещён к оболочке
    let u, v, s
    do {
      u = Math.random() * 2 - 1
      v = Math.random() * 2 - 1
      s = u * u + v * v
    } while (s >= 1 || s === 0)
    const factor = 2 * Math.sqrt(1 - s)
    const shell = Math.pow(Math.random(), 0.4)
    const r = RADIUS * (0.25 + shell * 0.75)
    positions.set([u * factor * r, v * factor * r, (1 - 2 * s) * r], i * 3)
    attributes.aSide[i] = i < PER_SIDE ? 0 : 1
    attributes.aMix[i] = shell
    attributes.aNoise[i] = Math.random()
    attributes.aScale[i] = 0.45 + Math.random() * 0.8
    attributes.aLayer[i] = Math.floor(Math.random() * 6)
    attributes.aRank[i] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  Object.entries(attributes).forEach(([key, array]) =>
    geometry.setAttribute(key, new THREE.BufferAttribute(array, 1))
  )

  const toVector = (color) => new THREE.Vector3(color.r, color.g, color.b)
  const uniforms = {
    ...createSpikeUniforms(),
    uTime: { value: 0 },
    uBreath: { value: 1.4 },
    uSwirl: { value: 0.05 },
    uSize: { value: 12 * renderer.getPixelRatio() },
    uDensity: { value: 1 },
    uSaturation: { value: 1 },
    uDim: { value: 1 },
    uAlive: { value: [0, 0, 0, 0, 0, 0] },
    uLayerColor: { value: colors.layers.map(toVector) },
    uCore: { value: toVector(colors.quiet).multiplyScalar(0.6) },
    uMid: { value: toVector(colors.signal) },
    uRim: { value: toVector(colors.ice) },
    uCursor: { value: new THREE.Vector3(0, 0, 99) },
    uActivity: { value: 0 }
  }
  uniforms.uWidth.value = 0.07
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: DOT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)

  // спайк расходится из центра своего облака, слои чуть смещены по кругу
  const origin = new THREE.Vector3()
  function spikeOrigin(layer, side) {
    const angle = (layer / 6) * Math.PI * 2
    return origin.set(
      (side === 0 ? -OFFSET : OFFSET) + Math.cos(angle) * 0.08,
      Math.sin(angle) * 0.08,
      0
    )
  }

  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane()
  const normal = new THREE.Vector3()
  const hit = new THREE.Vector3()

  function update({ time, look, speed, decay, spikes }) {
    uniforms.uTime.value = time
    uniforms.uBreath.value = reducedMotion ? 0.6 : 1.4 * speed
    uniforms.uSwirl.value = reducedMotion ? 0 : 0.04 + look.energy * 0.08
    uniforms.uDensity.value = look.density
    uniforms.uSaturation.value = look.saturation
    uniforms.uDim.value = look.dim
    uniforms.uAlive.value = look.alive
    uniforms.uSpeed.value = speed * 0.55
    uniforms.uDecay.value = decay
    writeSpikeUniforms(uniforms, spikes, spikeOrigin, colors.layers)

    camera.getWorldDirection(normal)
    plane.setFromNormalAndCoplanarPoint(normal, controls.target)
    raycaster.setFromCamera(pointer.ndc, camera)
    if (raycaster.ray.intersectPlane(plane, hit))
      uniforms.uCursor.value.lerp(hit, 0.12)
    uniforms.uActivity.value = pointer.activity
    controls.update()
  }

  function resize(width, height, isFull) {
    const distance = frameCamera(
      camera,
      width,
      height,
      isFull,
      OFFSET + RADIUS,
      RADIUS * 1.1
    )
    controls.minDistance = distance * 0.4
    controls.maxDistance = distance * 1.8
  }

  return { scene, camera, update, resize, dispose: () => controls.dispose() }
}
