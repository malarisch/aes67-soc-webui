import {
  Boxes,
  Cable,
  CircleSlash2,
  Gauge,
  Mic2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type {
  AuracastCard,
  CardsOverview,
  InputChannel,
  IoCardStatus,
  LoCardStatus,
  MiCardStatus,
  OutputChannel,
} from '../api/types'
import { usePolling } from '../hooks/usePolling'
import { AuracastPanel } from './cards/AuracastPanel'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  Toggle,
  useConfirm,
  useToast,
} from '../components/ui'

type CardKind = 'mi' | 'lo' | 'io' | 'auracast' | null
type CardStatus = MiCardStatus | LoCardStatus | IoCardStatus | AuracastCard | null
type CardPageData = { overview: CardsOverview; kind: CardKind; status: CardStatus }

function detectKind(typeId: number): CardKind {
  return typeId === 1 ? 'mi' : typeId === 2 ? 'lo' : typeId === 3 ? 'io' : typeId === 4 ? 'auracast' : null
}

function cloneWithInput(data: CardPageData, id: number, patch: Partial<InputChannel>): CardPageData {
  if (!data.status) return data
  if (data.kind === 'io') {
    const status = data.status as IoCardStatus
    return { ...data, status: { ...status, inputs: status.inputs.map((channel) => channel.id === id ? { ...channel, ...patch } : channel) } }
  }
  if (data.kind === 'mi') {
    const status = data.status as MiCardStatus
    return { ...data, status: { ...status, channels: status.channels.map((channel) => channel.id === id ? { ...channel, ...patch } : channel) } }
  }
  return data
}

function cloneWithOutput(data: CardPageData, id: number, patch: Partial<OutputChannel>): CardPageData {
  if (!data.status) return data
  if (data.kind === 'io') {
    const status = data.status as IoCardStatus
    return { ...data, status: { ...status, outputs: status.outputs.map((channel) => channel.id === id ? { ...channel, ...patch } : channel) } }
  }
  if (data.kind === 'lo') {
    const status = data.status as LoCardStatus
    return { ...data, status: { ...status, channels: status.channels.map((channel) => channel.id === id ? { ...channel, ...patch } : channel) } }
  }
  return data
}

