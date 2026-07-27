import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleStop,
  Edit3,
  Plus,
  Radio,
  RadioTower,
  Route,
  SatelliteDish,
  Search,
  Trash2,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type {
  DiscoveredStream,
  RxStream,
  RxStreamInput,
  StreamData,
  TxStream,
  TxStreamInput,
} from '../api/types'
import { usePolling } from '../hooks/usePolling'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Segmented,
  useConfirm,
  useToast,
} from '../components/ui'

type Editor =
  | { kind: 'tx'; id: number; values: TxStreamForm }
  | { kind: 'rx'; id: number; values: RxStreamForm }
  | null

type TxStreamForm = {
  name: string
  dst_ip: string
  channel_count: number
  samples_per_pkt: number
  ch_ids: string
}

type RxStreamForm = {
  name: string
  sender_name: string
  sender_ip: string
  dst_ip: string
  dst_port: number
  channel_count: number
  output_delay: number
  samples_per_channel: number
  ch_map: string
}

const DEFAULT_TX: TxStreamForm = {
  name: '',
  dst_ip: '239.69.0.1',
  channel_count: 2,
  samples_per_pkt: 48,
  ch_ids: '0, 1',
}

const DEFAULT_RX: RxStreamForm = {
  name: '',
  sender_name: '',
  sender_ip: '',
  dst_ip: '239.69.0.1',
  dst_port: 5004,
  channel_count: 2,
  output_delay: 0,
  samples_per_channel: 48,
  ch_map: '0, 1',
}

function parseList(value: string, count: number) {
  const result = value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isFinite(part))
    .slice(0, count)
  while (result.length < count) result.push(result.length)
  return result
}

function StreamSummary({
  label,
  value,
  caption,
  icon,
}: {
  label: string
  value: number
  caption: string
  icon: React.ReactNode
}) {
  return (
    <div className="stream-summary">
      <div className="stream-summary-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
      </div>
    </div>
  )
}

