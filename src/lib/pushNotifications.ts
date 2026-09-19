import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase } from './supabase'

let currentConversationId: string | null = null
let callOverlayActive = false

export function setCurrentConversationId(id: string | null) {
  currentConversationId = id
}

export function setCallOverlayActive(active: boolean) {
  callOverlayActive = active
}

export async function clearAllNotifications() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {
    // plugin indisponivel - nao critico
  }
}

export async function registerPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) return

  const permStatus = await PushNotifications.checkPermissions()
  let granted = permStatus.receive === 'granted'
  if (!granted) {
    const req = await PushNotifications.requestPermissions()
    granted = req.receive === 'granted'
  }
  if (!granted) return

  await LocalNotifications.requestPermissions().catch(() => {})

  // Canal de notificacao no Android e imutavel depois de criado (o SO ignora
  // troca de som em canal ja existente) - id novo (_v2) pra quem ja tinha o
  // app instalado com o canal antigo (som padrao) realmente ganhar o som
  // customizado, em vez de continuar preso no canal velho pra sempre.
  await LocalNotifications.createChannel({
    id: 'flux_messages_v2',
    name: 'Mensagens do ThothChat',
    description: 'Mensagens, sininho e winks',
    importance: 5,
    visibility: 1,
    sound: 'notify.mp3',
    vibration: true,
    lights: true,
  }).catch(() => {})

  await LocalNotifications.createChannel({
    id: 'flux_calls',
    name: 'Chamadas do ThothChat',
    description: 'Chamadas de voz e vídeo',
    importance: 5,
    visibility: 1,
    sound: undefined,
    vibration: true,
    lights: true,
  }).catch(() => {})

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: 'MESSAGE_REPLY',
        actions: [{ id: 'reply', title: 'Responder', input: true }],
      },
    ],
  }).catch(() => {})

  await LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
    if (action.actionId !== 'reply') return
    const text = (action.inputValue || '').trim()
    const conversationId = (action.notification.extra as { conversationId?: string } | undefined)?.conversationId
    if (!text || !conversationId) return
    const { data: userData } = await supabase.auth.getUser()
    const authorId = userData?.user?.id
    if (!authorId) return
    await supabase.from('messages').insert({ conversation_id: conversationId, author_id: authorId, content: text, kind: 'text' })
  })

  await PushNotifications.addListener('registration', async (token) => {
    await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token: token.value, platform: 'android' }, { onConflict: 'user_id,token' })
  })

  await PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error', err)
  })

  // Quando o app ainda esta "vivo" (mesmo em segundo plano), o FCM entrega
  // direto pro codigo em vez de mostrar sozinho na bandeja - tem que mostrar na mao.
  await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
    const data = notification.data as { conversationId?: string; type?: string } | undefined
    const isCall = data?.type === 'call'
    if (isCall && callOverlayActive) return
    if (!isCall && data?.conversationId && data.conversationId === currentConversationId) return

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 1000000),
          title: notification.title || 'ThothChat',
          body: notification.body || '',
          channelId: isCall ? 'flux_calls' : 'flux_messages_v2',
          ...(!isCall && data?.conversationId
            ? { actionTypeId: 'MESSAGE_REPLY', extra: { conversationId: data.conversationId } }
            : {}),
        },
      ],
    }).catch(() => {})
  })

  await PushNotifications.register()
}
