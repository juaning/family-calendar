import { useState, useEffect, useCallback } from 'react'

const REFRESH_MS = 5 * 60 * 1000  // 5 minutes — independent of photo advance interval

export function usePhotos() {
  const [photos, setPhotos] = useState([])

  const load = useCallback(() => {
    fetch('/api/photos')
      .then(r => r.json())
      .then(data => setPhotos(Array.isArray(data) ? data : []))
      .catch(() => setPhotos([]))
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  return { photos }
}
