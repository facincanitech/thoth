type IconProps = { size?: number }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconChat({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 5h16v11H9l-5 4V5z" />
    </svg>
  )
}

export function IconPlus({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function IconGroup({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
      <path d="M15 14.5c2.8.3 4.5 2 4.5 5.5" />
    </svg>
  )
}

export function IconStar({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2" />
    </svg>
  )
}

export function IconCrown({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z" />
      <line x1="5" y1="21" x2="19" y2="21" />
    </svg>
  )
}

export function IconEdit({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
      <path d="M14 6l3 3" />
    </svg>
  )
}

export function IconSearch({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function IconUser({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  )
}

export function IconHeart({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 20s-7-4.4-9.5-9C.8 7.8 2.4 4 6 4c2 0 3.3 1 4 2.3C10.7 5 12 4 14 4c3.6 0 5.2 3.8 3.5 7-2.5 4.6-9.5 9-9.5 9z" />
    </svg>
  )
}

export function IconSend({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <line x1="21" y1="3" x2="10" y2="14" />
      <polygon points="21 3 14 21 10 14 3 10 21 3" />
    </svg>
  )
}

export function IconAttach({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M17 7.5 9 15.5a3 3 0 1 0 4.2 4.2l8-8a5 5 0 1 0-7-7l-8 8" />
    </svg>
  )
}

export function IconSmile({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 13.5c1 1.3 2.3 2 4 2s3-.7 4-2" />
      <line x1="9" y1="9.5" x2="9" y2="9.5" />
      <line x1="15" y1="9.5" x2="15" y2="9.5" />
    </svg>
  )
}

export function IconHash({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <line x1="9" y1="4" x2="7" y2="20" />
      <line x1="17" y1="4" x2="15" y2="20" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="3" y1="15" x2="19" y2="15" />
    </svg>
  )
}

export function IconArrowLeft({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

export function IconCheck({ size = 14 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function IconCheckDouble({ size = 18 }: IconProps) {
  return (
    <svg {...base} viewBox="0 0 30 24" width={size * 1.4} height={size}>
      <polyline points="16 6 8 17 3 12" />
      <polyline points="27 6 15.5 20" />
    </svg>
  )
}

export function IconMore({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}

export function IconGrip({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  )
}

export function IconArchive({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}

export function IconPinOff({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <line x1="3" y1="3" x2="21" y2="21" />
      <path d="M9 4h6l-1 6 3 3v2H6v-2l3-3z" />
      <line x1="12" y1="15" x2="12" y2="21" />
    </svg>
  )
}

export function IconMailUnread({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}

export function IconListPlus({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <line x1="3" y1="6" x2="14" y2="6" />
      <line x1="3" y1="12" x2="14" y2="12" />
      <line x1="3" y1="18" x2="10" y2="18" />
      <line x1="18" y1="14" x2="18" y2="20" />
      <line x1="15" y1="17" x2="21" y2="17" />
    </svg>
  )
}

export function IconMinusCircle({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

export function IconTrash({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <polyline points="4 7 20 7" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
      <path d="M9 7V4h6v3" />
    </svg>
  )
}

export function IconBellOff({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 10a6 6 0 0 1 10-4.4M18 10c0 5 2 6 2 6H8" />
      <path d="M4 4l16 16" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconLogout({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export function IconKey({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9" />
      <path d="M16 7l3 3" />
      <path d="M19 4l3 3" />
    </svg>
  )
}

export function IconLock({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function IconLockOpen({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2.5" />
    </svg>
  )
}

export function IconCopy({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

export function IconMic({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

export function IconPhone({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2C9.5 21 3 14.5 3 6a2 2 0 0 1 1-2z" />
    </svg>
  )
}

export function IconPhoneOff({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2C9.5 21 3 14.5 3 6a2 2 0 0 1 1-2z" />
      <line x1="3" y1="21" x2="21" y2="3" />
    </svg>
  )
}

export function IconVideo({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
    </svg>
  )
}

export function IconVideoOff({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M16 10l5-3v10l-5-3" />
      <path d="M2 8v8a2 2 0 0 0 2 2h9" />
      <path d="M13.5 6H4a2 2 0 0 0-2 2" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export function IconMicOff({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M9 9V5a3 3 0 0 1 6 0v4" />
      <path d="M15 10v.5a3 3 0 0 1-4.7 2.5" />
      <path d="M5 10a7 7 0 0 0 10.5 6" />
      <path d="M12 19v3" />
      <line x1="8" y1="22" x2="16" y2="22" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export function IconDownload({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 3v12" />
      <polyline points="7 10 12 15 17 10" />
      <path d="M4 19h16" />
    </svg>
  )
}

export function IconChevronDown({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function IconPaint({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 2a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 1.06-2.56 1.5 1.5 0 0 1 1.06-2.56H17a3 3 0 0 0 3-3 8 8 0 0 0-8-9z" />
      <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBell({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconNudge({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M7 10a5 5 0 1 1 10 0c0 4.2 1.6 5 1.6 5H5.4s1.6-.8 1.6-5z" />
      <path d="M10.5 18a1.5 1.5 0 0 0 3 0" />
      <path d="M18 7q3 3 0 6" />
      <path d="M20 4q6 6 0 12" />
      <path d="M6 7q-3 3 0 6" />
      <path d="M4 4q-6 6 0 12" />
    </svg>
  )
}

export function IconCameraFlip({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 8a8 8 0 0 1 13.5-4.5L20 6" />
      <path d="M20 6V2m0 4h-4" />
      <path d="M20 16a8 8 0 0 1-13.5 4.5L4 18" />
      <path d="M4 18v4m0-4h4" />
    </svg>
  )
}

export function IconVolume({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  )
}

export function IconVolumeOff({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <line x1="16" y1="9" x2="21" y2="14" />
      <line x1="21" y1="9" x2="16" y2="14" />
    </svg>
  )
}

export function IconStatus({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="9" strokeDasharray="6 4" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconPanelLeft({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  )
}

export function IconGamepad({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="2" y="7" width="20" height="11" rx="5.5" />
      <line x1="7" y1="10" x2="7" y2="14" />
      <line x1="5" y1="12" x2="9" y2="12" />
      <circle cx="15" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconMonitorShare({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M9 13l3-3 3 3" />
      <line x1="12" y1="10" x2="12" y2="15" />
    </svg>
  )
}
