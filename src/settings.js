// Данные инструмента: слои, части сета, мастер, клавиши.
// Гармония на 4 такта: Fmaj7, Em7, Dm7, Cmaj7.

// steps: 16 шагов такта, 1 = удар
export const kick = {
  id: 'kick',
  name: 'Бочка',
  synth: {
    pitchDecay: 0.06,
    octaves: 4,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.003, decay: 0.42, sustain: 0, release: 0.4 }
  },
  note: 'C1',
  velocity: 0.9,
  filter: { type: 'lowpass', frequency: 900, Q: 0.5 },
  feedbackDelay: { delayTime: 0.5, feedback: 0.2, wet: 0, maxDelay: 2 },
  reverb: { decay: 2.5, preDelay: 0.01, wet: 0.08 },
  channel: { volume: -4, pan: 0 },
  variations: [
    { steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0] },
    { steps: [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
    { steps: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] }
  ]
}

export const perc = {
  id: 'perc',
  name: 'Перкуссия',
  synth: {
    noise: { type: 'white' },
    envelope: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.03 }
  },
  tick: {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 }
  },
  tickNote: 'A5',
  velocity: 0.7,
  highpass: { type: 'highpass', frequency: 5000, Q: 0.5 },
  filter: { type: 'lowpass', frequency: 9000, Q: 0.5 },
  feedbackDelay: { delayTime: 0.5, feedback: 0.25, wet: 0.1, maxDelay: 2 },
  reverb: { decay: 2.5, preDelay: 0.01, wet: 0.2 },
  channel: { volume: -1, pan: 0.2 },
  variations: [
    {
      steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      ticks: [4, 12]
    },
    {
      steps: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
      ticks: [4, 12]
    },
    {
      steps: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      ticks: [12]
    }
  ]
}

export const bass = {
  id: 'bass',
  name: 'Бас',
  synth: {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.04, decay: 0.3, sustain: 0.7, release: 0.8 }
  },
  velocity: 0.9,
  filter: { type: 'lowpass', frequency: 500, Q: 0.5 },
  feedbackDelay: { delayTime: 0.5, feedback: 0.2, wet: 0, maxDelay: 2 },
  reverb: { decay: 3, preDelay: 0.02, wet: 0.1 },
  channel: { volume: -8, pan: 0 },
  loop: '4m',
  variations: [
    {
      part: [
        { time: '0:0:0', noteName: 'F2', duration: '1m' },
        { time: '1:0:0', noteName: 'E2', duration: '1m' },
        { time: '2:0:0', noteName: 'D2', duration: '1m' },
        { time: '3:0:0', noteName: 'C2', duration: '1m' }
      ]
    },
    {
      part: [
        { time: '0:0:0', noteName: 'F2', duration: '2n' },
        { time: '0:2:0', noteName: 'C3', duration: '2n' },
        { time: '1:0:0', noteName: 'E2', duration: '2n' },
        { time: '1:2:0', noteName: 'B2', duration: '2n' },
        { time: '2:0:0', noteName: 'D2', duration: '2n' },
        { time: '2:2:0', noteName: 'A2', duration: '2n' },
        { time: '3:0:0', noteName: 'C2', duration: '2n' },
        { time: '3:2:0', noteName: 'G2', duration: '2n' }
      ]
    },
    {
      part: [
        { time: '0:0:0', noteName: 'F2', duration: '4n.' },
        { time: '0:1:2', noteName: 'F2', duration: '8n' },
        { time: '0:2:2', noteName: 'C3', duration: '4n' },
        { time: '1:0:0', noteName: 'E2', duration: '4n.' },
        { time: '1:1:2', noteName: 'E2', duration: '8n' },
        { time: '1:2:2', noteName: 'B2', duration: '4n' },
        { time: '2:0:0', noteName: 'D2', duration: '4n.' },
        { time: '2:1:2', noteName: 'D2', duration: '8n' },
        { time: '2:2:2', noteName: 'A2', duration: '4n' },
        { time: '3:0:0', noteName: 'C2', duration: '4n.' },
        { time: '3:1:2', noteName: 'C2', duration: '8n' },
        { time: '3:2:2', noteName: 'G2', duration: '4n' }
      ]
    }
  ]
}