function InputStrip({
  channel,
  onPatch,
  onPreview,
  onInteracting,
}: {
  channel: InputChannel
  onPatch: (id: number, patch: Partial<InputChannel>) => Promise<void>
  onPreview: (id: number, patch: Partial<InputChannel>) => void
  onInteracting: (value: boolean) => void
}) {
  return (
    <article className={`channel-strip ${channel.muted ? 'is-muted' : ''} ${channel.clip ? 'is-clipping' : ''}`}>
      <header>
        <div className="channel-number">{String(channel.id + 1).padStart(2, '0')}</div>
        <div>
          <strong>Input {channel.id + 1}</strong>
          <span>ADC preamplifier</span>
        </div>
        {channel.clip && <Badge tone="danger" pulse>CLIP</Badge>}
      </header>
      <div className="channel-control">
        <div className="control-label"><span>Preamp gain</span><strong>{channel.gain > 0 ? '+' : ''}{channel.gain} dB</strong></div>
        <input
          type="range"
          min={-6}
          max={66}
          value={channel.gain}
          onPointerDown={() => onInteracting(true)}
          onPointerUp={(event) => {
            onInteracting(false)
            void onPatch(channel.id, { gain: Number(event.currentTarget.value) })
          }}
          onChange={(event) => onPreview(channel.id, { gain: Number(event.target.value) })}
          aria-label={`Input ${channel.id + 1} gain`}
        />
        <div className="range-labels"><span>−6</span><span>+66</span></div>
      </div>
      <div className="channel-buttons">
        <button
          className={`channel-button phantom ${channel.phantom ? 'is-active' : ''}`}
          onClick={() => void onPatch(channel.id, { phantom: !channel.phantom })}
        >
          <Zap size={14} /> 48V
        </button>
        <button
          className={`channel-button mute ${channel.muted ? 'is-active' : ''}`}
          onClick={() => void onPatch(channel.id, { muted: !channel.muted })}
        >
          {channel.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          {channel.muted ? 'Muted' : 'Active'}
        </button>
      </div>
    </article>
  )
}

function OutputStrip({
  channel,
  onPatch,
  onPreview,
  onInteracting,
}: {
  channel: OutputChannel
  onPatch: (id: number, patch: Partial<OutputChannel>) => Promise<void>
  onPreview: (id: number, patch: Partial<OutputChannel>) => void
  onInteracting: (value: boolean) => void
}) {
  return (
    <article className={`channel-strip output-strip ${channel.muted ? 'is-muted' : ''}`}>
      <header>
        <div className="channel-number">{String(channel.id + 1).padStart(2, '0')}</div>
        <div>
          <strong>Output {channel.id + 1}</strong>
          <span>DAC line output</span>
        </div>
      </header>
      <div className="channel-control">
        <div className="control-label"><span>Clip level</span><strong>{channel.clip > 0 ? '+' : ''}{channel.clip} dB</strong></div>
        <input
          type="range"
          min={-9}
          max={24}
          value={channel.clip}
          onPointerDown={() => onInteracting(true)}
          onPointerUp={(event) => {
            onInteracting(false)
            void onPatch(channel.id, { clip: Number(event.currentTarget.value) })
          }}
          onChange={(event) => onPreview(channel.id, { clip: Number(event.target.value) })}
          aria-label={`Output ${channel.id + 1} clip level`}
        />
        <div className="range-labels"><span>−9</span><span>+24</span></div>
      </div>
      <button
        className={`channel-button mute full ${channel.muted ? 'is-active' : ''}`}
        onClick={() => void onPatch(channel.id, { muted: !channel.muted })}
      >
        {channel.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        {channel.muted ? 'Output muted' : 'Output active'}
      </button>
    </article>
  )
}

export function CardsPage({
  active,
  pollInterval,
  onUpdated,
}: {
  active: boolean
  pollInterval: number
  onUpdated: (date: Date) => void
}) {
  const [interacting, setInteracting] = useState(false)
  const loader = async (): Promise<CardPageData> => {
    const overview = await api.cards()
    const slot = overview.slots?.[0]
    const kind = detectKind(slot?.type_id || 0)
    let status: CardStatus = null
    if (slot?.initialized && kind === 'mi') status = await api.miCard()
    if (slot?.initialized && kind === 'lo') status = await api.loCard()
    if (slot?.initialized && kind === 'io') status = await api.ioCard()
    if (slot?.initialized && kind === 'auracast') status = await api.auracastCard()
    return { overview, kind, status }
  }
  const polling = usePolling(loader, Math.max(pollInterval, 2000), active && !interacting)
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (polling.updatedAt) onUpdated(polling.updatedAt)
  }, [onUpdated, polling.updatedAt])

  const slot = polling.data?.overview.slots?.[0]
  const kind = polling.data?.kind
  const status = polling.data?.status
  const inputChannels = useMemo(() => {
    if (!status) return []
    if (kind === 'mi') return (status as MiCardStatus).channels
    if (kind === 'io') return (status as IoCardStatus).inputs
    return []
  }, [kind, status])
  const outputChannels = useMemo(() => {
    if (!status) return []
    if (kind === 'lo') return (status as LoCardStatus).channels
    if (kind === 'io') return (status as IoCardStatus).outputs
    return []
  }, [kind, status])

  const refresh = async () => {
    setBusy(true)
    try {
      await api.rescanCards()
      await polling.refresh()
      toast('I/O bus scan complete')
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    } finally {
      setBusy(false)
    }
  }

  const patchGlobal = async (patch: Record<string, boolean>) => {
    if (!kind) return
    try {
      if (kind === 'mi') await api.updateMiCard(patch)
      if (kind === 'lo') await api.updateLoCard(patch)
      if (kind === 'io') await api.updateIoCard(patch)
      await polling.refresh(true)
      toast('Card settings updated')
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
      await polling.refresh(true)
    }
  }

  const patchInput = async (id: number, patch: Partial<InputChannel>) => {
    try {
      if (kind === 'mi') await api.updateMiChannel(id, patch)
      if (kind === 'io') await api.updateIoInput(id, patch)
      if (polling.data) polling.setData(cloneWithInput(polling.data, id, patch))
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
      await polling.refresh(true)
    }
  }

  const patchOutput = async (id: number, patch: Partial<OutputChannel>) => {
    try {
      if (kind === 'lo') await api.updateLoChannel(id, patch)
      if (kind === 'io') await api.updateIoOutput(id, patch)
      if (polling.data) polling.setData(cloneWithOutput(polling.data, id, patch))
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
      await polling.refresh(true)
    }
  }

  const reset = async () => {
    if (!kind) return
    const approved = await confirm({
      title: `Reset ${slot?.type || 'I/O'} card?`,
      message: kind === 'auracast'
        ? 'The S31 restarts and the broadcast is interrupted for a few seconds, then resumes with the stored configuration.'
        : 'The card will briefly go offline. Persisted gain, mute and phantom-power settings are reapplied after initialization.',
      confirmLabel: 'Reset card',
      destructive: true,
    })
    if (!approved) return
    setBusy(true)
    try {
      if (kind === 'auracast') await api.auracastReset()
      else await api.resetCard(kind)
      toast('Card reset completed')
      window.setTimeout(() => void polling.refresh(), 500)
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (polling.loading && !polling.data) return <LoadingState label="Detecting I/O hardware…" />
  if (polling.error && !polling.data) return <ErrorState error={polling.error} onRetry={() => void polling.refresh()} />

  return (
    <div className="page-stack">
      <Card className="hardware-banner">
        <div className="hardware-illustration">
          <div className="rack-ear left" />
          <div className="rack-face">
            <div className="rack-leds"><i /><i /><i /></div>
            <div className="rack-display">{slot?.present ? (slot.type || 'CARD').toUpperCase() : 'NO CARD'}</div>
            <div className="rack-ports">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>
          </div>
          <div className="rack-ear right" />
        </div>
        <div className="hardware-copy">
          <div className="eyebrow">SLOT 01 · I²C CONTROL</div>
          <h2>{slot?.present ? slot.type : 'No expansion card detected'}</h2>
          <p>
            {slot?.present
              ? kind === 'auracast'
                ? `ESP32-S31 firmware ${(status as AuracastCard | null)?.status.fw_version ?? `${slot.soft_id ?? 0}.${slot.board_id ?? 0}.${slot.hard_rev ?? 0}`} · I²C 0x3A`
                : `Board 0x${(slot.board_id || 0).toString(16).toUpperCase().padStart(2, '0')} · hardware revision ${slot.hard_rev ?? '—'}`
              : 'Connect an MI, LO, IO or Auracast card and rescan the bus.'}
          </p>
          <div className="hardware-badges">
            <Badge tone={slot?.initialized ? 'ok' : slot?.present ? 'danger' : 'neutral'} pulse={Boolean(slot?.initialized)}>
              {slot?.initialized ? 'INITIALIZED' : slot?.present ? 'INIT FAILED' : 'EMPTY SLOT'}
            </Badge>
            {(polling.data?.overview.i2c_devices || []).map((address) => (
              <Badge key={address} tone="neutral">I²C 0x{address.toString(16).toUpperCase().padStart(2, '0')}</Badge>
            ))}
          </div>
        </div>
        <div className="hardware-actions">
          <Button busy={busy} onClick={() => void refresh()}><RefreshCw size={15} /> Rescan bus</Button>
          {slot?.present && <Button variant="danger" busy={busy} onClick={() => void reset()}><RotateCcw size={15} /> Reset card</Button>}
        </div>
      </Card>

      {!slot?.present ? (
        <EmptyState
          icon={<Boxes size={24} />}
          title="The I/O slot is empty"
          description="No supported audio card responded during the last hardware scan."
          action={<Button variant="primary" busy={busy} onClick={() => void refresh()}><Cable size={15} /> Scan again</Button>}
        />
      ) : !slot.initialized ? (
        <EmptyState
          icon={<CircleSlash2 size={24} />}
          title="Card initialization failed"
          description="The card identifies correctly but did not finish its initialization sequence."
          action={<Button variant="danger" busy={busy} onClick={() => void reset()}><RotateCcw size={15} /> Reset hardware</Button>}
        />
      ) : kind === 'auracast' && status ? (
        <AuracastPanel
          data={status as AuracastCard}
          onInteracting={setInteracting}
          onChanged={(next) => polling.data && polling.setData({ ...polling.data, status: next })}
        />
      ) : (
        <>
          <Card title="Card-level controls" eyebrow="GLOBAL SETTINGS">
            <div className="global-controls">
              {kind === 'mi' && (
                <Toggle
                  label="High-pass filter"
                  checked={(status as MiCardStatus).hpf}
                  onChange={(hpf) => void patchGlobal({ hpf })}
                />
              )}
              {kind !== 'io' && (
                <Toggle
                  label="96 kHz sample rate"
                  checked={(status as MiCardStatus | LoCardStatus).f96khz}
                  onChange={(f96khz) => void patchGlobal({ f96khz })}
                />
              )}
              {(kind === 'lo' || kind === 'io') && (
                <Toggle
                  label="Master output enable"
                  checked={(status as LoCardStatus | IoCardStatus).output_enable}
                  onChange={(output_enable) => void patchGlobal({ output_enable })}
                />
              )}
              <div className="global-control-note">
                <Sparkles size={16} />
                <span>Changes are persisted automatically after a short debounce.</span>
              </div>
            </div>
          </Card>

          {inputChannels.length > 0 && (
            <Card
              title="Analog inputs"
              eyebrow={`${inputChannels.length} CHANNEL PREAMPLIFIER`}
              action={<Badge tone={inputChannels.some((channel) => channel.clip) ? 'danger' : 'ok'}>{inputChannels.some((channel) => channel.clip) ? 'CLIP DETECTED' : 'LEVELS OK'}</Badge>}
            >
              <div className="channel-grid">
                {inputChannels.map((channel) => (
                  <InputStrip
                    key={channel.id}
                    channel={channel}
                    onPatch={patchInput}
                    onInteracting={setInteracting}
                    onPreview={(id, patch) => polling.data && polling.setData(cloneWithInput(polling.data, id, patch))}
                  />
                ))}
              </div>
            </Card>
          )}

          {outputChannels.length > 0 && (
            <Card
              title="Analog outputs"
              eyebrow={`${outputChannels.length} CHANNEL LINE OUTPUT`}
              action={<Badge tone={(status as LoCardStatus | IoCardStatus).output_enable ? 'ok' : 'warning'}>{(status as LoCardStatus | IoCardStatus).output_enable ? 'OUTPUTS ENABLED' : 'MASTER DISABLED'}</Badge>}
            >
              <div className="channel-grid">
                {outputChannels.map((channel) => (
                  <OutputStrip
                    key={channel.id}
                    channel={channel}
                    onPatch={patchOutput}
                    onInteracting={setInteracting}
                    onPreview={(id, patch) => polling.data && polling.setData(cloneWithOutput(polling.data, id, patch))}
                  />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
