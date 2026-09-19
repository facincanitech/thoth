export type Profile = {
  id: string
  username: string
  email: string
  status?: string | null
  last_seen_at?: string | null
  display_name?: string | null
  avatar_url?: string | null
  is_idle?: boolean
  age?: number | null
  city?: string | null
  banner_color?: string | null
  banner_image_url?: string | null
  banner_image_position?: string | null
  app_bg_color?: string | null
  app_sidebar_color?: string | null
  app_button_color?: string | null
  app_card_color?: string | null
  app_incoming_color?: string | null
  app_outgoing_color?: string | null
  app_text_size?: 'small' | 'normal' | 'large' | null
  name_style_font?: string | null
  name_style_effect?: 'solid' | 'gradient' | 'neon' | 'prism' | null
  name_style_color?: string | null
}

export type Conversation = {
  id: string
  type: 'dm' | 'group'
  name: string | null
  description?: string | null
  image_url?: string | null
  invite_permission?: 'all' | 'owner'
  invite_code?: string | null
  invite_requires_approval?: boolean
  is_public?: boolean
  created_by: string
  created_at: string
}

export type Message = {
  id: string
  conversation_id: string
  author_id: string
  content: string
  created_at: string
  kind: 'text' | 'system' | 'ephemeral' | 'contact' | 'sticker' | 'gif' | 'sonor_picker'
  reply_to_id: string | null
}

export type TypingPayload = {
  userId: string
  text: string
}

export type PanelView = 'root' | 'contact' | 'group' | 'friends'

export type ContactCategory = {
  id: string
  user_id: string
  name: string
  position: number
  created_at: string
}

export type PlayGroup = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  is_closed: boolean
  tags: string[]
  invite_code: string
  created_by: string
  created_at: string
}

export type PlayProfile = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  status: string | null
  name_style_font: string | null
  name_style_effect: 'solid' | 'gradient' | 'neon' | 'prism' | null
  name_style_color: string | null
  updated_at: string
}

export type PlayGroupMember = {
  group_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

export type PlayCategory = {
  id: string
  group_id: string
  name: string
  position: number
  created_at: string
}

export type PlayChannel = {
  id: string
  group_id: string
  category_id: string | null
  name: string
  kind: 'text' | 'voice'
  position: number
  created_at: string
}

export type PlayMessage = {
  id: string
  channel_id: string
  author_id: string
  content: string
  created_at: string
}

export type Bot = {
  id: string
  slug: string
  name: string
  description: string
  command_prefix: string
  external_api_ready: boolean
}

export type GroupBot = {
  conversation_id: string
  bot_id: string
  permission: 'all' | 'admin'
  installed_by: string
  installed_at: string
}

export type SonorSession = {
  conversation_id: string
  title: string
  stream_url: string
  is_hls: boolean
  started_by: string
  started_at: string
}

export type StatusPost = {
  id: string
  user_id: string
  kind: 'image' | 'video' | 'text'
  media_path: string | null
  text_content: string | null
  bg_color: string | null
  text_color: string | null
  font: string | null
  created_at: string
}

export type Community = {
  id: string
  name: string
  description: string | null
  category: string | null
  image_url: string | null
  image_position?: string | null
  language: string | null
  is_private: boolean
  invite_code?: string | null
  created_by: string
  created_at: string
}
