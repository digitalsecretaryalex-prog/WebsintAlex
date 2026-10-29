// Нейроны в стиле сцены Tunnel. Из эталона взяты приём и цвет:
// точки стоят на кольцах трубы, шум в две октавы рябит радиус,
// угол на кольце дрожит и закручивается, кольца медленно поворачиваются;
// цвет идёт от индиго к циану по диагонали, фон с фиолетовыми и
// циановыми всполохами, пылинки у объектива.
// Из приёма собран нейрон. Тело: воронка из колец, она сужается в аксон,
// как горло тоннеля. Аксон: тонкий тоннель с перехватами миелина, импульс
// раздувает его кольца и проходит насквозь. Дендриты: трубки, которые
// сужаются к кончикам. Нейрон рождается из вихря: кольца сходятся спиралью.
// Камера летит рядом с импульсом и смотрит вдоль аксона, как в тоннель.
import * as THREE from 'three'
import { growSkeleton, crossFrame } from './skeleton.js'
import {
  CHAIN,
  NEURONS,
  NEURON_GLSL,
  AXON_GLSL,
  createChain,
  neuronUniforms,
  writeNeurons,
  bend
} from './chain.js'
import {
  SNOISE,
  POINT_FRAGMENT,
  hexToVec3,
  colorToVec3,
  createAtmosphere
} from './atmosphere.js'

// Значения эталона Tunnel
const REF = {
  bg: '#0a0524',
  flameA: '#2bf0ff',
  flameB: '#7a3cff',
  flameAmt: 0.2,
  atmo: '#8fe6ff',
  atmoCount: 300,
  atmoSize: 24,
  atmoSpeed: 1,
  low: '#180a3a',
  high: '#2bf0ff',
  opacity: 1.44,
  brightness: 0.4,
  swirl: 0.39,
  spin: 0.065,
  steer: 0.6,
  parallax: 0.12,
  pointerStrength: 0.8
}

const SOMA_RINGS = 44
const AXON_RINGS = 120

// радиус тела вдоль оси: шар, который сужается в бугорок аксона
function somaRadius(z) {
  if (z > -0.75) return Math.sqrt(1 - z * z)
  const t = Math.min(1, (-0.75 - z) / 1.1)
  return 0.661 + (0.16 - 0.661) * t * t * (3 - 2 * t)
}

