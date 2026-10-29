// Нейроны в стиле сцены Flow Wave. Из эталона взяты приём и цвет:
// ровная сетка точек, которая читается как пунктирные линии; по ней
// катятся холмы шума в две октавы; цвет от почти чёрного изумрудного
// к мятному на гребнях; зелёные всполохи в углах, пылинки у объектива;
// камера ныряет сверху к самой поверхности.
// Из приёма собран нейрон. Тело: мембрана-сфера из пунктирных параллелей,
// по ней от дендритов к аксону катятся холмы. Дендриты и аксон: ленты из той
// же сетки. Импульс: большой вал, который катится по ленте аксона и оставляет
// за собой рябь. Нейрон рождается из плоского листа точек: лист сворачивается
// в шар, ленты отрастают от тела.
// Во сне камера висит высоко над цепью. Со звуком ныряет вниз и скользит
// низко за импульсом. После стопа медленно поднимается обратно.
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

// Значения эталона Flow Wave
const REF = {
  bg: '#02160c',
  flameA: '#0aff7f',
  flameB: '#aef0c0',
  flameAmt: 0.2,
  atmo: '#7affbf',
  atmoCount: 300,
  atmoSize: 24,
  atmoSpeed: 1,
  low: '#02160c',
  high: '#34e89a',
  opacity: 0.26,
  brightness: 0.45,
  waveHeight: 3,
  flow: 1,
  scrollRise: 1,
  pointerStrength: 0.9
}

const LAT = 26
const LON = 56
const AXON_ROWS = 130

