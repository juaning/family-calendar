import { useState, useEffect, useCallback } from 'react'

export function useChores() {
  const [chores, setChores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchChores = useCallback(async () => {
    try {
      const res = await fetch('/api/chores')
      if (!res.ok) throw new Error(`/api/chores ${res.status}`)
      setChores(await res.json())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChores()
  }, [fetchChores])

  return { chores, loading, error, refetch: fetchChores }
}
