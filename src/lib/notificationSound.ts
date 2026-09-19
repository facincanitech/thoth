let messageAudio: HTMLAudioElement | null = null

export function playMessageSound() {
  try {
    if (!messageAudio) messageAudio = new Audio(`${import.meta.env.BASE_URL}sounds/notify.mp3`)
    messageAudio.currentTime = 0
    messageAudio.play().catch(() => {})
  } catch {
    // autoplay policy / unsupported - fail silently
  }
}
