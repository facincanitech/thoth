import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/errors'
import {
  activateStoreItem, installStoreItem, loadInstalledIds, loadStoreItems, publishStoreItem,
  uninstallStoreItem, uploadStoreAsset, type StoreItem, type StoreKind, type StoreManifest,
} from '../lib/store'
import { builtInSounds, builtInThemes, type BuiltInTheme } from '../lib/storeDefaults'
import { applyCommunityTheme } from '../lib/store'
import { StoreNameStudio } from './StoreNameStudio'
import { ensurePlayBotPanel } from '../lib/playBotPanels'
import { WINKS, playWinkEffect } from '../lib/winks'

type Category = StoreKind | 'bot'
type StoreSection = 'home' | 'themes' | 'name' | 'fun' | 'bots'
type Bot = { id: string; slug: string; name: string; description: string; command_prefix: string }
type Target = { id: string; name: string; type: 'messenger' | 'play' }

const categories: { id: Category; label: string; glyph: string }[] = [
  { id: 'theme', label: 'Temas', glyph: '◈' },
  { id: 'sound', label: 'Sons', glyph: '♫' },
  { id: 'wink', label: 'Winks', glyph: '✦' },
  { id: 'sticker', label: 'Stickers', glyph: '▣' },
  { id: 'emoji', label: 'Emojis', glyph: '☺' },
  { id: 'bot', label: 'Bots', glyph: '⚙' },
]

const sections: { id: StoreSection | 'mine'; label: string; description: string; glyph: string }[] = [
  { id: 'themes', label: 'Temas', description: 'Aparência e sons', glyph: '◈' },
  { id: 'name', label: 'Nome', description: 'Fontes, estilos e cores', glyph: '✎' },
  { id: 'fun', label: 'Diversão', description: 'Winks, stickers e emojis', glyph: '✦' },
  { id: 'bots', label: 'Bots', description: 'Para grupos e Play', glyph: '⚙' },
  { id: 'mine', label: 'Meus itens', description: 'Sua biblioteca', glyph: '★' },
]

const themeCategories = categories.filter((entry) => entry.id === 'theme' || entry.id === 'sound')
const funCategories = categories.filter((entry) => entry.id === 'wink' || entry.id === 'sticker' || entry.id === 'emoji')

const kindNames: Record<StoreKind, string> = { theme: 'tema', sound: 'som', wink: 'wink', sticker: 'sticker', emoji: 'emoji' }

