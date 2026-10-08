export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^(?:https?:|data:|blob:|capacitor:|tauri:)/i.test(url)) return url
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}${url.replace(/^\/+/, '')}`
}
