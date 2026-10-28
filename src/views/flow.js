// Режим «Волна»: поле точек как кора, волны активности бегут по нему.
// Левая и правая половины поля: два полушария со сдвигом фазы шума.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from '../visuals.js'
import { SNOISE, DOT_FRAGMENT } from './noise.js'
import {
  SPIKE_GLSL,
  createSpikeUniforms,
  writeSpikeUniforms
} from './spikes.js'

const COLUMNS = 320
const ROWS = 160
const HALF_X = 2.4
const HALF_Z = 1.4
const GAP = 0.06

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uStream;
uniform float uWave;
uniform float uSize;
uniform float uDensity;
uniform float uSaturation;
uniform float uDim;
uniform float uAlive[6];
uniform vec3 uLayerColor[6];
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uCursor;
uniform float uActivity;
attribute float aLayer;
attribute float aSide;
attribute float aRank;
varying vec3 vColor;
varying float vAlpha;
${SNOISE}
${SPIKE_GLSL}
void main() {
  vec3 p = position;
  float phase = aSide * 7.31;
  float z = p.z + uStream;
  float n = snoise(vec3(p.x * 1.2, z * 1.2, uTime * 0.15 + phase));
  n += snoise(vec3(p.x * 2.4, z * 2.4, uTime * 0.3 + phase)) * 0.4;
  vec3 spike = spikeLight(vec3(position.x, 0.0, position.z));
  p.y = n * uWave + length(spike) * 0.06;

  vec4 world = modelMatrix * vec4(p, 1.0);
  // курсор раздвигает поверхность
  vec3 toPoint = world.xyz - uCursor;
  float fall = smoothstep(0.45, 0.0, length(toPoint));
  world.xyz += normalize(toPoint + vec3(0.0001)) * fall * 0.12 * uActivity;
  vec4 view = viewMatrix * world;

  int layer = int(aLayer);
  float alive = uAlive[layer];
  vec3 base = mix(uLow, uHigh, smoothstep(-0.8, 1.0, n));
  base = mix(base, uLayerColor[layer], alive * 0.65 * uSaturation);
  vColor = base * (0.6 + alive * 0.75) * uDim + spike;
  // края поля растворяются, жёсткой рамки нет
  float edge = smoothstep(1.0, 0.65, abs(position.x) / ${HALF_X.toFixed(1)});
  edge *= smoothstep(1.0, 0.55, abs(position.z) / ${HALF_Z.toFixed(1)});
  vAlpha = aRank < uDensity ? 0.95 * edge : 0.0;

  gl_PointSize = max(1.0, uSize / -view.z);
  gl_Position = projectionMatrix * view;
}
`

export function createFlow({ renderer, colors, reducedMotion, pointer }) {
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30)
  camera.position.set(0, 1.15, 1.7)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.maxPolarAngle = Math.PI * 0.47

  const positions = []
  const layer = []
  const side = []
  const rank = []
  for (let column = 0; column < COLUMNS; column++) {
    const x = (column / (COLUMNS - 1)) * 2 * HALF_X - HALF_X
    if (Math.abs(x) < GAP) continue
    for (let row = 0; row < ROWS; row++) {
      const z = (row / (ROWS - 1)) * 2 * HALF_Z - HALF_Z
      positions.push(x, 0, z)
      // слои лежат полосами от дальнего края к ближнему
      layer.push(Math.min(5, Math.floor(((z + HALF_Z) / (2 * HALF_Z)) * 6)))
      side.push(x < 0 ? 0 : 1)
      rank.push(Math.random())
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1))
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
  geometry.setAttribute('aRank', new THREE.Float32BufferAttribute(rank, 1))

  const uniforms = {
    ...createSpikeUniforms(),
    uTime: { value: 0 },
    uStream: { value: 0 },
    uWave: { value: 0.18 },
    uSize: { value: 5 * renderer.getPixelRatio() },
    uDensity: { value: 1 },
    uSaturation: { value: 1 },
    uDim: { value: 1 },
    uAlive: { value: [0, 0, 0, 0, 0, 0] },
    uLayerColor: {
      value: colors.layers.map((c) => new THREE.Vector3(c.r, c.g, c.b))
    },
    uLow: {
      value: new THREE.Vector3().setFromColor(colors.quiet).multiplyScalar(0.35)
    },
    uHigh: { value: new THREE.Vector3().setFromColor(colors.signal) },
    uCursor: { value: new THREE.Vector3(0, 0, 99) },
    uActivity: { value: 0 }
  }
  uniforms.uWidth.value = 0.1
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

  // центр популяции: середина полосы слоя на своей половине поля
  const origin = new THREE.Vector3()
  function spikeOrigin(layerIndex, sideIndex) {
    const z = -HALF_Z + ((layerIndex + 0.5) / 6) * 2 * HALF_Z
    return origin.set(sideIndex === 0 ? -HALF_X / 2 : HALF_X / 2, 0, z)
  }

  const raycaster = new THREE.Raycaster()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()

  function update({ dt, time, look, speed, decay, spikes }) {
    const motion = reducedMotion ? 0 : 1
    uniforms.uTime.value = time * motion
    uniforms.uStream.value += dt * 0.12 * speed * (0.4 + look.energy) * motion
    uniforms.uWave.value = 0.16 + look.energy * 0.18
    uniforms.uDensity.value = look.density
    uniforms.uSaturation.value = look.saturation
    uniforms.uDim.value = look.dim
    uniforms.uAlive.value = look.alive
    uniforms.uSpeed.value = speed * 0.9
    uniforms.uDecay.value = decay
    writeSpikeUniforms(uniforms, spikes, spikeOrigin, colors.layers)

    raycaster.setFromCamera(pointer.ndc, camera)
    if (raycaster.ray.intersectPlane(ground, hit))
      uniforms.uCursor.value.lerp(hit, 0.12)
    uniforms.uActivity.value = pointer.activity
    controls.update()
  }

  function resize(width, height, isFull) {
    const distance = frameCamera(camera, width, height, isFull, 1.25, 0.6)
    controls.minDistance = distance * 0.5
    controls.maxDistance = distance * 1.6
  }

  return { scene, camera, update, resize, dispose: () => controls.dispose() }
}
