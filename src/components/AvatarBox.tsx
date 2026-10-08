import { useEffect, useState } from 'react'
import { colorFromId } from '../lib/avatarColor'
import type { ProfileCosmetic } from '../types'

type Props = {
  src: string | null | undefined
  id: string
  fallbackLetter: string
  className?: string
  style?: React.CSSProperties
  lazy?: boolean
  frame?: ProfileCosmetic | null
}

export function AvatarBox({ src, id, fallbackLetter, className, style, lazy, frame }: Props) {
  const [failed, setFailed] = useState(false)
  const [frameFailed, setFrameFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    setFrameFailed(false)
  }, [frame?.asset_url])

  const showImage = !!src && !failed

  return (
    <div className={`${className || ''}${frame?.asset_url && !frameFailed ? ' avatar-has-frame' : ''}`} style={showImage ? style : { ...style, background: colorFromId(id), color: '#fff' }}>
      {showImage ? <img src={src!} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" onError={() => setFailed(true)} /> : fallbackLetter}
      {frame?.asset_url && !frameFailed && <img className="avatar-frame-decoration" src={frame.asset_url} alt="" aria-hidden="true" onError={() => setFrameFailed(true)} />}
    </div>
  )
}
