import { Bluetooth, Play, RadioTower, RotateCcw, Save, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, ApiError } from '../../api/client'
import type { AuracastCard, AuracastConfig } from '../../api/types'
import { Badge, Button, Card, Field, Metric, Segmented, Toggle, useConfirm, useToast } from '../../components/ui'

type Tone = 'ok' | 'danger' | 'warning' | 'info' | 'neutral'

const CONTEXT_LIVE = 0x0040
const CONTEXT_MEDIA = 0x0004
const BROADCAST_ID_RANDOM = 0xffffffff
const PRESET_NONE = 0xff
const DEFAULT_HQ_PRESET = 3 /* 48_4_1 when the HQ subgroup is switched on */

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

function stateBadge(status: AuracastCard['status']): { tone: Tone; label: string; pulse: boolean } {
  if (!status.present) return { tone: 'danger', label: 'CARD NOT RESPONDING', pulse: false }
  switch (status.state_name) {
    case 'wait_config':
      return { tone: 'neutral', label: 'WAITING FOR CONFIG', pulse: false }
    case 'starting':
      return { tone: 'warning', label: 'STARTING', pulse: true }
    case 'streaming':
      return { tone: 'ok', label: 'ON AIR', pulse: true }
    case 'config_error':
      return { tone: 'danger', label: 'CONFIG ERROR', pulse: false }
    case 'fault':
      return { tone: 'danger', label: 'FAULT', pulse: false }
    default:
      return { tone: 'neutral', label: status.state_name.toUpperCase(), pulse: false }
  }
}

function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function sameConfig(a: AuracastConfig, b: AuracastConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.preset === b.preset &&
    a.channels === b.channels &&
    a.context === b.context &&
    a.flags === b.flags &&
    a.tx_power === b.tx_power &&
    a.pd_us === b.pd_us &&
    a.fifo_target === b.fifo_target &&
    a.broadcast_id === b.broadcast_id &&
    a.broadcast_id_random === b.broadcast_id_random &&
    a.name === b.name &&
    a.code === b.code &&
    a.hq_preset === b.hq_preset &&
    a.hq_channels === b.hq_channels &&
    a.hq_context === b.hq_context
  )
}

function contextMode(context: number): 'live' | 'media' | 'custom' {
  if (context === CONTEXT_LIVE) return 'live'
  if (context === CONTEXT_MEDIA) return 'media'
  return 'custom'
}

