import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { displayName } from '../lib/displayName'
import { uploadImage } from '../lib/uploadImage'
import { getErrorMessage } from '../lib/errors'
import { ReplayPlayer, type ReplayEvent } from './ReplayPlayer'
import { AvatarBox } from './AvatarBox'
import { IconArrowLeft, IconEdit, IconPanelLeft, IconSend, IconSmile, IconTrash, IconUser } from './icons'
import type { Community, Profile } from '../types'
import { generateInviteCode, inviteUrl } from '../lib/inviteLink'

const REACTION_EMOJIS = ['😀', '😂', '😍', '😭', '🔥', '👍', '🙏', '😡']
const CATEGORY_OPTIONS = ['Religioso', 'Filmes', 'Música', 'Entretenimento', 'Esportes', 'Tecnologia', 'Outros']
const REPLAY_WINDOW_MS = 20000

type PostAuthor = { username: string; display_name: string | null; avatar_url: string | null }

type Post = {
  id: string
  community_id: string
  author_id: string
  content: string | null
  image_url: string | null
  created_at: string
  edited_at: string | null
  events: ReplayEvent[] | null
}

type Comment = {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  edited_at: string | null
  events: ReplayEvent[] | null
}

type Reaction = { post_id: string; user_id: string; emoji: string }

type MemberProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  email: string
  is_editor: boolean
  joined_at: string
}

