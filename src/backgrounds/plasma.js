// «Плазма»: перенос компонента shader-background (21st.dev) с React на
// обычный JS. Шейдер тот же: волнистые линии, изогнутые шумом, по линиям
// бегут кружки. Изменено для проекта: линии стали пучками аксонов шести
// слоёв в цветах инструмента, кружки стали сигналами; фиолетовый фон
// исходника убран, линии складываются со светом поверх экрана.
// Звук: нота слоя наливает его линии и раздувает его сигналы; тон (фильтр)
// делает сердцевину линии чёткой или мутной; эхо добавляет второй и
// третий сигнал на линию; простор расширяет свечение; панорама сдвигает
// гребень линий своего слоя влево или вправо; темп гонит сигналы;
// громкость мастера поднимает волну, закрытый DJ-фильтр гасит.
import * as THREE from 'three'
import { PALETTE_GLSL } from './common.js'
import { LAYERS } from './hearing.js'

const VERTEX = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`

const FRAGMENT = /* glsl */ `
precision highp float;
${PALETTE_GLSL}
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uLayerColor[${LAYERS}];
uniform vec3 uIce;
uniform float uGlow[${LAYERS}];
uniform float uAlive[${LAYERS}];
uniform float uTone[${LAYERS}];
uniform float uEcho[${LAYERS}];
uniform float uPan[${LAYERS}];
uniform float uSpace;
uniform float uAmplitude;
uniform float uSaturation;
uniform float uDim;

const float overallSpeed = 0.2;
const float gridSmoothWidth = 0.015;
const float scale = 5.0;
const float minLineWidth = 0.01;
const float maxLineWidth = 0.2;
const float lineSpeed = 1.0 * overallSpeed;
const float lineFrequency = 0.2;
const float warpSpeed = 0.2 * overallSpeed;
const float warpFrequency = 0.5;
const float warpAmplitude = 1.0;
const float offsetFrequency = 0.5;
const float offsetSpeed = 1.33 * overallSpeed;
const float minOffsetSpread = 0.6;
const float maxOffsetSpread = 2.0;
const int linesPerGroup = 12;

float drawCircle(vec2 pos, float radius, vec2 coord) {
  return smoothstep(radius + gridSmoothWidth, radius, length(coord - pos));
}
float drawSmoothLine(float pos, float halfWidth, float t) {
  return smoothstep(halfWidth, 0.0, abs(pos - t));
}
float drawCrispLine(float pos, float halfWidth, float t) {
  return smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - t));
}
float random(float t) {
  return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
}
float getPlasmaY(float x, float horizontalFade, float offset) {
  return random(x * lineFrequency + uTime * lineSpeed) * horizontalFade * uAmplitude + offset;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 space = (gl_FragCoord.xy - uResolution.xy / 2.0) / uResolution.x * 2.0 * scale;
  float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
  float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);
  space.y += random(space.x * warpFrequency + uTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
  space.x += random(space.y * warpFrequency + uTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

  vec3 lines = vec3(0.0);
  for (int l = 0; l < linesPerGroup; l++) {
    int layer = l % ${LAYERS};
    float glow = uGlow[layer];
    float tone = uTone[layer];
    // панорама сдвигает гребень линий слоя
    float fade = 1.0 - (cos((uv.x - uPan[layer] * 0.18) * 6.28) * 0.5 + 0.5);
    float normalizedLineIndex = float(l) / float(linesPerGroup);
    float offsetTime = uTime * offsetSpeed;
    float offsetPosition = float(l) + space.x * offsetFrequency;
    float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
    float halfWidth = mix(minLineWidth, maxLineWidth * (0.6 + uSpace), rand * fade) / 2.0;
    float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, fade);
    float linePosition = getPlasmaY(space.x, fade, offset);
    float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0
      + drawCrispLine(linePosition, halfWidth * 0.15 * (0.4 + tone), space.y) * (0.3 + tone);

    // сигналы: кружки бегут по линии, эхо добавляет второй и третий
    float signals = 0.0;
    for (int c = 0; c < 3; c++) {
      if (float(c) > uEcho[layer] * 4.0) break;
      float circleX = mod(float(l) + float(c) * 8.3 + uTime * lineSpeed, 25.0) - 12.0;
      vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, fade, offset));
      signals += drawCircle(circlePosition, 0.012 + glow * 0.035, space) * 4.0 * (1.0 - float(c) * 0.3);
    }
    vec3 color = calm(uLayerColor[layer], uIce, uSaturation);
    lines += (line * (0.25 + uAlive[layer] * 0.5 + glow * 0.8) + signals * (0.6 + glow)) * color * rand;
  }
  gl_FragColor = vec4(lines * verticalFade * uDim, 1.0);
}`

export function createPlasma({ scene, renderer, colors }) {
  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uLayerColor: { value: colors.layers.map((color) => color.clone()) },
    uIce: { value: colors.ice.clone() },
    uGlow: { value: new Array(LAYERS).fill(0) },
    uAlive: { value: new Array(LAYERS).fill(0) },
    uTone: { value: new Array(LAYERS).fill(0.5) },
    uEcho: { value: new Array(LAYERS).fill(0) },
    uPan: { value: new Array(LAYERS).fill(0) },
    uSpace: { value: 0.3 },
    uAmplitude: { value: 1 },
    uSaturation: { value: 1 },
    uDim: { value: 1 }
  }
  // один треугольник на весь экран
  const geometry = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  )
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  mesh.frustumCulled = false
  scene.add(mesh)

  function update({ clock, look, target, hearing, dim }) {
    uniforms.uTime.value = clock * 1.6
    for (let i = 0; i < LAYERS; i++) {
      uniforms.uGlow.value[i] = Math.min(1.2, hearing.glow[i])
      uniforms.uAlive.value[i] = look.alive[i]
      uniforms.uTone.value[i] = hearing.knob('filter', i)
      uniforms.uEcho.value[i] = hearing.knob('echo', i, 0)
      uniforms.uPan.value[i] = hearing.knob('pan', i, 0)
    }
    uniforms.uSpace.value = target.space
    uniforms.uAmplitude.value = 0.6 + look.energy * 0.8
    uniforms.uSaturation.value = look.saturation
    uniforms.uDim.value = dim * (0.5 + 0.5 * look.density)
  }

  function resize(width, height) {
    const pixel = renderer.getPixelRatio()
    uniforms.uResolution.value.set(width * pixel, height * pixel)
  }

  return { update, resize }
}
