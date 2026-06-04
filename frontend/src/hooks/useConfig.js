import { useState, useEffect } from 'react'

const DEFAULTS = { idleMs: 120_000, intervalMs: 8_000 }

export function useConfig() {
  const [config, setConfig] = useState(DEFAULTS)

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => setConfig({
        idleMs: (data.slideshow_idle_seconds ?? 120) * 1000,
        intervalMs: (data.slideshow_interval_seconds ?? 8) * 1000,
      }))
      .catch(() => {})  // keep defaults on error
  }, [])

  return config
}
