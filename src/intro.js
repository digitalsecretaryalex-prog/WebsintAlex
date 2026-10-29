// Заставка: стеклянная плитка со знаком, название и вход.
// Стекло и металл: перенос компонентов в src/glass.js и src/metal.js.
// Звук заставка не запускает: нейроны за ней спят до кнопки «Старт».
import { createGlassReveal } from './glass.js'
import { createMetalButton } from './metal.js'

// Знак-заглушка: нейрон линиями, в духе значков инструмента.
// Это не логотип проекта: свой знак подставляется сюда же.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
<circle cx="44" cy="60" r="12"/>
<path d="M34 52 22 40m0 0-9 1m9-1-1-9"/>
<path d="M35 69 24 83m0 0-9 0m9 0 1 9"/>
<path d="M48 48l4-15m0 0-7-7m7 7 8-6"/>
<path d="M47 72l3 14m0 0-6 6m6-6 7 4"/>
<path d="M56 60h7m6 0h7m6 0h7"/>
<path d="M95 60l9-7m-9 7 9 7m-9-7h11"/>
</svg>`

// Цвета по скриншоту-референсу: тёмно-синий фон, светлая плитка, синий знак
const GLASS = {
  look: 'dark',
  background: '#0b1533',
  plateColor: '#e8edf7',
  logoColor: '#2f5fe0',
  keepPlate: true,
  logoScale: 0.6,
  finalScale: 0.92
}

export function showIntro() {
  const instrument = document.querySelector('.Instrument')
  instrument.inert = true
  document.body.classList.add('isIntro')

  const intro = document.createElement('section')
  intro.className = 'Intro'
  intro.setAttribute('role', 'dialog')
  intro.setAttribute('aria-modal', 'true')
  intro.setAttribute('aria-labelledby', 'IntroTitle')
  const body = document.createElement('div')
  body.className = 'IntroBody'
  const mark = document.createElement('div')
  mark.className = 'IntroMark'
  mark.setAttribute('role', 'img')
  mark.setAttribute('aria-label', 'Знак: нейрон')
  const text = document.createElement('div')
  text.className = 'IntroText'
  const title = document.createElement('h2')
  title.className = 'IntroTitle'
  title.id = 'IntroTitle'
  title.textContent = 'Нейросинт'
  const lead = document.createElement('p')
  lead.className = 'IntroLead'
  lead.textContent = 'Синтезатор для спокойного сета'
  text.append(title, lead)
  body.append(mark, text)
  intro.appendChild(body)
  document.body.appendChild(intro)

  const glass = createGlassReveal(mark, MARK, GLASS)
  // как в исходнике: клик по плитке повторяет появление
  mark.addEventListener('click', () => glass.replay())
  const enter = createMetalButton('Войти', close)
  text.appendChild(enter.element)
  enter.element.focus()

  function onKey(event) {
    if (event.code === 'Escape') close()
  }
  window.addEventListener('keydown', onKey)

  let isClosing = false
  function close() {
    if (isClosing) return
    isClosing = true
    window.removeEventListener('keydown', onKey)
    intro.classList.add('isLeaving')
    instrument.inert = false
    document.body.classList.remove('isIntro')
    document.querySelector('.PlayButton')?.focus()
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    // после ухода освобождаем WebGL стекла и металла
    setTimeout(
      () => {
        glass.dispose()
        enter.dispose()
        intro.remove()
      },
      reduced ? 0 : 700
    )
  }
}
