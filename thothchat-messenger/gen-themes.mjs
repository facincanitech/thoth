// Gera as variacoes de tema do Messenger DESKTOP a partir do skin base (thothmessenger.css = Frutiger Aero).
// A estrutura/layout e sempre a mesma. O HSL cria uma base e cada skin recebe
// acabamento proprio depois, seguindo a mesma direcao artistica dos temas do APK.
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
  dark: `
:root{--bg-deep:#090d13;--bg-panel:#101720;--bg-surface:#17212e;--bg-surface-2:#1c2938;--bg-selected:#24354a;--line:#2d3b4e;--line-2:#40526a;--text:#eef4ff;--text-base:#eef4ff;--text-secondary:#b9c6d8;--muted:#7f90a6;--accent-text:#65bdec;--input:#0d141e;--rail-bg:#111a25;--rail-icon:#bdc9da;--green:#56b7e9;--on-button:#07131c}
html,body,#root{background:#070b10!important;color:#eef4ff!important}
.desktop-window-shell{background:#0b1018!important;border-color:#34475e!important;box-shadow:inset 0 0 0 1px #ffffff0b,0 18px 45px #0009!important}
.titlebar{background:linear-gradient(#182332,#0b111a)!important;border-bottom-color:#40526a!important;color:#eef4ff!important}
.desktop-window-shell .rail{background:linear-gradient(120deg,#26384d33,transparent 42%),linear-gradient(#162332,#0c131d)!important;border-right-color:#40526a!important}
.desktop-window-shell .rail-link[aria-current="page"]{background:linear-gradient(#324b66,#21374d)!important;color:#dff5ff!important;border-color:#65bdec!important;box-shadow:inset 0 1px #ffffff22,0 0 12px #56b7e933!important}
.chat-header,.top,.msn-identity-card{background:linear-gradient(135deg,#202d3d,#111923)!important;color:#eef4ff!important;border-color:#40526a!important}
.messages{background:radial-gradient(circle at 82% 8%,#1a2a3a 0,transparent 38%),#090e15!important;color:#eef4ff!important}
.chats,.chat-list,.msn-contacts-window,.msn-contact-list,.new-conv-panel{background:#0d141dee!important;color:#eef4ff!important}
.msn-search-row,.composer,.composer-icons{background:#111a25!important;border-color:#34475e!important}
.search,.input,.msn-search-row input{background:#0a111a!important;color:#eef4ff!important;border-color:#40526a!important}
.chat,.msn-contact,.name,.preview,.time,.status,.header-name,.header-text{color:#eef4ff!important}
.chat.selected,.msn-contact:hover,.msn-contact:active{background:#24354a!important;border-color:#65bdec!important}
`,
  retro: `
:root{--bg-deep:#d9e6f5;--bg-panel:#fff;--bg-surface:#fff;--bg-surface-2:#edf3fa;--bg-selected:#e1ebf7;--line:#9fb8d4;--line-2:#c4d3e5;--text:#30405a;--text-base:#30405a;--text-secondary:#4d6380;--muted:#70839a;--accent-text:#315d9b;--input:#fff;--rail-bg:#d5e3f3;--rail-icon:#315d9b;--green:#315d9b;--on-button:#fff}
.play-window-shell .titlebar{background:linear-gradient(#7599c8,#4f75aa)!important}
.titlebar{background:linear-gradient(#7599c8,#4f75aa)!important}
.desktop-window-shell .rail{background:linear-gradient(180deg,#eaf2fb,#c6d8ec)!important;border-right-color:#9db6d5!important;box-shadow:inset -1px 0 #fff!important}
.rail-wordmark,.brand{color:#db2f86!important;text-shadow:none!important}
.desktop-window-shell .rail-link{border-radius:2px!important;color:#315d9b!important;text-shadow:none!important}
.desktop-window-shell .rail-link[aria-current="page"]{background:#fff!important;color:#315d9b!important;border-color:#9db6d5!important;border-bottom:3px solid #db2f86!important;box-shadow:none!important}
.top,.chat-header,.msn-identity-card{background:#d9e6f5!important;border-color:#9fb8d4!important}
.chat-list,.messages,.msn-contacts-window,.msn-contact-list{background:#fff!important}
.chat,.bubble,.input,.search,.msn-contact,.msn-search-row input{border-radius:2px!important;box-shadow:none!important}
.chat.selected,.msn-contact:active{background:#e1ebf7!important;border-color:#b2c9e1!important}
.composer,.composer-icons,.msn-search-row{background:#d9e6f5!important;border-color:#9fb8d4!important}
.msn-contact-list details summary{color:#315d9b!important;border-bottom:1px solid #c9d7e7!important}
.msn-contact:hover{background:#eef4fb!important;border-color:#b2c9e1!important}
.msn-avatar-me,.msn-contact-avatar,.header-photo{border-radius:2px!important;border-color:#a9bfd9!important;background:#edf3fa!important;box-shadow:0 1px 4px #315d9b2b!important}
.desktop-chat-shell .messages{background:#fff!important}
.desktop-chat-shell .bubble{border-radius:3px!important;box-shadow:none!important}
.desktop-chat-shell .in .bubble{background:#fff!important;border-color:#c1d1e3!important}
.desktop-chat-shell .out .bubble{background:#e6eef8!important;border-color:#afc4dd!important}
`,
  contrast: `
:root{--bg-deep:#000;--bg-panel:#000;--bg-surface:#000;--bg-surface-2:#111;--bg-selected:#fff;--line:#fff;--line-2:#fff;--text:#fff;--text-base:#fff;--text-secondary:#fff;--muted:#fff;--accent-text:#fff;--input:#000;--rail-bg:#000;--rail-icon:#fff;--green:#fff;--on-button:#000}
html,body,#root,.app,.desktop-window-shell{background:#000!important;color:#fff!important}
.desktop-window-shell{border:2px solid #fff!important;box-shadow:none!important}
.titlebar,.rail,.chat-header,.top,.msn-identity-card,.composer,.composer-icons,.msn-search-row{background:#000!important;color:#fff!important;border-color:#fff!important}
.desktop-window-shell .rail{border-right:2px solid #fff!important;background:#000!important}.desktop-window-shell .rail-link[aria-current="page"]{background:#fff!important;color:#000!important;border:2px solid #fff!important;box-shadow:none!important}
.chats,.chat-list,.msn-contacts-window,.msn-contact-list,.messages,.new-conv-panel{background:#000!important;color:#fff!important}
.search,.input,.msn-search-row input{background:#000!important;color:#fff!important;border:2px solid #fff!important}
.chat,.msn-contact{color:#fff!important;border-bottom:1px solid #fff!important}.chat.selected,.msn-contact:hover,.msn-contact:active{background:#fff!important;color:#000!important;border-color:#fff!important}
.chat.selected *,.msn-contact:hover *,.msn-contact:active *{color:#000!important}
.bubble{background:#000!important;color:#fff!important;border:2px solid #fff!important}.out .bubble{background:#fff!important;color:#000!important}
.send,.send-text{background:#fff!important;color:#000!important;border:2px solid #fff!important}
`,
  cyberpunk: `
:root{--bg-deep:#050710;--bg-panel:#0b0d1c;--bg-surface:#101329;--bg-surface-2:#151936;--bg-selected:#182b4d;--line:#25305a;--line-2:#2a3865;--text:#f4f7ff;--text-base:#f4f7ff;--text-secondary:#bec8e8;--muted:#8993b5;--accent-text:#20e7ff;--input:#080d20;--rail-bg:#09091a;--rail-icon:#9aa8d2;--green:#20e7ff;--on-button:#061019}
body{background:#050710 url('../src/assets/themes/cyberpunk-city.png') center bottom/auto 100% fixed!important;color:#f4f7ff!important}
.app,.desktop-window-shell{background:linear-gradient(rgb(5 7 16 / 38%),rgb(8 5 18 / 52%)),url('../src/assets/themes/cyberpunk-city.png') center bottom/auto 100% fixed!important}
.titlebar{background:linear-gradient(#141328,#070914)!important;border-bottom-color:#20e7ff!important}
.desktop-window-shell .rail{background:linear-gradient(rgb(7 8 19 / 48%),rgb(12 8 27 / 62%)),url('../src/assets/themes/cyberpunk-city.png') 18% bottom/auto 100% fixed!important;border-right:1px solid #20e7ff!important;box-shadow:inset -1px 0 #20e7ff66,5px 0 18px #20e7ff1f!important}
.desktop-window-shell .rail:before{background:linear-gradient(180deg,#20e7ff1f,transparent 28%,#ff3cac24 75%,transparent)!important}
.desktop-window-shell .rail:after{width:2px!important;height:100%!important;top:0!important;left:auto!important;right:2px!important;transform:none!important;background:linear-gradient(transparent,#20e7ff 30%,#ff3cac 72%,transparent)!important;box-shadow:0 0 10px #20e7ff!important}
.desktop-window-shell .rail-link{border-radius:0!important}
.desktop-window-shell .rail-link[aria-current="page"]{background:#20e7ff!important;color:#061019!important;border-color:#8affff!important;box-shadow:0 0 16px #20e7ff88!important}
.chat-header,.top,.msn-identity-card{background:linear-gradient(135deg,#11142bee,#21113aee)!important;color:#f4f7ff!important;border-color:#2a3865!important}
.messages{background:linear-gradient(#0507107a,#050710b3),url('../src/assets/themes/cyberpunk-city.png') center bottom/auto 100% fixed!important;color:#f4f7ff!important}
.chats,.chat-list,.new-conv-panel{background:#080a17b8!important;color:#f4f7ff!important}
.msn-contacts-window{background:linear-gradient(#05071063,#0c07199e),url('../src/assets/themes/cyberpunk-city.png') center bottom/auto 100% fixed!important;color:#f4f7ff!important}
.msn-contact-list{background:linear-gradient(#0507107a,#0b0819b3),url('../src/assets/themes/cyberpunk-city.png') center bottom/auto 100% fixed!important;color:#f4f7ff!important}
.msn-search-row,.composer,.composer-icons{background:#0b0d1cf2!important;border-color:#25305a!important}
.search,.input,.msn-search-row input{background:#080d20!important;color:#f4f7ff!important;border-color:#345078!important}
.chat,.msn-contact{color:#f4f7ff!important}.chat.selected,.msn-contact:active{background:#182b4d!important;border-color:#20e7ff!important}
.bubble{color:#f4f7ff!important;background:#101329!important;border-color:#2a3865!important}.out .bubble{background:#311653!important;border-color:#a33da3!important}
.msn-contact-list details summary{color:#20e7ff!important;text-shadow:0 0 7px #20e7ff77!important;border-bottom:1px solid #25305a!important}
.msn-contact:hover{background:#182b4d!important;border-color:#20e7ff!important;box-shadow:inset 3px 0 #ff3cac!important}
.msn-avatar-me,.msn-contact-avatar,.header-photo{border-radius:0!important;border-color:#20e7ff!important;background:#101329!important;box-shadow:0 0 11px #20e7ff66!important}
.send,.send-text{background:linear-gradient(135deg,#20e7ff,#a23cff)!important;color:#061019!important;border-color:#20e7ff!important;box-shadow:0 0 13px #20e7ff55!important}
`,
  matrix: `
:root{--bg-deep:#010502;--bg-panel:#031008;--bg-surface:#05170a;--bg-surface-2:#071e0c;--bg-selected:#0b3214;--line:#0d4820;--line-2:#126329;--text:#caffd4;--text-base:#d5ffdc;--text-secondary:#8cdb9b;--muted:#5ca66d;--accent-text:#36ff67;--input:#020b04;--rail-bg:#020a04;--rail-icon:#77cb88;--green:#20df50;--on-button:#001707}
html,body,#root{background:#010502!important;color:#caffd4!important}
.app,.desktop-window-shell{background:#010502!important;color:#caffd4!important}
.titlebar{background:#020703!important;color:#5cff7d!important;border-bottom:1px solid #18c947!important}
.desktop-window-shell .rail{background:#010502 url('../src/assets/themes/matrix-rain.svg') center top/180px 360px repeat-y!important;border-right:1px solid #00ff55!important;animation:matrixRain 24s linear infinite!important;box-shadow:inset -1px 0 #00ff5566,5px 0 18px #00ff5517!important}
@keyframes matrixRain{to{background-position:center 360px}}
.desktop-window-shell .rail:before{background:linear-gradient(90deg,#00ff550a,transparent 46%,#00ff5510)!important}
.desktop-window-shell .rail:after{display:none!important}
.desktop-window-shell .rail-link{border-radius:0!important}
.desktop-window-shell .rail-link[aria-current="page"]{background:#00d747!important;color:#001406!important;border-color:#68ff91!important;box-shadow:0 0 14px #00ff5577!important}
.chat-header,.top,.msn-identity-card{background:linear-gradient(#06170b,#020904)!important;color:#caffd4!important;border-color:#125224!important}
.chats,.chat-list,.msn-contacts-window,.msn-contact-list,.new-conv-panel{background:#020904!important;color:#caffd4!important}
.messages{background:repeating-linear-gradient(0deg,#010502 0,#010502 27px,#06180b 28px)!important;color:#d5ffdc!important}
.msn-search-row,.composer,.composer-icons{background:#020904!important;border-color:#125224!important}
.search,.input,.msn-search-row input{background:#010502!important;color:#caffd4!important;border:1px solid #167435!important;box-shadow:inset 0 0 8px #000!important}
.search input,.input textarea,.msn-search-row input{color:#caffd4!important;-webkit-text-fill-color:#caffd4!important}
.search input::placeholder,.input textarea::placeholder,.msn-search-row input::placeholder{color:#5ca66d!important;opacity:1!important}
.chat,.msn-contact,.name,.preview,.time,.status,.header-name,.header-text{color:#caffd4!important}
.chat.selected,.msn-contact:active{background:#092d12!important;border-color:#167435!important}
.bubble{color:#d5ffdc!important;background:#041208!important;border:1px solid #125426!important}.out .bubble{background:#082d12!important;border-color:#19893a!important}
.system-message{color:#9debab!important;background:#092d12!important}.send,.send-text{background:#27df55!important;color:#001707!important}
.msn-contact-list details summary{color:#43ff6d!important;text-shadow:0 0 6px #18d94a66!important;border-bottom:1px solid #0d4820!important}
.msn-contact:hover{background:#092d12!important;border-color:#35ff65!important;box-shadow:inset 3px 0 #35ff65!important}
.msn-avatar-me,.msn-contact-avatar,.header-photo{border-radius:0!important;border-color:#20df50!important;background:#05170a!important;box-shadow:0 0 9px #20df5055!important}
`,
  wood: `
:root{--bg-deep:#1a0e08;--bg-panel:#2a180f;--bg-surface:#372116;--bg-surface-2:#42291b;--bg-selected:#5b3b25;--line:#624128;--line-2:#795438;--text:#f5e4c9;--text-base:#f5e4c9;--text-secondary:#d9c09f;--muted:#b89b79;--accent-text:#efc47f;--input:#201109;--rail-bg:#241209;--rail-icon:#e4c69f;--green:#c49553;--on-button:#3b210f}
body{background:#1b0f09 url('../src/assets/themes/walnut-grain.png') center/420px auto fixed!important;color:#f5e4c9!important}
.app,.desktop-window-shell{background:rgb(24 13 8 / 70%)!important}
.titlebar{background:linear-gradient(#3b2417,#201109)!important;border-bottom-color:#b9874f!important}
.desktop-window-shell .rail{background:linear-gradient(rgb(35 18 10 / 10%),rgb(20 10 6 / 28%)),url('../src/assets/themes/walnut-grain.png') center/320px auto!important;border-right:2px solid #b9874f!important;box-shadow:inset -7px 0 13px #160a05aa,5px 0 18px #0b050399!important}
.desktop-window-shell .rail:before{background:linear-gradient(90deg,#f2d2a71c,transparent 18% 72%,#12070355)!important}
.desktop-window-shell .rail:after{width:34%!important;height:145%!important;top:-18%!important;left:32%!important;background:linear-gradient(100deg,transparent 38%,#f0d09b2e 48%,transparent 60%)!important}
.desktop-window-shell .rail-link{border-radius:5px!important;color:#e4c69f!important}
.desktop-window-shell .rail-link[aria-current="page"]{background:#e3c18f!important;color:#3b1f0d!important;border-color:#f3d9ac!important;box-shadow:0 2px 8px #13080399!important}
.chat-header,.top,.msn-identity-card{background:linear-gradient(#4e2e1d,#2b170e)!important;color:#f5e4c9!important;border-color:#9a704b!important}
.chats,.chat-list,.msn-contacts-window,.msn-contact-list,.new-conv-panel{background:#2a180ff2!important;color:#f5e4c9!important}
.msn-search-row,.composer,.composer-icons{background:#321d12!important;border-color:#795438!important}
.search,.input,.msn-search-row input{background:#201109!important;color:#f5e4c9!important;border-color:#8a603e!important}
.chat,.msn-contact,.name,.preview,.time,.status,.header-name,.header-text{color:#f5e4c9!important}
.chat.selected,.msn-contact:active{background:#5b3b25!important;border-color:#b9874f!important}
.messages{background:linear-gradient(#efe1c8f2,#e1cdabf5),url('../src/assets/themes/walnut-grain.png') center/520px auto!important;color:#3e291b!important}
.bubble{color:#3d291c!important;background:#f6ead3!important;border:1px solid #a9825c!important}.out .bubble{background:#d8b37b!important;border-color:#aa7f49!important}
.system-message{color:#64452d!important;background:#dfbd84!important}.send,.send-text{background:#d4ad70!important;color:#3b210f!important}
.msn-contact-list details summary{color:#efc47f!important;text-shadow:0 1px #160a05!important;border-bottom:1px solid #624128!important}
.msn-contact:hover{background:#553721!important;border-color:#b9874f!important;box-shadow:inset 3px 0 #efc47f!important}
.msn-avatar-me,.msn-contact-avatar,.header-photo{border-radius:4px!important;border-color:#b18455!important;background:#4b2e1d!important;box-shadow:0 2px 6px #120703!important}
`,
}

