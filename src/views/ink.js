// Режим «Чернила»: две скульптуры из лент-аксонов, по ленте бежит сигнал
// её слоя. Вокруг зернистая пыль, в центре стеклянная сфера и тонкие оси.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from '../visuals.js'
import { DOT_FRAGMENT } from './noise.js'
import {
  SPIKE_GLSL,
  createSpikeUniforms,
  writeSpikeUniforms
} from './spikes.js'

const OFFSET = 0.62
const RIBBON_LAYERS = [0, 1, 2, 3, 4]
const DUST_PER_SIDE = 2600

// mulberry32: скульптуры одинаковые при каждом запуске
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// TubeGeometry с двумя радиальными сегментами даёт плоскую ленту.
// normal здесь направлен от оси к краю: по нему меняем ширину ленты
const RIBBON_VERTEX = /* glsl */ `
uniform float uRadius;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vViewPosition;
void main() {
  float swell = 0.25 + 0.75 * (0.5 + 0.5 * sin(uv.x * 6.2831 * 2.0 + uSeed));
  vec3 p = position - normal * uRadius * (1.0 - swell);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vUv = uv;
  vViewPosition = view.xyz;
  gl_Position = projectionMatrix * view;
}
`

const RIBBON_FRAGMENT = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uColor;
uniform float uAge;
uniform float uSpeed;
uniform float uDecay;
uniform float uAlive;
uniform float uSaturation;
uniform float uDim;
varying vec2 vUv;
varying vec3 vViewPosition;
void main() {
  // нормаль плоской ленты из производных: работает с обеих сторон
  vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float light = abs(dot(n, normalize(vec3(0.3, 0.8, 0.5))));
  float facing = abs(dot(n, normalize(-vViewPosition)));
  vec3 ink = uInk * (0.12 + 0.88 * light * (0.4 + 0.6 * facing));
  ink *= (0.45 + 0.55 * uAlive) * uDim;
  // сигнал: яркая голова и хвост позади неё, гаснет со временем
  float behind = fract(uAge * uSpeed - vUv.x);
  float glow = exp(-behind * behind / 0.0012) + exp(-behind * 14.0) * 0.35;
  glow *= exp(-uAge / uDecay);
  vec3 signal = mix(uInk, uColor, 0.4 + 0.6 * uSaturation) * glow * 1.8;
  gl_FragColor = vec4(ink + signal, 1.0);
}
`

const GLASS_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-view.xyz);
  gl_Position = projectionMatrix * view;
}
`

