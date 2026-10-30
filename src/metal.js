// Жидкий металл для кнопок: перенос liquid-metal-button (21st.dev) с React
// на обычный JS. Шейдер берётся из @paper-design/shaders (Apache-2.0),
// параметры и поведение из компонента: металл течёт медленно, под курсором
// быстрее, на нажатие ускоряется на 300 мс, от точки клика расходится круг,
// кнопка чуть проседает. Слои те же: металлическое кольцо, внутри тёмная
// капсула с градиентом, поверх значок или подпись.
// Изменено для проекта: металл надевается на уже существующие кнопки
// (их подписи, клавиши и обработчики не трогаются); подпись светлее, чем
// #666 в исходнике, чтобы контраст был не ниже 4.5:1; видимый фокус.
// Без сети шейдер не загрузится, тогда кольцо рисует CSS.

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
const SPEED = { idle: 0.6, hover: 1, press: 2.4 }

let library = null
function loadShaders() {
  if (!library) library = import('@paper-design/shaders')
  return library
}

// Надеть металл на кнопку. Возвращает dispose.
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

  let mount = null
  let hovered = false
  let disposed = false
  // снять металл: обработчики уходят вместе с ним
  const listening = new AbortController()
  const on = (type, callback) =>
    button.addEventListener(type, callback, { signal: listening.signal })
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
  const speed = (name) => (reduceMotion ? 0 : SPEED[name])

  loadShaders()
    .then(({ ShaderMount, liquidMetalFragmentShader }) => {
      if (disposed) return
      mount = new ShaderMount(
        shader,
        liquidMetalFragmentShader,
        UNIFORMS,
        undefined,
        speed('idle')
      )
      button.classList.add('hasShader')
    })
    .catch((error) => console.warn('Металл без шейдера', error))

  on('pointerenter', () => {
    hovered = true
    button.classList.add('isHover')
    mount?.setSpeed(speed('hover'))
  })
  on('pointerleave', () => {
    hovered = false
    button.classList.remove('isHover', 'isPressed')
    mount?.setSpeed(speed('idle'))
  })
  on('pointerdown', () => button.classList.add('isPressed'))
  on('pointerup', () => button.classList.remove('isPressed'))
  on('click', (event) => {
    mount?.setSpeed(speed('press'))
    setTimeout(() => mount?.setSpeed(speed(hovered ? 'hover' : 'idle')), 300)
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

  return () => {
    disposed = true
    listening.abort()
    mount?.dispose()
    mount = null
    rim.remove()
    face.remove()
    ripples.remove()
    button.classList.remove('isMetal', 'hasShader', 'isHover', 'isPressed')
  }
}

// Отдельная металлическая кнопка с подписью, как в исходнике (142 × 46)
export function createMetalButton(label, onClick) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'MetalButton'
  const text = document.createElement('span')
  text.className = 'MetalLabel'
  text.textContent = label
  button.appendChild(text)
  button.addEventListener('click', onClick)
  const dispose = addMetalSkin(button)
  return { element: button, dispose }
}