export function AuracastPanel({
  data,
  onInteracting,
  onChanged,
}: {
  data: AuracastCard
  onInteracting: (interacting: boolean) => void
  onChanged: (next: AuracastCard) => void
}) {
  const { status, config } = data
  const confirm = useConfirm()
  const toast = useToast()
  const [draft, setDraft] = useState<AuracastConfig>(config)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [badField, setBadField] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) setDraft(config)
  }, [config, dirty])

  const edit = (patch: Partial<AuracastConfig>) => {
    setDraft((current) => {
      const next = { ...current, ...patch }
      setDirty(!sameConfig(next, config))
      return next
    })
    setBadField(null)
  }

  const run = async (label: string, action: () => Promise<AuracastCard>) => {
    setBusy(true)
    onInteracting(true)
    try {
      const next = await action()
      onChanged(next)
      setDirty(false)
      setBadField(null)
      toast(label)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 422) {
        const detail = reason.detail || {}
        const field = typeof detail.error_reg_name === 'string' ? detail.error_reg_name : null
        setBadField(field)
        toast(`${String(detail.error || 'rejected')}: ${field || 'configuration'}`, 'error')
      } else {
        toast(reason instanceof Error ? reason.message : String(reason), 'error')
      }
    } finally {
      setBusy(false)
      onInteracting(false)
    }
  }

  const apply = async () => {
    const approved = await confirm({
      title: 'Apply and restart the broadcast?',
      message: 'The S31 restarts with the new configuration. Listeners drop out for a few seconds.',
      confirmLabel: 'Apply and broadcast',
      destructive: true,
    })
    if (!approved) return
    await run('Broadcast configuration applied', () => api.updateAuracastCard(draft))
  }

  const nameBytes = utf8Bytes(draft.name)
  const codeBytes = utf8Bytes(draft.code)
  const nameInvalid = nameBytes < 4 || nameBytes > 32
  const codeInvalid = codeBytes > 16
  const badge = stateBadge(status)
  const errorLine =
    status.error !== 0
      ? `${status.error_name} (${status.error_reg_name})`
      : status.last_errno !== 0
        ? `host error ${status.last_errno}`
        : null
  const i2sBitsSuspect = status.stats_valid && !status.i2s_bits.toLowerCase().endsWith('00')
  const fieldClass = (name: string) => (badField === name ? 'field-invalid' : '')
  const mode = contextMode(draft.context)
  const hqEnabled = draft.hq_preset !== PRESET_NONE
  const hqMode = contextMode(draft.hq_context)
  const sqPresetIsHq = draft.preset >= 2

  return (
    <>
      <Card
        title="Broadcast status"
        eyebrow="AURACAST · BLE AUDIO"
        action={<Badge tone={badge.tone} pulse={badge.pulse}>{badge.label}</Badge>}
      >
        <div className="auracast-headline">
          <Bluetooth size={18} />
          <strong>{config.name}</strong>
          <span className="mono">{status.active_id ? `ID ${status.active_id}` : 'no active ID'}</span>
          <small>S31 firmware {status.fw_version}</small>
          <Badge tone={config.hq_enabled ? 'info' : 'neutral'}>{config.hq_enabled ? 'SQ + HQ SUBGROUPS' : 'SINGLE SUBGROUP'}</Badge>
        </div>
        {errorLine && <div className="auracast-error">{errorLine}</div>}
        {status.stats_valid ? (
          <div className="live-metrics-grid">
            <Metric label="I2S signal" value={status.i2s_signal ? 'present' : 'missing'} />
            <Metric label="Pipeline" value={status.pipe_state_name} />
            <Metric label="FIFO" value={`${status.fifo_fill} / ${config.fifo_target}`} mono help="frames @ 48 kHz" />
            <Metric label="Drift" value={`${status.drift_ppm} ppm`} mono />
            <Metric label="Input rate" value={`${status.in_ppm} ppm`} mono help="vs. 48 kHz" />
            <Metric label="Underrun / overflow / lost" value={`${status.underrun} / ${status.overflow} / ${status.lost}`} mono />
            <Metric label="Send errors / sent" value={`${status.send_err} / ${status.sent}`} mono />
            <Metric label="S31 uptime" value={formatUptime(status.uptime_ms)} mono />
            <Metric
              label="I2S bits"
              value={status.i2s_bits}
              mono
              help={i2sBitsSuspect ? <Badge tone="danger">not 24-bit aligned</Badge> : 'low byte must be 00'}
            />
            <Metric label="BIS" value={status.bis_streaming ? 'all streaming' : 'not streaming'} />
          </div>
        ) : (
          <p className="muted">Statistics are available once the broadcast is starting.</p>
        )}
      </Card>

      <Card
        title="Broadcast configuration"
        eyebrow="APPLIED ON DEMAND"
        action={<Badge tone={config.enabled ? 'ok' : 'neutral'}>{config.enabled ? 'ENABLED' : 'STOPPED'}</Badge>}
      >
        <div className="form-grid">
          <Field label="Broadcast name" hint={`${nameBytes}/32 bytes, at least 4`} className={`${fieldClass('name')} ${nameInvalid ? 'field-invalid' : ''}`}>
            <input value={draft.name} maxLength={64} onChange={(event) => edit({ name: event.target.value })} />
          </Field>
          <Field label="Broadcast code" hint={codeBytes === 0 ? 'empty = unencrypted' : `${codeBytes}/16 bytes, encrypted`} className={`${fieldClass('code')} ${codeInvalid ? 'field-invalid' : ''}`}>
            <div className="input-with-action">
              <input type={showCode ? 'text' : 'password'} value={draft.code} maxLength={32} onChange={(event) => edit({ code: event.target.value })} />
              <Button size="sm" variant="ghost" type="button" onClick={() => setShowCode((value) => !value)}>{showCode ? 'Hide' : 'Show'}</Button>
            </div>
          </Field>
          <Field label="LC3 preset" hint={hqEnabled ? 'subgroup 1 · Standard Quality (16/24 kHz)' : undefined} className={fieldClass('preset')}>
            <select value={draft.preset} onChange={(event) => edit({ preset: Number(event.target.value) })}>
              {data.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </Field>
          <Field label="Channels" className={fieldClass('channels')}>
            <select value={draft.channels} onChange={(event) => edit({ channels: Number(event.target.value) })}>
              {data.channel_modes.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
            </select>
          </Field>
          <Field label="Streaming context" className={fieldClass('context')}>
            <Segmented
              value={mode}
              options={[{ value: 'live', label: 'Live' }, { value: 'media', label: 'Media' }, { value: 'custom', label: 'Custom' }]}
              onChange={(value) => {
                if (value === 'live') edit({ context: CONTEXT_LIVE })
                else if (value === 'media') edit({ context: CONTEXT_MEDIA })
                else if (mode !== 'custom') edit({ context: CONTEXT_LIVE | CONTEXT_MEDIA })
              }}
            />
            {mode === 'custom' && (
              <input
                className="mono"
                value={`0x${draft.context.toString(16).toUpperCase().padStart(4, '0')}`}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 16)
                  if (!Number.isNaN(parsed)) edit({ context: parsed & 0xffff })
                }}
              />
            )}
          </Field>
          <Field label="TX power" hint="-15 … 20 dBm" className={fieldClass('tx_power')}>
            <input type="number" min={-15} max={20} value={draft.tx_power} onChange={(event) => edit({ tx_power: Number(event.target.value) })} />
          </Field>
          <Field label="Presentation delay" hint="20000 … 40000 µs" className={fieldClass('pd_us')}>
            <input type="number" min={20000} max={40000} step={1000} value={draft.pd_us} onChange={(event) => edit({ pd_us: Number(event.target.value) })} />
          </Field>
          <Field label="FIFO target" hint="840 … 3000 frames" className={fieldClass('fifo_target')}>
            <input type="number" min={840} max={3000} step={10} value={draft.fifo_target} onChange={(event) => edit({ fifo_target: Number(event.target.value) })} />
          </Field>
          <Field label="Broadcast ID" hint={draft.broadcast_id_random ? 'new random ID at every start' : '24-bit hex'} className={fieldClass('broadcast_id')}>
            <Toggle
              label="Random at every start"
              checked={draft.broadcast_id_random}
              onChange={(random) => edit({ broadcast_id_random: random, broadcast_id: random ? BROADCAST_ID_RANDOM : 0 })}
            />
            {!draft.broadcast_id_random && (
              <input
                className="mono"
                value={draft.broadcast_id.toString(16).toUpperCase().padStart(6, '0')}
                maxLength={6}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value || '0', 16)
                  if (!Number.isNaN(parsed)) edit({ broadcast_id: parsed & 0xffffff })
                }}
              />
            )}
          </Field>
          <div className="field field-span">
            <span className="field-label">High Quality subgroup</span>
            <Toggle
              label="Second subgroup at 48 kHz for headphones (same BIG)"
              checked={hqEnabled}
              onChange={(on) => edit({ hq_preset: on ? DEFAULT_HQ_PRESET : PRESET_NONE })}
            />
            {hqEnabled && sqPresetIsHq && (
              <span className="field-hint text-danger">With an HQ subgroup the first preset must be 16 or 24 kHz.</span>
            )}
          </div>
          {hqEnabled && (
            <>
              <Field label="HQ preset" className={fieldClass('hq_preset')}>
                <select value={draft.hq_preset} onChange={(event) => edit({ hq_preset: Number(event.target.value) })}>
                  {data.hq_presets.filter((preset) => preset.id !== PRESET_NONE).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                </select>
              </Field>
              <Field label="HQ channels" className={fieldClass('hq_channels')}>
                <select value={draft.hq_channels} onChange={(event) => edit({ hq_channels: Number(event.target.value) })}>
                  {data.channel_modes.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
                </select>
              </Field>
              <Field label="HQ streaming context" className={fieldClass('hq_context')}>
                <Segmented
                  value={hqMode}
                  options={[{ value: 'live', label: 'Live' }, { value: 'media', label: 'Media' }, { value: 'custom', label: 'Custom' }]}
                  onChange={(value) => {
                    if (value === 'live') edit({ hq_context: CONTEXT_LIVE })
                    else if (value === 'media') edit({ hq_context: CONTEXT_MEDIA })
                    else if (hqMode !== 'custom') edit({ hq_context: CONTEXT_LIVE | CONTEXT_MEDIA })
                  }}
                />
                {hqMode === 'custom' && (
                  <input
                    className="mono"
                    value={`0x${draft.hq_context.toString(16).toUpperCase().padStart(4, '0')}`}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 16)
                      if (!Number.isNaN(parsed)) edit({ hq_context: parsed & 0xffff })
                    }}
                  />
                )}
              </Field>
            </>
          )}
          <div className="field">
            <span className="field-label">Flags</span>
            <Toggle
              label="Immediate rendering"
              checked={(draft.flags & 0x01) !== 0}
              onChange={(immediate) => edit({ flags: immediate ? draft.flags | 0x01 : draft.flags & ~0x01 })}
            />
          </div>
        </div>

        <div className="form-actions">
          <Button variant="primary" busy={busy} disabled={!dirty || nameInvalid || codeInvalid} onClick={() => void apply()}>
            <Save size={15} /> Apply and broadcast
          </Button>
          {config.enabled ? (
            <Button busy={busy} onClick={() => void run('Broadcast stopped', api.auracastStop)}>
              <Square size={15} /> Stop broadcasting
            </Button>
          ) : (
            <Button busy={busy} onClick={() => void run('Broadcast started', api.auracastStart)}>
              <Play size={15} /> Start broadcasting
            </Button>
          )}
          <Button variant="danger" busy={busy} onClick={() => void run('S31 restarted', api.auracastReset)}>
            <RotateCcw size={15} /> Restart S31
          </Button>
          <span className="global-control-note">
            <RadioTower size={16} />
            <span>Changes are written to the S31 only when applied. Applying restarts the broadcast.</span>
          </span>
        </div>
      </Card>
    </>
  )
}