const GLASS_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float edge = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
  gl_FragColor = vec4(uColor, edge * 0.75 + 0.04);
}
`

const DUST_VERTEX = /* glsl */ `
uniform float uSize;
uniform float uAlive;
uniform float uDim;
uniform vec3 uDust;
attribute float aScale;
varying vec3 vColor;
varying float vAlpha;
${SPIKE_GLSL}
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vColor = uDust * (0.4 + uAlive * 0.8) * uDim + spikeLight(position) * 0.6;
  vAlpha = 0.6;
  gl_PointSize = max(1.0, uSize * aScale / -view.z);
  gl_Position = projectionMatrix * view;
}
`

export function createInk({ renderer, colors, reducedMotion }) {
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30)
  camera.position.set(0, 0.15, 1)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.3

  const rand = random(11)
  // чернила: нейтральный светлый серый на тёмном экране
  const ink = new THREE.Vector3(colors.ice.r, colors.ice.g, colors.ice.b)
    .lerp(new THREE.Vector3(1, 1, 1), 0.5)
    .multiplyScalar(0.85)
  const ribbons = []
  const curves = []

  ;[0, 1].forEach((side) => {
    const center = new THREE.Vector3(side === 0 ? -OFFSET : OFFSET, 0, 0)
    const group = new THREE.Group()
    group.position.copy(center)
    scene.add(group)

    RIBBON_LAYERS.forEach((layer) => {
      // лента-орбита: точки по кругу в своей плоскости, с отклонениями
      const axis = new THREE.Vector3(
        rand() * 2 - 1,
        rand() * 2 - 1,
        rand() * 2 - 1
      ).normalize()
      const u = new THREE.Vector3(1, 0, 0).cross(axis).normalize()
      const v = axis.clone().cross(u)
      const points = []
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + (rand() - 0.5) * 0.6
        const radius = 0.34 + rand() * 0.14
        points.push(
          u
            .clone()
            .multiplyScalar(Math.cos(angle) * radius)
            .addScaledVector(v, Math.sin(angle) * radius)
            .addScaledVector(axis, (rand() - 0.5) * 0.16)
        )
      }
      const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal')
      curves.push({ curve, center, side })
      const radius = 0.016 + rand() * 0.034
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uRadius: { value: radius },
          uSeed: { value: rand() * 6.28 },
          uInk: { value: ink },
          uColor: {
            value: new THREE.Vector3(
              colors.layers[layer].r,
              colors.layers[layer].g,
              colors.layers[layer].b
            )
          },
          uAge: { value: 99 },
          uSpeed: { value: 0.6 },
          uDecay: { value: 1 },
          uAlive: { value: 0 },
          uSaturation: { value: 1 },
          uDim: { value: 1 }
        },
        vertexShader: RIBBON_VERTEX,
        fragmentShader: RIBBON_FRAGMENT,
        side: THREE.DoubleSide
      })
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 300, radius, 2, true),
          material
        )
      )
      ribbons.push({ layer, side, material })
    })

    // стеклянная сфера с тонкими кольцами внутри
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: ink } },
        vertexShader: GLASS_VERTEX,
        fragmentShader: GLASS_FRAGMENT,
        transparent: true,
        depthWrite: false
      })
    )
    group.add(glass)
    const ringMaterial = new THREE.LineBasicMaterial({
      color: colors.ice,
      transparent: true,
      opacity: 0.35
    })
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          new THREE.EllipseCurve(0, 0, 0.06, 0.06).getPoints(48)
        ),
        ringMaterial
      )
      ring.rotation.set(rand() * Math.PI, rand() * Math.PI, 0)
      group.add(ring)
    }

    // тонкие радиальные оси
    const axes = []
    for (let i = 0; i < 4; i++) {
      const direction = new THREE.Vector3(
        rand() * 2 - 1,
        rand() * 2 - 1,
        rand() * 2 - 1
      ).normalize()
      axes.push(
        direction.clone().multiplyScalar(-0.75),
        direction.multiplyScalar(0.75)
      )
    }
    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(axes),
        new THREE.LineBasicMaterial({
          color: colors.ice,
          transparent: true,
          opacity: 0.12
        })
      )
    )
  })

  // пыль: зерно вокруг лент, ярче от спайков
  const dustPositions = []
  const dustScale = []
  for (let i = 0; i < DUST_PER_SIDE * 2; i++) {
    const { curve, center } = curves[Math.floor(rand() * curves.length)]
    const point = curve.getPointAt(rand()).add(center)
    const spread = 0.015 + Math.pow(rand(), 3) * 0.12
    point.x += (rand() * 2 - 1) * spread
    point.y += (rand() * 2 - 1) * spread
    point.z += (rand() * 2 - 1) * spread
    dustPositions.push(point.x, point.y, point.z)
    dustScale.push(0.4 + rand())
  }
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(dustPositions, 3)
  )
  dustGeometry.setAttribute(
    'aScale',
    new THREE.Float32BufferAttribute(dustScale, 1)
  )
  const dustUniforms = {
    ...createSpikeUniforms(),
    uSize: { value: 2.2 * renderer.getPixelRatio() },
    uAlive: { value: 0 },
    uDim: { value: 1 },
    uDust: { value: ink.clone().multiplyScalar(0.4) }
  }
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      vertexShader: DUST_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  dust.frustumCulled = false
  scene.add(dust)

  const origin = new THREE.Vector3()
  const spikeOrigin = (layer, side) =>
    origin.set(side === 0 ? -OFFSET : OFFSET, 0, 0)

  function update({ look, speed, decay, spikes }) {
    const now = spikes.now()
    ribbons.forEach(({ layer, side, material }) => {
      const last = spikes.spikes.findLast(
        (spike) => spike.layer === layer && spike.side === side
      )
      const uniforms = material.uniforms
      uniforms.uAge.value = last ? now - last.born : 99
      uniforms.uSpeed.value = speed * 0.7
      uniforms.uDecay.value = decay
      uniforms.uAlive.value = look.alive[layer]
      uniforms.uSaturation.value = look.saturation
      uniforms.uDim.value = look.dim
    })
    dustUniforms.uAlive.value = look.alive[5]
    dustUniforms.uDim.value = look.dim * (0.5 + look.density * 0.5)
    dustUniforms.uSpeed.value = speed * 0.5
    dustUniforms.uDecay.value = decay
    writeSpikeUniforms(dustUniforms, spikes, spikeOrigin, colors.layers)
    controls.autoRotateSpeed = reducedMotion ? 0 : 0.3 * speed
    controls.update()
  }

  function resize(width, height, isFull) {
    const distance = frameCamera(
      camera,
      width,
      height,
      isFull,
      OFFSET + 0.55,
      0.55
    )
    controls.minDistance = distance * 0.4
    controls.maxDistance = distance * 1.8
  }

  return { scene, camera, update, resize, dispose: () => controls.dispose() }
}