// Acabamento estrutural comum: traz para o desktop a densidade, hierarquia e
// legibilidade do APK sem mover nenhum componente da estrutura desktop.
const desktopFoundation = `
.desktop-window-shell .msn-identity-card{min-height:118px!important;padding:16px 18px!important}
.desktop-window-shell .msn-identity-copy strong{color:var(--text)!important;font-size:18px!important}
.desktop-window-shell .msn-presence{color:var(--text-secondary)!important;line-height:1.45!important}
.desktop-window-shell .msn-search-row{padding:10px 12px!important}
.desktop-window-shell .msn-search-row input{height:38px!important;padding:0 12px!important;color:var(--text)!important;background:var(--input)!important;border:1px solid var(--line-2)!important}
.desktop-window-shell .msn-search-row input::placeholder{color:var(--muted)!important;opacity:1!important}
.desktop-window-shell .msn-contact-list{padding:7px 9px!important}
.desktop-window-shell .msn-contact-list details summary{height:34px!important;color:var(--text-secondary)!important;font-size:13px!important}
.desktop-window-shell .msn-contact{height:58px!important;gap:9px!important;padding:6px 9px!important;color:var(--text)!important;transition:background .14s,border-color .14s,box-shadow .14s!important}
.desktop-window-shell .msn-contact-info strong{color:var(--text)!important;font-size:13px!important}
.desktop-window-shell .msn-contact-info small{color:var(--muted)!important;font-size:11px!important}
.desktop-window-shell .msn-contact-avatar{width:42px!important;height:42px!important}
.desktop-chat-shell .chat-header{min-height:108px!important;padding:15px 20px!important}
.desktop-chat-shell .messages{padding:22px 24px!important}
.desktop-chat-shell .bubble{max-width:min(620px,82%)!important;padding:10px 13px 8px!important;border:1px solid var(--line-2)!important;border-radius:10px!important;box-shadow:0 2px 8px #00000016!important}
.desktop-chat-shell .in .bubble{background:var(--bg-surface)!important;color:var(--text-base)!important}
.desktop-chat-shell .out .bubble{background:var(--bg-selected)!important;color:var(--text-base)!important}
.desktop-chat-shell .composer{min-height:142px!important;background:var(--bg-panel)!important;border-top:1px solid var(--line)!important}
.desktop-chat-shell .composer-icons{background:var(--bg-surface-2)!important;border-bottom:1px solid var(--line)!important}
.desktop-chat-shell .input{background:var(--input)!important;color:var(--text)!important;border:1px solid var(--line-2)!important}
.desktop-chat-shell .input textarea{color:var(--text)!important;-webkit-text-fill-color:var(--text)!important}
.desktop-chat-shell .input textarea::placeholder{color:var(--muted)!important;opacity:1!important}
`

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
  css += desktopFoundation
  css += extras[name] || ''
  // a barra de titulo nao precisa seguir o tema do Windows aqui (o tema do app manda)
  fs.writeFileSync(path.join(dir, `thothmessenger-${name}.css`), `/* GERADO por gen-themes.mjs a partir de thothmessenger.css - nao editar */\n` + css)
  console.log('gerado', name)
}