// Кожа нейрона: кольца точек вокруг линий скелета.
// position: точка на оси кольца в единицах клетки; aSide1, aSide2: плоскость
// кольца; aTube: угол, радиус, порядок от тела (0) к кончикам (1), длина вдоль;
// aMeta: часть (0 тело, 1 дендрит, 2 аксон, 3 ореол ядра) и номер нейрона.
function buildSkin() {
  const data = { position: [], aSide1: [], aSide2: [], aTube: [], aMeta: [] }
  function ring(cell, part, center, side1, side2, count, radius, order, along) {
    for (let j = 0; j < count; j++) {
      const angle = ((j + Math.random() * 0.6) / count) * Math.PI * 2
      data.position.push(center.x, center.y, center.z)
      data.aSide1.push(side1.x, side1.y, side1.z)
      data.aSide2.push(side2.x, side2.y, side2.z)
      data.aTube.push(angle, radius, order, along)
      data.aMeta.push(part, cell)
    }
  }
  const axis = new THREE.Vector3()
  const across = new THREE.Vector3(1, 0, 0)
  const up = new THREE.Vector3(0, 1, 0)
  for (let cell = 0; cell < NEURONS; cell++) {
    const dense = cell < CHAIN ? 1 : 0.55
    // тело: кольца от задней точки к бугорку, где начинается аксон
    for (let i = 0; i <= SOMA_RINGS; i++) {
      const z = 1 - (i / SOMA_RINGS) * 2.85
      const r = somaRadius(z)
      const count = Math.max(8, Math.round((10 + 60 * r) * dense))
      ring(cell, 0, axis.set(0, 0, z), across, up, count, r, 0, (1 - z) * 1.4)
    }
    // ореол ядра: несколько крупных мягких точек в центре
    ring(cell, 3, axis.set(0, 0, 0), across, up, 3, 0, 0, 0)
    // дендриты: у каждого третьего нейрона пирамидная форма
    growSkeleton(cell % 3 === 1).forEach((branch) => {
      let side = null
      branch.points.forEach((point, k) => {
        const [side1, side2] = crossFrame(branch.tangents[k], side)
        side = side1
        const count = Math.max(
          4,
          Math.round((4 + branch.widths[k] * 16) * dense)
        )
        ring(
          cell,
          1,
          point,
          side1,
          side2,
          count,
          branch.widths[k],
          branch.orders[k],
          k * 0.12
        )
      })
    })
    // аксон: форму считает шейдер, здесь только доля пути и угол
    for (let i = 0; i < AXON_RINGS; i++) {
      const count = Math.round(13 * dense) + 1
      ring(
        cell,
        2,
        axis.set(0, 0, 0),
        across,
        up,
        count,
        0,
        i / (AXON_RINGS - 1),
        i * 0.1
      )
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(data.position, 3)
  )
  geometry.setAttribute(
    'aSide1',
    new THREE.Float32BufferAttribute(data.aSide1, 3)
  )
  geometry.setAttribute(
    'aSide2',
    new THREE.Float32BufferAttribute(data.aSide2, 3)
  )
  geometry.setAttribute(
    'aTube',
    new THREE.Float32BufferAttribute(data.aTube, 4)
  )
  geometry.setAttribute(
    'aMeta',
    new THREE.Float32BufferAttribute(data.aMeta, 2)
  )
  return geometry
}

const VERTEX = /* glsl */ `
${NEURON_GLSL}
uniform float uTime;
uniform float uSwirl;
uniform float uRoll;
uniform float uSize;
uniform float uLight;
uniform float uWake;
uniform float uOpacity;
uniform float uKick;
uniform vec3 uColLow;
uniform vec3 uColHigh;
uniform vec3 uCursor;
uniform float uActivity;
uniform float uRepelStrength;
attribute vec3 aSide1;
attribute vec3 aSide2;
attribute vec4 aTube;
attribute vec2 aMeta;
varying vec3 vColor;
varying float vAlpha;
${SNOISE}
${AXON_GLSL}
void main() {
  int c = int(aMeta.y);
  float part = aMeta.x;
  vec4 state = uState[c];
  vec4 look = uLook[c];
  float scale = look.x;
  float seed = look.w;
  float grow = state.x;
  float age = state.y;
  float imp = state.w;
  vec3 center = uCenter[c];
  float angle = aTube.x;
  float order = aTube.z;
  float along = aTube.w;
  vec3 base;
  vec3 side1 = aSide1;
  vec3 side2 = aSide2;
  float radius = aTube.y * scale;
  float glow = 0.0;
  float swell = 0.0;
  float shown;

  if (part < 1.5 || part > 2.5) {
    // рождение: тело стягивается из вихря, дендриты прорастают от тела
    shown = smoothstep(order * 0.6, order * 0.6 + 0.4, grow);
    float sprout = part > 0.5 && part < 1.5 ? shown : 1.0;
    base = center + position * scale * sprout;
    // вспышка: волна бежит от кончиков дендритов к телу, потом горит тело
    float front = 1.0 - age / 0.3;
    float wave = exp(-pow((order - front) * 6.0, 2.0)) * step(age, 0.45);
    float flare = smoothstep(0.22, 0.34, age) * exp(-max(age - 0.34, 0.0) * 1.6);
    glow = wave + flare * (1.0 - order) + look.z * (1.0 - order) * 0.8;
    swell = wave * 0.7 + flare * (1.0 - order) * 0.35;
  } else {
    // аксон: от бугорка тела к дендритам следующего нейрона
    vec3 a = center + vec3(0.0, 0.0, -1.85 * scale);
    vec3 b = uNext[c];
    base = axonPoint(a, b, order, seed);
    vec3 tangent = normalize(axonPoint(a, b, order + 0.01, seed) - base);
    side1 = normalize(cross(tangent, vec3(0.0, 1.0, 0.001)));
    side2 = cross(tangent, side1);
    // миелин: толстые муфты, между ними тонкие перехваты
    float node = abs(fract(order * 9.0) - 0.5) * 2.0;
    radius = scale * mix(0.09, 0.3, smoothstep(0.05, 0.4, node));
    // аксон дорастает до следующего нейрона последним
    float reach = clamp((grow - 0.6) / 0.4, 0.0, 1.0);
    shown = 1.0 - smoothstep(reach, reach + 0.04, order);
    // импульс: кольца раздуваются и загораются, на перехватах ярче
    float head = exp(-pow((order - imp) * 14.0, 2.0));
    float tail = step(order, imp) * exp(-(imp - order) * 6.0) * 0.5;
    float atNode = (1.0 - smoothstep(0.0, 0.3, node)) * exp(-abs(order - imp) * 9.0);
    glow = step(0.0, imp) * (head + tail + atNode * 0.6) * uWake;
    swell = step(0.0, imp) * head * 1.8 * uWake;
  }

  // приём тоннеля: шум рябит радиус, угол дрожит и закручивается
  vec2 around = vec2(cos(angle), sin(angle));
  float wn = snoise(vec3(around * 1.3 + vec2(along * 0.7, 0.0), uTime * 0.15 + seed)) * 2.0;
  wn += snoise(vec3(around * 2.6 + vec2(0.0, along * 1.4), uTime * 0.3 + seed)) * 0.8;
  float jitterAngle = snoise(vec3(around * 4.0, along * 3.0 + uTime * 0.1)) * 0.35;
  float ambientSwirl = snoise(vec3(around * 0.9 + vec2(along * 0.5), uTime * 0.2 + seed * 3.0)) * 3.0;
  angle += jitterAngle + ambientSwirl * uSwirl + uRoll * (part < 0.5 ? 1.0 : 0.35);
  // до рождения точки ходят по широкой спирали
  angle += (1.0 - shown) * 6.0;
  float r = radius * (1.0 - wn * 0.07) * (1.0 + swell) * (1.0 + uKick * 0.12 * (1.0 - order));
  r = mix(r * 3.0 + scale * 0.6, r, shown);
  vec3 dir = side1 * sin(angle) + side2 * cos(angle);
  vec3 world = base + dir * r;

  // курсор раздвигает кольца
  vec3 toP = world - uCursor;
  float fall = smoothstep(scale * 4.0, 0.0, length(toP));
  world += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * scale * uActivity;
  vec4 mv = viewMatrix * vec4(world, 1.0);

  // цвет эталона: индиго снизу слева, циан сверху справа
  float colMix = smoothstep(-1.2, 1.2, dir.y + dir.x * 0.5 + wn * 0.2);
  vColor = mix(uColLow, uColHigh, colMix) * uLight * (0.55 + 0.45 * look.y);
  // вспышка красит точки в цвет слоя, а не пересвечивает их в белое
  vColor = mix(vColor, uTint[c] * 0.9, min(glow, 1.0) * 0.85);
  vAlpha = shown * state.z * uOpacity;
  float size = uSize;
  if (part > 2.5) {
    // ореол ядра: крупная тусклая точка, светится при вспышке
    vAlpha = state.z * shown * (0.05 + 0.35 * min(glow, 1.0));
    vColor = mix(uColHigh, uTint[c], 0.6) * (0.3 + glow);
    size = 34.0;
  }
  gl_PointSize = max(1.0, size * scale / 0.22 * (10.0 / -mv.z));
  gl_Position = projectionMatrix * mv;
}`

export function createTunnel({ renderer, colors, reducedMotion, pointer }) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80)
  const pixel = renderer.getPixelRatio()
  const atmosphere = createAtmosphere(scene, REF, pixel)
  const chain = createChain({
    tints: colors.layers.map(colorToVec3),
    rest: hexToVec3(REF.atmo),
    reducedMotion
  })

  const uniforms = {
    ...neuronUniforms(),
    uTime: { value: 0 },
    uSwirl: { value: REF.swirl },
    uRoll: { value: 0 },
    uSize: { value: 1.25 },
    uLight: { value: 1 },
    uWake: { value: 0 },
    uOpacity: { value: REF.opacity * 0.6 },
    uKick: { value: 0 },
    uColLow: { value: hexToVec3(REF.low) },
    uColHigh: { value: hexToVec3(REF.high) },
    uCursor: { value: new THREE.Vector3(0, 0, 99) },
    uActivity: { value: 0 },
    uRepelStrength: { value: REF.pointerStrength }
  }
  const neurons = new THREE.Points(
    buildSkin(),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: POINT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  neurons.frustumCulled = false
  scene.add(neurons)

  const lowRef = hexToVec3(REF.low)
  const highRef = hexToVec3(REF.high)
  const grey = new THREE.Vector3(0.32, 0.34, 0.4)
  const axis = new THREE.Vector2()
  const ahead = new THREE.Vector2()
  const mouse = new THREE.Vector2()
  const rest = new THREE.Vector2()
  const focus = new THREE.Vector3()
  const gaze = new THREE.Vector3()
  const view = new THREE.Vector3()
  const hit = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()
  let time = 0
  let clock = 0
  let roll = 0
  let spread = 0
  let height = 1
  let started = false

  function update({ dt, target, look, spikes }) {
    const wake = look.wake
    const live = wake * (reducedMotion ? 0 : 1)
    time += dt
    clock += dt * live
    chain.update(dt, { target, look, spikes })
    writeNeurons(chain.neurons, uniforms)

    // свет: во сне слабый и медленно дышит, со звуком в полную силу
    const breath = 1 + (1 - wake) * 0.14 * Math.sin(time * 0.9)
    uniforms.uLight.value =
      REF.brightness * 2.2 * (0.5 + 0.5 * wake) * breath * look.dim
    uniforms.uWake.value = wake
    uniforms.uTime.value = clock
    // энергия части сета вместо скролла: вихрь сильнее, кольца крутятся быстрее
    uniforms.uSwirl.value = REF.swirl * (1 + look.energy * wake * 0.75)
    roll += dt * live * (REF.spin + look.energy * 0.05)
    uniforms.uRoll.value = roll
    uniforms.uKick.value = chain.state.kick * live
    uniforms.uColLow.value.copy(lowRef).lerp(grey, (1 - look.saturation) * 0.6)
    uniforms.uColHigh.value
      .copy(highRef)
      .lerp(grey, (1 - look.saturation) * 0.6)

    // камера чуть сбоку от пути, взгляд на импульс и дальше вдоль аксона
    const travel = chain.state.travel
    mouse.lerp(pointer.active ? pointer.ndc : rest, 0.06)
    bend(travel, axis)
    bend(travel + 4, ahead)
    const bank = (ahead.x - axis.x) * 0.3
    camera.up.set(Math.sin(bank), Math.cos(bank), 0)
    camera.position.set(
      axis.x + 0.95 + mouse.x * REF.parallax + Math.sin(clock * 0.31) * 0.05,
      axis.y + 0.55 + mouse.y * REF.parallax + Math.cos(clock * 0.23) * 0.04,
      0
    )
    focus.lerpVectors(chain.state.impulse, chain.state.target, 0.5)
    if (!started) gaze.copy(focus)
    started = true
    gaze.lerp(focus, 1 - Math.exp(-dt * 2.5))
    view.set(gaze.x + mouse.x * REF.steer, gaze.y + mouse.y * REF.steer, gaze.z)
    camera.lookAt(view)

    // при открытой панели картинка выше: цепь не уходит под капсулы
    spread += ((target.panelHidden ? 1 : 0) - spread) * (1 - Math.exp(-dt * 2))
    frame()

    // курсор: точка на луче на глубине импульса
    raycaster.setFromCamera(pointer.ndc, camera)
    const depth = Math.max(1, camera.position.distanceTo(chain.state.impulse))
    raycaster.ray.at(depth, hit)
    uniforms.uCursor.value.lerp(hit, 0.12)
    uniforms.uActivity.value = pointer.activity

    atmosphere.update({ clock, wake, breath, camera, flash: chain.state.flash })
  }

  function frame() {
    const shift = 0.2 * (1 - spread)
    camera.setViewOffset(
      1000,
      1000 * height,
      0,
      shift * 1000 * height,
      1000,
      1000 * height
    )
  }

  function resize(width, h) {
    camera.aspect = width / h
    height = h / width
    frame()
    atmosphere.resize(width, h)
  }

  return { scene, camera, update, resize, ownBackdrop: true }
}
