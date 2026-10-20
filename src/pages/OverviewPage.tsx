import {
  AudioWaveform,
  Boxes,
  Cable,
  CheckCircle2,
  Clock3,
  Cpu,
  RadioTower,
  Route,
  ShieldAlert,
  TimerReset,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { CardsOverview, Summary } from '../api/types'
import { usePolling } from '../hooks/usePolling'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
} from '../components/ui'

type Point = { at: number; value: number }
const HISTORY_WINDOW = 5 * 60 * 1000

function StatusHero({ summary }: { summary: Summary }) {
  const { network, ptp, fpga } = summary
  const healthy = Boolean(network.phy_link_up && ptp.locked && fpga.wc_locked && !fpga.ptp_leader_lost)
  return (
    <Card className="health-hero">
      <div className="hero-signal">
        <span className={healthy ? 'is-healthy' : 'is-warning'} />
        <span />
        <span />
      </div>
      <div className="hero-copy">
        <div className="eyebrow">NODE HEALTH</div>
        <h2>{healthy ? 'Signal chain is synchronized' : 'Node needs attention'}</h2>
        <p>
          {healthy
            ? 'Network, PTP and media clock are operating normally.'
            : 'Review the highlighted timing or network indicators below.'}
        </p>
      </div>
      <div className="hero-stats">
        <div>
          <span>PTP role</span>
          <strong>{ptp.role.charAt(0).toUpperCase() + ptp.role.slice(1)}</strong>
        </div>
        <div>
          <span>Clock offset</span>
          <strong>{formatSigned(ptp.offset_ns)} ns</strong>
        </div>
        <div>
          <span>Link</span>
          <strong>{network.phy_speed || '—'}</strong>
        </div>
      </div>
    </Card>
  )
}

function formatSigned(value: number | undefined) {
  if (value === undefined || value === null) return '—'
  return value > 0 ? `+${value}` : String(value)
}

function roleTone(role: string): 'info' | 'ok' | 'warning' {
  return role === 'leader' ? 'info' : role === 'follower' ? 'ok' : 'warning'
}

function flags(mask: number, prefix: string) {
  const values: string[] = []
  for (let bit = 0; bit < 8; bit += 1) {
    if (mask & (1 << bit)) values.push(`${prefix}${bit}`)
  }
  return values.join(', ')
}

function StatCard({
  icon,
  label,
  value,
  caption,
  tone = 'blue',
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  caption: React.ReactNode
  tone?: 'blue' | 'green' | 'orange' | 'violet'
}) {
  return (
    <Card className={`stat-card stat-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
      </div>
    </Card>
  )
}

function HistoryChart({ offset, ppb }: { offset: Point[]; ppb: Point[] }) {
  const width = 900
  const height = 240
  const pad = { left: 52, right: 52, top: 18, bottom: 30 }
  const now = Date.now()
  const start = now - HISTORY_WINDOW

  const range = (points: Point[]) => {
    if (!points.length) return [-1, 1] as const
    let min = Math.min(...points.map((point) => point.value))
    let max = Math.max(...points.map((point) => point.value))
    if (min === max) {
      min -= 1
      max += 1
    }
    const margin = (max - min) * 0.12
    return [min - margin, max + margin] as const
  }

  const offsetRange = range(offset)
  const ppbRange = range(ppb)
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const x = (at: number) => pad.left + ((at - start) / HISTORY_WINDOW) * innerWidth
  const y = (value: number, [min, max]: readonly [number, number]) =>
    pad.top + innerHeight - ((value - min) / (max - min)) * innerHeight
  const path = (points: Point[], valueRange: readonly [number, number]) =>
    points.map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${x(point.at).toFixed(1)} ${y(point.value, valueRange).toFixed(1)}`,
    ).join(' ')

  return (
    <div className="history-chart">
      <div className="chart-legend">
        <span><i className="line-blue" /> Leader offset <b>{formatSigned(offset.at(-1)?.value)} ns</b></span>
        <span><i className="line-orange" /> PLL correction <b>{formatSigned(ppb.at(-1)?.value)} ppb</b></span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="PTP and PLL history for the last five minutes">
        <defs>
          <linearGradient id="offsetFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#49b7ff" stopOpacity=".28" />
            <stop offset="100%" stopColor="#49b7ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((line) => {
          const yy = pad.top + (innerHeight * line) / 4
          return <line key={line} x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-grid" />
        })}
        {[0, 1, 2, 3, 4, 5].map((minute) => {
          const xx = pad.left + (innerWidth * minute) / 5
          return (
            <text key={minute} x={xx} y={height - 7} className="chart-axis" textAnchor="middle">
              -{5 - minute}m
            </text>
          )
        })}
        {offset.length > 1 && (
          <>
            <path
              d={`${path(offset, offsetRange)} L ${x(offset.at(-1)!.at)} ${pad.top + innerHeight} L ${x(offset[0].at)} ${pad.top + innerHeight} Z`}
              fill="url(#offsetFill)"
            />
            <path d={path(offset, offsetRange)} className="chart-line chart-line-offset" />
          </>
        )}
        {ppb.length > 1 && <path d={path(ppb, ppbRange)} className="chart-line chart-line-ppb" />}
        {!offset.length && (
          <text x={width / 2} y={height / 2} className="chart-empty" textAnchor="middle">
            History builds while this page is open
          </text>
        )}
      </svg>
    </div>
  )
}

