// Gera as variacoes de tema do Messenger DESKTOP a partir do skin base (thothmessenger.css = Frutiger Aero).
// A estrutura/layout e a mesma do skin - so as cores mudam (mapeamento HSL de toda cor do arquivo).
// Rode: node thothchat-messenger/gen-themes.mjs  (o build:tauri ja roda isso).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const base = fs.readFileSync(path.join(dir, 'thothmessenger.css'), 'utf8')

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255))
}
const clamp = (v) => Math.max(0, Math.min(1, v))

const themes = {
  // cores de destaque (saturadas, tom medio: barra de titulo, botoes) ficam como estao; o resto inverte a luminosidade
  dark: ([h, s, l]) => (s > 0.5 && l > 0.25 && l < 0.65 ? [h, s, l] : [h, clamp(s * 0.75), 0.07 + 0.86 * (1 - l)]),
  // retro: azul claro e branco inspirados na web social dos anos 2000
  retro: ([h, s, l]) => [210, clamp(0.12 + s * 0.32), l],
  // alto contraste: preto/branco puro, tons medios (barra de titulo, botoes) viram vermelho de destaque
  contrast: ([h, s, l]) => {
    if (l < 0.34) return [0, 0, 0]
    if (l > 0.66) return [0, 0, 1]
    return [0, 1, 0.5]
  },
  // neon noturno: preserva contraste e leva destaques para ciano/magenta
  cyberpunk: ([h, s, l]) => s > 0.42 ? [h < 210 ? 188 : 316, clamp(s * 1.12), clamp(l * 0.8)] : [232, clamp(s + 0.18), 0.055 + l * 0.28],
  // terminal verde monocromatico
  matrix: ([h, s, l]) => [132, clamp(0.35 + s * 0.55), 0.025 + l * 0.45],
  // madeira e couro: castanhos quentes com destaques de latão
  wood: ([h, s, l]) => [28 + (h % 12), clamp(0.3 + s * 0.34), 0.06 + l * 0.68],
}

const extras = {
  retro: `
.play-window-shell .titlebar{background:linear-gradient(#7599c8,#4f75aa)!important}
.rail{background:#d7e5f5!important;border-right-color:#9db6d5!important}
.rail-wordmark,.brand{color:#db2f86!important;text-shadow:none!important}
.rail-link[aria-current="page"]{background:#fff!important;color:#315d9b!important;border-color:#9db6d5!important}
.chat-list,.messages{background:#fff!important}
`,
  cyberpunk: `
body{background:#050710 url('../themes/cyberpunk-city.png') center/cover fixed!important}
.app{background:rgb(5 7 16 / 78%)!important}
.rail{background:linear-gradient(rgb(7 8 19 / 90%),rgb(12 8 27 / 94%)),url('../themes/cyberpunk-city.png') left bottom/auto 100% fixed!important;border-right:1px solid #20e7ff!important}
.rail-link[aria-current="page"]{background:#20e7ff!important;color:#061019!important;box-shadow:0 0 16px #20e7ff88!important}
.chat-header,.top{background:linear-gradient(135deg,#11142b,#21113a)!important}
.messages{background:rgb(5 7 16 / 84%)!important}
`,
  matrix: `
body{background:#010502!important}
.rail{background:repeating-linear-gradient(180deg,#001106 0,#001106 18px,#00220b 19px)!important;border-right:1px solid #00ff55!important}
.rail-link[aria-current="page"]{background:#00d747!important;color:#001406!important;box-shadow:0 0 14px #00ff5577!important}
.chat-header,.top{background:linear-gradient(#06170b,#020904)!important}
.messages{background:repeating-linear-gradient(0deg,#010602 0,#010602 23px,#06200c 24px)!important}
`,
  wood: `
body{background:#1b0f09 url('../themes/walnut-grain.png') center/420px auto fixed!important}
.app{background:rgb(24 13 8 / 72%)!important}
.rail{background:linear-gradient(rgb(35 18 10 / 30%),rgb(20 10 6 / 48%)),url('../themes/walnut-grain.png') center/360px auto!important;border-right:2px solid #b9874f!important;box-shadow:inset -5px 0 12px #160a05aa!important}
.rail-link[aria-current="page"]{background:#e3c18f!important;color:#3b1f0d!important;border-color:#f3d9ac!important;box-shadow:0 2px 8px #13080399!important}
.chat-header,.top{background:linear-gradient(#4e2e1d,#2b170e)!important}
.messages{background:#efe1c8!important}
`,
}

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const RGB = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/g

function fmt([r, g, b], a) {
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  if (a == null || a >= 1) return hex
  return hex + Math.round(a * 255).toString(16).padStart(2, '0')
}

function convert(css, fn) {
  let out = css.replace(/(?<![-\w])white(?![-\w])/g, '#ffffff')
  out = out.replace(HEX, (_, h) => {
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('')
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : null
    return fmt(hsl2rgb(...fn(rgb2hsl(r, g, b))), a)
  })
  out = out.replace(RGB, (_, r, g, b, a) => {
    let alpha = null
    if (a != null) alpha = a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a)
    return fmt(hsl2rgb(...fn(rgb2hsl(+r, +g, +b))), alpha)
  })
  return out
}

for (const [name, fn] of Object.entries(themes)) {
  let css = convert(base, fn)
  if (name !== 'retro') css = css.replace(/color-scheme:\s*light/g, 'color-scheme:dark')
  css += extras[name] || ''
  // a barra de titulo nao precisa seguir o tema do Windows aqui (o tema do app manda)
  fs.writeFileSync(path.join(dir, `thothmessenger-${name}.css`), `/* GERADO por gen-themes.mjs a partir de thothmessenger.css - nao editar */\n` + css)
  console.log('gerado', name)
}
