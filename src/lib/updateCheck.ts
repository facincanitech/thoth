import { Capacitor } from '@capacitor/core'
import { isTauriDesktop } from './platform'

export type UpdateInfo = { available: boolean; version?: string }

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  try {
    const res = await fetch(
      `https://facincanitech.github.io/thoth/version.json?t=${Date.now()}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return { available: false }
    const data = await res.json()
    // version.json tem a versao do site e, separado, a do ultimo exe e do ultimo apk publicados
    // (deploy so do site nao deve fazer o sininho avisar de atualizacao que nao existe).
    const platformVersion = isTauriDesktop ? data.desktopVersion : Capacitor.isNativePlatform() ? data.androidVersion : undefined
    const remote = String(platformVersion || data.version || '')
    if (remote && remote !== currentVersion) {
      return { available: true, version: remote }
    }
    return { available: false }
  } catch {
    return { available: false }
  }
}
