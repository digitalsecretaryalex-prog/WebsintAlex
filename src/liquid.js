// Металл на десятках элементов одним WebGL-контекстом (?ui=glass и
// ?ui=liquid). Шейдер liquid metal из @paper-design/shaders с теми же
// параметрами, что у кнопок src/metal.js, рисуется в две плитки на скрытом
// холсте: круг (ручки, круглые кнопки) и капсулу (кнопки-капсулы). Каждый
// элемент копирует свою плитку в маленький холст под собой, повернув её
// на свой угол, чтобы металл не повторялся одинаково. Браузер держит около
// 16 контекстов, поэтому по контексту на кнопку не выйдет.
// Металл стоит: копии рисуются, когда элемент появился или поменял
// размер (ResizeObserver), а не каждый кадр.
import { METAL_UNIFORMS, METAL_FRAME } from './metal.js'

// плитки: x, y, ширина, высота в пикселях скрытого холста
const TILES = {
  round: [0, 0, 192, 192],
  pill: [0, 192, 288, 96]
}

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
  Object.entries(METAL_UNIFORMS).forEach(([name, value]) =>
    gl.uniform1f(at(name), value)
  )
  gl.uniform1f(at('u_pixelRatio'), 1)
  gl.uniform1f(at('u_time'), METAL_FRAME / 1000)
  gl.enable(gl.SCISSOR_TEST)
  gl.clearColor(0, 0, 0, 0)
  // обе плитки один раз: металл не меняется
  Object.values(TILES).forEach(([x, y, w, h]) => {
    // у WebGL y снизу
    const glY = canvas.height - y - h
    gl.viewport(x, glY, w, h)
    gl.scissor(x, glY, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(at('u_resolution'), w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  })
  return canvas
}

// копии плиток во все элементы; размер холста по размеру элемента
function draw() {
  field.queued = false
  field.skins.forEach(({ canvas, context, shape, turn }) => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const [x, y, w, h] = TILES[shape]
    context.save()
    context.translate(canvas.width / 2, canvas.height / 2)
    // круг можно повернуть, капсулу только отразить
    if (shape === 'round') context.rotate(turn)
    else if (turn > Math.PI) context.scale(-1, 1)
    context.drawImage(
      field.tiles,
      x,
      y,
      w,
      h,
      -canvas.width / 2,
      -canvas.height / 2,
      canvas.width,
      canvas.height
    )
    context.restore()
  })
}

function redraw() {
  if (!field.tiles || field.queued) return
  field.queued = true
  requestAnimationFrame(draw)
}

// Надеть металл на элемент: холст первым ребёнком, форма круг или капсула
export function addLiquidSkin(element, shape = 'round') {
  const canvas = document.createElement('canvas')
  canvas.className = 'LiquidSkin'
  canvas.setAttribute('aria-hidden', 'true')
  element.prepend(canvas)
  element.classList.add('hasLiquid')
  if (!field) {
    field = {
      skins: [],
      tiles: null,
      queued: false,
      // спрятанный элемент (скрытая панель) получит металл, когда покажется
      sizes: new ResizeObserver(() => redraw())
    }
    start()
      .then((tiles) => {
        field.tiles = tiles
        redraw()
      })
      .catch((error) => {
        // без сети или WebGL2 кольцо рисует CSS
        console.warn('Жидкий металл без шейдера', error)
        document.body.classList.add('isLiquidFallback')
      })
  }
  field.skins.push({
    canvas,
    context: canvas.getContext('2d'),
    shape,
    turn: Math.random() * Math.PI * 2
  })
  field.sizes.observe(canvas)
}