type Props = {
  me: Profile
  community: Community
  activeTab: 'home' | 'info' | 'members' | 'settings'
  onTabChange: (tab: 'home' | 'info' | 'members' | 'settings') => void
  onCommunityUpdate: (patch: Partial<Community>) => void
  onDeleted: () => void
  onBack: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

function recordEvent(bufferRef: React.MutableRefObject<ReplayEvent[]>, text: string) {
  const now = Date.now()
  bufferRef.current.push({ t: now, text })
  bufferRef.current = bufferRef.current.filter((e) => now - e.t <= REPLAY_WINDOW_MS)
}

export function CommunityView({ me, community, activeTab, onTabChange, onCommunityUpdate, onDeleted, onBack, sidebarCollapsed, onToggleSidebar }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [authors, setAuthors] = useState<Record<string, PostAuthor>>({})
  const [memberCount, setMemberCount] = useState(0)
  const [isMember, setIsMember] = useState(false)
  const [memberList, setMemberList] = useState<MemberProfile[]>([])
  const [draft, setDraft] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [imagePosDraft, setImagePosDraft] = useState('50% 50%')
  const imageDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const imagePreviewRef = useRef<HTMLDivElement>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [confirmDeleteCommunity, setConfirmDeleteCommunity] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [editCategory, setEditCategory] = useState('')
  const [editLanguage, setEditLanguage] = useState('')
  const [editIsPrivate, setEditIsPrivate] = useState(false)
  const [infoBusy, setInfoBusy] = useState(false)
  const [inviteLinkBusy, setInviteLinkBusy] = useState(false)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editPostDraft, setEditPostDraft] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentDraft, setEditCommentDraft] = useState('')
  const [replayFor, setReplayFor] = useState<{ events: ReplayEvent[] } | null>(null)

  const newPostEvents = useRef<ReplayEvent[]>([])
  const editPostEvents = useRef<ReplayEvent[]>([])
  const commentEventsRef = useRef<Record<string, ReplayEvent[]>>({})
  const editCommentEvents = useRef<ReplayEvent[]>([])

  const isOwner = community.created_by === me.id
  const myMembership = memberList.find((m) => m.id === me.id)
  const isManager = isOwner || !!myMembership?.is_editor

  async function load() {
    const { data: memberRows } = await supabase
      .from('community_members')
      .select('user_id, is_editor, joined_at')
      .eq('community_id', community.id)
    setMemberCount(memberRows?.length || 0)
    setIsMember(!!memberRows?.some((r) => r.user_id === me.id))

    const memberIds = (memberRows || []).map((r) => r.user_id as string)
    if (memberIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, email')
        .in('id', memberIds)
      const rowMap = new Map((memberRows || []).map((r) => [r.user_id as string, r]))
      setMemberList(
        ((memberProfiles as Omit<MemberProfile, 'is_editor' | 'joined_at'>[]) || []).map((p) => ({
          ...p,
          is_editor: !!rowMap.get(p.id)?.is_editor,
          joined_at: (rowMap.get(p.id)?.joined_at as string) || '',
        })),
      )
    } else {
      setMemberList([])
    }

    const { data: postRows } = await supabase
      .from('community_posts')
      .select('*')
      .eq('community_id', community.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    const loadedPosts = (postRows as Post[]) || []
    setPosts(loadedPosts)

    const postIds = loadedPosts.map((p) => p.id)
    if (postIds.length === 0) {
      setComments([])
      setReactions([])
      return
    }

    const [{ data: commentRows }, { data: reactionRows }] = await Promise.all([
      supabase.from('community_comments').select('*').in('post_id', postIds).is('deleted_at', null).order('created_at', { ascending: true }),
      supabase.from('community_reactions').select('*').in('post_id', postIds),
    ])
    setComments((commentRows as Comment[]) || [])
    setReactions((reactionRows as Reaction[]) || [])

    const authorIds = Array.from(
      new Set([
        ...loadedPosts.map((p) => p.author_id),
        ...((commentRows as Comment[]) || []).map((c) => c.author_id),
      ]),
    )
    if (authorIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', authorIds)
      const map: Record<string, PostAuthor> = {}
      for (const p of profileRows || []) {
        map[p.id] = { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }
      }
      setAuthors(map)
    }
  }

  useEffect(() => {
    load()
  }, [community.id])

  useEffect(() => {
    setEditName(community.name)
    setEditImageUrl(community.image_url || '')
    setImagePosDraft(community.image_position || '50% 50%')
    setEditCategory(community.category || '')
    setEditLanguage(community.language || '')
    setEditIsPrivate(community.is_private)
    setInfoError(null)
    setConfirmDeleteCommunity(false)
  }, [community.id, community.name, community.image_url, community.image_position, community.category, community.language, community.is_private])

  function authorLabel(id: string): string {
    const a = authors[id]
    return a ? displayName(a) : '...'
  }

  async function uploadCommunityImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'community')
      setEditImageUrl(url)
      setImagePosDraft('50% 50%')
      await supabase.from('communities').update({ image_url: url, image_position: '50% 50%' }).eq('id', community.id)
      onCommunityUpdate({ image_url: url, image_position: '50% 50%' })
    } catch (err) {
      setInfoError(getErrorMessage(err))
    } finally {
      setImageUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  function parseImagePos(pos: string): [number, number] {
    const [x, y] = pos.split(' ').map((p) => parseFloat(p))
    return [Number.isFinite(x) ? x : 50, Number.isFinite(y) ? y : 50]
  }

  function handleImagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!(editImageUrl || community.image_url)) return
    const [x, y] = parseImagePos(imagePosDraft)
    imageDragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: x, startPosY: y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleImagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = imageDragRef.current
    if (!drag || !imagePreviewRef.current) return
    const rect = imagePreviewRef.current.getBoundingClientRect()
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100
    const nextX = Math.min(100, Math.max(0, drag.startPosX + dxPct))
    const nextY = Math.min(100, Math.max(0, drag.startPosY + dyPct))
    setImagePosDraft(`${nextX.toFixed(0)}% ${nextY.toFixed(0)}%`)
  }

  async function handleImagePointerUp() {
    if (!imageDragRef.current) return
    imageDragRef.current = null
    await supabase.from('communities').update({ image_position: imagePosDraft }).eq('id', community.id)
    onCommunityUpdate({ image_position: imagePosDraft })
  }

  async function generateCommunityInviteLink() {
    setInviteLinkBusy(true)
    try {
      const code = generateInviteCode()
      const { error } = await supabase.from('communities').update({ invite_code: code }).eq('id', community.id)
      if (error) throw error
      onCommunityUpdate({ invite_code: code })
    } catch (err) {
      console.error('generateCommunityInviteLink failed', err)
    } finally {
      setInviteLinkBusy(false)
    }
  }

  async function copyInviteLink(code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code))
      setInviteLinkCopied(true)
      setTimeout(() => setInviteLinkCopied(false), 2000)
    } catch (err) {
      console.error('copyInviteLink failed', err)
    }
  }

  async function saveCommunityName() {
    const name = editName.trim()
    if (!name || name === community.name) return
    const { error } = await supabase.from('communities').update({ name }).eq('id', community.id)
    if (error) setInfoError(getErrorMessage(error))
    else onCommunityUpdate({ name })
  }

  async function saveCommunityCategory(value: string) {
    setEditCategory(value)
    const category = value.trim() || null
    const { error } = await supabase.from('communities').update({ category }).eq('id', community.id)
    if (error) setInfoError(getErrorMessage(error))
    else onCommunityUpdate({ category })
  }

  async function saveCommunityLanguage() {
    const language = editLanguage.trim() || null
    const { error } = await supabase.from('communities').update({ language }).eq('id', community.id)
    if (error) setInfoError(getErrorMessage(error))
    else onCommunityUpdate({ language })
  }

  async function saveCommunityPrivacy(value: boolean) {
    setEditIsPrivate(value)
    const { error } = await supabase.from('communities').update({ is_private: value }).eq('id', community.id)
    if (error) setInfoError(getErrorMessage(error))
    else onCommunityUpdate({ is_private: value })
  }

  async function deleteCommunity() {
    setInfoBusy(true)
    try {
      await supabase.from('communities').delete().eq('id', community.id)
      onDeleted()
    } finally {
      setInfoBusy(false)
    }
  }

  async function removeParticipant(userId: string) {
    await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', userId)
    setMemberList((prev) => prev.filter((m) => m.id !== userId))
    setMemberCount((n) => Math.max(0, n - 1))
    if (userId === me.id) setIsMember(false)
  }

  async function toggleEditor(userId: string, next: boolean) {
    await supabase.from('community_members').update({ is_editor: next }).eq('community_id', community.id).eq('user_id', userId)
    setMemberList((prev) => prev.map((m) => (m.id === userId ? { ...m, is_editor: next } : m)))
  }

  async function joinCommunity() {
    await supabase.from('community_members').insert({ community_id: community.id, user_id: me.id })
    setIsMember(true)
    setMemberCount((n) => n + 1)
  }

  async function leaveCommunity() {
    await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', me.id)
    setIsMember(false)
    setMemberCount((n) => Math.max(0, n - 1))
  }

  async function createPost() {
    const content = draft.trim()
    const img = imageUrl.trim()
    if (!content && !img) return
    setBusy(true)
    setError(null)
    try {
      const eventsToStore = newPostEvents.current.length > 1 ? newPostEvents.current : null
      const { data, error: err } = await supabase
        .from('community_posts')
        .insert({ community_id: community.id, author_id: me.id, content: content || null, image_url: img || null, events: eventsToStore })
        .select()
        .single()
      if (err) throw err
      setPosts((prev) => [data as Post, ...prev])
      setAuthors((prev) => (prev[me.id] ? prev : { ...prev, [me.id]: { username: me.username, display_name: me.display_name ?? null, avatar_url: me.avatar_url ?? null } }))
      setDraft('')
      setImageUrl('')
      newPostEvents.current = []
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function startEditPost(post: Post) {
    setEditingPostId(post.id)
    setEditPostDraft(post.content || '')
    editPostEvents.current = []
    recordEvent(editPostEvents, post.content || '')
  }

  async function saveEditPost(postId: string) {
    const content = editPostDraft.trim()
    if (!content) return
    const eventsToStore = editPostEvents.current.length > 1 ? editPostEvents.current : null
    const edited_at = new Date().toISOString()
    await supabase.from('community_posts').update({ content, events: eventsToStore, edited_at }).eq('id', postId)
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, content, events: eventsToStore, edited_at } : p)))
    setEditingPostId(null)
    setEditPostDraft('')
    editPostEvents.current = []
  }

  async function moderatePost(postId: string) {
    await supabase.from('community_posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId)
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  async function moderateComment(commentId: string) {
    await supabase.from('community_comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId)
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  async function react(postId: string, emoji: string) {
    setReactionPickerFor(null)
    const mine = reactions.find((r) => r.post_id === postId && r.user_id === me.id)
    if (mine && mine.emoji === emoji) {
      await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', me.id)
      setReactions((prev) => prev.filter((r) => !(r.post_id === postId && r.user_id === me.id)))
      return
    }
    await supabase.from('community_reactions').upsert({ post_id: postId, user_id: me.id, emoji })
    setReactions((prev) => [...prev.filter((r) => !(r.post_id === postId && r.user_id === me.id)), { post_id: postId, user_id: me.id, emoji }])
  }

  async function submitComment(postId: string) {
    const content = (commentDrafts[postId] || '').trim()
    if (!content) return
    const buf = commentEventsRef.current[postId] || []
    const eventsToStore = buf.length > 1 ? buf : null
    const { data, error: err } = await supabase
      .from('community_comments')
      .insert({ post_id: postId, author_id: me.id, content, events: eventsToStore })
      .select()
      .single()
    if (err) {
      setError(getErrorMessage(err))
      return
    }
    setComments((prev) => [...prev, data as Comment])
    setAuthors((prev) => (prev[me.id] ? prev : { ...prev, [me.id]: { username: me.username, display_name: me.display_name ?? null, avatar_url: me.avatar_url ?? null } }))
    setCommentDrafts((prev) => ({ ...prev, [postId]: '' }))
    commentEventsRef.current[postId] = []
  }

  function startEditComment(c: Comment) {
    setEditingCommentId(c.id)
    setEditCommentDraft(c.content)
    editCommentEvents.current = []
    recordEvent(editCommentEvents, c.content)
  }

  async function saveEditComment(commentId: string) {
    const content = editCommentDraft.trim()
    if (!content) return
    const eventsToStore = editCommentEvents.current.length > 1 ? editCommentEvents.current : null
    const edited_at = new Date().toISOString()
    await supabase.from('community_comments').update({ content, events: eventsToStore, edited_at }).eq('id', commentId)
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, content, events: eventsToStore, edited_at } : c)))
    setEditingCommentId(null)
    setEditCommentDraft('')
    editCommentEvents.current = []
  }

  function toggleExpanded(postId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  function reactionSummary(postId: string): { emoji: string; count: number }[] {
    const counts: Record<string, number> = {}
    for (const r of reactions) {
      if (r.post_id !== postId) continue
      counts[r.emoji] = (counts[r.emoji] || 0) + 1
    }
    return Object.entries(counts).map(([emoji, count]) => ({ emoji, count }))
  }

  return (
    <main className="main community-main">
      <header className="chat-header community-header">
        <button type="button" className="back-mobile icon-btn" aria-label="Voltar às comunidades" onClick={onBack}><IconArrowLeft size={20} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => onTabChange(activeTab === 'info' ? 'home' : 'info')}>
          {community.image_url ? (
            <div
              className="header-photo community-header-photo"
              style={{ backgroundImage: `url(${community.image_url})`, backgroundSize: 'cover', backgroundPosition: community.image_position || '50% 50%' }}
            />
          ) : (
            <AvatarBox
              src={null}
              id={community.id}
              fallbackLetter={community.name[0]?.toUpperCase() || 'C'}
              className="header-photo community-header-photo"
            />
          )}
          <div className="header-text">
            <div className="header-name">{community.name}</div>
            {community.description && <p className="community-header-description">{community.description}</p>}
            <div className="status community-header-meta">
              {memberCount} {memberCount === 1 ? 'participante' : 'participantes'}
              {community.category ? ` · ${community.category}` : ''}
            </div>
          </div>
        </div>
        <div className="header-actions">
          {onToggleSidebar && (
            <button
              type="button"
              className={`icon-btn sidebar-toggle${sidebarCollapsed ? ' active' : ''}`}
              aria-pressed={!!sidebarCollapsed}
              title={sidebarCollapsed ? 'Mostrar lista de conversas' : 'Esconder lista de conversas'}
              onClick={onToggleSidebar}
            >
              <IconPanelLeft size={20} />
            </button>
          )}
          <button type="button" className={`header-action-btn${isMember ? ' leave' : ''}`} onClick={isMember ? leaveCommunity : joinCommunity}>
            {isMember ? 'Sair' : 'Participar'}
          </button>
        </div>
      </header>

      <nav className="community-tabs" aria-label="Seções da comunidade">
        <button type="button" aria-pressed={activeTab === 'home'} onClick={() => onTabChange('home')}>Tópicos</button>
        <button type="button" aria-pressed={activeTab === 'info'} onClick={() => onTabChange('info')}>Informações</button>
        <button type="button" aria-pressed={activeTab === 'members'} onClick={() => onTabChange('members')}>Membros</button>
        <button type="button" aria-pressed={activeTab === 'settings'} onClick={() => onTabChange('settings')}>Configurações</button>
      </nav>

      {activeTab === 'home' && (
      <section className="messages community-feed">
        {isMember && (
          <div className="community-composer community-topic-composer">
            <textarea
              placeholder="Novo tópico..."
              value={draft}
              onChange={(e) => { setDraft(e.target.value); recordEvent(newPostEvents, e.target.value) }}
              rows={2}
            />
            <input
              placeholder="link de imagem (opcional)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <button type="button" disabled={busy} onClick={createPost}>Postar</button>
            {error && <span className="auth-error">{error}</span>}
          </div>
        )}
        {!isMember && <p className="community-description">Participe da comunidade pra postar e comentar.</p>}

        {posts.length === 0 && <div className="empty">Nenhum tópico ainda</div>}

        {posts.map((post) => {
          const postComments = comments.filter((c) => c.post_id === post.id)
          const isExpanded = expanded.has(post.id)
          const myReaction = reactions.find((r) => r.post_id === post.id && r.user_id === me.id)
          const authorMember = memberList.find((m) => m.id === post.author_id)
          return (
            <div key={post.id} className="community-post">
              <div className="community-post-header">
                <div className="option-icon post-avatar"><IconUser size={18} /></div>
                <div>
                  <div className="author-label" style={{ marginBottom: 0 }}>
                    {authorLabel(post.author_id)}
                    {authorMember?.is_editor && <IconEdit size={11} />}
                  </div>
                  <div className="status" style={{ marginTop: 0 }}>
                    {new Date(post.created_at).toLocaleString('pt-BR')}{post.edited_at ? ' (editado)' : ''}
                  </div>
                </div>
                {post.author_id === me.id && editingPostId !== post.id && (
                  <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => startEditPost(post)} title="Editar tópico">
                    <IconEdit size={16} />
                  </button>
                )}
                {post.author_id !== me.id && isManager && (
                  <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => moderatePost(post.id)} title="Remover tópico (moderação)">
                    <IconTrash size={16} />
                  </button>
                )}
              </div>

              {editingPostId === post.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    className="edit-message-input"
                    value={editPostDraft}
                    onChange={(e) => { setEditPostDraft(e.target.value); recordEvent(editPostEvents, e.target.value) }}
                    rows={2}
                    autoFocus
                  />
                  <button type="button" className="replay-btn" onClick={() => saveEditPost(post.id)}>salvar</button>
                  <button type="button" className="replay-btn" onClick={() => setEditingPostId(null)}>cancelar</button>
                </div>
              ) : (
                <>
                  {post.content && <p className="community-post-content">{post.content}</p>}
                  {post.image_url && <img src={post.image_url} alt="" className="community-post-image" />}
                </>
              )}

              <div className="community-post-actions">
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="replay-btn"
                    onClick={() => setReactionPickerFor((v) => (v === post.id ? null : post.id))}
                  >
                    <IconSmile size={14} /> {myReaction ? myReaction.emoji : 'reagir'}
                  </button>
                  {reactionPickerFor === post.id && (
                    <div className="emoji-picker" style={{ bottom: '110%' }}>
                      {REACTION_EMOJIS.map((e) => (
                        <button key={e} type="button" onClick={() => react(post.id, e)}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                {reactionSummary(post.id).map(({ emoji, count }) => (
                  <span key={emoji} className="reaction-pill">{emoji} {count}</span>
                ))}
                <button type="button" className="replay-btn" onClick={() => toggleExpanded(post.id)}>
                  {postComments.length} {postComments.length === 1 ? 'comentário' : 'comentários'}
                </button>
                {post.events && (
                  <button type="button" className="replay-btn" onClick={() => setReplayFor({ events: post.events! })}>replay</button>
                )}
              </div>

              {isExpanded && (
                <div className="community-comments">
                  {postComments.map((c) => {
                    const isMine = c.author_id === me.id
                    const commentAuthorMember = memberList.find((m) => m.id === c.author_id)
                    return (
                      <div key={c.id} className="community-comment">
                        <span className="author-label">
                          {authorLabel(c.author_id)}
                          {commentAuthorMember?.is_editor && <IconEdit size={10} />}
                        </span>
                        {editingCommentId === c.id ? (
                          <span style={{ display: 'flex', gap: 4, flex: 1 }}>
                            <input
                              className="edit-message-input"
                              style={{ margin: 0 }}
                              value={editCommentDraft}
                              onChange={(e) => { setEditCommentDraft(e.target.value); recordEvent(editCommentEvents, e.target.value) }}
                              autoFocus
                            />
                            <button type="button" className="replay-btn" onClick={() => saveEditComment(c.id)}>salvar</button>
                            <button type="button" className="replay-btn" onClick={() => setEditingCommentId(null)}>cancelar</button>
                          </span>
                        ) : (
                          <>
                            <span>{c.content}{c.edited_at ? ' (editado)' : ''}</span>
                            {isMine && (
                              <button type="button" className="icon-btn" onClick={() => startEditComment(c)} title="Editar comentário">
                                <IconEdit size={13} />
                              </button>
                            )}
                            {!isMine && isManager && (
                              <button type="button" className="icon-btn" onClick={() => moderateComment(c.id)} title="Remover comentário (moderação)">
                                <IconTrash size={13} />
                              </button>
                            )}
                            {c.events && (
                              <button type="button" className="replay-btn" onClick={() => setReplayFor({ events: c.events! })}>replay</button>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                  {isMember && (
                    <div className="community-comment-composer">
                      <input
                        placeholder="Comentar..."
                        value={commentDrafts[post.id] || ''}
                        onChange={(e) => {
                          setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                          const buf = commentEventsRef.current[post.id] || []
                          const now = Date.now()
                          buf.push({ t: now, text: e.target.value })
                          commentEventsRef.current[post.id] = buf.filter((ev) => now - ev.t <= REPLAY_WINDOW_MS)
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitComment(post.id) }}
                      />
                      <button type="button" onClick={() => submitComment(post.id)}><IconSend size={16} /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>
      )}

      {activeTab === 'info' && (
        <section className="messages community-feed community-page">
          <div className="community-info-box">
            <div className="community-section-heading">
              <h2>Informações gerais</h2>
              <p>A identidade e a história da comunidade.</p>
            </div>
            <div className="community-info-grid">
              <div><span>idioma</span><strong>{community.language || '—'}</strong></div>
              <div><span>criada em</span><strong>{new Date(community.created_at).toLocaleDateString('pt-BR')}</strong></div>
              <div><span>categoria</span><strong>{community.category || '—'}</strong></div>
              <div><span>dono</span><strong>{authorLabel(community.created_by)}</strong></div>
              <div><span>tipo</span><strong>{community.is_private ? 'particular' : 'pública'}</strong></div>
              <div><span>membros</span><strong>{memberCount}</strong></div>
            </div>
          </div>
          <div className="community-info-notice community-info-notice-yellow">
            <strong>{community.is_private ? 'Comunidade particular' : 'Comunidade pública'}</strong>
            <span>{community.is_private ? 'Só membros podem ver tópicos e comentários.' : 'Qualquer pessoa pode encontrar e participar.'}</span>
          </div>
        </section>
      )}

      {activeTab === 'members' && (
        <section className="messages community-feed community-page">
          <div className="community-members-box">
          <div className="community-section-heading">
            <h2>Membros</h2>
            <p>{memberCount} {memberCount === 1 ? 'participante' : 'participantes'} nesta comunidade.</p>
          </div>
          <div className="member-table community-member-page">
            {[...memberList]
              .sort((a, b) => {
                const rank = (m: MemberProfile) => (m.id === community.created_by ? 0 : m.is_editor ? 1 : 2)
                return rank(a) - rank(b)
              })
              .map((m) => (
              <div key={m.id} className="member-table-row">
                <div className="member-table-name">
                  {displayName(m)}
                  {(m.id === community.created_by || m.is_editor || m.id === me.id) && (
                    <span className="member-table-tags">
                      {[m.id === community.created_by ? 'dono' : m.is_editor ? 'editor' : null, m.id === me.id ? 'você' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </div>
                <div className="member-table-email">{m.email}</div>
                <div className="member-table-date">
                  {m.joined_at ? new Date(m.joined_at).toLocaleDateString('pt-BR') : '—'}
                </div>
                {isOwner && m.id !== community.created_by && (
                  <div className="member-table-actions">
                    <button type="button" onClick={() => toggleEditor(m.id, !m.is_editor)}>
                      {m.is_editor ? 'tirar mod' : 'mod'}
                    </button>
                    <button type="button" className="remove-btn" onClick={() => removeParticipant(m.id)}>remover</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          </div>
        </section>
      )}

      {activeTab === 'settings' && (
        <section className="messages community-feed community-settings">
          <div className="community-section-heading">
            <h2>Configurações</h2>
            <p>Imagem, detalhes, convite e privacidade da comunidade.</p>
          </div>
          {isManager ? (
          <>
          <div className="community-settings-box">
          <div className="settings-community-identity">
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={uploadCommunityImage} />
            <div
              ref={imagePreviewRef}
              className="group-info-avatar"
              onClick={() => !imageDragRef.current && isManager && !(editImageUrl || community.image_url) && imageInputRef.current?.click()}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onPointerLeave={handleImagePointerUp}
              style={{
                cursor: isManager ? ((editImageUrl || community.image_url) ? 'grab' : 'pointer') : 'default',
                touchAction: 'none',
                ...((editImageUrl || community.image_url)
                  ? { backgroundImage: `url(${editImageUrl || community.image_url})`, backgroundSize: 'cover', backgroundPosition: imagePosDraft }
                  : {}),
              }}
            >
              {!(editImageUrl || community.image_url) && (community.name[0] || 'C')}
            </div>
            {isManager && (editImageUrl || community.image_url) && (
              <button type="button" className="chevron-btn" onClick={() => imageInputRef.current?.click()} style={{ marginBottom: 8 }}>
                trocar foto
              </button>
            )}
            {imageUploading && <p className="status">enviando...</p>}
            <h2>{community.name}</h2>
            <p className="status">{community.is_private ? 'Comunidade particular' : 'Comunidade pública'} · {memberCount} membros</p>
          </div>
            <details className="settings-disclosure" open>
            <summary><IconEdit size={20} /> Detalhes da comunidade</summary>
            <div className="community-composer">
              <label>Nome</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={saveCommunityName} />
              <label style={{ marginTop: 8 }}>Categoria</label>
              <select value={editCategory} onChange={(e) => saveCommunityCategory(e.target.value)}>
                <option value="">categoria</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <label style={{ marginTop: 8 }}>Idioma</label>
              <input value={editLanguage} onChange={(e) => setEditLanguage(e.target.value)} onBlur={saveCommunityLanguage} placeholder="idioma" />
              <label style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={editIsPrivate} onChange={(e) => saveCommunityPrivacy(e.target.checked)} style={{ width: 'auto' }} />
                Comunidade particular (só membros veem tópicos e comentários)
              </label>
              <p className="status" style={{ margin: '4px 0 0' }}>
                criada em {new Date(community.created_at).toLocaleDateString('pt-BR')}
              </p>
              <details className="settings-disclosure settings-invite">
              <summary>Link de convite</summary>
              <div className="invite-link-box">
                {community.invite_code ? (
                  <>
                    <input type="text" readOnly value={inviteUrl(community.invite_code)} onClick={(e) => (e.target as HTMLInputElement).select()} />
                    <div className="invite-link-actions">
                      <button type="button" onClick={() => community.invite_code && copyInviteLink(community.invite_code)}>
                        {inviteLinkCopied ? 'copiado!' : 'copiar link'}
                      </button>
                      <button type="button" disabled={inviteLinkBusy} onClick={generateCommunityInviteLink}>gerar novo</button>
                    </div>
                    <span className="invite-code">quem tem esse link entra direto na comunidade</span>
                  </>
                ) : (
                  <button type="button" disabled={inviteLinkBusy} onClick={generateCommunityInviteLink}>
                    {inviteLinkBusy ? 'gerando...' : 'gerar link de convite'}
                  </button>
                )}
              </div>
              </details>
              {infoError && <span className="auth-error">{infoError}</span>}
              {isOwner && !confirmDeleteCommunity && (
                <button type="button" className="settings-danger-btn" onClick={() => setConfirmDeleteCommunity(true)}>
                  <IconTrash size={18} /> Excluir comunidade
                </button>
              )}
              {isOwner && confirmDeleteCommunity && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 5px' }}>
                  <button type="button" className="danger" disabled={infoBusy} onClick={deleteCommunity}>Confirmar exclusão</button>
                  <button type="button" disabled={infoBusy} onClick={() => setConfirmDeleteCommunity(false)}>cancelar</button>
                </div>
              )}
            </div>
            </details>
          </div>
          </>
          ) : (
            <div className="community-info-notice">
              <strong>Configurações restritas</strong>
              <span>Somente o dono e os editores podem alterar esta comunidade.</span>
            </div>
          )}
        </section>
      )}

      {replayFor && (
        <div className="modal-backdrop" onClick={() => setReplayFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>replay</h2>
            <ReplayPlayer events={replayFor.events} />
            <button type="button" className="modal-close" onClick={() => setReplayFor(null)}>fechar</button>
          </div>
        </div>
      )}
    </main>
  )
}
