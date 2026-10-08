import { supabase } from './supabase'
import { deleteCustomSticker, getCustomStickers, saveCustomSticker } from './stickers'
import { deleteCustomWink, getCustomWinks, saveCustomWink } from './customWinks'

export type StoreKind = 'theme' | 'sound' | 'wink' | 'sticker' | 'emoji' | 'avatar_frame' | 'nameplate' | 'messenger_nameplate' | 'profile_background'
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

export async function hydrateInstalledMedia(userId: string) {
  const { data, error } = await supabase.from('store_installs')
    .select('item:store_items(*)').eq('user_id', userId)
  if (error) throw error
  const installedMediaIds = new Set<string>()
  for (const row of data || []) {
    const item = row.item as unknown as StoreItem | null
    if (!item?.asset_url) continue
    if (item.kind === 'wink') {
      installedMediaIds.add(`store:${item.id}`)
      await saveCustomWink({ id: `store:${item.id}`, label: item.name, imageData: item.asset_url, soundData: String(item.manifest.soundUrl || '') || null, fromUser: null })
    } else if (item.kind === 'sticker' || item.kind === 'emoji') {
      installedMediaIds.add(`store:${item.id}`)
      await saveCustomSticker({ id: `store:${item.id}`, label: item.name, imageData: item.asset_url })
    }
  }
  const [localWinks, localStickers] = await Promise.all([getCustomWinks(), getCustomStickers()])
  await Promise.all([
    ...localWinks.filter((item) => item.id.startsWith('store:') && !installedMediaIds.has(item.id)).map((item) => deleteCustomWink(item.id)),
    ...localStickers.filter((item) => item.id.startsWith('store:') && !installedMediaIds.has(item.id)).map((item) => deleteCustomSticker(item.id)),
  ])
  window.dispatchEvent(new CustomEvent('thoth-store-library-changed'))
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
      : item.kind === 'sound' ? { message_sound_id: item.id }
        : item.kind === 'avatar_frame' ? { active_avatar_frame_id: item.id }
          : item.kind === 'nameplate' ? { active_nameplate_id: item.id }
            : item.kind === 'messenger_nameplate' ? { active_messenger_nameplate_id: item.id } : {}
  if (item.kind === 'profile_background') Object.assign(update, { active_profile_background_id: item.id })
  if (!Object.keys(update).length) return
  const { error } = await supabase.from('store_preferences').upsert({ user_id: userId, ...update, updated_at: new Date().toISOString() })
  if (error) throw error
  if (item.kind === 'theme') applyCommunityTheme(item)
  if (item.kind === 'sound' && item.asset_url) localStorage.setItem(item.manifest.soundType === 'nudge' ? 'thoth-nudge-sound' : 'thoth-message-sound', item.asset_url)
  if (item.kind === 'avatar_frame' || item.kind === 'nameplate') {
    const cosmetic = { item_id: item.id, asset_url: item.asset_url, accent: typeof item.manifest.accent === 'string' ? item.manifest.accent : null }
    const { error: profileError } = await supabase.from('play_profiles').upsert({ user_id: userId, [item.kind === 'avatar_frame' ? 'avatar_frame' : 'nameplate']: cosmetic }, { onConflict: 'user_id' })
    if (profileError) throw profileError
  }
  if (item.kind === 'messenger_nameplate') {
    const cosmetic = { item_id: item.id, asset_url: item.asset_url, accent: typeof item.manifest.accent === 'string' ? item.manifest.accent : null }
    const { error: profileError } = await supabase.from('profiles').update({ messenger_nameplate: cosmetic }).eq('id', userId)
    if (profileError) throw profileError
  }
  if (item.kind === 'profile_background') {
    const { error: profileError } = await supabase.from('play_profiles').upsert({ user_id: userId, banner_image_url: item.asset_url }, { onConflict: 'user_id' })
    if (profileError) throw profileError
  }
}

export async function deactivateStoreCosmetic(userId: string, kind: Extract<StoreKind, 'avatar_frame' | 'nameplate' | 'messenger_nameplate' | 'profile_background'>) {
  const preferenceColumn = kind === 'avatar_frame' ? 'active_avatar_frame_id'
    : kind === 'nameplate' ? 'active_nameplate_id'
      : kind === 'messenger_nameplate' ? 'active_messenger_nameplate_id' : 'active_profile_background_id'
  const { error } = await supabase.from('store_preferences').upsert({
    user_id: userId,
    [preferenceColumn]: null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error

  if (kind === 'messenger_nameplate') {
    const { error: profileError } = await supabase.from('profiles').update({ messenger_nameplate: null }).eq('id', userId)
    if (profileError) throw profileError
    return
  }

  const profilePatch = kind === 'avatar_frame' ? { avatar_frame: null }
    : kind === 'nameplate' ? { nameplate: null } : { banner_image_url: null }
  const { error: profileError } = await supabase.from('play_profiles').upsert(
    { user_id: userId, ...profilePatch },
    { onConflict: 'user_id' },
  )
  if (profileError) throw profileError
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
