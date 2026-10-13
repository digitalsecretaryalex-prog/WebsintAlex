// Значки интерфейса: текста на инструменте нет, вместо подписей значки.
// Внутренности SVG 24x24, рисуются линией currentColor

export const icons = {
  // слои
  kick: '<circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/>',
  perc: '<circle cx="5" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  bass: '<path d="M2 12c3-8 7-8 10 0s7 8 10 0"/>',
  pad: '<path d="M3 9h18M3 15h18"/>',
  melody: '<path d="M3 17l5-6 5 3 8-9"/>',
  texture:
    '<g fill="currentColor" stroke="none"><circle cx="6" cy="7" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="10" cy="13" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="18" r="1.6"/><circle cx="14" cy="19" r="1.6"/></g>',

  // ручки
  tone: '<path d="M3 8h9c4 0 5 9 9 9"/>',
  echo: '<circle cx="6" cy="12" r="3"/><circle cx="13.5" cy="12" r="2.2" opacity="0.8"/><circle cx="19.5" cy="12" r="1.6" opacity="0.6"/>',
  space:
    '<path d="M8 8a6 6 0 0 0 0 8M5 5a10 10 0 0 0 0 14"/><circle cx="14" cy="12" r="2.4"/>',
  djFilter: '<path d="M2 7h6c3 0 3 10 6 10M22 7h-2c-3 0-3 10-6 10"/>',
  tempo: '<path d="M9 3h6l3 18H6z"/><path d="M12 15l5-9"/>',
  volume:
    '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19.5 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',

  // транспорт
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
  reset: '<path d="M5 12a7 7 0 1 0 2.2-5.1"/><path d="M5 4v4h4"/>'
}

export function createIcon(name) {
  const element = document.createElement('span')
  element.className = 'Icon'
  element.setAttribute('aria-hidden', 'true')
  element.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`
  return element
}

// Значок части сета: волна, чем дальше часть, тем реже и спокойнее
export function createWaveIcon(cycles, height) {
  let path = ''
  for (let x = 0; x <= 60; x += 2) {
    const y = 12 + Math.sin((x / 60) * Math.PI * 2 * cycles) * height
    path += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`
  }
  const element = document.createElement('span')
  element.className = 'Icon isWide'
  element.setAttribute('aria-hidden', 'true')
  element.innerHTML = `<svg viewBox="0 0 60 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="${path}"/></svg>`
  return element
}

// Точки вариации: одна, две, три (A, B, C) без букв
export function createDotsIcon(count) {
  const element = document.createElement('span')
  element.className = 'Dots'
  element.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < count; i++) {
    element.appendChild(document.createElement('span'))
  }
  return element
}
