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
  reset: '<path d="M5 12a7 7 0 1 0 2.2-5.1"/><path d="M5 4v4h4"/>',

  // режимы визуализации
  network:
    '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="17" r="2"/><path d="M8 7.5l8-1M7 9l4 6.5M17 8l-4 7.5"/>',
  flow: '<path d="M2 9c3-3 5-3 8 0s5 3 8 0 3-2 4-1M2 16c3-3 5-3 8 0s5 3 8 0 3-2 4-1"/>',
  storm:
    '<g fill="currentColor" stroke="none"><circle cx="12" cy="12" r="2.4"/><circle cx="7" cy="9" r="1.3"/><circle cx="17" cy="9.5" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="16" cy="16" r="1.3"/><circle cx="12" cy="5" r="1"/><circle cx="4.5" cy="14" r="1"/><circle cx="19.5" cy="14" r="1"/></g>',
  ink: '<path d="M4 15c2-9 14-11 16-4s-10 9-12 3 6-9 9-6"/>',

  // раскладки
  layoutBold:
    '<circle cx="12" cy="8" r="4.5"/><rect x="3" y="15" width="4" height="6" rx="2"/><rect x="10" y="15" width="4" height="6" rx="2"/><rect x="17" y="15" width="4" height="6" rx="2"/>',
  panelA:
    '<rect x="2" y="6" width="3" height="14" rx="1.5"/><rect x="7" y="6" width="9" height="14" rx="3"/><rect x="18" y="6" width="3" height="14" rx="1.5"/>',
  panelB:
    '<rect x="2" y="5" width="3" height="15" rx="1.5"/><rect x="7" y="5" width="3" height="15" rx="1.5"/><rect x="12" y="5" width="10" height="15" rx="3"/>',
  panelC:
    '<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="5" y="13" width="3" height="8" rx="1.5"/><rect x="10.5" y="13" width="3" height="8" rx="1.5"/><rect x="16" y="13" width="3" height="8" rx="1.5"/>',
  more: '<path d="M6 15l6-6 6 6"/>',
  variants:
    '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><circle cx="16.75" cy="16.75" r="3.25"/>',
  multipolar:
    '<circle cx="12" cy="12" r="3"/><path d="M12 9V3M14.6 10.5l5-3M14.6 13.5l5 3M12 15v6M9.4 13.5l-5 3M9.4 10.5l-5-3M12 3l-2-1.5M12 3l2-1.5"/>',
  pyramidal:
    '<path d="M12 8l-3 6h6z"/><path d="M12 8V2M12 4l-3-2M12 4l3-2M12 6l-3.5-1M9 14l-4 4M15 14l4 4M12 14v8"/>',
  purkinje:
    '<circle cx="12" cy="19" r="2.2"/><path d="M12 17v-4M12 13l-5-4M12 13l5-4M7 9l-3-5M7 9l1-6M17 9l3-5M17 9l-1-6M12 13V5"/>',
  synapse:
    '<path d="M12 2v4"/><ellipse cx="12" cy="9" rx="5" ry="3.2"/><path d="M6 20c2-4 10-4 12 0"/><circle cx="10.5" cy="14" r="0.9" fill="currentColor" stroke="none"/><circle cx="13.5" cy="15" r="0.9" fill="currentColor" stroke="none"/>',
  axon: '<circle cx="3.5" cy="12" r="2"/><rect x="7" y="9.5" width="5" height="5" rx="2.5"/><rect x="14" y="9.5" width="5" height="5" rx="2.5"/><path d="M5.5 12H7M12 12h2M19 12h3"/>'
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
  // отступ 3 по краям: скруглённые концы линии не обрезаются viewBox
  let path = ''
  for (let step = 0; step <= 30; step++) {
    const x = 3 + step * 1.8
    const y = 12 + Math.sin((step / 30) * Math.PI * 2 * cycles) * height
    path += `${step === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
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
