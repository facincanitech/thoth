import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 44100
const TAU = Math.PI * 2
const outDir = path.dirname(fileURLToPath(import.meta.url))

function sine(frequency, time, phase = 0) {
  return Math.sin(TAU * frequency * time + phase)
}

function triangle(frequency, time) {
  return 2 * Math.abs(2 * ((time * frequency) % 1) - 1) - 1
}

function envelope(time, start, duration, attack = 0.008, release = 0.12) {
  const local = time - start
  if (local < 0 || local >= duration) return 0
  const up = Math.min(1, local / attack)
  const down = Math.min(1, (duration - local) / release)
  return Math.max(0, Math.min(up, down))
}

function note(time, start, duration, frequency, character = 'bell') {
  const env = envelope(time, start, duration, 0.006, Math.min(0.16, duration * 0.62))
  if (!env) return 0
  const local = time - start
  if (character === 'soft') {
    return env * (sine(frequency, local) * 0.82 + sine(frequency * 2, local) * 0.12)
  }
  return env * (
    sine(frequency, local) * 0.68
    + sine(frequency * 2.01, local, 0.2) * 0.21
    + sine(frequency * 3.98, local, 0.6) * 0.08
  )
}

function seededNoise(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453
  return ((value - Math.floor(value)) * 2) - 1
}

function writeWav(name, duration, render) {
  const count = Math.floor(RATE * duration)
  const dataSize = count * 2
  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(RATE, 24)
  wav.writeUInt32LE(RATE * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)

  const samples = new Float64Array(count)
  let peak = 0
  for (let i = 0; i < count; i += 1) {
    const value = render(i / RATE, i)
    samples[i] = value
    peak = Math.max(peak, Math.abs(value))
  }
  const gain = peak ? 0.88 / peak : 1
  for (let i = 0; i < count; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i] * gain))
    wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
  }
  fs.writeFileSync(path.join(outDir, name), wav)
}

// Mensagem 1: tres pequenas luzes ascendentes, limpa e otimista.
writeWav('mensagem-01-luzes.wav', 0.72, (t) => (
  note(t, 0.00, 0.26, 659.25)
  + note(t, 0.105, 0.28, 880)
  + note(t, 0.225, 0.43, 1174.66)
))

// Mensagem 2: assinatura curta de duas notas com brilho digital.
writeWav('mensagem-02-orbita.wav', 0.68, (t) => (
  note(t, 0.00, 0.34, 783.99, 'soft')
  + note(t, 0.145, 0.48, 1318.51)
  + note(t, 0.18, 0.30, 1977.77) * 0.18
))

// Mensagem 3: arpejo mais nostalgico, sem reproduzir melodia de outro produto.
writeWav('mensagem-03-portal.wav', 0.82, (t) => (
  note(t, 0.00, 0.29, 523.25)
  + note(t, 0.12, 0.34, 783.99)
  + note(t, 0.255, 0.50, 1046.5)
  + note(t, 0.32, 0.38, 1567.98) * 0.16
))

// Mensagem cyberpunk: pulso grave curto + duas laminas de vidro FM.
// Pouca melodia, cauda curta e sem reverb para soar como interface, nao musica.
writeWav('mensagem-04-cyberpunk.wav', 0.62, (t, i) => {
  const clickEnv = envelope(t, 0.00, 0.055, 0.001, 0.025)
  const click = clickEnv * (seededNoise(i) * 0.42 + sine(118, t) * 0.58)

  const firstLocal = t - 0.025
  const firstEnv = envelope(t, 0.025, 0.24, 0.003, 0.13)
  const firstCarrier = firstEnv
    ? Math.sin(TAU * 612 * firstLocal + Math.sin(TAU * 1224 * firstLocal) * 1.55) * firstEnv
    : 0

  const secondLocal = t - 0.145
  const secondEnv = envelope(t, 0.145, 0.39, 0.004, 0.24)
  const secondCarrier = secondEnv
    ? Math.sin(TAU * 918 * secondLocal + Math.sin(TAU * 1836 * secondLocal) * 1.15) * secondEnv
    : 0

  const electricTail = secondEnv * sine(2754, secondLocal, 0.4) * 0.09
  return click * 0.42 + firstCarrier * 0.62 + secondCarrier * 0.72 + electricTail
})

// Chamar atencao 1: quatro impactos digitais alternados.
writeWav('atencao-01-pulso.wav', 1.06, (t, i) => {
  let value = 0
  for (let hit = 0; hit < 4; hit += 1) {
    const start = hit * 0.205
    const local = t - start
    const env = envelope(t, start, 0.17, 0.003, 0.09)
    if (env) {
      const sweep = 205 + hit * 28 + local * 310
      value += env * (triangle(sweep, local) * 0.54 + sine(sweep * 2.03, local) * 0.3 + seededNoise(i) * 0.08)
    }
  }
  return value
})

// Chamar atencao 2: sirene curta em tres rajadas, forte sem ser estridente.
writeWav('atencao-02-sinal.wav', 1.20, (t, i) => {
  let value = 0
  for (let hit = 0; hit < 3; hit += 1) {
    const start = hit * 0.29
    const local = t - start
    const env = envelope(t, start, 0.245, 0.006, 0.075)
    if (env) {
      const frequency = 430 + local * 1550
      value += env * (sine(frequency, local) * 0.7 + triangle(frequency * 0.5, local) * 0.22 + seededNoise(i) * 0.035)
    }
  }
  return value
})

// Chamar atencao 3: batida grave seguida por uma resposta aguda "Thoth".
writeWav('atencao-03-thoth.wav', 1.28, (t, i) => {
  const low1 = envelope(t, 0.00, 0.28, 0.003, 0.16) * (sine(138 - t * 35, t) * 0.78 + seededNoise(i) * 0.08)
  const high1 = note(t, 0.16, 0.31, 740, 'soft')
  const low2 = envelope(t, 0.48, 0.30, 0.003, 0.17) * (sine(158 - (t - 0.48) * 42, t - 0.48) * 0.78 + seededNoise(i) * 0.08)
  const high2 = note(t, 0.64, 0.50, 987.77)
  return low1 + high1 * 0.6 + low2 + high2 * 0.64
})

console.log('7 sons originais gerados em', outDir)
