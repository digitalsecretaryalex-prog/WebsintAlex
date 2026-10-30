// Слух фонов: что звучит прямо сейчас. Ноты слоёв приходят событиями
// (main.js → visuals.js → pulse), ручки слоя приходят каждый кадр
// (target.sound). Все фоны берут звук отсюда, поэтому отвечают на одни
// и те же ручки одинаково:
// тон (фильтр) слоя: сила вспышки; эхо: повторы ноты через пунктирную
// восьмую, обратная связь эха: сколько повторов; простор (реверб): длина
// свечения; панорама: сторона экрана; громкость и включённость слоя:
// яркость его нейронов (look.alive); Mute: слой молчит и в картинке.
import { pitchUnit } from '../views/chain.js'

export const LAYERS = 6
export const KICK = 0
export const PERC = 1
export const BASS = 2
export const PAD = 3
export const MELODY = 4
export const TEXTURE = 5

export function createHearing() {
  // Огибающая каждого слоя: нота копится в pending и перетекает в свет
  // за ~0.1 с, поэтому вспышка набирается плавно, а не щёлкает
  const glow = new Array(LAYERS).fill(0)
  const pending = new Array(LAYERS).fill(0)
  let notes = []
  let echoes = []
  let time = 0
  let sound = null
  let echoDelay = 0.54

  // gain < 1: это повтор эха, у него свои повторы не рождаются
  function pulse(layer, event = {}, gain = 1) {
    if (!sound || layer < 0 || sound.muted[layer]) return
    // закрытый фильтр даёт тусклую вспышку
    const tone = 0.45 + 0.75 * sound.filter[layer]
    const strength = (event.velocity ?? 0.8) * tone * gain
    notes.push({
      layer,
      strength,
      pitch: pitchUnit(event.note),
      duration: event.duration || 0.25,
      accent: !!event.accent,
      pan: sound.pan[layer],
      echo: gain < 1
    })
    pending[layer] += strength
    const wet = sound.echo[layer]
    if (gain === 1 && wet > 0.03) {
      let repeat = Math.min(0.9, wet * 1.8)
      for (let k = 1; k <= 3 && repeat > 0.08; k++) {
        echoes.push({ at: time + k * echoDelay, layer, event, gain: repeat })
        repeat *= sound.feedback[layer] + 0.25
      }
    }
  }

  // Раз в кадр: вернуть ноты, пришедшие с прошлого кадра, вместе с эхом
  function listen(dt, target) {
    time += dt
    sound = target.sound
    // эхо слоёв стоит на пунктирной восьмой: 0.75 доли
    echoDelay = (60 / target.bpm) * 0.75
    const due = echoes.filter((echo) => echo.at <= time)
    echoes = echoes.filter((echo) => echo.at > time)
    due.forEach(({ layer, event, gain }) => pulse(layer, event, gain))
    const rise = 1 - Math.exp(-dt * 10)
    for (let i = 0; i < LAYERS; i++) {
      const give = pending[i] * rise
      pending[i] -= give
      glow[i] = Math.min(1.5, glow[i] + give)
      const space = sound ? sound.space[i] : 0.3
      glow[i] *= Math.exp(-dt / (0.4 + space * 1.3))
    }
    const heard = notes
    notes = []
    return heard
  }

  // параметр слоя для шейдера, пока звук не загрузился: середина
  function knob(name, layer, fallback = 0.5) {
    return sound ? sound[name][layer] : fallback
  }

  return { glow, pulse, listen, knob }
}
