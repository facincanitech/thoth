import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { isTauriDesktop } from './platform'

export type UpdateInfo = { available: boolean; version?: string }

function versionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

export function isVersionNewer(remoteVersion: string, currentVersion: string): boolean {
  const remote = versionParts(remoteVersion)
  const current = versionParts(currentVersion)
  const length = Math.max(remote.length, current.length)
  for (let i = 0; i < length; i += 1) {
    const remotePart = remote[i] || 0
    const currentPart = current[i] || 0
    if (remotePart > currentPart) return true
    if (remotePart < currentPart) return false
  }
  return false
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  try {
    // No Android a interface vem do site publicado e APP_VERSION representa o bundle web,
    // nao o APK instalado. Consulte o versionName nativo para o sininho continuar detectando
    // atualizacoes de APK mesmo quando o JavaScript remoto ja esta na versao mais recente.
    let installedVersion = currentVersion
    if (Capacitor.isNativePlatform()) {
      const appInfo = await CapacitorApp.getInfo()
      installedVersion = appInfo.version || currentVersion
    }
    const res = await fetch(
      `https://facincanitech.github.io/thoth/version.json?t=${Date.now()}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return { available: false }
    const data = await res.json()
    // version.json tem a versao do site e, separado, a do ultimo exe e do ultimo apk publicados
    // (deploy so do site nao deve fazer o sininho avisar de atualizacao que nao existe).
    const platformVersion = isTauriDesktop
      ? data.desktopVersion
      : Capacitor.isNativePlatform()
        ? data.androidVersion
        : undefined
    // Web e deploy do site podem estar na frente dos binarios publicados. APK
    // e desktop so olham seus campos proprios, atualizados ao publicar a release.
    const remote = String(platformVersion || '')
    if (remote && isVersionNewer(remote, installedVersion)) {
      return { available: true, version: remote }
    }
    return { available: false }
  } catch {
    return { available: false }
  }
}
