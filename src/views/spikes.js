// Модель активности нейронов: спайк вспыхивает, бежит волной и гаснет.
// После спайка популяция слоя молчит REFRACTORY секунд.
const MAX_SPIKES = 16
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