export function OverviewPage({
  active,
  summary,
  loading,
  error,
  onRetry,
  pollInterval,
}: {
  active: boolean
  summary: Summary | null
  loading: boolean
  error: Error | null
  onRetry: () => void
  pollInterval: number
}) {
  const cards = usePolling<CardsOverview>(api.cards, active ? Math.max(pollInterval, 2000) : 0, active)
  const [offsetHistory, setOffsetHistory] = useState<Point[]>([])
  const [ppbHistory, setPpbHistory] = useState<Point[]>([])

  useEffect(() => {
    if (!active || !summary) return
    const at = Date.now()
    const cutoff = at - HISTORY_WINDOW
    setOffsetHistory((items) => [...items.filter((point) => point.at >= cutoff), {
      at,
      value: summary.fpga.leader_offset_ns || 0,
    }])
    setPpbHistory((items) => [...items.filter((point) => point.at >= cutoff), {
      at,
      value: summary.fpga.ppb_offset || 0,
    }])
  }, [active, summary])

  const slot = cards.data?.slots?.[0]
  const cardCaption = useMemo(() => {
    if (!slot?.present) return 'No expansion card'
    if (slot.type_id === 4) return `${slot.type} · firmware ${slot.soft_id ?? 0}.${slot.board_id ?? 0}.${slot.hard_rev ?? 0}`
    return `${slot.type} · revision ${slot.hard_rev ?? '—'}`
  }, [slot])

  if (loading && !summary) return <LoadingState />
  if (error && !summary) return <ErrorState error={error} onRetry={onRetry} />
  if (!summary) return null

  const { network, ptp, fpga } = summary

  return (
    <div className="page-stack">
      <StatusHero summary={summary} />

      <div className="stats-grid">
        <StatCard
          icon={<Cable size={20} />}
          label="Network link"
          value={network.phy_link_up ? 'Online' : 'Down'}
          caption={network.phy_speed || 'Speed unavailable'}
          tone={network.phy_link_up ? 'green' : 'orange'}
        />
        <StatCard
          icon={<Clock3 size={20} />}
          label="PTP clock"
          value={ptp.role}
          caption={ptp.locked ? 'Phase locked' : 'Acquiring lock'}
          tone={ptp.locked ? 'blue' : 'orange'}
        />
        <StatCard
          icon={<AudioWaveform size={20} />}
          label="Media clock"
          value={fpga.wc_locked ? 'Locked' : 'Unlocked'}
          caption={`${formatSigned(fpga.ppb_offset)} ppb correction`}
          tone={fpga.wc_locked ? 'violet' : 'orange'}
        />
        <StatCard
          icon={<Boxes size={20} />}
          label="I/O hardware"
          value={slot?.present ? slot.type : 'None'}
          caption={cardCaption}
          tone={slot?.initialized ? 'green' : 'orange'}
        />
      </div>

      <div className="overview-grid">
        <Card title="Network path" eyebrow="CONNECTIVITY" className="detail-card">
          <div className="metric-list">
            <Metric label="PHY status" value={<Badge tone={network.phy_link_up ? 'ok' : 'danger'}>{network.phy_link_up ? 'LINK UP' : 'LINK DOWN'}</Badge>} />
            <Metric label="IPv4 address" value={network.ip || '—'} mono />
            <Metric label="Netmask" value={network.netmask || '—'} mono />
            <Metric label="Gateway" value={network.gateway || '—'} mono />
            <Metric label="MAC address" value={network.mac || '—'} mono />
          </div>
        </Card>

        <Card title="Precision timing" eyebrow="IEEE 1588-2008" className="detail-card">
          <div className="metric-list">
            <Metric label="Role" value={<Badge tone={roleTone(ptp.role)}>{ptp.role.toUpperCase()}</Badge>} />
            <Metric label="Implementation" value={ptp.mode === 'software' ? 'Software PTP' : 'FPGA PTP'} />
            <Metric label="Clock identity" value={ptp.clock_identity || '—'} mono />
            <Metric label="Selected leader" value={ptp.best_master || '—'} mono />
            <Metric label="Path delay" value={`${formatSigned(ptp.path_delay_ns)} ns`} />
          </div>
        </Card>

        <Card title="FPGA signal health" eyebrow="GATEWARE" className="detail-card">
          <div className="metric-list">
            <Metric label="Wallclock" value={<Badge tone={fpga.wc_locked ? 'ok' : 'warning'}>{fpga.wc_locked ? 'LOCKED' : 'UNLOCKED'}</Badge>} />
            <Metric label="Configured" value={fpga.wc_configured ? <CheckCircle2 size={16} className="text-ok" /> : <TimerReset size={16} className="text-warning" />} />
            <Metric label="RX underrun" value={fpga.rx_underrun ? <Badge tone="danger">{flags(fpga.rx_underrun, 'S')}</Badge> : <Badge tone="ok">CLEAR</Badge>} />
            <Metric label="Muted outputs" value={fpga.rx_mute ? <Badge tone="warning">{flags(fpga.rx_mute, 'CH')}</Badge> : 'None'} />
            <Metric label="Leader loss" value={fpga.ptp_leader_lost ? <ShieldAlert size={16} className="text-danger" /> : 'No'} />
          </div>
        </Card>
      </div>

      <Card
        title="Timing history"
        eyebrow="ROLLING 5 MINUTES"
        action={<Badge tone="neutral">{pollInterval ? `${pollInterval / 1000}s samples` : 'Manual samples'}</Badge>}
      >
        <HistoryChart offset={offsetHistory} ppb={ppbHistory} />
      </Card>

      {cards.error && (
        <EmptyState
          icon={<Cpu size={22} />}
          title="I/O card telemetry unavailable"
          description={cards.error.message}
        />
      )}
    </div>
  )
}