export const pad = {
  id: 'pad',
  name: 'Пэд',
  synth: {
    // три расстроенные пилы: движение как у ШИМ, но без алиасинга
    // (ШИМ в Tone строится WaveShaper-ом и давал хрип: −35 дБ вне гармоник)
    oscillator: { type: 'fatsawtooth', count: 3, spread: 16 },
    envelope: { attack: 1.2, decay: 1, sustain: 0.7, release: 3 }
  },
  maxPolyphony: 24,
  velocity: 0.5,
  filter: { type: 'lowpass', frequency: 1400, Q: 0.5 },
  feedbackDelay: { delayTime: 0.5, feedback: 0.3, wet: 0.1, maxDelay: 2 },
  reverb: { decay: 6, preDelay: 0.05, wet: 0.45 },
  // три пилы тише одной ШИМ на ~11 дБ, уровень поднят обратно
  channel: { volume: -6, pan: -0.15 },
  loop: '4m',
  variations: [
    {
      part: [
        { time: '0:0:0', noteName: ['F3', 'A3', 'C4', 'E4'], duration: '1m' },
        { time: '1:0:0', noteName: ['E3', 'G3', 'B3', 'D4'], duration: '1m' },
        { time: '2:0:0', noteName: ['D3', 'F3', 'A3', 'C4'], duration: '1m' },
        { time: '3:0:0', noteName: ['C3', 'E3', 'G3', 'B3'], duration: '1m' }
      ]
    },
    {
      part: [
        { time: '0:0:0', noteName: ['F3', 'C4', 'E4', 'A4'], duration: '1m' },
        { time: '1:0:0', noteName: ['E3', 'B3', 'D4', 'G4'], duration: '1m' },
        { time: '2:0:0', noteName: ['D3', 'A3', 'C4', 'F4'], duration: '1m' },
        { time: '3:0:0', noteName: ['C3', 'G3', 'B3', 'E4'], duration: '1m' }
      ]
    },
    {
      part: [
        { time: '0:0:0', noteName: ['F3', 'A3', 'C4', 'E4'], duration: '2m' },
        { time: '2:0:0', noteName: ['D3', 'F3', 'A3', 'C4'], duration: '2m' }
      ]
    }
  ]
}

export const melody = {
  id: 'melody',
  name: 'Мелодия',
  synth: {
    oscillator: { type: 'custom', partials: [1, 0.4, 0.12, 0.06, 0.02] },
    envelope: { attack: 0.005, decay: 1.4, sustain: 0.12, release: 1.4 }
  },
  maxPolyphony: 16,
  velocity: 0.6,
  filter: { type: 'lowpass', frequency: 2600, Q: 0.5 },
  feedbackDelay: { delayTime: 0.5, feedback: 0.35, wet: 0.25, maxDelay: 2 },
  reverb: { decay: 4, preDelay: 0.03, wet: 0.35 },
  channel: { volume: -6, pan: 0.15 },
  loop: '4m',
  variations: [
    {
      part: [
        { time: '0:0:2', noteName: 'A4', duration: '8n' },
        { time: '0:1:0', noteName: 'C5', duration: '4n' },
        { time: '0:2:2', noteName: 'E5', duration: '8n' },
        { time: '0:3:0', noteName: 'D5', duration: '4n' },
        { time: '1:0:2', noteName: 'G4', duration: '8n' },
        { time: '1:1:0', noteName: 'B4', duration: '4n' },
        { time: '1:3:0', noteName: 'D5', duration: '4n' },
        { time: '2:0:2', noteName: 'F4', duration: '8n' },
        { time: '2:1:0', noteName: 'A4', duration: '4n' },
        { time: '2:2:2', noteName: 'C5', duration: '8n' },
        { time: '3:0:0', noteName: 'E4', duration: '2n' },
        { time: '3:2:2', noteName: 'G4', duration: '4n' }
      ]
    },
    {
      part: [
        { time: '0:0:0', noteName: 'E5', duration: '2n' },
        { time: '1:0:0', noteName: 'D5', duration: '2n' },
        { time: '2:0:0', noteName: 'C5', duration: '2n' },
        { time: '3:0:0', noteName: 'B4', duration: '2n' }
      ]
    },
    {
      part: [
        { time: '0:0:0', noteName: 'A4', duration: '1m' },
        { time: '2:0:0', noteName: 'F4', duration: '1m' },
        { time: '3:2:0', noteName: 'E4', duration: '2n' }
      ]
    }
  ]
}

// crackle: вероятность щелчка «винила» на каждой шестнадцатой
export const texture = {
  id: 'texture',
  name: 'Фон',
  noise: { type: 'pink', volume: -6 },
  // громкость щелчка от и до: тихо, чтобы треск не читался как сбой звука
  crackleVelocity: [0.18, 0.34],
  crackle: {
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.01 }
  },
  fadeTime: 2,
  filter: { type: 'lowpass', frequency: 6000, Q: 0.5 },
  feedbackDelay: { delayTime: 0.5, feedback: 0.2, wet: 0, maxDelay: 2 },
  reverb: { decay: 3, preDelay: 0.02, wet: 0.3 },
  channel: { volume: -2, pan: 0 },
  variations: [
    { bandpass: { frequency: 2500, Q: 0.4 }, crackle: 0 },
    { bandpass: { frequency: 1200, Q: 0.8 }, crackle: 0.2 },
    { bandpass: { frequency: 500, Q: 1.2 }, crackle: 0.04 }
  ]
}

