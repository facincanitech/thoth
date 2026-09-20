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
  // retro: cinza/bege de janela antiga
  retro: ([h, s, l]) => [35, clamp(s * 0.22), l],
  // alto contraste: preto/branco puro, tons medios (barra de titulo, botoes) viram vermelho de destaque
  contrast: ([h, s, l]) => {
    if (l < 0.34) return [0, 0, 0]
    if (l > 0.66) return [0, 0, 1]
    return [0, 1, 0.5]
  },
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
  // a barra de titulo nao precisa seguir o tema do Windows aqui (o tema do app manda)
  fs.writeFileSync(path.join(dir, `thothmessenger-${name}.css`), `/* GERADO por gen-themes.mjs a partir de thothmessenger.css - nao editar */\n` + css)
  console.log('gerado', name)
}
