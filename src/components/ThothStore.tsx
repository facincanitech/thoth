import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/errors'
import {
  activateStoreItem, installStoreItem, loadInstalledIds, loadStoreItems, publishStoreItem,
  uninstallStoreItem, uploadStoreAsset, type StoreItem, type StoreKind, type StoreManifest,
} from '../lib/store'

type Category = StoreKind | 'bot' | 'mine'
type Bot = { id: string; slug: string; name: string; description: string; command_prefix: string }
type Target = { id: string; name: string; type: 'messenger' | 'play' }

const categories: { id: Category; label: string; glyph: string }[] = [
  { id: 'theme', label: 'Temas', glyph: '◈' },
  { id: 'sound', label: 'Sons', glyph: '♫' },
  { id: 'wink', label: 'Winks', glyph: '✦' },
  { id: 'sticker', label: 'Stickers', glyph: '▣' },
  { id: 'emoji', label: 'Emojis', glyph: '☺' },
  { id: 'bot', label: 'Bots', glyph: '⚙' },
  { id: 'mine', label: 'Meus itens', glyph: '★' },
]

const kindNames: Record<StoreKind, string> = { theme: 'tema', sound: 'som', wink: 'wink', sticker: 'sticker', emoji: 'emoji' }

export function ThothStore({ me }: { me: Profile }) {
  const [category, setCategory] = useState<Category>('theme')
  const [items, setItems] = useState<StoreItem[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [botTarget, setBotTarget] = useState<Bot | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (category === 'bot') {
        const { data, error: botError } = await supabase.from('bots').select('*').order('name')
        if (botError) throw botError
        setBots((data || []) as Bot[])
      } else {
        const [catalog, library] = await Promise.all([
          loadStoreItems(category === 'mine' ? undefined : category), loadInstalledIds(me.id),
        ])
        setInstalled(library)
        setItems(category === 'mine' ? catalog.filter((item) => library.has(item.id) || item.creator_id === me.id) : catalog)
      }
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setLoading(false) }
  }, [category, me.id])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    const channel = supabase.channel(`store:${me.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_items' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_installs', filter: `user_id=eq.${me.id}` }, reload)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me.id, reload])

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
      setBotTarget(null)
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusyId(null) }
  }

  const title = categories.find((entry) => entry.id === category)?.label || 'Loja'
  const canCreate = category !== 'mine'

  return (
    <div className="thoth-store">
      <div className="store-hero">
        <div><span className="store-kicker">LOJA THOTH</span><h2>{title}</h2><p>Feito pela comunidade. Seu acervo acompanha sua conta.</p></div>
        {canCreate && <button className="store-create" type="button" onClick={() => setCreatorOpen(true)}>＋ Criar</button>}
      </div>
      <div className="store-tabs">
        {categories.map((entry) => <button key={entry.id} className={category === entry.id ? 'active' : ''} onClick={() => setCategory(entry.id)}><b>{entry.glyph}</b><span>{entry.label}</span></button>)}
      </div>
      {error && <div className="store-error">{error}</div>}
      {loading ? <div className="store-empty">Abrindo o acervo…</div> : category === 'bot' ? (
        <div className="store-grid">{bots.map((bot) => <article className="store-card bot" key={bot.id}>
          <div className="store-preview store-bot-preview"><span>⚙</span><small>{bot.command_prefix}</small></div>
          <div className="store-card-body"><span className="store-kind">BOT</span><h3>{bot.name}</h3><p>{bot.description}</p><div className="store-author">Thoth Bots</div>
            <button onClick={() => chooseBot(bot)}>Adicionar ao grupo ou Play</button></div>
        </article>)}</div>
      ) : items.length ? (
        <div className="store-grid">{items.map((item) => <StoreCard key={item.id} item={item} installed={installed.has(item.id)} busy={busyId === item.id} onToggle={() => toggleInstall(item)} onUse={() => activateItem(item)} />)}</div>
      ) : <div className="store-empty">Ainda não há nada nesta prateleira. Seja a primeira pessoa a publicar.</div>}
      {creatorOpen && <CreatorModal me={me} initialKind={category === 'bot' || category === 'mine' ? 'theme' : category} botSubmission={category === 'bot'} onClose={() => setCreatorOpen(false)} onDone={() => { setCreatorOpen(false); reload() }} />}
      {botTarget && <div className="store-modal-backdrop" onMouseDown={() => setBotTarget(null)}><div className="store-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="store-modal-close" onClick={() => setBotTarget(null)}>×</button><span className="store-kicker">INSTALAR {botTarget.name.toUpperCase()}</span><h2>Onde ele vai morar?</h2>
        <p>Escolha um grupo do Messenger ou servidor do Play que você administra.</p><div className="store-targets">
          {targets.map((target) => <button key={`${target.type}:${target.id}`} disabled={busyId === target.id} onClick={() => installBot(target)}><b>{target.name}</b><span>{target.type === 'play' ? 'Thoth Play' : 'Grupo do Messenger'}</span></button>)}
          {!targets.length && <div className="store-empty">Você precisa administrar um grupo ou servidor para instalar este bot.</div>}
        </div></div></div>}
    </div>
  )
}

function StoreCard({ item, installed, busy, onToggle, onUse }: { item: StoreItem; installed: boolean; busy: boolean; onToggle: () => void; onUse: () => void }) {
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
      <div className="store-card-actions"><button className="secondary" disabled={busy} onClick={onToggle}>{installed ? 'Remover' : 'Baixar'}</button>{(item.kind === 'theme' || item.kind === 'sound') && <button disabled={busy} onClick={onUse}>Usar</button>}</div>
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
  const [colors, setColors] = useState({ primary: '#0b1720', accent: '#22d3ee', background: '#071017', surface: '#122531', text: '#f4fbff', incoming: '#173746', outgoing: '#164e63' })
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
    {!botSubmission && kind === 'theme' && <div className="store-color-grid">{Object.entries(colors).map(([key, value]) => <label key={key}>{key}<input type="color" value={value} onChange={(event) => setColors((old) => ({ ...old, [key]: event.target.value }))} /></label>)}</div>}
    {!botSubmission && kind === 'sound' && <label>Usar para<select value={soundType} onChange={(event) => setSoundType(event.target.value as 'message' | 'nudge')}><option value="message">Nova mensagem</option><option value="nudge">Chamar atenção</option></select></label>}
    {!botSubmission && (needsFile || kind === 'theme') && <label>{kind === 'theme' ? 'Imagem da barra/fundo (opcional)' : 'Arquivo'}<input type="file" accept={accepts} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>}
    {!botSubmission && kind === 'wink' && <label>Som do wink (opcional)<input type="file" accept="audio/*" onChange={(event) => setSoundFile(event.target.files?.[0] || null)} /></label>}
    {error && <div className="store-error">{error}</div>}<button className="store-publish" disabled={busy} onClick={submit}>{busy ? 'Publicando…' : botSubmission ? 'Enviar para análise' : 'Publicar na loja'}</button>
  </div></div>
}