function TxTable({
  streams,
  onEdit,
  onDelete,
}: {
  streams: TxStream[]
  onEdit: (stream: TxStream) => void
  onDelete: (stream: TxStream) => void
}) {
  if (!streams.length) {
    return (
      <EmptyState
        icon={<ArrowUpFromLine size={22} />}
        title="No transmit streams"
        description="Create a multicast flow to publish audio from this node."
      />
    )
  }
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Stream</th><th>Destination</th><th>Channels</th><th>Packet</th><th>Map</th><th /></tr></thead>
        <tbody>
          {streams.map((stream) => (
            <tr key={stream.stream_id}>
              <td>
                <div className="table-primary"><Badge tone="info">TX {stream.stream_id}</Badge><strong>{stream.name || 'Unnamed stream'}</strong></div>
              </td>
              <td className="mono">{stream.dst_ip}</td>
              <td>{stream.channel_count}</td>
              <td>{stream.samples_per_packet} smp</td>
              <td className="mono">{stream.ch_ids.join(' · ')}</td>
              <td>
                <div className="table-actions">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(stream)}><Edit3 size={14} /> Edit</Button>
                  <Button size="sm" variant="ghost" className="danger-ghost" onClick={() => onDelete(stream)}><Trash2 size={14} /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RxTable({
  streams,
  onEdit,
  onDelete,
}: {
  streams: RxStream[]
  onEdit: (stream: RxStream) => void
  onDelete: (stream: RxStream) => void
}) {
  if (!streams.length) {
    return (
      <EmptyState
        icon={<ArrowDownToLine size={22} />}
        title="No receive streams"
        description="Subscribe to a discovered flow or configure one manually."
      />
    )
  }
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Stream</th><th>Sender</th><th>Destination</th><th>Channels</th><th>Buffer</th><th>Output map</th><th>Status</th><th /></tr></thead>
        <tbody>
          {streams.map((stream) => (
            <tr key={stream.stream_id}>
              <td><div className="table-primary"><Badge tone="ok">RX {stream.stream_id}</Badge><strong>{stream.name || `Receive stream ${stream.stream_id}`}</strong></div></td>
              <td>
                <strong>{stream.sender_name || stream.sender_ip || 'Unknown sender'}</strong>
                {stream.sender_ip && stream.sender_ip !== stream.sender_name && <small className="table-subline mono">{stream.sender_ip}</small>}
              </td>
              <td><span className="mono">{stream.dst_ip}</span><small className="table-subline">UDP {stream.dst_port}</small></td>
              <td>{stream.channel_count}</td>
              <td>{stream.samples_per_channel} smp <small className="table-subline">{stream.output_delay} delay</small></td>
              <td className="mono">{stream.ch_map.slice(0, stream.channel_count).join(' · ')}</td>
              <td><Badge tone={stream.underrun ? 'danger' : 'ok'} pulse={stream.underrun}>{stream.underrun ? 'UNDERRUN' : 'HEALTHY'}</Badge></td>
              <td>
                <div className="table-actions">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(stream)}><Edit3 size={14} /> Edit</Button>
                  <Button size="sm" variant="ghost" className="danger-ghost" onClick={() => onDelete(stream)}><Trash2 size={14} /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DiscoveredTable({
  streams,
  onSubscribe,
}: {
  streams: DiscoveredStream[]
  onSubscribe: (stream: DiscoveredStream) => void
}) {
  if (!streams.length) {
    return (
      <EmptyState
        icon={<SatelliteDish size={22} />}
        title="No sessions discovered"
        description="Listening for SAP and mDNS announcements on the network."
      />
    )
  }
  return (
    <div className="discovery-grid">
      {streams.map((stream) => (
        <article className="discovery-card" key={`${stream.mcast_addr}:${stream.port}`}>
          <div className="discovery-top">
            <div className="discovery-icon"><RadioTower size={18} /></div>
            <Badge tone="neutral">{stream.via || 'SAP'}</Badge>
          </div>
          <h3>{stream.name || 'Unnamed session'}</h3>
          <span className="mono discovery-address">{stream.mcast_addr}:{stream.port}</span>
          <div className="discovery-meta">
            <span><strong>{stream.channels}</strong> channels</span>
            <span><strong>{stream.bit_depth}</strong> bit</span>
            <span><strong>{stream.sample_rate / 1000}</strong> kHz</span>
          </div>
          <div className="discovery-origin">
            <span>Sender</span>
            <span>
              <strong>{stream.sender_name || stream.origin_addr || 'Unknown'}</strong>
              {stream.sender_name && stream.origin_addr && <small className="table-subline mono">{stream.origin_addr}</small>}
            </span>
          </div>
          <Button variant="primary" size="sm" onClick={() => onSubscribe(stream)}>
            <ArrowDownToLine size={14} /> Subscribe
          </Button>
        </article>
      ))}
    </div>
  )
}

export function StreamsPage({
  active,
  pollInterval,
  onUpdated,
}: {
  active: boolean
  pollInterval: number
  onUpdated: (date: Date) => void
}) {
  const loader = async (): Promise<StreamData> => {
    const [tx, rx, discovered] = await Promise.all([
      api.txStreams(),
      api.rxStreams(),
      api.discoveredStreams(),
    ])
    return { tx, rx, discovered }
  }
  const polling = usePolling(loader, pollInterval, active)
  const [tab, setTab] = useState('active')
  const [editor, setEditor] = useState<Editor>(null)
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()

  useEffect(() => {
    if (polling.updatedAt) onUpdated(polling.updatedAt)
  }, [onUpdated, polling.updatedAt])

  const updateEditor = (patch: Record<string, string | number>) => {
    setEditor((current) => {
      if (!current) return current
      if (current.kind === 'tx') {
        return { ...current, values: { ...current.values, ...patch } as TxStreamForm }
      }
      return { ...current, values: { ...current.values, ...patch } as RxStreamForm }
    })
  }
  const data = polling.data || { tx: [], rx: [], discovered: [] }
  const usedTx = useMemo(() => new Set(data.tx.map((stream) => stream.stream_id)), [data.tx])
  const usedRx = useMemo(() => new Set(data.rx.map((stream) => stream.stream_id)), [data.rx])
  const firstFree = (used: Set<number>) => {
    for (let id = 0; id < 8; id += 1) if (!used.has(id)) return id
    return 0
  }

  const openTx = (stream?: TxStream) => setEditor({
    kind: 'tx',
    id: stream?.stream_id ?? firstFree(usedTx),
    values: stream ? {
      name: stream.name || '',
      dst_ip: stream.dst_ip,
      channel_count: stream.channel_count,
      samples_per_pkt: stream.samples_per_packet,
      ch_ids: stream.ch_ids.join(', '),
    } : { ...DEFAULT_TX },
  })

  const openRx = (stream?: RxStream, discovered?: DiscoveredStream) => {
    const channels = discovered?.channels || stream?.channel_count || 2
    setEditor({
      kind: 'rx',
      id: stream?.stream_id ?? firstFree(usedRx),
      values: stream ? {
        name: stream.name || '',
        sender_name: stream.sender_name || '',
        sender_ip: stream.sender_ip || '',
        dst_ip: stream.dst_ip,
        dst_port: stream.dst_port,
        channel_count: stream.channel_count,
        output_delay: stream.output_delay,
        samples_per_channel: stream.samples_per_channel,
        ch_map: stream.ch_map.join(', '),
      } : discovered ? {
        name: discovered.name || '',
        sender_name: discovered.sender_name || '',
        sender_ip: discovered.origin_addr || '',
        dst_ip: discovered.mcast_addr,
        dst_port: discovered.port || 5004,
        channel_count: channels,
        output_delay: 0,
        samples_per_channel: discovered.samples_per_packet || 48,
        ch_map: Array.from({ length: channels }, (_, id) => id).join(', '),
      } : { ...DEFAULT_RX },
    })
  }

  const remove = async (kind: 'tx' | 'rx', stream: TxStream | RxStream) => {
    const id = stream.stream_id
    const approved = await confirm({
      title: `Remove ${kind.toUpperCase()} stream ${id}?`,
      message: 'The stream slot will be disabled immediately. You can configure it again at any time.',
      confirmLabel: 'Remove stream',
      destructive: true,
    })
    if (!approved) return
    try {
      if (kind === 'tx') await api.deleteTxStream(id)
      else await api.deleteRxStream(id)
      toast(`${kind.toUpperCase()} stream ${id} removed`)
      await polling.refresh()
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    }
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editor) return
    setSaving(true)
    try {
      if (editor.kind === 'tx') {
        const value: TxStreamInput = {
          name: editor.values.name.trim(),
          dst_ip: editor.values.dst_ip.trim(),
          channel_count: Number(editor.values.channel_count),
          samples_per_pkt: Number(editor.values.samples_per_pkt),
          ch_ids: parseList(editor.values.ch_ids, Number(editor.values.channel_count)),
        }
        await api.saveTxStream(editor.id, value)
      } else {
        const value: RxStreamInput = {
          name: editor.values.name.trim(),
          sender_name: editor.values.sender_name.trim(),
          sender_ip: editor.values.sender_ip.trim(),
          dst_ip: editor.values.dst_ip.trim(),
          dst_port: Number(editor.values.dst_port),
          channel_count: Number(editor.values.channel_count),
          output_delay: Number(editor.values.output_delay),
          samples_per_channel: Number(editor.values.samples_per_channel),
          ch_map: parseList(editor.values.ch_map, Number(editor.values.channel_count)),
        }
        await api.saveRxStream(editor.id, value)
      }
      toast(`${editor.kind.toUpperCase()} stream ${editor.id} configured`)
      setEditor(null)
      await polling.refresh()
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (polling.loading && !polling.data) return <LoadingState label="Reading stream configuration…" />
  if (polling.error && !polling.data) return <ErrorState error={polling.error} onRetry={() => void polling.refresh()} />

  return (
    <div className="page-stack">
      <div className="stream-overview-card">
        <div className="stream-overview-copy">
          <div className="eyebrow">MEDIA ROUTING</div>
          <h2>Audio flows at a glance</h2>
          <p>Publish, receive and discover AES67 multicast sessions.</p>
        </div>
        <StreamSummary label="Transmit" value={data.tx.length} caption="active flows" icon={<ArrowUpFromLine size={20} />} />
        <StreamSummary label="Receive" value={data.rx.length} caption="active subscriptions" icon={<ArrowDownToLine size={20} />} />
        <StreamSummary label="Discovered" value={data.discovered.length} caption="network sessions" icon={<SatelliteDish size={20} />} />
      </div>

      <div className="section-toolbar">
        <Segmented
          value={tab}
          options={[
            { value: 'active', label: 'Configured streams' },
            { value: 'discovered', label: `Discovered (${data.discovered.length})` },
          ]}
          onChange={setTab}
        />
        {tab === 'active' && (
          <div className="toolbar-actions">
            <Button onClick={() => openRx()}><Plus size={15} /> Add RX</Button>
            <Button variant="primary" onClick={() => openTx()}><Plus size={15} /> Add TX</Button>
          </div>
        )}
      </div>

      {tab === 'active' ? (
        <>
          <Card title="Transmit streams" eyebrow="PUBLISH" action={<Badge tone="neutral">{data.tx.length} / 8 slots</Badge>}>
            <TxTable streams={data.tx} onEdit={openTx} onDelete={(stream) => void remove('tx', stream)} />
          </Card>
          <Card title="Receive streams" eyebrow="SUBSCRIBE" action={<Badge tone="neutral">{data.rx.length} / 8 slots</Badge>}>
            <RxTable streams={data.rx} onEdit={(stream) => openRx(stream)} onDelete={(stream) => void remove('rx', stream)} />
          </Card>
        </>
      ) : (
        <Card
          title="Sessions on the network"
          eyebrow="SAP / mDNS"
          action={<span className="discovery-listening"><i /> Listening</span>}
        >
          <DiscoveredTable streams={data.discovered} onSubscribe={(stream) => openRx(undefined, stream)} />
        </Card>
      )}

      <Modal
        open={editor !== null}
        onClose={() => !saving && setEditor(null)}
        title={editor ? `${editor.kind === 'tx' ? 'Transmit' : 'Receive'} stream ${editor.id}` : ''}
        eyebrow={editor?.kind === 'tx' ? 'PUBLISH MULTICAST AUDIO' : 'SUBSCRIBE TO MULTICAST AUDIO'}
        footer={(
          <>
            <Button onClick={() => setEditor(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" type="submit" form="stream-form" busy={saving}>
              <Route size={15} /> Apply stream
            </Button>
          </>
        )}
      >
        {editor && (
          <form id="stream-form" onSubmit={save}>
            <div className="form-grid">
              <Field label="Stream slot" hint="Hardware stream ID, 0–7">
                <select
                  value={editor.id}
                  onChange={(event) => setEditor({ ...editor, id: Number(event.target.value) })}
                >
                  {Array.from({ length: 8 }, (_, id) => (
                    <option key={id} value={id}>Slot {id}{(editor.kind === 'tx' ? usedTx : usedRx).has(id) ? ' · configured' : ''}</option>
                  ))}
                </select>
              </Field>
              <Field label="Session name">
                <input
                  value={editor.values.name}
                  placeholder="Main mix"
                  maxLength={31}
                  onChange={(event) => updateEditor({ name: event.target.value })}
                />
              </Field>
              {editor.kind === 'rx' && (
                <>
                  <Field label="Sender name">
                    <input
                      value={editor.values.sender_name}
                      placeholder="Studio A"
                      maxLength={31}
                      onChange={(event) => updateEditor({ sender_name: event.target.value })}
                    />
                  </Field>
                  <Field label="Sender address">
                    <input
                      value={editor.values.sender_ip}
                      placeholder="192.168.1.20"
                      pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
                      onChange={(event) => updateEditor({ sender_ip: event.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field label="Multicast address">
                <input
                  required
                  value={editor.values.dst_ip}
                  placeholder="239.69.0.1"
                  pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
                  onChange={(event) => updateEditor({ dst_ip: event.target.value })}
                />
              </Field>
              {editor.kind === 'rx' && (
                <Field label="UDP port">
                  <input
                    required type="number" min={1} max={65535}
                    value={editor.values.dst_port}
                    onChange={(event) => updateEditor({ dst_port: Number(event.target.value) })}
                  />
                </Field>
              )}
              <Field label="Channel count" hint="1–8 channels per stream">
                <input
                  required type="number" min={1} max={8}
                  value={editor.values.channel_count}
                  onChange={(event) => updateEditor({ channel_count: Number(event.target.value) })}
                />
              </Field>
              {editor.kind === 'tx' ? (
                <>
                  <Field label="Samples per packet">
                    <input
                      required type="number" min={1} max={255}
                      value={editor.values.samples_per_pkt}
                      onChange={(event) => updateEditor({ samples_per_pkt: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label="Source channel IDs" hint="Comma-separated FPGA channel IDs" className="field-span">
                    <input
                      required value={editor.values.ch_ids}
                      onChange={(event) => updateEditor({ ch_ids: event.target.value })}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Samples per channel">
                    <input
                      required type="number" min={1} max={255}
                      value={editor.values.samples_per_channel}
                      onChange={(event) => updateEditor({ samples_per_channel: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label="Output delay" hint="Samples buffered before playout">
                    <input
                      required type="number" min={0} max={255}
                      value={editor.values.output_delay}
                      onChange={(event) => updateEditor({ output_delay: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label="Output channel map" hint="Comma-separated FPGA output IDs" className="field-span">
                    <input
                      required value={editor.values.ch_map}
                      onChange={(event) => updateEditor({ ch_map: event.target.value })}
                    />
                  </Field>
                </>
              )}
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
