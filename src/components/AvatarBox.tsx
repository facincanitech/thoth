import { useEffect, useState } from 'react'
import { colorFromId } from '../lib/avatarColor'

type Props = {
  src: string | null | undefined
  id: string
  fallbackLetter: string
  className?: string
  style?: React.CSSProperties
  lazy?: boolean
}

export function AvatarBox({ src, id, fallbackLetter, className, style, lazy }: Props) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const showImage = !!src && !failed

  return (
    <div className={className} style={showImage ? style : { ...style, background: colorFromId(id), color: '#fff' }}>
      {showImage ? <img src={src!} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" onError={() => setFailed(true)} /> : fallbackLetter}
    </div>
  )
}
