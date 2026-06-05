import { useState, useEffect, useRef, useCallback } from 'react'

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function fmt(date) {
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const day  = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  return { time, day }
}

function PhotoCrossfade({ photos, intervalMs }) {
  const [current, setCurrent] = useState(0)
  const [next, setNext]       = useState(1 % photos.length)
  const [showNext, setShowNext] = useState(false)
  const tickRef = useRef(null)

  const advance = useCallback(() => {
    const nextIdx = (current + 1) % photos.length
    setNext(nextIdx)
    setShowNext(false)
  }, [current, photos.length])

  const onSettled = useCallback(() => {
    // called by onLoad or onError on the next img — swap and schedule
    setShowNext(true)
    tickRef.current = setTimeout(() => {
      setCurrent(c => (c + 1) % photos.length)
      setShowNext(false)
    }, intervalMs)
  }, [intervalMs, photos.length])

  useEffect(() => {
    if (photos.length > 0) {
      setCurrent(c => c % photos.length)
      setNext(n => (n % photos.length) || 0)
    }
  }, [photos.length])

  useEffect(() => {
    if (photos.length < 2) return
    tickRef.current = setTimeout(advance, intervalMs)
    return () => clearTimeout(tickRef.current)
  }, [current, photos.length, intervalMs, advance])

  useEffect(() => () => clearTimeout(tickRef.current), [])

  if (photos.length === 0) return null

  const imgStyle = {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    objectFit: 'cover',
  }

  return (
    <>
      <img
        src={photos[current]?.url}
        alt={`Photo ${current + 1} of ${photos.length}`}
        style={{ ...imgStyle, opacity: showNext ? 0 : 1, transition: `opacity var(--slideshow-photo-crossfade) ease`, zIndex: 0 }}
      />
      <img
        key={photos[next]?.id ?? photos[next]?.url}  /* force remount to reset load state */
        src={photos[next]?.url}
        alt={`Photo ${(next % photos.length) + 1} of ${photos.length}`}
        style={{ ...imgStyle, opacity: showNext ? 1 : 0, transition: `opacity var(--slideshow-photo-crossfade) ease`, zIndex: 0 }}
        onLoad={onSettled}
        onError={onSettled}
      />
    </>
  )
}

export default function Slideshow({ isIdle, onWake, photos = [], intervalMs = 8_000 }) {
  const now = useClock()
  const { time, day } = fmt(now)
  const hasPhotos = photos.length > 0

  return (
    <div
      onClick={onWake}
      onTouchStart={onWake}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        opacity: isIdle ? 1 : 0,
        pointerEvents: isIdle ? 'auto' : 'none',
        transition: `opacity var(--slideshow-fade-duration) ease`,
        background: hasPhotos ? 'transparent' : 'var(--slideshow-empty-bg)',
        overflow: 'hidden',
      }}
    >
      {/* photo layer */}
      {hasPhotos && <PhotoCrossfade photos={photos} intervalMs={intervalMs} />}

      {/* flat scrim */}
      {hasPhotos && (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--slideshow-overlay-bg)', zIndex: 1 }} />
      )}

      {/* clock + date */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          padding: '40px 60px',
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.35) 60%, transparent)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 'var(--slideshow-clock-size)',
            fontWeight: 'var(--slideshow-clock-weight)',
            letterSpacing: 'var(--slideshow-clock-tracking)',
            color: '#ffffff',
            textShadow: 'var(--slideshow-text-shadow)',
            fontFamily: 'var(--font-family)',
          }}>{time}</div>
          <div style={{
            fontSize: 'var(--slideshow-date-size)',
            fontWeight: 400,
            color: '#ffffff',
            opacity: 0.9,
            marginTop: 12,
            textShadow: 'var(--slideshow-text-shadow)',
            fontFamily: 'var(--font-family)',
          }}>{day}</div>
        </div>
      </div>

      {/* bottom gradient + hint */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '20%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.40), transparent)',
        zIndex: 2,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: 32,
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: 'var(--slideshow-hint-size)',
          color: '#ffffff',
          opacity: 0.7,
          textShadow: 'var(--slideshow-text-shadow)',
          fontFamily: 'var(--font-family)',
        }}>Tap anywhere to wake</span>
      </div>
    </div>
  )
}
