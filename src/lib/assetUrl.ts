export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^(?:https?:|data:|blob:|capacitor:|tauri:)/i.test(url)) return url
  const base = new URL(import.meta.env.BASE_URL || './', window.location.href)
  return new URL(url.replace(/^\/+/, ''), base).href
}
