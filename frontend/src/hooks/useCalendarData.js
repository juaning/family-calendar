import { useState, useEffect, useCallback } from 'react'

const POLL_MS = 5 * 60 * 1000  // 5 minutes

function buildRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 4, 1).toISOString()
  return { start, end }
}

export function useCalendarData() {
  const [calendars, setCalendars] = useState([])
  const [events, setEvents] = useState([])
  // 'loading' | 'auth_required' | 'ok' | 'error'
  const [status, setStatus] = useState('loading')

  const fetchData = useCallback(async () => {
    const { start, end } = buildRange()
    try {
      const calRes = await fetch('/api/calendars')
      if (!calRes.ok) throw new Error(`/api/calendars ${calRes.status}`)
      const cals = await calRes.json()
      setCalendars(cals)

      const evtRes = await fetch(
        `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      )
      if (evtRes.status === 503) {
        setStatus('auth_required')
        return
      }
      if (!evtRes.ok) throw new Error(`/api/events ${evtRes.status}`)
      const evts = await evtRes.json()
      setEvents(evts)
      setStatus('ok')
    } catch (err) {
      console.error('[calendar]', err)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, POLL_MS)
    return () => clearInterval(id)
  }, [fetchData])

  return { calendars, events, status }
}
