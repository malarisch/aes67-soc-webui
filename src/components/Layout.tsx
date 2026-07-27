import {
  Activity,
  AudioLines,
  Boxes,
  ChevronDown,
  Clock3,
  Gauge,
  Menu,
  Network,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { NetworkStatus } from '../api/types'
import { Badge, IconButton } from './ui'

export type PageId = 'overview' | 'streams' | 'cards' | 'ptp' | 'settings'

const NAV: { id: PageId; label: string; caption: string; icon: typeof Gauge }[] = [
  { id: 'overview', label: 'Overview', caption: 'Live health', icon: Gauge },
  { id: 'streams', label: 'Audio streams', caption: 'TX, RX & discovery', icon: AudioLines },
  { id: 'cards', label: 'I/O cards', caption: 'Inputs & outputs', icon: Boxes },
  { id: 'ptp', label: 'PTP timing', caption: 'Clock & servo', icon: Clock3 },
  { id: 'settings', label: 'Device', caption: 'Config & system', icon: Settings },
]

const PAGE_META: Record<PageId, { title: string; kicker: string }> = {
  overview: { title: 'System overview', kicker: 'Live node telemetry' },
  streams: { title: 'Audio streams', kicker: 'AES67 routing' },
  cards: { title: 'I/O cards', kicker: 'Hardware control' },
  ptp: { title: 'PTP timing', kicker: 'Precision clock' },
  settings: { title: 'Device settings', kicker: 'Configuration & maintenance' },
}

export function Layout({
  page,
  onPageChange,
  children,
  deviceName,
  network,
  connected,
  updatedAt,
  pollInterval,
  onPollIntervalChange,
  onRefresh,
  refreshing,
}: {
  page: PageId
  onPageChange: (page: PageId) => void
  children: ReactNode
  deviceName: string
  network: NetworkStatus | null
  connected: boolean
  updatedAt: Date | null
  pollInterval: number
  onPollIntervalChange: (value: number) => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const meta = PAGE_META[page]

  const navigate = (id: PageId) => {
    onPageChange(id)
    setMobileOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <AudioLines size={23} strokeWidth={1.8} />
          </div>
          <div>
            <strong>AES67</strong>
            <span>NODE CONTROL</span>
          </div>
          <IconButton label="Close navigation" className="mobile-close" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="node-identity">
          <div className="node-orbit"><span /></div>
          <div>
            <span className="node-label">THIS DEVICE</span>
            <strong>{deviceName || 'AES67 Node'}</strong>
            <span className="mono">{network?.ip || 'Awaiting address'}</span>
          </div>
        </div>

        <nav>
          <span className="nav-heading">WORKSPACE</span>
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={page === item.id ? 'is-active' : ''}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.caption}</small>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-line">
            <span className={`connection-light ${connected ? 'is-online' : ''}`} />
            <div>
              <strong>{connected ? 'Node online' : 'Node unreachable'}</strong>
              <span>{network?.phy_speed || 'REST API'}</span>
            </div>
          </div>
          <div className="sidebar-protocols">
            <span>AES67</span><span>PTPv2</span><span>SAP</span>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </IconButton>
          <div className="page-title">
            <span>{meta.kicker}</span>
            <h1>{meta.title}</h1>
          </div>
          <div className="topbar-actions">
            <Badge tone={connected ? 'ok' : 'danger'} pulse>
              {connected ? 'Connected' : 'Offline'}
            </Badge>
            <div className="sync-control">
              <Clock3 size={14} />
              <span>{updatedAt ? `Synced ${updatedAt.toLocaleTimeString()}` : 'Not synced'}</span>
            </div>
            <label className="refresh-select">
              <Activity size={15} />
              <select
                value={pollInterval}
                onChange={(event) => onPollIntervalChange(Number(event.target.value))}
                aria-label="Auto refresh interval"
              >
                <option value={0}>Manual</option>
                <option value={500}>0.5 s</option>
                <option value={1000}>1 s</option>
                <option value={2000}>2 s</option>
                <option value={5000}>5 s</option>
              </select>
              <ChevronDown size={13} />
            </label>
            <IconButton label="Refresh now" onClick={onRefresh}>
              <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            </IconButton>
          </div>
        </header>

        <div className="page-content">{children}</div>

        <footer className="app-footer">
          <span><Network size={13} /> {network?.mac || 'MAC unavailable'}</span>
          <span>Professional audio over IP</span>
        </footer>
      </main>
    </div>
  )
}
