import { useState, useEffect, useRef, useCallback } from 'react'

export function useIdle(idleMs) {
  const [isIdle, setIsIdle] = useState(false)
  const timer = useRef(null)

  const reset = useCallback(() => {
    setIsIdle(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setIsIdle(true), idleMs)
  }, [idleMs])

  useEffect(() => {
    const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown']
    events.forEach(e => document.addEventListener(e, reset, { passive: true }))
    reset()  // start the timer immediately
    return () => {
      events.forEach(e => document.removeEventListener(e, reset))
      clearTimeout(timer.current)
    }
  }, [reset])

  return { isIdle, resetIdle: reset }
}
