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

  // виды нейронов
  flight:
    '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="5.5" opacity="0.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  stream:
    '<circle cx="6" cy="12" r="3"/><circle cx="15" cy="9" r="2.2"/><circle cx="20" cy="15" r="1.6"/><path d="M2 19h20"/>',
  field:
    '<circle cx="6" cy="7" r="2.4"/><circle cx="17" cy="6" r="2.4"/><circle cx="11.5" cy="12" r="2.4"/><circle cx="6" cy="17.5" r="2.4"/><circle cx="17.5" cy="17" r="2.4"/>',
  cascade:
    '<circle cx="5" cy="12" r="2.4"/><circle cx="12" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><circle cx="19.5" cy="12" r="2.4"/><path d="M7 10.6l3-2.4M7 13.4l3 2.4M14 7.5l3.5 2.8M14 16.5l3.5-2.8"/>',
  // тоннель: кольца уходят вглубь, по оси цепь из двух клеток
  tunnel:
    '<circle cx="12" cy="12" r="9.5" opacity="0.5"/><circle cx="12" cy="12" r="6" opacity="0.75"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 13.6v4.4"/>',
  wave: '<path d="M2 15c3-5 6-5 9 0s6 5 11-2"/><path d="M2 20c3-3 6-3 9 0s6 3 11-1" opacity="0.6"/><circle cx="16" cy="6" r="1.6" fill="currentColor"/>',

  panelHide: '<path d="M6 8l6 6 6-6"/><path d="M4 19h16"/>',
  panelShow: '<path d="M6 14l6-6 6 6"/><path d="M4 19h16"/>',
  // фоны
  dust: '<circle cx="6" cy="7" r="1"/><circle cx="14" cy="5" r="1"/><circle cx="19" cy="11" r="1"/><circle cx="9" cy="14" r="1"/><circle cx="16" cy="18" r="1"/><circle cx="5" cy="19" r="1"/>',
  calcium:
    '<circle cx="7" cy="8" r="3.5"/><circle cx="17" cy="7" r="2.5"/><circle cx="14" cy="17" r="3.5"/><circle cx="14" cy="17" r="0.8"/>',
  tracts:
    '<path d="M3 17c4-9 10-11 18-9"/><path d="M3 12c5-4 11-4 18 1"/><path d="M5 21c3-4 9-6 15-3"/>',

  // идеи
  breath:
    '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5" stroke-dasharray="2 3"/>',
  prune:
    '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 11l10-4"/><path d="M7 13l3 1.4M14 16l3 1"/>',
  score:
    '<path d="M3 7h18M3 12h18M3 17h18"/><circle cx="8" cy="12" r="2.2"/><circle cx="15" cy="17" r="2.2"/>',
  trace: '<path d="M3 6h5v4h4v5h3v-3h6"/><path d="M3 20h18"/>',
  save: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  variants:
    '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><circle cx="16.75" cy="16.75" r="3.25"/>'
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
