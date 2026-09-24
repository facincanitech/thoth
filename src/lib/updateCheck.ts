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

// No Android a interface vem do site publicado, entao APP_VERSION (a const do bundle JS) e' sempre
// a versao mais recente do SITE, nao do APK instalado - as duas podem divergir a qualquer momento
// (ex.: alguem so deu `npm run deploy` sem gerar APK novo). Consulta o versionName nativo de verdade
// via @capacitor/app pra qualquer lugar que precise saber "qual versao esta instalada de fato".
export async function getInstalledVersion(currentVersion: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return currentVersion
  try {
    const appInfo = await CapacitorApp.getInfo()
    return appInfo.version || currentVersion
  } catch {
    return currentVersion
  }
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  try {
    const installedVersion = await getInstalledVersion(currentVersion)
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
