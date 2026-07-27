import {
  Activity,
  Clock3,
  Crosshair,
  Gauge,
  Orbit,
  Radio,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Waves,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { PtpStatus, PtpTuning, PtpTuningResponse } from '../api/types'
import { usePolling } from '../hooks/usePolling'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Metric,
  Segmented,
  Toggle,
  useConfirm,
  useToast,
} from '../components/ui'

type PtpPageData = { status: PtpStatus; servo: PtpTuningResponse }

function signed(value: number | null | undefined, unit = '') {
  if (value === null || value === undefined) return '—'
  return `${value > 0 ? '+' : ''}${value}${unit}`
}

function roleTone(role: string): 'info' | 'ok' | 'warning' {
  if (role === 'leader') return 'info'
  if (role === 'follower') return 'ok'
  return 'warning'
}

function LiveMetric({
  label,
  value,
  unit,
  icon,
  tone = 'blue',
}: {
  label: string
  value: number | string
  unit?: string
  icon: React.ReactNode
  tone?: 'blue' | 'orange' | 'green' | 'violet'
}) {
  return (
    <div className={`live-metric live-${tone}`}>
      <div className="live-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}<small>{unit}</small></strong>
    </div>
  )
}

export function PtpPage({
  active,
  pollInterval,
  onUpdated,
}: {
  active: boolean
  pollInterval: number
  onUpdated: (date: Date) => void
}) {
  const loader = async (): Promise<PtpPageData> => {
    const [status, servo] = await Promise.all([api.ptp(), api.ptpTuning()])
    return { status, servo }
  }
  const polling = usePolling(loader, pollInterval, active)
  const [tab, setTab] = useState('status')
  const [form, setForm] = useState<PtpTuning | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    if (polling.updatedAt) onUpdated(polling.updatedAt)
  }, [onUpdated, polling.updatedAt])

  useEffect(() => {
    if (!dirty && polling.data?.servo.tuning) setForm(polling.data.servo.tuning)
  }, [dirty, polling.data?.servo.tuning])

  const update = <K extends keyof PtpTuning>(key: K, value: PtpTuning[K]) => {
    if (!form) return
    setForm({ ...form, [key]: value })
    setDirty(true)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    try {
      await api.updatePtpTuning(form)
      setDirty(false)
      toast('PTP servo tuning applied')
      await polling.refresh()
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    const approved = await confirm({
      title: 'Reset the PTP module?',
      message: 'The wallclock will drop lock and start a fresh acquisition. Audio timing may be interrupted briefly.',
      confirmLabel: 'Reset PTP',
      destructive: true,
    })
    if (!approved) return
    try {
      await api.resetPtp()
      toast('PTP reset triggered')
      window.setTimeout(() => void polling.refresh(), 750)
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    }
  }

  if (polling.loading && !polling.data) return <LoadingState label="Reading PTP datasets…" />
  if (polling.error && !polling.data) return <ErrorState error={polling.error} onRetry={() => void polling.refresh()} />
  if (!polling.data) return null

  const { status, servo } = polling.data
  const monitor = servo.monitor

  return (
    <div className="page-stack">
      <Card className="ptp-hero">
        <div className="ptp-clock-visual">
          <div className={`clock-ring ${status.locked ? 'is-locked' : ''}`}>
            <Orbit size={64} strokeWidth={1} />
            <div className="clock-core"><Clock3 size={23} /></div>
          </div>
          <Badge tone={status.locked ? 'ok' : 'warning'} pulse>{status.locked ? 'PHASE LOCKED' : 'ACQUIRING'}</Badge>
        </div>
        <div className="ptp-hero-copy">
          <div className="eyebrow">IEEE 1588 PRECISION TIME PROTOCOL</div>
          <h2>{status.role === 'leader' ? 'This node is the clock leader' : status.role === 'follower' ? 'Following the selected leader' : 'Listening for an eligible leader'}</h2>
          <p className="mono">{status.clock_identity || 'Clock identity unavailable'}</p>
          <div className="ptp-hero-badges">
            <Badge tone={roleTone(status.role)}>{status.role.toUpperCase()}</Badge>
            <Badge tone="neutral">{status.mode.toUpperCase()} ENGINE</Badge>
            <Badge tone="neutral">{status.steps_removed} STEPS REMOVED</Badge>
          </div>
        </div>
        <div className="ptp-offset-readout">
          <span>LEADER OFFSET</span>
          <strong>{signed(status.offset_ns)}</strong>
          <small>nanoseconds</small>
        </div>
      </Card>

      <div className="section-toolbar">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'status', label: 'Clock status' },
            { value: 'tuning', label: 'Servo tuning' },
          ]}
        />
        <Button variant="danger" onClick={() => void reset()}><RotateCcw size={15} /> Reset PTP</Button>
      </div>

      {tab === 'status' ? (
        <>
          <div className="live-metrics-grid">
            <LiveMetric label="Leader offset" value={signed(status.offset_ns)} unit=" ns" icon={<Crosshair size={20} />} tone="blue" />
            <LiveMetric label="Path delay" value={signed(status.path_delay_ns)} unit=" ns" icon={<Waves size={20} />} tone="violet" />
            <LiveMetric label="Filtered offset" value={signed(monitor.filtered_offset)} unit=" ns" icon={<Activity size={20} />} tone="green" />
            <LiveMetric label="Lock counter" value={monitor.lock_counter} icon={<ShieldCheck size={20} />} tone="orange" />
          </div>

          <div className="ptp-detail-grid">
            <Card title="Clock dataset" eyebrow="ACTIVE STATE">
              <div className="metric-list">
                <Metric label="Selected role" value={<Badge tone={roleTone(status.role)}>{status.role.toUpperCase()}</Badge>} />
                <Metric label="Selected leader" value={status.best_master || 'None'} mono />
                <Metric label="Clock identity" value={status.clock_identity || '—'} mono />
                <Metric label="Steps removed" value={status.steps_removed} />
                <Metric label="Servo implementation" value={status.mode === 'software' ? 'Zephyr software' : 'FPGA hardware'} />
              </div>
            </Card>
            <Card title="Local announce quality" eyebrow="LEADER ELECTION PARAMETERS">
              <div className="quality-grid">
                <div><span>Priority 1</span><strong>{status.own_priority1}</strong></div>
                <div><span>Priority 2</span><strong>{status.own_priority2}</strong></div>
                <div><span>Clock class</span><strong>{status.own_clock_class}</strong></div>
                <div><span>Accuracy</span><strong>0x{status.own_clock_accuracy.toString(16).toUpperCase().padStart(2, '0')}</strong></div>
              </div>
              <p className="card-note">These values participate in PTP leader election.</p>
            </Card>
          </div>

          <Card
            title="Announced leaders"
            eyebrow="LEADER CANDIDATES"
            action={<Badge tone="neutral">{status.foreign_masters.length} observed</Badge>}
          >
            {!status.foreign_masters.length ? (
              <EmptyState
                icon={<Radio size={22} />}
                title="No external leaders"
                description="No announce messages from another PTP leader are currently tracked."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Sender</th><th>Leader clock identity</th><th>Priority</th><th>Class</th><th>Accuracy</th><th>Steps</th><th>Announces</th></tr></thead>
                  <tbody>
                    {status.foreign_masters.map((master) => (
                      <tr key={`${master.sender_id}-${master.gm_identity}`}>
                        <td className="mono">{master.sender_id}</td>
                        <td className="mono">{master.gm_identity}</td>
                        <td>{master.priority1} / {master.priority2}</td>
                        <td>{master.clock_class}</td>
                        <td className="mono">0x{master.clock_accuracy.toString(16).toUpperCase().padStart(2, '0')}</td>
                        <td>{master.steps_removed}</td>
                        <td>{master.announce_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="servo-warning">
            <SlidersHorizontal size={19} />
            <div><strong>Live FPGA parameters</strong><span>Changes take effect on the next sync sample and can alter lock stability.</span></div>
          </div>
          <form onSubmit={save} className="tuning-layout">
            <Card title="Loop gain" eyebrow="PI CONTROLLER">
              <div className="form-grid">
                <Field label="Proportional gain (Kp)" hint="Signed 8-bit coefficient">
                  <input type="number" min={-128} max={127} value={form?.kp_gain ?? 0} onChange={(event) => update('kp_gain', Number(event.target.value))} />
                </Field>
                <Field label="Integral gain (Ki)" hint="Signed 8-bit coefficient">
                  <input type="number" min={-128} max={127} value={form?.ki_gain ?? 0} onChange={(event) => update('ki_gain', Number(event.target.value))} />
                </Field>
                <Field label="Gain shift">
                  <input type="number" min={0} max={31} value={form?.gain_shift ?? 0} onChange={(event) => update('gain_shift', Number(event.target.value))} />
                </Field>
                <Field label="Locked gain shift">
                  <input type="number" min={0} max={31} value={form?.gain_shift_locked ?? 0} onChange={(event) => update('gain_shift_locked', Number(event.target.value))} />
                </Field>
                <Field label="Ki extra shift">
                  <input type="number" min={0} max={31} value={form?.ki_extra_shift ?? 0} onChange={(event) => update('ki_extra_shift', Number(event.target.value))} />
                </Field>
                <Field label="Filter shift">
                  <input type="number" min={0} max={31} value={form?.filter_shift ?? 0} onChange={(event) => update('filter_shift', Number(event.target.value))} />
                </Field>
              </div>
            </Card>

            <Card title="Lock acquisition" eyebrow="THRESHOLDS">
              <div className="form-grid">
                <Field label="Warm-up samples">
                  <input type="number" min={0} max={255} value={form?.warmup_samples ?? 0} onChange={(event) => update('warmup_samples', Number(event.target.value))} />
                </Field>
                <Field label="Lock count threshold">
                  <input type="number" min={0} max={255} value={form?.lock_count_threshold ?? 0} onChange={(event) => update('lock_count_threshold', Number(event.target.value))} />
                </Field>
                <Field label="Lock threshold" hint="Nanoseconds">
                  <input type="number" min={0} value={form?.lock_threshold_ns ?? 0} onChange={(event) => update('lock_threshold_ns', Number(event.target.value))} />
                </Field>
                <Field label="Unlock threshold" hint="Nanoseconds">
                  <input type="number" min={0} value={form?.unlock_threshold_ns ?? 0} onChange={(event) => update('unlock_threshold_ns', Number(event.target.value))} />
                </Field>
                <div className="field-span tuning-toggle">
                  <Toggle
                    label="Enable minimum filter"
                    checked={form?.min_filter_enable ?? false}
                    onChange={(value) => update('min_filter_enable', value)}
                  />
                </div>
                <Field label="Minimum filter depth" className="field-span">
                  <input type="number" min={0} max={255} value={form?.min_filter_active_depth ?? 0} onChange={(event) => update('min_filter_active_depth', Number(event.target.value))} />
                </Field>
              </div>
              <div className="form-actions">
                <Button
                  type="button"
                  onClick={() => {
                    setForm(servo.tuning)
                    setDirty(false)
                  }}
                  disabled={!dirty}
                >
                  Revert changes
                </Button>
                <Button type="submit" variant="primary" busy={saving} disabled={!dirty}>
                  <Save size={15} /> Apply tuning
                </Button>
              </div>
            </Card>
          </form>

          <Card title="Live servo internals" eyebrow="READ-ONLY MONITOR">
            <div className="servo-monitor-grid">
              <Metric label="Filtered offset" value={signed(monitor.filtered_offset, ' ns')} />
              <Metric label="Integral accumulator" value={monitor.integral_sum} mono />
              <Metric label="Proportional term" value={monitor.pi_proportional} mono />
              <Metric label="Raw PI sum" value={monitor.pi_sum_raw} mono />
              <Metric label="Effective shift" value={monitor.effective_gain_shift} />
              <Metric label="Sample count" value={monitor.sample_count} />
              <Metric label="First lock" value={<Badge tone={monitor.first_lock_achieved ? 'ok' : 'warning'}>{monitor.first_lock_achieved ? 'ACHIEVED' : 'PENDING'}</Badge>} />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
