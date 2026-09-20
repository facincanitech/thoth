export type UpdateInfo = { available: boolean; version?: string }

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  try {
    const res = await fetch(
      `https://facincanitech.github.io/thoth/version.json?t=${Date.now()}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return { available: false }
    const data = await res.json()
    const remote = String(data.version || '')
    if (remote && remote !== currentVersion) {
      return { available: true, version: remote }
    }
    return { available: false }
  } catch {
    return { available: false }
  }
}
