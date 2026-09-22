import { supabase } from './supabase'
import type { Bot, PlayBotButton, PlayCategory, PlayChannel } from '../types'

function panelForBot(bot: Pick<Bot, 'slug'>) {
  if (bot.slug === 'sonor') return {
    category: 'SONOR', channel: 'painel', title: 'Painel de Rádio',
    description: 'Toca rádio de verdade no servidor. Use os botões abaixo.',
    buttons: [
      { id: 'play', label: 'Tocar', action: 'sonor_play' },
      { id: 'random', label: 'Aleatória', action: 'sonor_random' },
      { id: 'stop', label: 'Parar', action: 'sonor_stop' },
      { id: 'save', label: 'Salvar atual', action: 'sonor_save' },
      { id: 'favs', label: 'Favoritos', action: 'sonor_favs' },
    ] as PlayBotButton[],
  }
  if (bot.slug === 'zelador') return {
    category: 'ZELADOR', channel: 'comandos', title: 'Painel do Zelador',
    description: 'Dados e sorteios pro servidor. Use os botões abaixo.',
    buttons: [
      { id: 'd6', label: 'Dado d6', action: 'zelador_d6' },
      { id: 'd20', label: 'Dado d20', action: 'zelador_d20' },
      { id: 'd100', label: 'Dado d100', action: 'zelador_d100' },
      { id: 'draw', label: 'Sorteio', action: 'zelador_draw' },
    ] as PlayBotButton[],
  }
  return null
}

// Mesmo fluxo para instalação pela Loja e pelas configurações do servidor.
export async function ensurePlayBotPanel(groupId: string, bot: Pick<Bot, 'id' | 'slug'>): Promise<void> {
  const panel = panelForBot(bot)
  if (!panel) return

  const { data: categories, error: categoryReadError } = await supabase.from('play_categories')
    .select('id,name').eq('group_id', groupId)
  if (categoryReadError) throw categoryReadError
  let category = (categories || []).find((entry) => entry.name.toUpperCase() === panel.category) as PlayCategory | undefined
  if (!category) {
    const { data, error } = await supabase.from('play_categories')
      .insert({ group_id: groupId, name: panel.category, position: (categories || []).length }).select().single()
    if (error) throw error
    category = data as PlayCategory
  }

  const { data: channels, error: channelReadError } = await supabase.from('play_channels')
    .select('id,name,category_id').eq('group_id', groupId).eq('category_id', category.id)
  if (channelReadError) throw channelReadError
  let channel = (channels || []).find((entry) => entry.name === panel.channel) as PlayChannel | undefined
  if (!channel) {
    const { data, error } = await supabase.from('play_channels')
      .insert({ group_id: groupId, name: panel.channel, kind: 'text', category_id: category.id, position: 0 }).select().single()
    if (error) throw error
    channel = data as PlayChannel
  }
  const { data: existing, error: panelReadError } = await supabase.from('play_messages')
    .select('id').eq('channel_id', channel.id).eq('author_id', bot.id).eq('kind', 'bot_panel').limit(1)
  if (panelReadError) throw panelReadError
  if (existing?.length) return
  const { error: postError } = await supabase.rpc('post_play_bot_message', {
    p_channel_id: channel.id, p_bot_slug: bot.slug,
    p_content: JSON.stringify({ title: panel.title, description: panel.description }),
    p_components: panel.buttons, p_kind: 'bot_panel',
  })
  if (postError) throw postError
}
