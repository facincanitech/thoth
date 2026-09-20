export function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10)
}

const BASE_URL = 'https://facincanitech.github.io/thoth/'

export function inviteUrl(code: string): string {
  return `${BASE_URL}?invite=${code}`
}
