import { useCallback, useEffect, useRef, useState } from 'react'

export function usePolling<T>(
  loader: () => Promise<T>,
  intervalMs: number,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const inFlight = useRef(false)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const refresh = useCallback(async (silent = false) => {
    if (inFlight.current) return
    inFlight.current = true
    if (!silent) setLoading(true)
    try {
      const next = await loaderRef.current()
      setData(next)
      setError(null)
      setUpdatedAt(new Date())
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error(String(reason)))
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    if (intervalMs <= 0) return
    const id = window.setInterval(() => void refresh(true), intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, intervalMs, refresh])

  useEffect(() => {
    if (!enabled) return
    const onRefresh = () => void refresh()
    window.addEventListener('aes67:refresh', onRefresh)
    return () => window.removeEventListener('aes67:refresh', onRefresh)
  }, [enabled, refresh])

  return { data, error, loading, updatedAt, refresh, setData }
}
