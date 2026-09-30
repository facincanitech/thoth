import { registerPlugin, Capacitor } from '@capacitor/core'

interface AudioRoutePlugin {
  setSpeakerphoneOn(options: { on: boolean }): Promise<void>
  startCallAudio(): Promise<void>
  stopCallAudio(): Promise<void>
  setMediaAudioMode(): Promise<void>
  startRingtone(): Promise<void>
  stopRingtone(): Promise<void>
}

const AudioRoute = registerPlugin<AudioRoutePlugin>('AudioRoute')

export async function setSpeakerphoneOn(on: boolean) {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioRoute.setSpeakerphoneOn({ on })
  } catch {
    // plugin indisponivel - nao critico
  }
}

export async function startCallAudio() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioRoute.startCallAudio()
  } catch {
    // plugin indisponivel - nao critico
  }
}

export async function stopCallAudio() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioRoute.stopCallAudio()
  } catch {
    // plugin indisponivel - nao critico
  }
}

export async function setMediaAudioMode() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioRoute.setMediaAudioMode()
  } catch {
    // plugin indisponivel - nao critico
  }
}

export async function startRingtone() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioRoute.startRingtone()
  } catch {
    // plugin indisponivel - nao critico
  }
}

export async function stopRingtone() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioRoute.stopRingtone()
  } catch {
    // plugin indisponivel - nao critico
  }
}
