// Облака-нейроны из частиц: плотная оболочка и нити-дендриты.
// Четыре бесконечных движения: полёт, лента, поле, каскад.
// Нота слоя зажигает нейрон этого слоя, по нитям бежит импульс наружу.
import * as THREE from 'three'

const NEURONS = 14
const SHELL = 4200
const FIBRES = 7
const FIBRE_POINTS = 150
const REFRACTORY = 0.25
// сколько облаков в кадре у каждого режима: меньше, но крупнее
const ACTIVE = { flight: 12, stream: 8, field: 7, cascade: 9 }

// Мягкая круглая точка для Points
const DOT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, soft * vAlpha);
}
`

const VERTEX = /* glsl */ `
uniform vec3 uCenter[${NEURONS}];
uniform float uRadius[${NEURONS}];
uniform float uFlash[${NEURONS}];
uniform float uFireAge[${NEURONS}];
uniform vec3 uFlashColor[${NEURONS}];
uniform float uAlive[${NEURONS}];
uniform float uFade[${NEURONS}];
uniform float uTime;
uniform float uBreath;
uniform float uSwirl;
uniform float uSize;
uniform float uSpeed;
uniform float uDensity;
uniform float uSaturation;
uniform float uDim;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uRim;
uniform vec3 uCursor;
uniform float uActivity;
attribute float aNeuron;
attribute float aFibre;
attribute float aT;
attribute float aMix;
attribute float aNoise;
attribute float aScale;
attribute float aRank;
varying vec3 vColor;
varying float vAlpha;
void main() {
  int n = int(aNeuron);
  vec3 p = position;
  if (aFibre < 0.5) {
    // оболочка дышит и медленно закручивается
    float t = uTime * uBreath + aNoise * 6.2831 + aNeuron * 1.7;
    p *= 1.0 + sin(t) * 0.06 * (0.4 + aMix);
    float angle = uTime * uSwirl + aNoise * 6.2831;
    p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
  } else {
    // нити колышутся, кончики сильнее
    p += vec3(
      sin(uTime * 0.8 + aNoise * 6.28),
      cos(uTime * 0.6 + aNoise * 4.0),
      sin(uTime * 0.7 + aNoise * 2.0)
    ) * 0.06 * aT;
  }
  vec3 world = uCenter[n] + p * uRadius[n];
  vec3 toPoint = world - uCursor;
  float fall = smoothstep(0.6, 0.0, length(toPoint));
  world += normalize(toPoint + vec3(0.0001)) * fall * 0.35 * uActivity;
  vec4 view = viewMatrix * vec4(world, 1.0);

  vec3 base;
  if (aFibre < 0.5) {
    base = mix(uCore, uMid, smoothstep(0.25, 0.85, aMix));
    base = mix(base, uRim, clamp((aMix - 0.7) * 3.0, 0.0, 1.0));
  } else {
    base = mix(uRim, uMid, aT) * (1.0 - aT * 0.5);
  }
  vec3 tint = mix(vec3(1.0), uFlashColor[n], 0.4 + 0.6 * uSaturation);
  float pulse = 0.0;
  if (aFibre > 0.5) {
    float d = aT - uFireAge[n] * uSpeed;
    pulse = exp(-d * d / 0.004) * exp(-uFireAge[n] * 1.2);
  }
  float flash = uFlash[n] * (aFibre < 0.5 ? aMix : 0.3);
  vColor = base * (0.9 + uAlive[n] * 0.5) * uDim + tint * (flash * 0.9 + pulse * 1.6);
  vAlpha = (aRank < uDensity ? 0.8 : 0.0) * uFade[n];

  gl_PointSize = max(1.0, uSize * aScale / -view.z);
  gl_Position = projectionMatrix * view;
}
`

function buildGeometry() {
  const count = NEURONS * (SHELL + FIBRES * FIBRE_POINTS)
  const positions = new Float32Array(count * 3)
  const attributes = {
    aNeuron: new Float32Array(count),
    aFibre: new Float32Array(count),
    aT: new Float32Array(count),
    aMix: new Float32Array(count),
    aNoise: new Float32Array(count),
    aScale: new Float32Array(count),
    aRank: new Float32Array(count)
  }
  let i = 0
  function push(neuron, x, y, z, fields) {
    positions.set([x, y, z], i * 3)
    attributes.aNeuron[i] = neuron
    attributes.aNoise[i] = Math.random()
    attributes.aRank[i] = Math.random()
    Object.entries(fields).forEach(
      ([key, value]) => (attributes[key][i] = value)
    )
    i++
  }
  for (let neuron = 0; neuron < NEURONS; neuron++) {
    // оболочка: точка на сфере (Марсалья), радиус смещён к поверхности
    for (let k = 0; k < SHELL; k++) {
      let u, v, s
      do {
        u = Math.random() * 2 - 1
        v = Math.random() * 2 - 1
        s = u * u + v * v
      } while (s >= 1 || s === 0)
      const factor = 2 * Math.sqrt(1 - s)
      const shell = Math.pow(Math.random(), 0.28)
      const r = 0.5 + shell * 0.5
      push(neuron, u * factor * r, v * factor * r, (1 - 2 * s) * r, {
        aMix: shell,
        aScale: 0.45 + Math.random() * 0.8
      })
    }
    // нити-дендриты: выходят из оболочки и изгибаются
    for (let f = 0; f < FIBRES; f++) {
      const direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize()
      const bend = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      )
        .cross(direction)
        .normalize()
      const length = 1.2 + Math.random()
      for (let k = 0; k < FIBRE_POINTS; k++) {
        const t = k / FIBRE_POINTS
        const point = direction
          .clone()
          .multiplyScalar(1 + t * length)
          .addScaledVector(bend, Math.sin(t * Math.PI) * 0.35 * length)
        const jitter = 0.03 * (1 - t * 0.5)
        push(
          neuron,
          point.x + (Math.random() - 0.5) * jitter,
          point.y + (Math.random() - 0.5) * jitter,
          point.z + (Math.random() - 0.5) * jitter,
          { aFibre: 1, aT: t, aMix: 1, aScale: 0.5 + (1 - t) * 0.7 }
        )
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  Object.entries(attributes).forEach(([key, array]) =>
    geometry.setAttribute(key, new THREE.BufferAttribute(array, 1))
  )
  return geometry
}

export function createSwarm(
  { renderer, colors, reducedMotion, pointer },
  mode
) {
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60)
  camera.position.set(0, 0, 3)

  const toVector = (color) => new THREE.Vector3(color.r, color.g, color.b)
  const neurons = Array.from({ length: NEURONS }, (_, index) => ({
    position: new THREE.Vector3(),
    home: new THREE.Vector3(),
    radius: 0.5,
    layer: index % 6,
    fired: -Infinity,
    seed: Math.random() * 100
  }))

  const uniforms = {
    uCenter: { value: neurons.map((neuron) => neuron.position) },
    uRadius: { value: new Array(NEURONS).fill(0.5) },
    uFlash: { value: new Array(NEURONS).fill(0) },
    uFireAge: { value: new Array(NEURONS).fill(99) },
    uFlashColor: { value: neurons.map(() => new THREE.Vector3(1, 1, 1)) },
    uAlive: { value: new Array(NEURONS).fill(0) },
    uFade: { value: new Array(NEURONS).fill(1) },
    uTime: { value: 0 },
    uBreath: { value: 1.4 },
    uSwirl: { value: 0.05 },
    uSize: { value: 24 * renderer.getPixelRatio() },
    uSpeed: { value: 0.8 },
    uDensity: { value: 1 },
    uSaturation: { value: 1 },
    uDim: { value: 1 },
    uCore: { value: toVector(colors.quiet).multiplyScalar(0.6) },
    uMid: { value: toVector(colors.signal) },
    uRim: { value: toVector(colors.ice) },
    uCursor: { value: new THREE.Vector3(0, 0, 99) },
    uActivity: { value: 0 }
  }
  const points = new THREE.Points(
    buildGeometry(),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  points.frustumCulled = false
  scene.add(points)

  // Каскад: искры летят от сработавшего нейрона к соседу
  const SPARKS = 64
  const sparkPositions = new Float32Array(SPARKS * 3).fill(99)
  const sparkColors = new Float32Array(SPARKS * 3)
  const sparkGeometry = new THREE.BufferGeometry()
  sparkGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(sparkPositions, 3)
  )
  sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3))
  const sparkMaterial = new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const sparkPoints = new THREE.Points(sparkGeometry, sparkMaterial)
  sparkPoints.frustumCulled = false
  scene.add(sparkPoints)
  const sparks = []
  const queue = []

  // половина видимой ширины и высоты на расстоянии depth от камеры
  function viewHalf(depth) {
    const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth
    return [h * camera.aspect, h]
  }

  // Свободная зона экрана: над растром и под транспортом, центр чуть выше середины
  function place(neuron, index) {
    neuron.active = index < ACTIVE[mode]
    if (!neuron.active) {
      neuron.position.set(0, 0, 99)
      return
    }
    const count = ACTIVE[mode]
    if (mode === 'flight') {
      neuron.position.set(
        (Math.random() * 2 - 1) * 1.8,
        0.35 + (Math.random() * 2 - 1) * 0.9,
        -15 + (index / count) * 16
      )
      neuron.radius = 0.5 + Math.random() * 0.3
    } else if (mode === 'stream') {
      const depth = 2.5 + ((index * 0.53) % 1) * 4
      const [w, h] = viewHalf(depth + 3)
      neuron.position.set(
        -w - 0.8 + (index / count) * (2 * w + 1.6),
        h * (0.15 + ((index * 0.71) % 1) * 0.45),
        -depth
      )
      neuron.radius = 0.45 + ((index * 0.37) % 1) * 0.3
    } else {
      // поле и каскад: два ряда со сдвигом, без наложений
      const perRow = Math.ceil(count / 2)
      const row = index < perRow ? 0 : 1
      const column = row === 0 ? index : index - perRow
      const depth = 4.2 + ((index * 0.37) % 1) * 0.8
      const [w, h] = viewHalf(depth + 3)
      const step = (2 * w) / perRow
      neuron.home.set(
        -w + (column + 0.5 + row * 0.5) * step,
        row === 0 ? h * 0.42 : h * 0.0,
        -depth
      )
      neuron.position.copy(neuron.home)
      neuron.radius = Math.min(0.75, step * 0.26)
    }
  }

  function layout() {
    neurons.forEach(place)
  }

  // Нейрон вспыхивает, если не в рефрактерном периоде
  function fire(neuron, color, now, generation = 0) {
    if (now - neuron.fired < REFRACTORY) return false
    neuron.fired = now
    neuron.color = color
    if (mode === 'cascade' && generation < 4) {
      // соседи по полю срабатывают с задержкой: лавина
      const nearest = neurons
        .filter((other) => other.active && other !== neuron)
        .sort(
          (a, b) =>
            a.position.distanceTo(neuron.position) -
            b.position.distanceTo(neuron.position)
        )
        .slice(0, 3)
      nearest.forEach((other) => {
        if (Math.random() > Math.pow(0.72, generation + 1)) return
        const delay = 0.22 + Math.random() * 0.18
        queue.push({
          neuron: other,
          color,
          at: now + delay,
          generation: generation + 1
        })
        if (sparks.length < SPARKS) {
          sparks.push({
            from: neuron.position.clone(),
            to: other,
            born: now,
            delay,
            color
          })
        }
      })
    }
    return true
  }

  const handled = new Set()
  let time = 0
  const lookAt = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane()
  const normal = new THREE.Vector3()
  const hit = new THREE.Vector3()

  function update({ dt, look, speed, spikes }) {
    const motion = reducedMotion ? 0.15 : 1
    time += dt
    const drift = dt * speed * (0.45 + look.energy * 0.7) * motion

    // ноты слоёв: каждый спайк зажигает нейрон своего слоя
    spikes.spikes.forEach((spike) => {
      if (handled.has(spike.born)) return
      handled.add(spike.born)
      const candidates = neurons.filter(
        (neuron) => neuron.active && neuron.layer === spike.layer
      )
      if (!candidates.length) return
      const target = candidates[Math.floor(Math.random() * candidates.length)]
      fire(target, colors.layers[spike.layer], time)
    })
    handled.forEach((born) => {
      if (!spikes.spikes.some((spike) => spike.born === born))
        handled.delete(born)
    })
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].at <= time) {
        const item = queue.splice(i, 1)[0]
        fire(item.neuron, item.color, time, item.generation)
      }
    }

    neurons.forEach((neuron, index) => {
      if (!neuron.active) {
        uniforms.uFade.value[index] = 0
        return
      }
      if (mode === 'flight') {
        neuron.position.z += drift * 1.4
        if (neuron.position.z > 0.8) {
          neuron.position.set(
            (Math.random() * 2 - 1) * 1.8,
            0.35 + (Math.random() * 2 - 1) * 0.9,
            -13
          )
        }
      } else if (mode === 'stream') {
        const depth = -neuron.position.z
        const [w] = viewHalf(depth + 3)
        neuron.position.x += ((drift * 0.9) / depth) * 3
        if (neuron.position.x > w + 1.2) neuron.position.x = -w - 1.2
      } else {
        // поле живёт на месте, каскад медленно плывёт по кругу
        const [w] = viewHalf(-neuron.home.z + 3)
        if (mode === 'cascade') {
          neuron.home.x += drift * 0.12
          if (neuron.home.x > w + 0.8) neuron.home.x = -w - 0.8
        }
        neuron.position.set(
          neuron.home.x + Math.sin(time * 0.2 + neuron.seed) * 0.12 * motion,
          neuron.home.y + Math.cos(time * 0.17 + neuron.seed) * 0.1 * motion,
          neuron.home.z
        )
      }
      // мягкое появление издалека и исчезновение у камеры
      const distance = camera.position.z - neuron.position.z
      uniforms.uFade.value[index] =
        mode === 'flight'
          ? THREE.MathUtils.smoothstep(distance, 2.4, 4.4) *
            (1 - THREE.MathUtils.smoothstep(distance, 11, 17))
          : 1
      const age = time - neuron.fired
      uniforms.uFireAge.value[index] = age
      uniforms.uFlash.value[index] = Math.exp(-age * 3)
      uniforms.uRadius.value[index] = neuron.radius
      uniforms.uAlive.value[index] = look.alive[neuron.layer]
      if (neuron.color) {
        uniforms.uFlashColor.value[index].set(
          neuron.color.r,
          neuron.color.g,
          neuron.color.b
        )
      }
    })

    // искры каскада
    sparkPositions.fill(99)
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i]
      const t = (time - spark.born) / spark.delay
      if (t >= 1) {
        sparks.splice(i, 1)
        continue
      }
      const at = spark.from.clone().lerp(spark.to.position, t)
      sparkPositions.set([at.x, at.y, at.z], i * 3)
      sparkColors.set([spark.color.r, spark.color.g, spark.color.b], i * 3)
    }
    sparkGeometry.attributes.position.needsUpdate = true
    sparkGeometry.attributes.color.needsUpdate = true

    uniforms.uTime.value = time * motion
    uniforms.uBreath.value = 1.4 * speed
    uniforms.uSwirl.value = 0.04 + look.energy * 0.08
    uniforms.uSpeed.value = speed * 0.9
    uniforms.uDensity.value = look.density
    uniforms.uSaturation.value = look.saturation
    uniforms.uDim.value = look.dim

    // курсор: лёгкий параллакс камеры и пустота в облаках
    camera.position.x += (pointer.ndc.x * 0.25 - camera.position.x) * 0.04
    camera.position.y += (pointer.ndc.y * 0.15 - camera.position.y) * 0.04
    lookAt.set(camera.position.x * 0.3, camera.position.y * 0.3, -4)
    camera.lookAt(lookAt)
    camera.getWorldDirection(normal)
    plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0, -2))
    raycaster.setFromCamera(pointer.ndc, camera)
    if (raycaster.ray.intersectPlane(plane, hit))
      uniforms.uCursor.value.lerp(hit, 0.12)
    uniforms.uActivity.value = pointer.activity
  }

  function resize(width, height) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    layout()
  }

  return { scene, camera, update, resize }
}

export const createFlight = (context) => createSwarm(context, 'flight')
export const createStream = (context) => createSwarm(context, 'stream')
export const createField = (context) => createSwarm(context, 'field')
export const createCascade = (context) => createSwarm(context, 'cascade')