export const layers = [kick, perc, bass, pad, melody, texture]

// variation: 0-2
// breathBars: длина вдоха и выдоха в тактах для варианта «Дыхание»:
// 84 уд/мин и 2 такта = 5.7 с (10 вдохов в минуту), 70 и 3 такта = 10.3 с (6)
export const parts = [
  {
    name: 'Вход',
    bpm: 84,
    breathBars: 2,
    level: 0,
    djFilter: 0,
    layers: {
      kick: { on: true, variation: 0 },
      perc: { on: true, variation: 0 },
      bass: { on: true, variation: 0 },
      pad: { on: true, variation: 0 },
      melody: { on: false, variation: 0 },
      texture: { on: true, variation: 0 }
    }
  },
  {
    name: 'Сеть',
    bpm: 79,
    breathBars: 2,
    level: -1,
    djFilter: 0,
    layers: {
      kick: { on: true, variation: 1 },
      perc: { on: true, variation: 1 },
      bass: { on: true, variation: 1 },
      pad: { on: true, variation: 0 },
      melody: { on: true, variation: 0 },
      texture: { on: true, variation: 0 }
    }
  },
  {
    name: 'Глубина',
    bpm: 74,
    breathBars: 3,
    level: -2,
    djFilter: -0.25,
    layers: {
      kick: { on: false, variation: 1 },
      perc: { on: true, variation: 2 },
      bass: { on: true, variation: 2 },
      pad: { on: true, variation: 1 },
      melody: { on: true, variation: 1 },
      texture: { on: true, variation: 1 }
    }
  },
  {
    name: 'Ровно',
    bpm: 70,
    breathBars: 3,
    level: -3,
    djFilter: -0.45,
    layers: {
      kick: { on: true, variation: 2 },
      perc: { on: false, variation: 2 },
      bass: { on: true, variation: 0 },
      pad: { on: true, variation: 2 },
      melody: { on: true, variation: 2 },
      texture: { on: true, variation: 2 }
    }
  }
]

export const tempoRamp = '8m'

// Партитура сета «Спуск» для автопилота: такт и действие.
// Смена ставится за такт до нужного, звук квантует её на начало такта.
export const score = [
  { bar: 0, part: 0 }, // 84 уд/мин, день ещё звучит
  { bar: 8, variation: ['perc', 1] }, // перкуссия гуще: мысли бегут
  { bar: 16, part: 1 }, // 79, входит мелодия
  { bar: 24, variation: ['kick', 0] }, // бочка проще, напряжение спадает
  { bar: 32, part: 2 }, // 74, без бочки, фильтр прикрыт
  { bar: 40, variation: ['bass', 0] }, // бас ровнее
  { bar: 48, part: 3 }, // 70, редкие удары, тише
  { bar: 56, off: 'melody' }, // мелодия уходит
  { bar: 60, off: 'bass' }, // остаются пэд, фон и редкая бочка
  { bar: 64, stop: true }
]

export const master = {
  lowpass: { type: 'lowpass', frequency: 20000, Q: 0.7, rolloff: -24 },
  highpass: { type: 'highpass', frequency: 20, Q: 0.7, rolloff: -24 },
  // диапазон ручки: lowpass до 300 Гц, highpass до 1500 Гц
  djFilterRange: { lowpassMin: 300, highpassMax: 1500 },
  feedbackDelay: { delayTime: 0.5, feedback: 0.4, wet: 0, maxDelay: 2 },
  channel: { volume: 0 },
  limiter: { threshold: -1 }
}

export const layerKnobs = [
  {
    param: 'filter',
    label: 'тон',
    icon: 'tone',
    min: 200,
    max: 12000,
    scale: 'log'
  },
  { param: 'echo', label: 'эхо', icon: 'echo', min: 0, max: 0.6 },
  { param: 'space', label: 'простор', icon: 'space', min: 0, max: 0.8 }
]

export const volumeRange = { min: -40, max: 0, step: 1 }
export const tempoRange = { min: 60, max: 90 }

// event.code не зависит от раскладки
export const keys = {
  start: 'Space',
  layers: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'],
  variations: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'],
  parts: ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
  reset: 'Digit0',
  panel: 'KeyH'
}
