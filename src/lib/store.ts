import { supabase } from './supabase'
import { deleteCustomSticker, saveCustomSticker } from './stickers'
import { deleteCustomWink, saveCustomWink } from './customWinks'

export type StoreKind = 'theme' | 'sound' | 'wink' | 'sticker' | 'emoji'
export type StoreManifest = Record<string, string | number | boolean | null>

export type StoreItem = {
  id: string
  kind: StoreKind
  name: string
  description: string
  creator_id: string
  status: 'published' | 'hidden' | 'pending'
  manifest: StoreManifest
  preview_url: string | null
  asset_url: string | null
  version: number
  installs_count: number
  likes_count: number
  created_at: string
  creator?: { display_name: string | null; username: string; avatar_url: string | null } | null
}

const SAFE_THEME_KEYS = ['primary', 'accent', 'background', 'surface', 'text', 'muted', 'incoming', 'outgoing', 'railImage'] as const

export async function loadStoreItems(kind?: StoreKind) {
  let query = supabase.from('store_items')
    .select('*, creator:profiles!store_items_creator_id_fkey(display_name,username,avatar_url)')
    .eq('status', 'published').order('created_at', { ascending: false })
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query
  if (error) throw error
  return (data || []) as unknown as StoreItem[]
}

export async function loadInstalledIds(userId: string) {
  const { data, error } = await supabase.from('store_installs').select('item_id').eq('user_id', userId)
  if (error) throw error
  return new Set((data || []).map((row) => row.item_id as string))
}

async function cacheAsset(url: string | null) {
  if (!url || !('caches' in window)) return
  try { await (await caches.open('thoth-store-v1')).add(url) } catch { /* cache e best-effort */ }
}

export async function installStoreItem(userId: string, item: StoreItem) {
  const { error } = await supabase.from('store_installs').upsert({
    user_id: userId, item_id: item.id, installed_version: item.version, installed_at: new Date().toISOString(),
  })
  if (error) throw error
  await Promise.all([cacheAsset(item.asset_url), cacheAsset(item.preview_url)])
  if (item.kind === 'wink' && item.asset_url) {
    await saveCustomWink({ id: `store:${item.id}`, label: item.name, imageData: item.asset_url, soundData: String(item.manifest.soundUrl || '') || null, fromUser: item.creator?.display_name || item.creator?.username || null })
  }
  if ((item.kind === 'sticker' || item.kind === 'emoji') && item.asset_url) {
    await saveCustomSticker({ id: `store:${item.id}`, label: item.name, imageData: item.asset_url })
  }
  window.dispatchEvent(new CustomEvent('thoth-store-library-changed'))
}

export async function uninstallStoreItem(userId: string, itemId: string) {
  const { error } = await supabase.from('store_installs').delete().eq('user_id', userId).eq('item_id', itemId)
  if (error) throw error
  await Promise.allSettled([deleteCustomSticker(`store:${itemId}`), deleteCustomWink(`store:${itemId}`)])
  window.dispatchEvent(new CustomEvent('thoth-store-library-changed'))
}

export async function uploadStoreAsset(userId: string, file: File) {
  const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('store-assets').upload(path, file, { cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from('store-assets').getPublicUrl(path).data.publicUrl
}

export async function publishStoreItem(input: Pick<StoreItem, 'kind' | 'name' | 'description' | 'creator_id' | 'manifest' | 'preview_url' | 'asset_url'>) {
  const { data, error } = await supabase.from('store_items').insert(input).select().single()
  if (error) throw error
  return data as StoreItem
}

export async function activateStoreItem(userId: string, item: StoreItem) {
  const update = item.kind === 'theme' ? { active_theme_id: item.id }
    : item.kind === 'sound' && item.manifest.soundType === 'nudge' ? { nudge_sound_id: item.id }
      : item.kind === 'sound' ? { message_sound_id: item.id } : {}
  if (!Object.keys(update).length) return
  const { error } = await supabase.from('store_preferences').upsert({ user_id: userId, ...update, updated_at: new Date().toISOString() })
  if (error) throw error
  if (item.kind === 'theme') applyCommunityTheme(item)
  if (item.kind === 'sound' && item.asset_url) localStorage.setItem(item.manifest.soundType === 'nudge' ? 'thoth-nudge-sound' : 'thoth-message-sound', item.asset_url)
}

export function applyCommunityTheme(item: StoreItem | null) {
  const root = document.documentElement
  SAFE_THEME_KEYS.forEach((key) => root.style.removeProperty(`--store-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`))
  root.removeAttribute('data-store-theme')
  if (!item || item.kind !== 'theme') return
  root.setAttribute('data-store-theme', item.id)
  SAFE_THEME_KEYS.forEach((key) => {
    const value = item.manifest[key]
    if (typeof value !== 'string') return
    if (key === 'railImage') {
      if (/^https:\/\//.test(value)) root.style.setProperty('--store-rail-image', `url("${value.replace(/["\\]/g, '')}")`)
      return
    }
    if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|hsla?\([\d\s,.%]+\))$/i.test(value)) {
      root.style.setProperty(`--store-${key}`, value)
    }
  })
}
