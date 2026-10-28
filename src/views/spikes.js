// Модель активности нейронов: спайк вспыхивает, бежит волной и гаснет.
// После спайка популяция слоя молчит REFRACTORY секунд.
import * as THREE from 'three'

export const MAX_SPIKES = 16
const REFRACTORY = 0.14

export function createSpikes(layerCount) {
  const spikes = []
  const lastSpike = [0, 1].map(() => new Array(layerCount).fill(-Infinity))
  const nextSide = new Array(layerCount).fill(0)
  let time = 0

  // side: 0 левое полушарие, 1 правое; ноты слоя чередуют полушария
  function fire(layer, strength = 1) {
    const side = nextSide[layer]
    if (time - lastSpike[side][layer] < REFRACTORY) return false
    nextSide[layer] = 1 - side
    lastSpike[side][layer] = time
    spikes.push({ layer, side, born: time, strength })
    if (spikes.length > MAX_SPIKES) spikes.shift()
    return true
  }

  // Фоновая активность: редкие слабые спайки даже в тишине
  function update(dt, rate, decay) {
    time += dt
    if (Math.random() < rate * dt) {
      fire(Math.floor(Math.random() * layerCount), 0.35)
    }
    while (spikes.length && time - spikes[0].born > decay * 5) spikes.shift()
  }

  return { fire, update, spikes, now: () => time }
}

// Общие uniforms и GLSL для всех режимов: свет от спайков в точке p
export function createSpikeUniforms() {
  return {
    uSpikeOrigin: {
      value: Array.from({ length: MAX_SPIKES }, () => new THREE.Vector3())
    },
    uSpikeColor: {
      value: Array.from({ length: MAX_SPIKES }, () => new THREE.Vector3())
    },
    uSpikeAge: { value: new Array(MAX_SPIKES).fill(-1) },
    uSpikeStrength: { value: new Array(MAX_SPIKES).fill(0) },
    uSpeed: { value: 1 },
    uDecay: { value: 0.8 },
    uWidth: { value: 0.12 }
  }
}

// origin(layer, side) возвращает центр популяции в координатах режима
export function writeSpikeUniforms(uniforms, model, origin, colors) {
  const now = model.now()
  for (let i = 0; i < MAX_SPIKES; i++) {
    const spike = model.spikes[i]
    if (!spike) {
      uniforms.uSpikeAge.value[i] = -1
      continue
    }
    uniforms.uSpikeOrigin.value[i].copy(origin(spike.layer, spike.side))
    const color = colors[spike.layer]
    uniforms.uSpikeColor.value[i].set(color.r, color.g, color.b)
    uniforms.uSpikeAge.value[i] = now - spike.born
    uniforms.uSpikeStrength.value[i] = spike.strength
  }
}

export const SPIKE_GLSL = /* glsl */ `
uniform vec3 uSpikeOrigin[${MAX_SPIKES}];
uniform vec3 uSpikeColor[${MAX_SPIKES}];
uniform float uSpikeAge[${MAX_SPIKES}];
uniform float uSpikeStrength[${MAX_SPIKES}];
uniform float uSpeed;
uniform float uDecay;
uniform float uWidth;

vec3 spikeLight(vec3 p) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${MAX_SPIKES}; i++) {
    float age = uSpikeAge[i];
    if (age < 0.0) continue;
    float d = distance(p, uSpikeOrigin[i]);
    float front = (d - age * uSpeed) / uWidth;
    float flash = exp(-d * d / (uWidth * uWidth)) * exp(-age * 10.0);
    float wave = exp(-front * front);
    sum += uSpikeColor[i] * uSpikeStrength[i] * (wave + flash) * exp(-age / uDecay);
  }
  return sum;
}
`
