// Гипнограмма сета: ступеньки частей во времени и полосы слоёв под ними,
// как на записи сна. Каждые полсекунды игры добавляется точка.
// toBlob() рисует ту же картинку крупно, с названием и длиной сета, в PNG.

const SAMPLE = 0.5 // секунд между точками
const MIN_POINTS = 120 // первая минута рисуется в масштабе, потом сжимается

export function createTrace(palette) {
  const element = document.createElement('figure')
  element.className = 'Trace'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', 'Гипнограмма сета: пока пусто')
  element.appendChild(canvas)
  const samples = []
  let wait = 0

  // sample: { part: 0-3, level: 0-1, on: [6 x boolean] }
  function add(dt, sample) {
    wait -= dt
    if (wait > 0) return
    wait = SAMPLE
    samples.push(sample)
    const minutes = Math.floor((samples.length * SAMPLE) / 60)
    const seconds = Math.round((samples.length * SAMPLE) % 60)
    canvas.setAttribute(
      'aria-label',
      `Гипнограмма сета: ${minutes} мин ${seconds} с, сейчас часть ${sample.part + 1}`
    )
    draw(canvas, canvas.clientWidth, canvas.clientHeight)
  }

  // часть 1 сверху, часть 4 внизу: чем глубже, тем ниже, как стадии сна
  function draw(target, width, height, scale = window.devicePixelRatio || 1) {
    if (!width || !height) return
    target.width = Math.round(width * scale)
    target.height = Math.round(height * scale)
    const context = target.getContext('2d')
    context.scale(scale, scale)
    context.clearRect(0, 0, width, height)
    const rows = palette.layers.length
    const laneHeight = Math.max(3, height * 0.045)
    const lanesTop = height - rows * (laneHeight + 2)
    const stepTop = 6
    const stepHeight = (lanesTop - 14 - stepTop) / 3
    const dx = width / Math.max(samples.length, MIN_POINTS)

    context.strokeStyle = palette.hair
    context.lineWidth = 1
    for (let part = 0; part < 4; part++) {
      const y = stepTop + part * stepHeight + 0.5
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.globalAlpha = 0.25
      context.stroke()
    }
    context.globalAlpha = 1

    // громкость: полупрозрачная заливка под ступеньками
    context.fillStyle = palette.signal
    samples.forEach((sample, i) => {
      const y = stepTop + sample.part * stepHeight
      const h = (lanesTop - 14 - y) * sample.level
      context.globalAlpha = 0.18
      context.fillRect(i * dx, lanesTop - 14 - h, dx + 0.5, h)
    })
    context.globalAlpha = 1

    context.strokeStyle = palette.ice
    context.lineWidth = 2
    context.lineJoin = 'round'
    context.beginPath()
    samples.forEach((sample, i) => {
      const y = stepTop + sample.part * stepHeight
      if (i === 0) context.moveTo(0, y)
      else context.lineTo(i * dx, y)
      context.lineTo((i + 1) * dx, y)
    })
    context.stroke()

    samples.forEach((sample, i) => {
      sample.on.forEach((on, row) => {
        if (!on) return
        context.fillStyle = palette.layers[row]
        context.fillRect(
          i * dx,
          lanesTop + row * (laneHeight + 2),
          dx + 0.5,
          laneHeight
        )
      })
    })
  }

  function redraw() {
    draw(canvas, canvas.clientWidth, canvas.clientHeight)
  }

  // крупная картинка для сохранения: фон, подпись, сама гипнограмма
  function toBlob() {
    const width = 1600
    const height = 640
    const picture = document.createElement('canvas')
    picture.width = width
    picture.height = height
    const context = picture.getContext('2d')
    context.fillStyle = palette.screen
    context.fillRect(0, 0, width, height)
    const plot = document.createElement('canvas')
    draw(plot, width - 160, height - 220, 1)
    context.drawImage(plot, 80, 160)
    const font = getComputedStyle(document.body).fontFamily
    const total = samples.length * SAMPLE
    const length = `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}`
    context.fillStyle = palette.text
    context.font = `600 44px ${font}`
    context.fillText('Нейросинт', 80, 96)
    context.fillStyle = palette.textDim
    context.font = `28px ${font}`
    context.fillText(
      `гипнограмма сета · ${new Date().toLocaleDateString('ru-RU')} · ${length}`,
      80,
      138
    )
    return new Promise((resolve) => picture.toBlob(resolve, 'image/png'))
  }

  return { element, add, redraw, toBlob, count: () => samples.length }
}
