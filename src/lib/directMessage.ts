import { supabase } from './supabase'
import { isTauriDesktop } from './platform'

// Acha (ou cria) a conversa 1:1 entre duas pessoas e abre: janela de conversa no desktop, tela do chat no resto.
export async function findOrCreateDm(meId: string, otherId: string): Promise<string | null> {
  const { data: mine, error: mineErr } = await supabase
    .from('conversation_members')
    .select('conversation_id, conversation:conversations!inner(type)')
    .eq('user_id', meId)
    .eq('conversation.type', 'dm')
  if (mineErr) { console.error('find dm failed', mineErr); return null }
  const ids = (mine || []).map((r) => r.conversation_id as string)
  if (ids.length) {
    const { data: shared, error: sharedErr } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', otherId).in('conversation_id', ids).limit(1)
    if (sharedErr) { console.error('find dm failed', sharedErr); return null }
    if (shared && shared.length) return shared[0].conversation_id as string
  }
  const { data: conv, error: convErr } = await supabase.from('conversations').insert({ type: 'dm', created_by: meId }).select().single()
  if (convErr || !conv) { console.error('create dm failed', convErr); return null }
  const { error: membersErr } = await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: meId },
    { conversation_id: conv.id, user_id: otherId },
  ])
  if (membersErr) { console.error('create dm members failed', membersErr); return null }
  return conv.id as string
}

export async function openDirectMessage(meId: string, otherId: string, title: string): Promise<boolean> {
  const id = await findOrCreateDm(meId, otherId)
  if (!id) return false
  if (isTauriDesktop) {
    const { openChatWindow } = await import('./desktopWindows')
    await openChatWindow(id, title)
  } else {
    window.dispatchEvent(new CustomEvent('thoth-open-conversation', { detail: { id } }))
  }
  return true
}
