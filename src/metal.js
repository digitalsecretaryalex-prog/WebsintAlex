// Металл для главных кнопок (?ui=metal): перенос liquid-metal-button
// (21st.dev) с React на обычный JS. Шейдер из @paper-design/shaders
// (Apache-2.0). Слои те же: металлическое кольцо, внутри тёмная капсула,
// поверх значок; от точки клика расходится круг, кнопка чуть проседает.
// Изменено для проекта: металл стоит, без переливания (переливание
// отвлекало), радужный сдвиг слабее; металл надевается на уже существующие
// кнопки, их подписи, клавиши и обработчики не трогаются; видимый фокус.
// Без сети шейдер не загрузится, тогда кольцо рисует CSS.

// общие с src/liquid.js: один и тот же металл во всех видах пульта
export const METAL_UNIFORMS = {
  u_repetition: 4,
  u_softness: 0.5,
  u_shiftRed: 0.12,
  u_shiftBlue: 0.12,
  u_distortion: 0,
  u_contour: 0,
  u_angle: 45,
  u_scale: 8,
  u_shape: 1,
  u_offsetX: 0.1,
  u_offsetY: -0.1
}
// кадр шейдера, на котором металл застывает: блик сверху слева
export const METAL_FRAME = 2400

let library = null
function loadShaders() {
  if (!library) library = import('@paper-design/shaders')
  return library
}

export function addMetalSkin(button) {
  button.classList.add('isMetal')
  const rim = document.createElement('span')
  rim.className = 'MetalRim'
  rim.setAttribute('aria-hidden', 'true')
  const shader = document.createElement('span')
  shader.className = 'MetalShader'
  rim.appendChild(shader)
  const face = document.createElement('span')
  face.className = 'MetalFace'
  face.setAttribute('aria-hidden', 'true')
  const ripples = document.createElement('span')
  ripples.className = 'MetalRipples'
  ripples.setAttribute('aria-hidden', 'true')
  button.prepend(rim, face)
  button.append(ripples)

  // скорость 0: шейдер рисует один кадр и не двигается
  loadShaders()
    .then(({ ShaderMount, liquidMetalFragmentShader }) => {
      new ShaderMount(
        shader,
        liquidMetalFragmentShader,
        METAL_UNIFORMS,
        undefined,
        0,
        METAL_FRAME
      )
      button.classList.add('hasShader')
    })
    .catch((error) => console.warn('Металл без шейдера', error))

  button.addEventListener('pointerenter', () => button.classList.add('isHover'))
  button.addEventListener('pointerleave', () =>
    button.classList.remove('isHover', 'isPressed')
  )
  button.addEventListener('pointerdown', () =>
    button.classList.add('isPressed')
  )
  button.addEventListener('pointerup', () =>
    button.classList.remove('isPressed')
  )
  button.addEventListener('click', (event) => {
    // круг от точки клика; с клавиатуры из центра
    const rect = button.getBoundingClientRect()
    const fromPointer = event.detail > 0
    const ripple = document.createElement('span')
    ripple.className = 'MetalRipple'
    ripple.style.left = `${fromPointer ? event.clientX - rect.left : rect.width / 2}px`
    ripple.style.top = `${fromPointer ? event.clientY - rect.top : rect.height / 2}px`
    ripples.appendChild(ripple)
    setTimeout(() => ripple.remove(), 600)
  })
}
