import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import type { Summary } from './api/types'
import { Layout, type PageId } from './components/Layout'
import { ConfirmProvider, ToastProvider } from './components/ui'
import { usePolling } from './hooks/usePolling'
import { CardsPage } from './pages/CardsPage'
import { OverviewPage } from './pages/OverviewPage'
import { PtpPage } from './pages/PtpPage'
import { SettingsPage } from './pages/SettingsPage'
import { StreamsPage } from './pages/StreamsPage'

const PAGES: PageId[] = ['overview', 'streams', 'cards', 'ptp', 'settings']

function pageFromHash(): PageId {
  const candidate = window.location.hash.replace(/^#\/?/, '') as PageId
  return PAGES.includes(candidate) ? candidate : 'overview'
}

export default function App() {
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [pollInterval, setPollInterval] = useState(() => {
    const raw = window.localStorage.getItem('aes67-poll-interval')
    if (raw === null) return 1000
    const stored = Number(raw)
    return [0, 500, 1000, 2000, 5000].includes(stored) ? stored : 1000
  })
  const [deviceName, setDeviceName] = useState('AES67 Node')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const summary = usePolling<Summary>(
    api.summary,
    page === 'overview' ? pollInterval : 10_000,
    true,
  )

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    void api.config()
      .then((config) => setDeviceName(config.device_name || 'AES67 Node'))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (summary.updatedAt && page === 'overview') setLastUpdated(summary.updatedAt)
  }, [page, summary.updatedAt])

  const navigate = (next: PageId) => {
    if (page === next) return
    window.location.hash = `/${next}`
    setPage(next)
  }

  const changePollInterval = (value: number) => {
    setPollInterval(value)
    window.localStorage.setItem('aes67-poll-interval', String(value))
  }

  const recordUpdate = useCallback((date: Date) => setLastUpdated(date), [])

  const refresh = () => {
    setRefreshing(true)
    window.dispatchEvent(new Event('aes67:refresh'))
    window.setTimeout(() => setRefreshing(false), 650)
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Layout
          page={page}
          onPageChange={navigate}
          deviceName={deviceName}
          network={summary.data?.network || null}
          connected={Boolean(summary.data && !summary.error)}
          updatedAt={lastUpdated || summary.updatedAt}
          pollInterval={pollInterval}
          onPollIntervalChange={changePollInterval}
          onRefresh={refresh}
          refreshing={refreshing || summary.loading}
        >
          <div hidden={page !== 'overview'}>
            <OverviewPage
              active={page === 'overview'}
              summary={summary.data}
              loading={summary.loading}
              error={summary.error}
              onRetry={() => void summary.refresh()}
              pollInterval={pollInterval}
            />
          </div>
          <div hidden={page !== 'streams'}>
            <StreamsPage active={page === 'streams'} pollInterval={pollInterval} onUpdated={recordUpdate} />
          </div>
          <div hidden={page !== 'cards'}>
            <CardsPage active={page === 'cards'} pollInterval={pollInterval} onUpdated={recordUpdate} />
          </div>
          <div hidden={page !== 'ptp'}>
            <PtpPage active={page === 'ptp'} pollInterval={pollInterval} onUpdated={recordUpdate} />
          </div>
          <div hidden={page !== 'settings'}>
            <SettingsPage
              active={page === 'settings'}
              pollInterval={pollInterval}
              onUpdated={recordUpdate}
              onDeviceNameChange={setDeviceName}
            />
          </div>
        </Layout>
      </ConfirmProvider>
    </ToastProvider>
  )
}
