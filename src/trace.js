// Гипнограмма сета: лента над растром бита. Ступени частей во времени и
// растр слоёв под ними, как на записи сна. Каждые полсекунды игры точка.
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

  // След как запись сна: линия спускается ступенями от части 1 к части 4,
  // громкость даёт ей рябь, как у ЭЭГ. Под линией растр: точка на каждый
  // отсчёт, пока слой звучит, как растр спайков на записи нейронов.
  function draw(target, width, height, scale = window.devicePixelRatio || 1) {
    if (!width || !height) return
    target.width = Math.round(width * scale)
    target.height = Math.round(height * scale)
    const context = target.getContext('2d')
    context.scale(scale, scale)
    context.clearRect(0, 0, width, height)
    const rows = palette.layers.length
    const rasterHeight = Math.min(height * 0.34, rows * 6)
    const rowGap = rasterHeight / rows
    const rasterTop = height - rasterHeight
    const top = 4
    const stage = (rasterTop - 6 - top) / 3.4
    const levelOf = (part) => top + stage * (part + 0.2)
    const dx = width / Math.max(samples.length, MIN_POINTS)

    // уровни частей: пунктир; засечка каждую минуту
    context.strokeStyle = palette.hair
    context.globalAlpha = 0.35
    context.lineWidth = 1
    context.setLineDash([1, 5])
    for (let part = 0; part < 4; part++) {
      const y = Math.round(levelOf(part)) + 0.5
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }
    context.setLineDash([])
    for (let i = 120; i < samples.length; i += 120) {
      const x = Math.round(i * dx) + 0.5
      context.beginPath()
      context.moveTo(x, rasterTop - 4)
      context.lineTo(x, rasterTop)
      context.stroke()
    }
    context.globalAlpha = 1
    if (!samples.length) return

    // линия: ступени сглажены, рябь от громкости постоянна для каждого отсчёта
    let y = levelOf(samples[0].part)
    let x = 0
    context.beginPath()
    samples.forEach((sample, i) => {
      y += (levelOf(sample.part) - y) * 0.3
      const ripple =
        Math.sin(i * 2.7) * Math.sin(i * 0.61 + 1) * sample.level * stage * 0.45
      x = i * dx
      if (i === 0) context.moveTo(x, y + ripple)
      else context.lineTo(x, y + ripple)
    })
    context.strokeStyle = palette.ice
    context.lineWidth = 1.4
    context.lineJoin = 'round'
    context.shadowColor = palette.signal
    context.shadowBlur = 6
    context.stroke()

    // «сейчас»: светящаяся точка на конце линии
    context.fillStyle = palette.ice
    context.beginPath()
    context.arc(x, y, 2.6, 0, Math.PI * 2)
    context.fill()
    context.shadowBlur = 0

    samples.forEach((sample, i) => {
      sample.on.forEach((on, row) => {
        if (!on) return
        context.fillStyle = palette.layers[row]
        context.fillRect(
          i * dx,
          rasterTop + row * rowGap,
          Math.max(1, dx * 0.6),
          Math.max(1.5, rowGap * 0.55)
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