// Кожа: сетка точек. position: направление на сфере (тело) или точка
// скелета (лента); aSide1: поперёк ленты, aSide2: нормаль ленты;
// aTube: для тела широта и долгота 0..1, для ленты место поперёк -1..1 и
// ширина; дальше порядок от тела и длина вдоль; aMeta: часть и номер нейрона.
function buildMembrane() {
  const data = { position: [], aSide1: [], aSide2: [], aTube: [], aMeta: [] }
  function push(cell, part, point, side1, side2, tube) {
    data.position.push(point.x, point.y, point.z)
    data.aSide1.push(side1.x, side1.y, side1.z)
    data.aSide2.push(side2.x, side2.y, side2.z)
    data.aTube.push(...tube)
    data.aMeta.push(part, cell)
  }
  const point = new THREE.Vector3()
  const none = new THREE.Vector3()
  const turn = new THREE.Quaternion()
  for (let cell = 0; cell < NEURONS; cell++) {
    const dense = cell < CHAIN ? 1 : 0.6
    // тело: параллели от задней точки (+z) к передней, где выходит аксон
    const lat = Math.round(LAT * dense)
    const lon = Math.round(LON * dense)
    for (let i = 1; i < lat; i++) {
      const theta = (i / lat) * Math.PI
      for (let j = 0; j < lon; j++) {
        const phi = (j / lon) * Math.PI * 2
        point.set(
          Math.sin(theta) * Math.cos(phi),
          Math.sin(theta) * Math.sin(phi),
          Math.cos(theta)
        )
        push(cell, 0, point, none, none, [i / lat, j / lon, 0, 0])
      }
    }
    // дендриты: ленты, которые медленно перекручиваются вдоль ветки
    const cols = cell < CHAIN ? 5 : 3
    growSkeleton(cell % 3 === 1).forEach((branch) => {
      let side = null
      branch.points.forEach((at, k) => {
        const [side1, side2] = crossFrame(branch.tangents[k], side)
        side = side1
        turn.setFromAxisAngle(branch.tangents[k], k * 0.16)
        const across = side1.clone().applyQuaternion(turn)
        const normal = side2.clone().applyQuaternion(turn)
        for (let c = 0; c < cols; c++) {
          const w = (c / (cols - 1)) * 2 - 1
          push(cell, 1, at, across, normal, [
            w,
            branch.widths[k],
            branch.orders[k],
            k * 0.12
          ])
        }
      })
    })
    // аксон: лента, форму считает шейдер
    const axonCols = cell < CHAIN ? 7 : 4
    const rows = Math.round(AXON_ROWS * (cell < CHAIN ? 1 : 0.6))
    for (let i = 0; i < rows; i++) {
      for (let c = 0; c < axonCols; c++) {
        const w = (c / (axonCols - 1)) * 2 - 1
        push(cell, 2, none, none, none, [w, 0, i / (rows - 1), i * 0.1])
      }
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
uniform float uStream;
uniform float uWave;
uniform float uSize;
uniform float uLight;
uniform float uWake;
// 0 при prefers-reduced-motion: свет меняется, форма не дышит
uniform float uMotion;
uniform float uOpacity;
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
// холмы эталона: две октавы шума, катятся вдоль второй координаты
float hills(vec3 p, float flow) {
  float wn = snoise(vec3(p.x, p.y + flow, p.z + uTime * 0.15)) * 2.0;
  wn += snoise(vec3(p.x * 2.0, (p.y + flow) * 2.0, p.z + uTime * 0.3)) * 0.8;
  return wn;
}
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
  float order = aTube.z;
  vec3 world;
  float wn;
  float glow = 0.0;
  float shown;
  // вспышка: волна от кончиков к телу, потом горит тело
  float front = 1.0 - age / 0.3;
  float flare = smoothstep(0.22, 0.34, age) * exp(-max(age - 0.34, 0.0) * 1.6);

  if (part < 0.5) {
    // мембрана тела; холмы катятся от задней точки к аксону
    vec3 dir = position;
    wn = hills(dir * 1.5 + vec3(seed), -uStream * 0.35);
    // круг от входа дендритов по мембране, как кольца от курсора в эталоне
    float fromBack = acos(clamp(dir.z, -1.0, 1.0));
    float ripple = exp(-pow((fromBack - (age - 0.18) * 9.0) / 0.3, 2.0)) * step(0.18, age) * exp(-age * 1.2);
    float r = 1.0 + wn * 0.05 * uWave + (ripple * 0.16 + flare * 0.1 + look.z * 0.06) * uMotion;
    // рождение: лист точек под телом сворачивается в шар
    shown = smoothstep(0.0, 0.5, grow);
    float spread = aTube.x * 3.14159 * 0.9;
    float phi = aTube.y * 6.28318;
    vec3 sheet = vec3(cos(phi) * spread, -1.4 + wn * 0.08, sin(phi) * spread);
    world = center + mix(sheet, dir * r, shown) * scale;
    glow = ripple + flare * 0.9 + look.z * 0.6;
  } else if (part < 1.5) {
    // лента дендрита: холмы бегут к телу, поперёк лента волнистая
    float w = aTube.x;
    shown = smoothstep(order * 0.6 + 0.2, order * 0.6 + 0.45, grow);
    float along = aTube.w;
    wn = hills(vec3(w * 0.6 + seed, along * 0.9, seed), uStream * 0.3);
    float wave = exp(-pow((order - front) * 6.0, 2.0)) * step(age, 0.45);
    float width = aTube.y * 1.8 * scale;
    float lift = (wn * 0.05 + wave * 0.5 * uMotion) * scale * shown;
    vec3 base = center + position * scale * shown;
    world = base + aSide1 * w * width + aSide2 * lift;
    glow = wave + flare * (1.0 - order) * 0.6 + look.z * (1.0 - order) * 0.5;
  } else {
    // лента аксона: от бугорка к дендритам следующего нейрона
    float w = aTube.x;
    float t = order;
    vec3 a = center + vec3(0.0, 0.0, -1.1 * scale);
    vec3 b = uNext[c];
    vec3 base = axonPoint(a, b, t, seed);
    vec3 tangent = normalize(axonPoint(a, b, t + 0.01, seed) - base);
    vec3 across = normalize(cross(tangent, vec3(0.0, 1.0, 0.001)));
    vec3 normal = cross(tangent, across);
    // лента медленно перекручивается
    float twist = t * 5.0 + uTime * 0.2 + seed;
    vec3 side = across * cos(twist) + normal * sin(twist);
    normal = cross(tangent, side);
    float reach = clamp((grow - 0.55) / 0.45, 0.0, 1.0);
    shown = 1.0 - smoothstep(reach, reach + 0.04, t);
    wn = hills(vec3(w * 0.6 + seed, t * 9.0, seed), -uStream * 0.3);
    // импульс: вал катится по ленте, за ним рябь
    float behind = imp - t;
    float swell = exp(-pow(behind * 12.0, 2.0));
    float wake = step(0.0, behind) * sin(behind * 70.0) * exp(-behind * 7.0) * 0.35;
    float carry = step(0.0, imp) * uWake;
    float lift = (wn * 0.04 + (swell * 1.1 + wake) * carry) * scale;
    world = base + side * w * scale * 0.32 * (1.0 + swell * carry * 0.8) + normal * lift;
    glow = (swell + abs(wake) * 0.8) * carry;
  }

  // курсор раздвигает мембрану
  vec3 toP = world - uCursor;
  float fall = smoothstep(scale * 5.0, 0.0, length(toP));
  world += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * scale * uActivity;
  vec4 mv = viewMatrix * vec4(world, 1.0);

  // цвет эталона: тёмный в ложбинах, мятный на гребнях
  float colMix = smoothstep(-2.6, 2.6, wn * 1.3 + glow * 2.0);
  vColor = mix(uColLow, uColHigh, colMix) * uLight * (0.5 + 0.5 * look.y);
  // вспышка красит точки в цвет слоя, а не пересвечивает их в белое
  vColor = mix(vColor, uTint[c] * 0.9, min(glow, 1.0) * 0.85);
  vAlpha = shown * state.z * uOpacity * (0.4 + 0.6 * shown);
  gl_PointSize = max(1.0, uSize * scale / 0.22 * (10.0 / -mv.z));
  gl_Position = projectionMatrix * mv;
}`

export function createWave({ renderer, colors, reducedMotion, pointer }) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 120)
  const pixel = renderer.getPixelRatio()
  const atmosphere = createAtmosphere(scene, REF, pixel)
  const chain = createChain({
    tints: colors.layers.map(colorToVec3),
    rest: hexToVec3(REF.high),
    reducedMotion
  })

  const uniforms = {
    ...neuronUniforms(),
    uTime: { value: 0 },
    uStream: { value: 0 },
    uWave: { value: REF.waveHeight / 3 },
    uSize: { value: 1.15 },
    uLight: { value: 1 },
    uWake: { value: 0 },
    uMotion: { value: reducedMotion ? 0 : 1 },
    // точек меньше, чем в листе эталона, поэтому каждая плотнее
    uOpacity: { value: REF.opacity * 2.2 },
    uColLow: { value: hexToVec3(REF.low) },
    uColHigh: { value: hexToVec3(REF.high) },
    uCursor: { value: new THREE.Vector3(0, 0, 99) },
    uActivity: { value: 0 },
    uRepelStrength: { value: REF.pointerStrength }
  }
  const neurons = new THREE.Points(
    buildMembrane(),
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
  const grey = new THREE.Vector3(0.3, 0.34, 0.32)
  const axis = new THREE.Vector2()
  const ahead = new THREE.Vector2()
  const mouse = new THREE.Vector2()
  const rest = new THREE.Vector2()
  const high = new THREE.Vector3()
  const low = new THREE.Vector3()
  const focus = new THREE.Vector3()
  const overview = new THREE.Vector3()
  const gaze = new THREE.Vector3()
  const hit = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()
  let time = 0
  let clock = 0
  let stream = 0
  let dive = 0
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

    // холмы текут в темп; волна выше с громкостью и по мере погружения
    stream += dt * REF.flow * 2 * (target.bpm / 84) * live
    uniforms.uStream.value = stream
    uniforms.uTime.value = clock
    uniforms.uWave.value =
      (1 + dive * REF.scrollRise) * (0.6 + 0.5 * look.energy)
    const breath = 1 + (1 - wake) * 0.14 * Math.sin(time * 0.9)
    uniforms.uLight.value =
      REF.brightness * 2 * (0.5 + 0.5 * wake) * breath * look.dim
    uniforms.uWake.value = wake
    uniforms.uColLow.value.copy(lowRef).lerp(grey, (1 - look.saturation) * 0.5)
    uniforms.uColHigh.value
      .copy(highRef)
      .lerp(grey, (1 - look.saturation) * 0.5)

    // нырок эталона: сверху вниз за первые 35 % пути, только ведёт его звук
    const toward = reducedMotion ? 0 : wake
    dive +=
      (toward - dive) * (1 - Math.exp(-dt * (toward > dive ? 0.35 : 0.25)))
    const ea = Math.min(dive / 0.35, 1)
    const e = ea * ea * (3 - 2 * ea)

    const travel = chain.state.travel
    mouse.lerp(pointer.active ? pointer.ndc : rest, 0.06)
    bend(travel, axis)
    bend(travel + 7, ahead)
    // сверху: высоко за цепью, взгляд вниз вдоль неё
    high.set(axis.x + mouse.x * 0.6, 4.2 + mouse.y * 0.3, 4)
    overview.set(ahead.x, ahead.y, -7)
    // снизу: у самой ленты аксона, взгляд на импульс и следующий нейрон
    low.set(axis.x + 0.5 + mouse.x * 0.25, axis.y + 0.3 + mouse.y * 0.1, 0)
    focus.lerpVectors(chain.state.impulse, chain.state.target, 0.35)
    camera.position.lerpVectors(high, low, e)
    focus.lerpVectors(overview, focus, e)
    if (!started) gaze.copy(focus)
    started = true
    gaze.lerp(focus, 1 - Math.exp(-dt * 2.5))
    camera.up.set(0, 1, 0)
    camera.lookAt(gaze.x + mouse.x * 0.3, gaze.y, gaze.z)

    spread += ((target.panelHidden ? 1 : 0) - spread) * (1 - Math.exp(-dt * 2))
    frame()

    raycaster.setFromCamera(pointer.ndc, camera)
    raycaster.ray.at(
      Math.max(1, camera.position.distanceTo(chain.state.impulse)),
      hit
    )
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
