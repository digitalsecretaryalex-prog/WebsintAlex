// Общее из эталонных сцен Flow Wave и Tunnel: шум, фон со всполохами
// в углах и пылинки у объектива. Цвета передаёт вид.
// В эталонах фон собирался проходом FinalPass вместе с текстурами bloom;
// эти текстуры там чёрные (проверено чтением пикселей), поэтому здесь
// фон рисуется одним полноэкранным треугольником под нейронами.
import * as THREE from 'three'

export function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255
  )
}

// цвет слоя из палитры (THREE.Color) в те же 0..1, что и hex эталонов
export function colorToVec3(color) {
  return hexToVec3(`#${color.getHexString(THREE.SRGBColorSpace)}`)
}

// 3D simplex noise из эталонов
export const SNOISE = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx; vec3 x2 = x0 - i2 + 2.0 * C.xxx; vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`

// Мягкая точка эталонов
export const POINT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 xy = gl_PointCoord - 0.5;
  float ll = length(xy);
  if (ll > 0.5) discard;
  gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, ll) * vAlpha);
}`

const UNDERLAY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`

// фон и всполохи FinalPass эталона, без текстур bloom
const UNDERLAY_FRAGMENT = /* glsl */ `
uniform float iTime;
uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB; uniform float uFlameAmt;
uniform vec3 uFlash; uniform vec2 uFlashAt;
varying vec2 vUv;
vec3 warp3d(vec3 pos, float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
  pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
  pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
  pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
  return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
void main(){
  vec2 uv = 2.*vUv - 1.;
  vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*1.5), vec3(1.5));
  vec3 flame = 1.5*uFlameA*w.x; flame*=w.y; flame += uFlameB*w.z;
  flame *= smoothstep(0.25, 1., abs(uv.y));
  float md = smoothstep(-0.7, 1., -uv.y*uv.x); flame *= md*md;
  vec3 bg = uBg * (1.0 - 0.4 * length(uv));
  // свет вспышки нейрона расходится по фону мягким пятном
  vec2 fromFlash = (vUv - uFlashAt) * vec2(1.6, 1.0);
  bg += uFlash * exp(-dot(fromFlash, fromFlash) * 9.0);
  gl_FragColor = vec4(bg + flame*uFlameAmt, 1.);
}`

const MOTE_VERTEX = /* glsl */ `
attribute float size; attribute float seed; uniform float uTime; uniform vec2 uRes;
varying float vA;
vec3 warp(vec3 p, float t){ float c=0.9,a=1.9,b=0.02,s=0.05; p*=2.;
  p.x+=c*sin(s*t+a*p.y)+t*b; p.y+=c*cos(s*t+a*p.x); p.y+=c*sin(s*t+a*p.z)+t*b;
  p.z+=c*cos(s*t+a*p.y); p.z+=c*sin(s*t+a*p.x)+t*b; p.x+=c*cos(s*t+a*p.z);
  return cos(p+vec3(1,2,4)); }
void main(){
  vec3 v = position*4.0 + warp(position, uTime)*1.2;
  vec4 mv = modelViewMatrix * vec4(v, 1.0);
  float r = length(v); float farF = 1.0 - smoothstep(5.0, 6.5, r); float nearF = smoothstep(0.0, 0.5, -mv.z);
  vA = farF * nearF;
  gl_PointSize = size * uRes.y / 900.0 / -mv.z; gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mv;
}`

const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor; uniform float uLight; varying float vA;
void main(){ vec2 p = gl_PointCoord - 0.5; float l = length(p); if (l > 0.5) discard;
  float tex = smoothstep(0.5, 0.0, l); gl_FragColor = vec4(uColor * tex, tex * vA * 0.6 * uLight); }`

// ref: { bg, flameA, flameB, flameAmt, atmo, atmoCount, atmoSize, atmoSpeed }
export function createAtmosphere(scene, ref, pixel) {
  const underlay = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
    ),
    new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        uBg: { value: hexToVec3(ref.bg) },
        uFlameA: { value: hexToVec3(ref.flameA) },
        uFlameB: { value: hexToVec3(ref.flameB) },
        uFlameAmt: { value: ref.flameAmt },
        uFlash: { value: new THREE.Vector3() },
        uFlashAt: { value: new THREE.Vector2(0.5, 0.5) }
      },
      vertexShader: UNDERLAY_VERTEX,
      fragmentShader: UNDERLAY_FRAGMENT,
      depthTest: false,
      depthWrite: false
    })
  )
  underlay.frustumCulled = false
  underlay.renderOrder = -1
  scene.add(underlay)

  const count = ref.atmoCount
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = 2 * Math.random() - 1
    positions[i * 3 + 1] = 2 * Math.random() - 1
    positions[i * 3 + 2] = 2 * Math.random() - 1
    sizes[i] = ref.atmoSize * (0.4 + Math.random())
    seeds[i] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
  const moteUniforms = {
    uTime: { value: 0 },
    uColor: { value: hexToVec3(ref.atmo) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uLight: { value: 1 }
  }
  const motes = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: moteUniforms,
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    })
  )
  motes.frustumCulled = false
  scene.add(motes)

  const flashScreen = new THREE.Vector3()
  // clock стоит во сне; wake 0..1; breath: дыхание света
  function update({ clock, wake, breath, camera, flash }) {
    const u = underlay.material.uniforms
    u.iTime.value = clock
    u.uFlameAmt.value = ref.flameAmt * (0.5 + 0.5 * wake) * breath
    moteUniforms.uTime.value = clock * ref.atmoSpeed * 8
    moteUniforms.uLight.value = 0.5 + 0.5 * wake
    motes.position.copy(camera.position)
    // вспышка нейрона цепи: мягкий свет на фоне в её месте экрана
    flashScreen.copy(flash.point).project(camera)
    const visible = flashScreen.z < 1 ? 1 : 0
    u.uFlashAt.value.set(flashScreen.x * 0.5 + 0.5, flashScreen.y * 0.5 + 0.5)
    u.uFlash.value
      .copy(flash.tint)
      .multiplyScalar(0.22 * Math.exp(-flash.age * 1.4) * wake * visible)
  }

  function resize(width, height) {
    moteUniforms.uRes.value.set(width * pixel, height * pixel)
  }

  return { update, resize }
}