export function ThothStore({ me, mode = 'store', onProfileChange, backSignal, onExit }: { me: Profile; mode?: 'store' | 'library'; onOpenStore?: () => void; onProfileChange: (patch: Partial<Profile>) => void; backSignal: number; onExit: () => void }) {
  const [section, setSection] = useState<StoreSection>('home')
  const [category, setCategory] = useState<Category | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(mode === 'library')
  const [libraryCategory, setLibraryCategory] = useState<Category | null>(null)
  const [items, setItems] = useState<StoreItem[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [installedBots, setInstalledBots] = useState<Set<string>>(new Set())
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [botTarget, setBotTarget] = useState<Bot | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [builtInLibrary, setBuiltInLibrary] = useState<string[]>(['messenger'])
  const [activeTheme, setActiveTheme] = useState<string>('messenger')
  const [activeSounds, setActiveSounds] = useState({ message: 'message', nudge: 'nudge' })
  const [preview, setPreview] = useState<{ kind: 'theme' | 'sound'; id: string; name: string; description: string; item?: StoreItem; soundUrl?: string; colors?: StoreManifest } | null>(null)
  const lastBackSignal = useRef(backSignal)
  const activeCategory = libraryOpen ? libraryCategory : category

  const loadPreferences = useCallback(async () => {
    const { data } = await supabase.from('store_preferences').select('*').eq('user_id', me.id).maybeSingle()
    if (!data) return
    setBuiltInLibrary(data.installed_builtin_themes || ['messenger'])
    setActiveTheme(data.active_theme_id || data.builtin_theme || 'messenger')
    setActiveSounds({ message: data.message_sound_id || data.message_builtin_sound || 'message', nudge: data.nudge_sound_id || data.nudge_builtin_sound || 'nudge' })
  }, [me.id])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (activeCategory === 'bot') {
        const [{ data, error: botError }, { data: groupBots }, { data: playBots }] = await Promise.all([
          supabase.from('bots').select('*').order('name'),
          supabase.from('group_bots').select('bot_id').eq('installed_by', me.id),
          supabase.from('play_group_bots').select('bot_id').eq('installed_by', me.id),
        ])
        if (botError) throw botError
        setBots((data || []) as Bot[])
        setInstalledBots(new Set([...(groupBots || []), ...(playBots || [])].map((row) => row.bot_id as string)))
      } else {
        const [catalog, library] = await Promise.all([
          loadStoreItems(activeCategory === null ? undefined : activeCategory), loadInstalledIds(me.id),
        ])
        setInstalled(library)
        setItems(catalog)
      }
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setLoading(false) }
  }, [activeCategory, me.id])

  useEffect(() => { reload() }, [reload])
  useEffect(() => { loadPreferences() }, [loadPreferences])
  useEffect(() => {
    const channel = supabase.channel(`store:${me.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_items' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_installs', filter: `user_id=eq.${me.id}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_preferences', filter: `user_id=eq.${me.id}` }, loadPreferences)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me.id, reload, loadPreferences])

  async function activateBuiltInTheme(id: BuiltInTheme) {
    setBusyId(id); setError('')
    try {
      const library = Array.from(new Set([...builtInLibrary, id, 'messenger']))
      const { error: saveError } = await supabase.from('store_preferences').upsert({ user_id: me.id, active_theme_id: null, builtin_theme: id, installed_builtin_themes: library, updated_at: new Date().toISOString() })
      if (saveError) throw saveError
      setBuiltInLibrary(library); setActiveTheme(id)
      window.dispatchEvent(new CustomEvent('thoth-store-theme', { detail: id }))
      window.dispatchEvent(new CustomEvent('thoth-store-library-changed'))
      applyCommunityTheme(null)
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusyId(null) }
  }

  async function removeBuiltInTheme(id: BuiltInTheme) {
    if (id === 'messenger') return
    if (activeTheme === id) await activateBuiltInTheme('messenger')
    const library = builtInLibrary.filter((item) => item !== id)
    const { error: saveError } = await supabase.from('store_preferences').upsert({ user_id: me.id, installed_builtin_themes: library, updated_at: new Date().toISOString() })
    if (saveError) { setError(getErrorMessage(saveError)); return }
    setBuiltInLibrary(library)
  }

  async function activateBuiltInSound(type: 'message' | 'nudge') {
    setBusyId(type); setError('')
    const update = type === 'message' ? { message_sound_id: null, message_builtin_sound: 'message' } : { nudge_sound_id: null, nudge_builtin_sound: 'nudge' }
    const { error: saveError } = await supabase.from('store_preferences').upsert({ user_id: me.id, ...update, updated_at: new Date().toISOString() })
    if (saveError) setError(getErrorMessage(saveError))
    else { localStorage.removeItem(type === 'message' ? 'thoth-message-sound' : 'thoth-nudge-sound'); setActiveSounds((old) => ({ ...old, [type]: type })) }
    setBusyId(null)
  }

  async function toggleInstall(item: StoreItem) {
    setBusyId(item.id); setError('')
    try {
      if (installed.has(item.id)) await uninstallStoreItem(me.id, item.id)
      else await installStoreItem(me.id, item)
      await reload()
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusyId(null) }
  }

  async function activateItem(item: StoreItem) {
    setBusyId(item.id); setError('')
    try {
      if (!installed.has(item.id)) await installStoreItem(me.id, item)
      await activateStoreItem(me.id, item)
      setInstalled((old) => new Set(old).add(item.id))
      if (item.kind === 'theme') setActiveTheme(item.id)
      if (item.kind === 'sound') setActiveSounds((old) => ({ ...old, [item.manifest.soundType === 'nudge' ? 'nudge' : 'message']: item.id }))
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusyId(null) }
  }

  async function chooseBot(bot: Bot) {
    setBotTarget(bot); setError('')
    try {
      const [{ data: memberships }, { data: playMemberships }] = await Promise.all([
        supabase.from('conversation_members').select('conversation_id, role, conversation:conversations(id,name,type,created_by)').eq('user_id', me.id),
        supabase.from('play_group_members').select('group_id, role, group:play_groups(id,name)').eq('user_id', me.id),
      ])
      const messenger: Target[] = (memberships || []).filter((row) => {
        const conv = row.conversation as unknown as { type: string; created_by: string } | null
        return conv?.type === 'group' && (row.role === 'admin' || conv.created_by === me.id)
      }).map((row) => {
        const conv = row.conversation as unknown as { id: string; name: string | null }
        return { id: conv.id, name: conv.name || 'Grupo sem nome', type: 'messenger' as const }
      })
      const play: Target[] = (playMemberships || []).filter((row) => row.role === 'owner' || row.role === 'admin').map((row) => {
        const group = row.group as unknown as { id: string; name: string }
        return { id: group.id, name: group.name, type: 'play' as const }
      })
      setTargets([...messenger, ...play])
    } catch (cause) { setError(getErrorMessage(cause)) }
  }

  async function installBot(target: Target) {
    if (!botTarget) return
    setBusyId(target.id); setError('')
    try {
      const result = target.type === 'messenger'
        ? await supabase.from('group_bots').upsert({ conversation_id: target.id, bot_id: botTarget.id, installed_by: me.id, permission: 'all' })
        : await supabase.from('play_group_bots').upsert({ group_id: target.id, bot_id: botTarget.id, installed_by: me.id })
      if (result.error) throw result.error
      setInstalledBots((old) => new Set(old).add(botTarget.id))
      if (target.type === 'play') await ensurePlayBotPanel(target.id, botTarget)
      setBotTarget(null)
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusyId(null) }
  }

  const title = libraryOpen ? libraryCategory ? categories.find((entry) => entry.id === libraryCategory)?.label || 'Meus itens' : 'Meus itens' : category ? categories.find((entry) => entry.id === category)?.label || 'Loja' : sections.find((entry) => entry.id === section)?.label || 'Loja Thoth'
  const canCreate = !libraryOpen && !!category
  const visibleItems = libraryOpen ? items.filter((item) => installed.has(item.id)) : items

  function openLibrary() { setLibraryCategory(null); setLibraryOpen(true) }
  function openSection(id: StoreSection | 'mine') {
    if (id === 'mine') { openLibrary(); return }
    setSection(id)
    setCategory(id === 'bots' ? 'bot' : null)
  }
  useEffect(() => {
    if (backSignal === lastBackSignal.current) return
    lastBackSignal.current = backSignal
    if (preview) { setPreview(null); return }
    if (libraryOpen && libraryCategory) { setLibraryCategory(null); return }
    if (libraryOpen) {
      if (mode === 'library') onExit()
      else { setLibraryOpen(false); setSection('home'); setCategory(null) }
      return
    }
    if (category && section !== 'bots') { setCategory(null); return }
    if (section !== 'home') { setSection('home'); setCategory(null); return }
    onExit()
  }, [backSignal, preview, libraryCategory, libraryOpen, mode, category, section, onExit])

  return (
    <div className="thoth-store">
      <div className="store-hero">
        <div><span className="store-kicker">{libraryOpen ? 'SUA BIBLIOTECA' : 'LOJA THOTH'}</span><h2>{title}</h2><p>{libraryOpen ? 'Seus downloads e escolhas, organizados por categoria.' : 'Feito pela comunidade. Seu acervo acompanha sua conta.'}</p></div>
        {canCreate && <button className="store-create" type="button" onClick={() => setCreatorOpen(true)}>＋ Criar</button>}
      </div>
      {error && <div className="store-error">{error}</div>}
      {!libraryOpen && section === 'home' ? <div className="store-category-grid">{sections.map((entry) => <button key={entry.id} className="store-category-tile" onClick={() => openSection(entry.id)}><b>{entry.glyph}</b><span>{entry.label}</span><small>{entry.description}</small></button>)}</div>
      : !libraryOpen && (section === 'themes' || section === 'fun') && !category ? <div className="store-category-grid">{(section === 'themes' ? themeCategories : funCategories).map((entry) => <button key={entry.id} className="store-category-tile" onClick={() => setCategory(entry.id)}><b>{entry.glyph}</b><span>{entry.label}</span><small>{entry.id === 'theme' ? 'Visuais do app' : entry.id === 'sound' ? 'Mensagem e chamar atenção' : 'Explore o acervo'}</small></button>)}</div>
      : !libraryOpen && section === 'name' ? <StoreNameStudio me={me} onProfileChange={onProfileChange} />
      : libraryOpen && !libraryCategory ? <div className="store-category-grid">{categories.map((entry) => <button key={entry.id} className="store-category-tile" onClick={() => setLibraryCategory(entry.id)}><b>{entry.glyph}</b><span>{entry.label}</span><small>{entry.id === 'theme' ? `${builtInLibrary.length + items.filter((item) => item.kind === 'theme' && installed.has(item.id)).length} salvos` : entry.id === 'sound' ? `${builtInSounds.length + items.filter((item) => item.kind === 'sound' && installed.has(item.id)).length} disponíveis` : entry.id === 'wink' ? `${WINKS.length + items.filter((item) => item.kind === 'wink' && installed.has(item.id)).length} disponíveis` : entry.id === 'emoji' ? 'Coleção padrão + seus itens' : entry.id === 'bot' ? 'Ver instalados' : `${items.filter((item) => item.kind === entry.id && installed.has(item.id)).length} salvos`}</small></button>)}</div>
      : loading ? <div className="store-empty">Abrindo o acervo…</div> : activeCategory === 'bot' ? (
        <div className="store-grid">{bots.filter((bot) => !libraryOpen || installedBots.has(bot.id)).map((bot) => <article className="store-card bot" key={bot.id}>
          <div className="store-preview store-bot-preview"><span>⚙</span><small>{bot.command_prefix}</small></div>
          <div className="store-card-body"><span className="store-kind">BOT</span><h3>{bot.name}</h3><p>{bot.description}</p><div className="store-author">Thoth Bots</div>
            <button onClick={() => chooseBot(bot)}>Adicionar ao grupo ou Play</button></div>
        </article>)}{libraryOpen && !installedBots.size && <div className="store-empty">Você ainda não instalou bots em grupos ou servidores.</div>}</div>
      ) : <div className="store-grid">
        {activeCategory === 'theme' && builtInThemes.filter((theme) => !libraryOpen || builtInLibrary.includes(theme.id)).map((theme) => <article className="store-card" key={theme.id}>
          <div className={`store-preview builtin-theme-preview builtin-${theme.id}`}><div className="theme-mini"><i/><i/><i/></div></div>
          <div className="store-card-body"><span className="store-kind">{theme.id === 'messenger' ? 'TEMA PRINCIPAL' : 'TEMA OFICIAL'}</span><h3>{theme.name}</h3><p>{theme.description}</p><div className="store-author">por Thoth Messenger</div>
            <div className="store-card-actions">{libraryOpen && theme.id !== 'messenger' && <button className="secondary" onClick={() => removeBuiltInTheme(theme.id)}>Remover</button>}<button onClick={() => setPreview({ kind: 'theme', id: theme.id, name: theme.name, description: theme.description })}>Ver prévia</button></div></div>
        </article>)}
        {activeCategory === 'sound' && builtInSounds.map((sound) => <article className="store-card" key={sound.id}><div className="store-preview sound"><span className="store-preview-glyph">♫</span></div><div className="store-card-body"><span className="store-kind">SOM PADRÃO · {sound.type === 'message' ? 'MENSAGEM' : 'CHAMAR ATENÇÃO'}</span><h3>{sound.name}</h3><p>{sound.description}</p><div className="store-author">por Thoth Messenger</div><div className="store-card-actions"><button onClick={() => setPreview({ kind: 'sound', id: sound.id, name: sound.name, description: sound.description, soundUrl: `${import.meta.env.BASE_URL}${sound.url}` })}>Ouvir prévia</button></div></div></article>)}
        {activeCategory === 'wink' && WINKS.map((wink) => <article className="store-card" key={wink.id}><div className="store-preview wink"><span className="store-preview-glyph">{wink.emoji}</span></div><div className="store-card-body"><span className="store-kind">WINK PADRÃO</span><h3>{wink.label}</h3><p>Disponível para todos, sempre no seu acervo.</p><div className="store-author">por Thoth Messenger</div><div className="store-card-actions"><button onClick={() => playWinkEffect(wink.id)}>Ver prévia</button></div></div></article>)}
        {activeCategory === 'emoji' && <article className="store-card"><div className="store-preview emoji"><span className="store-preview-glyph">😀 💙 🎉</span></div><div className="store-card-body"><span className="store-kind">EMOJIS PADRÃO</span><h3>Emojis do Messenger</h3><p>A coleção que já vem no teclado de conversa.</p><div className="store-author">por Thoth Messenger · sempre disponível</div></div></article>}
        {visibleItems.map((item) => <StoreCard key={item.id} item={item} installed={installed.has(item.id)} busy={busyId === item.id} active={activeTheme === item.id || activeSounds.message === item.id || activeSounds.nudge === item.id} onToggle={() => toggleInstall(item)} onPreview={() => setPreview({ kind: item.kind as 'theme' | 'sound', id: item.id, name: item.name, description: item.description || '', item, colors: item.manifest, soundUrl: item.kind === 'sound' ? item.asset_url || undefined : undefined })} />)}
        {!visibleItems.length && !['theme', 'sound', 'wink', 'emoji'].includes(activeCategory || '') && <div className="store-empty">{libraryOpen ? 'Nada salvo nesta categoria ainda. Explore a Loja Thoth.' : 'Ainda não há itens nesta categoria.'}</div>}
      </div>}
      {preview && <div className="store-modal-backdrop" onMouseDown={() => setPreview(null)}><div className="store-modal store-use-preview" onMouseDown={(event) => event.stopPropagation()}>
        <button className="store-modal-close" onClick={() => setPreview(null)}>×</button><span className="store-kicker">PRÉVIA · {preview.kind === 'theme' ? 'TEMA' : 'SOM'}</span><h2>{preview.name}</h2><p>{preview.description}</p>
        {preview.kind === 'theme' ? <div className={`store-theme-demo ${preview.item ? 'community' : `builtin-${preview.id}`}`} style={preview.item ? { '--demo-bg': String(preview.colors?.background || '#08131c'), '--demo-surface': String(preview.colors?.surface || '#172936'), '--demo-accent': String(preview.colors?.accent || '#22d3ee'), '--demo-text': String(preview.colors?.text || '#fff') } as CSSProperties : undefined}><div className="store-demo-sidebar">◉<br/>▤<br/>♫</div><div className="store-demo-chat"><header>Thoth Messenger <span>● online</span></header><div className="store-demo-messages"><span>Oi! Como ficou esse tema?</span><span>Ficou com a sua cara ✨</span></div><footer>Digite sua mensagem…　➤</footer></div></div> : <button className="store-demo-play" onClick={() => { if (preview.soundUrl) new Audio(preview.soundUrl).play().catch(() => setError('Não foi possível tocar este áudio.')) }}>▶ Ouvir som</button>}
        <div className="store-preview-actions"><button className="secondary" onClick={() => setPreview(null)}>Fechar</button><button disabled={busyId === preview.id || (preview.kind === 'theme' ? activeTheme === preview.id : activeSounds[preview.item?.manifest.soundType === 'nudge' || preview.id === 'nudge' ? 'nudge' : 'message'] === preview.id)} onClick={async () => { if (preview.item) await activateItem(preview.item); else if (preview.kind === 'theme') await activateBuiltInTheme(preview.id as BuiltInTheme); else await activateBuiltInSound(preview.id as 'message' | 'nudge'); setPreview(null) }}>{(preview.kind === 'theme' ? activeTheme === preview.id : activeSounds[preview.item?.manifest.soundType === 'nudge' || preview.id === 'nudge' ? 'nudge' : 'message'] === preview.id) ? 'Em uso' : 'Usar'}</button></div>
      </div></div>}
      {creatorOpen && <CreatorModal me={me} initialKind={category === 'bot' || !category ? 'theme' : category} botSubmission={category === 'bot'} onClose={() => setCreatorOpen(false)} onDone={() => { setCreatorOpen(false); reload() }} />}
      {botTarget && <div className="store-modal-backdrop" onMouseDown={() => setBotTarget(null)}><div className="store-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="store-modal-close" onClick={() => setBotTarget(null)}>×</button><span className="store-kicker">INSTALAR {botTarget.name.toUpperCase()}</span><h2>Onde ele vai morar?</h2>
        <p>Escolha um grupo do Messenger ou servidor do Play que você administra.</p>{error && <div className="store-error">{error}</div>}<div className="store-targets">
          {targets.map((target) => <button key={`${target.type}:${target.id}`} disabled={busyId === target.id} onClick={() => installBot(target)}><b>{target.name}</b><span>{target.type === 'play' ? 'Thoth Play' : 'Grupo do Messenger'}</span></button>)}
          {!targets.length && <div className="store-empty">Você precisa administrar um grupo ou servidor para instalar este bot.</div>}
        </div></div></div>}
    </div>
  )
}

function StoreCard({ item, installed, busy, active, onToggle, onPreview }: { item: StoreItem; installed: boolean; busy: boolean; active: boolean; onToggle: () => void; onPreview: () => void }) {
  const previewStyle = item.kind === 'theme' ? {
    background: `linear-gradient(145deg, ${item.manifest.background || '#08131c'}, ${item.manifest.surface || '#172936'})`,
    color: String(item.manifest.text || '#fff'), '--card-accent': item.manifest.accent || '#22d3ee',
  } as CSSProperties : undefined
  return <article className="store-card">
    <div className={`store-preview ${item.kind}`} style={previewStyle}>
      {item.preview_url || item.asset_url ? <img src={item.preview_url || item.asset_url || ''} alt="" /> : item.kind === 'theme' ? <div className="theme-mini"><i /><i /><i /></div> : <span className="store-preview-glyph">{item.kind === 'sound' ? '♫' : item.kind === 'wink' ? '✦' : item.kind === 'emoji' ? '☺' : '▣'}</span>}
    </div>
    <div className="store-card-body"><span className="store-kind">{kindNames[item.kind]}</span><h3>{item.name}</h3><p>{item.description || 'Uma criação da comunidade Thoth.'}</p>
      <div className="store-author">{item.creator?.avatar_url ? <img src={item.creator.avatar_url} alt="" /> : <i /> }<span>por {item.creator?.display_name || item.creator?.username || 'comunidade'}</span></div>
      <div className="store-card-actions"><button className="secondary" disabled={busy || active} onClick={onToggle}>{installed ? 'Remover' : 'Baixar'}</button>{(item.kind === 'theme' || item.kind === 'sound') && <button onClick={onPreview}>{item.kind === 'sound' ? 'Ouvir prévia' : 'Ver prévia'}</button>}</div>
      <small>{item.installs_count} instalações · {item.likes_count} curtidas</small>
    </div></article>
}

function CreatorModal({ me, initialKind, botSubmission, onClose, onDone }: { me: Profile; initialKind: StoreKind; botSubmission: boolean; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<StoreKind>(initialKind)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [soundFile, setSoundFile] = useState<File | null>(null)
  const [soundType, setSoundType] = useState<'message' | 'nudge'>('message')
  const [colors, setColors] = useState({ primary: '#0b1720', accent: '#22d3ee', background: '#071017', surface: '#122531', text: '#f4fbff', muted: '#b4c3cc', incoming: '#173746', outgoing: '#164e63' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const accepts = kind === 'sound' ? 'audio/*' : 'image/png,image/jpeg,image/webp,image/gif'
  const needsFile = kind !== 'theme'
  const help = useMemo(() => botSubmission ? 'Bots executam ações, então a publicação passa por revisão antes de entrar no catálogo.' : 'Você escolhe o nome; seu perfil aparece como autor em todos os aparelhos.', [botSubmission])

  async function submit() {
    if (!name.trim() || (needsFile && !file)) { setError('Dê um nome e escolha o arquivo do item.'); return }
    setBusy(true); setError('')
    try {
      if (botSubmission) {
        const { error: submissionError } = await supabase.from('store_bot_submissions').insert({ creator_id: me.id, name: name.trim(), description: description.trim(), manifest: {} })
        if (submissionError) throw submissionError
        onDone(); return
      }
      const assetUrl = file ? await uploadStoreAsset(me.id, file) : null
      const manifest: StoreManifest = kind === 'theme' ? { ...colors } : kind === 'sound' ? { soundType } : {}
      if (kind === 'theme' && assetUrl) manifest.railImage = assetUrl
      if (kind === 'wink' && soundFile) manifest.soundUrl = await uploadStoreAsset(me.id, soundFile)
      await publishStoreItem({ kind, name: name.trim(), description: description.trim(), creator_id: me.id, manifest, asset_url: assetUrl, preview_url: kind === 'sound' ? null : assetUrl })
      onDone()
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="store-modal-backdrop" onMouseDown={onClose}><div className="store-modal" onMouseDown={(event) => event.stopPropagation()}>
    <button className="store-modal-close" onClick={onClose}>×</button><span className="store-kicker">ESTÚDIO DA COMUNIDADE</span><h2>{botSubmission ? 'Enviar bot para análise' : `Criar ${kindNames[kind]}`}</h2><p>{help}</p>
    {!botSubmission && <label>Categoria<select value={kind} onChange={(event) => setKind(event.target.value as StoreKind)}>{Object.entries(kindNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
    <label>Nome da criação<input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Noite em Neo Thoth" /></label>
    <label>Descrição<textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Conte a ideia e o que torna isso especial" /></label>
    {!botSubmission && kind === 'theme' && <><p className="store-color-help">Essas cores controlam áreas gerais do app; os temas oficiais ainda podem ter detalhes próprios.</p><div className="store-color-grid">{Object.entries(colors).map(([key, value]) => <label key={key}>{({ primary: 'Cor principal', accent: 'Destaque e botões', background: 'Fundo', surface: 'Painéis', text: 'Texto principal', muted: 'Texto secundário', incoming: 'Mensagem recebida', outgoing: 'Mensagem enviada' } as Record<string, string>)[key]}<input type="color" value={value} onChange={(event) => setColors((old) => ({ ...old, [key]: event.target.value }))} /></label>)}</div></>}
    {!botSubmission && kind === 'sound' && <label>Usar para<select value={soundType} onChange={(event) => setSoundType(event.target.value as 'message' | 'nudge')}><option value="message">Nova mensagem</option><option value="nudge">Chamar atenção</option></select></label>}
    {!botSubmission && (needsFile || kind === 'theme') && <label>{kind === 'theme' ? 'Imagem da barra/fundo (opcional)' : 'Arquivo'}<input type="file" accept={accepts} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>}
    {!botSubmission && kind === 'wink' && <label>Som do wink (opcional)<input type="file" accept="audio/*" onChange={(event) => setSoundFile(event.target.files?.[0] || null)} /></label>}
    {error && <div className="store-error">{error}</div>}<button className="store-publish" disabled={busy} onClick={submit}>{busy ? 'Publicando…' : botSubmission ? 'Enviar para análise' : 'Publicar na loja'}</button>
  </div></div>
}
