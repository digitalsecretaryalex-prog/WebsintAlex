// Жидкий металл на десятках элементов одним WebGL-контекстом.
// Шейдер liquid metal из @paper-design/shaders с параметрами кнопки
// liquid-metal-button рисуется в две плитки на скрытом холсте: круг (ручки,
// круглые кнопки) и капсулу (кнопки-капсулы). Каждый элемент копирует свою
// плитку в маленький холст под собой, повернув её на свой угол, чтобы
// металл не повторялся одинаково. Браузер держит около 16 контекстов,
// поэтому по контексту на кнопку не выйдет.
// Металл течёт медленно, пока звук не играет, и быстрее со звуком.

const UNIFORMS = {
  u_repetition: 4,
  u_softness: 0.5,
  u_shiftRed: 0.3,
  u_shiftBlue: 0.3,
  u_distortion: 0,
  u_contour: 0,
  u_angle: 45,
  u_scale: 8,
  u_shape: 1,
  u_offsetX: 0.1,
  u_offsetY: -0.1
}
// плитки: x, y, ширина, высота в пикселях скрытого холста
const TILES = {
  round: [0, 0, 192, 192],
  pill: [0, 192, 288, 96]
}
// металл течёт медленно, 24 кадров хватает
const FPS = 24

let field = null

async function start() {
  const [{ liquidMetalFragmentShader }, { vertexShaderSource }] =
    await Promise.all([
      import('@paper-design/shaders'),
      import('@paper-design/shaders/vertex-shader.js')
    ])
  const canvas = document.createElement('canvas')
  canvas.width = 288
  canvas.height = 288
  const gl = canvas.getContext('webgl2', {
    premultipliedAlpha: true,
    preserveDrawingBuffer: true
  })
  if (!gl) throw new Error('WebGL2 недоступен')
  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader))
    return shader
  }
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShaderSource))
  gl.attachShader(
    program,
    compile(gl.FRAGMENT_SHADER, liquidMetalFragmentShader)
  )
  gl.linkProgram(program)
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  )
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const at = (name) => gl.getUniformLocation(program, name)
  Object.entries(UNIFORMS).forEach(([name, value]) =>
    gl.uniform1f(at(name), value)
  )
  gl.uniform1f(at('u_pixelRatio'), 1)
  gl.enable(gl.SCISSOR_TEST)
  return { canvas, gl, time: at('u_time'), resolution: at('u_resolution') }
}

// Один кадр: обе плитки, потом копии во все элементы
function draw(now) {
  requestAnimationFrame(draw)
  // без металла на странице шейдер не считается
  if (!field.skins.length) return
  if (document.hidden || now - field.last < 1000 / FPS) return
  const dt = Math.min(0.1, (now - field.last) / 1000)
  field.last = now
  field.clock += dt * field.speed
  const { gl } = field.engine
  gl.uniform1f(field.engine.time, field.clock)
  gl.clearColor(0, 0, 0, 0)
  Object.values(TILES).forEach(([x, y, w, h]) => {
    // у WebGL y снизу
    const glY = field.engine.canvas.height - y - h
    gl.viewport(x, glY, w, h)
    gl.scissor(x, glY, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(field.engine.resolution, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  })
  field.skins.forEach((skin) => {
    const { canvas, context, shape, turn } = skin
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.round(width * scale)
    const pixelHeight = Math.round(height * scale)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
    const [x, y, w, h] = TILES[shape]
    context.clearRect(0, 0, pixelWidth, pixelHeight)
    context.save()
    context.translate(pixelWidth / 2, pixelHeight / 2)
    // круг можно повернуть, капсулу только отразить
    if (shape === 'round') context.rotate(turn)
    else if (turn > Math.PI) context.scale(-1, 1)
    context.drawImage(
      field.engine.canvas,
      x,
      y,
      w,
      h,
      -pixelWidth / 2,
      -pixelHeight / 2,
      pixelWidth,
      pixelHeight
    )
    context.restore()
  })
}

// Надеть металл на элемент: холст первым ребёнком, форма круг или капсула
export function addLiquidSkin(element, shape = 'round') {
  const canvas = document.createElement('canvas')
  canvas.className = 'LiquidSkin'
  canvas.setAttribute('aria-hidden', 'true')
  element.prepend(canvas)
  element.classList.add('hasLiquid')
  const skin = {
    canvas,
    context: canvas.getContext('2d'),
    shape,
    turn: Math.random() * Math.PI * 2
  }
  if (!field) {
    field = { skins: [], speed: 0.6, clock: 0, last: 0, engine: null }
    start()
      .then((engine) => {
        field.engine = engine
        requestAnimationFrame(draw)
      })
      .catch((error) => {
        // без сети или WebGL2 кольцо рисует CSS
        console.warn('Жидкий металл без шейдера', error)
        document.body.classList.add('isLiquidFallback')
      })
  }
  field.skins.push(skin)
  return () => {
    canvas.remove()
    element.classList.remove('hasLiquid')
    field.skins = field.skins.filter((other) => other !== skin)
  }
}

// со звуком металл течёт быстрее, как у кнопки под курсором
export function setLiquidSpeed(speed) {
  if (field) field.speed = speed
}
