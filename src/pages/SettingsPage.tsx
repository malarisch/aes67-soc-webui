import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Cpu,
  Database,
  FileCode2,
  HardDrive,
  Network,
  RefreshCw,
  RotateCw,
  Save,
  ServerCog,
  Settings2,
  ShieldCheck,
  UploadCloud,
  Wifi,
} from 'lucide-react'
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { api, uploadFirmware } from '../api/client'
import type { DeviceConfig, FirmwareStatus, SystemStatus } from '../api/types'
import { usePolling } from '../hooks/usePolling'
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  LoadingState,
  Metric,
  Segmented,
  Toggle,
  useConfirm,
  useToast,
} from '../components/ui'

type SettingsData = {
  config: DeviceConfig
  system: SystemStatus
  firmware: FirmwareStatus | null
}

const FACTORY_DEFAULTS: DeviceConfig = {
  device_name: 'AES67 Node',
  default_mcast_addr: '239.69.0.1',
  default_port: 5004,
  default_channels: 2,
  default_bit_depth: 24,
  default_sample_rate: 48000,
  default_samples_per_pkt: 48,
  default_payload_type: 97,
  ptp_domain: 0,
  ptp_priority1: 128,
  ptp_priority2: 128,
  ptp_clock_class: 248,
  ptp_clock_accuracy: 254,
  ptp_log_sync_interval: -3,
  ptp_log_announce_interval: 0,
  pi_kp_num: 1,
  pi_kp_den: 4,
  pi_ki_num: 1,
  pi_ki_den: 32,
  pi_imax: 500000,
  pi_outlier_ppb: 50000000,
  pi_warmup_cycles: 3,
  sap_announce_interval_s: 30,
  sap_announce_enabled: true,
}

function uptime(seconds: number | undefined) {
  if (seconds === undefined) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${days ? `${days}d ` : ''}${hours}h ${minutes}m`
}

function statusTone(value: string | undefined): 'ok' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (value === 'ok') return 'ok'
  if (value === 'error' || value === 'no_card') return 'danger'
  if (value === 'no_file') return 'warning'
  if (value === 'not_loaded') return 'info'
  return 'neutral'
}

function statusLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    ok: 'LOADED',
    no_file: 'DEFAULTS',
    no_card: 'NO CARD',
    error: 'ERROR',
    not_loaded: 'NOT LOADED',
    disabled: 'DISABLED',
  }
  return labels[value || ''] || (value || 'UNKNOWN').replaceAll('_', ' ').toUpperCase()
}

function ConfigField({
  label,
  field,
  form,
  update,
  min,
  max,
  hint,
}: {
  label: string
  field: keyof DeviceConfig
  form: DeviceConfig
  update: <K extends keyof DeviceConfig>(key: K, value: DeviceConfig[K]) => void
  min?: number
  max?: number
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        value={String(form[field])}
        onChange={(event) => update(field, Number(event.target.value) as never)}
      />
    </Field>
  )
}

function FirmwarePanel({
  firmware,
  refresh,
}: {
  firmware: FirmwareStatus | null
  refresh: () => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const confirm = useConfirm()

  const select = (next: File | undefined) => {
    if (!next) return
    setFile(next)
    setMessage(`Ready to upload ${next.name}`)
    setProgress(0)
  }

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    select(event.dataTransfer.files[0])
  }

  const upload = async () => {
    if (!file) return
    const approved = await confirm({
      title: `Flash ${file.name}?`,
      message: `This writes ${file.size.toLocaleString()} bytes to the firmware partition. Do not power off the node during the update.`,
      confirmLabel: 'Flash firmware',
      destructive: true,
    })
    if (!approved) return

    setUploading(true)
    setProgress(0)
    setMessage('Uploading image to the node…')
    try {
      const accepted = await uploadFirmware(file, (percent) => setProgress(Math.round(percent / 2)))
      setMessage('Writing image to flash…')
      const total = accepted.bytes || file.size || 1
      let result: FirmwareStatus | null = null
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        result = await api.firmware()
        if (result.phase === 'writing') {
          setProgress(50 + Math.round(((result.written || 0) / total) * 50))
          setMessage(`Writing ${Number(result.written || 0).toLocaleString()} / ${total.toLocaleString()} bytes…`)
          continue
        }
        break
      }
      if (result?.phase === 'done' && result.crc_ok) {
        setProgress(100)
        setMessage('Firmware written and CRC verified.')
        toast('Firmware update completed')
      } else if (result?.phase === 'done') {
        setProgress(100)
        setMessage('Image was written, but CRC verification failed.')
        toast('Firmware CRC mismatch', 'error')
      } else {
        throw new Error(result?.error ? String(result.error) : 'Firmware write timed out')
      }
      await refresh()
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : String(reason)
      setMessage(text)
      toast(text, 'error')
    } finally {
      setUploading(false)
    }
  }

  if (!firmware) {
    return (
      <Card title="Firmware update" eyebrow="NOT AVAILABLE">
        <div className="maintenance-unavailable">
          <FileCode2 size={22} />
          <div><strong>Flash update endpoint is disabled</strong><span>This firmware target does not expose an SPI flash updater.</span></div>
        </div>
      </Card>
    )
  }

  return (
    <div className="firmware-layout">
      <Card title="Installed image" eyebrow="SPI FLASH">
        <div className="firmware-chip">
          <div className="chip-body"><Cpu size={27} /><span>BOOT IMAGE</span></div>
          {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
        </div>
        <div className="metric-list">
          <Metric label="JEDEC ID" value={firmware.jedec_id || '—'} mono />
          <Metric label="Image size" value={firmware.fw_size ? `${firmware.fw_size.toLocaleString()} bytes` : firmware.bytes ? `${firmware.bytes.toLocaleString()} bytes` : 'No image'} />
          <Metric label="CRC-32" value={firmware.fw_crc || '—'} mono />
          <Metric label="Writer" value={<Badge tone={firmware.phase === 'error' ? 'danger' : firmware.phase === 'writing' ? 'warning' : 'ok'}>{(firmware.phase || 'idle').toUpperCase()}</Badge>} />
        </div>
      </Card>

      <Card title="Upload firmware" eyebrow="LITEX BOOT IMAGE">
        <input
          ref={inputRef}
          type="file"
          accept=".fbi,.bin"
          hidden
          onChange={(event) => select(event.target.files?.[0])}
        />
        <div
          className={`firmware-drop ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
        >
          {file ? <FileCode2 size={28} /> : <UploadCloud size={28} />}
          <strong>{file?.name || 'Drop a firmware image here'}</strong>
          <span>{file ? `${file.size.toLocaleString()} bytes` : 'or click to select a .fbi / .bin file'}</span>
        </div>
        {(uploading || progress > 0) && (
          <div className="upload-progress">
            <div><span>{message}</span><strong>{Math.min(progress, 100)}%</strong></div>
            <div className="progress-track"><i style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          </div>
        )}
        {!uploading && message && progress === 0 && <p className="upload-message">{message}</p>}
        <div className="form-actions">
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>Choose file</Button>
          <Button variant="primary" busy={uploading} disabled={!file} onClick={() => void upload()}>
            <UploadCloud size={15} /> Upload & verify
          </Button>
        </div>
      </Card>
    </div>
  )
}

export function SettingsPage({
  active,
  pollInterval,
  onUpdated,
  onDeviceNameChange,
}: {
  active: boolean
  pollInterval: number
  onUpdated: (date: Date) => void
  onDeviceNameChange: (name: string) => void
}) {
  const loader = async (): Promise<SettingsData> => {
    const [config, system, firmware] = await Promise.all([
      api.config(),
      api.system(),
      api.firmware().catch(() => null),
    ])
    return { config, system, firmware }
  }
  const polling = usePolling(loader, Math.max(pollInterval, 5000), active)
  const [tab, setTab] = useState('config')
  const [form, setForm] = useState<DeviceConfig | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [maintenanceBusy, setMaintenanceBusy] = useState('')
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    if (polling.updatedAt) onUpdated(polling.updatedAt)
  }, [onUpdated, polling.updatedAt])

  useEffect(() => {
    if (!dirty && polling.data?.config) setForm(polling.data.config)
  }, [dirty, polling.data?.config])

  const update = <K extends keyof DeviceConfig>(key: K, value: DeviceConfig[K]) => {
    if (!form) return
    setForm({ ...form, [key]: value })
    setDirty(true)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    try {
      const result = await api.updateConfig(form)
      setForm(result)
      setDirty(false)
      onDeviceNameChange(result.device_name)
      toast('Device configuration saved')
      await polling.refresh(true)
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    } finally {
      setSaving(false)
    }
  }

  const resetDefaults = async () => {
    const approved = await confirm({
      title: 'Restore factory configuration?',
      message: 'Network audio, PTP, PLL and SAP settings will be replaced with project defaults. Stream slots and I/O card settings are not changed.',
      confirmLabel: 'Restore defaults',
      destructive: true,
    })
    if (!approved) return
    setSaving(true)
    try {
      const result = await api.updateConfig(FACTORY_DEFAULTS)
      setForm(result)
      setDirty(false)
      onDeviceNameChange(result.device_name)
      toast('Factory configuration restored')
      await polling.refresh(true)
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatStorage = async () => {
    const approved = await confirm({
      title: 'Format the SD card?',
      message: 'All files on the SD card will be erased. This operation cannot be undone.',
      confirmLabel: 'Erase SD card',
      destructive: true,
    })
    if (!approved) return
    setMaintenanceBusy('format')
    try {
      await api.formatStorage()
      toast('SD card formatted')
      await polling.refresh()
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), 'error')
    } finally {
      setMaintenanceBusy('')
    }
  }

  const reboot = async () => {
    const approved = await confirm({
      title: 'Reboot this node?',
      message: 'Audio streams and the control interface will be unavailable while the MCU restarts.',
      confirmLabel: 'Reboot node',
      destructive: true,
    })
    if (!approved) return
    setMaintenanceBusy('reboot')
    try {
      await api.reboot()
    } catch {
      // A dropped connection is expected once the delayed reboot runs.
    }
    toast('Node is rebooting', 'info')
    window.setTimeout(() => window.location.reload(), 5000)
  }

  if (polling.loading && !polling.data) return <LoadingState label="Reading device configuration…" />
  if (polling.error && !polling.data) return <ErrorState error={polling.error} onRetry={() => void polling.refresh()} />
  if (!polling.data || !form) return null

  const system = polling.data.system

  return (
    <div className="page-stack">
      <div className="settings-hero">
        <div className="settings-hero-icon"><ServerCog size={26} /></div>
        <div>
          <div className="eyebrow">AES67 NODE</div>
          <h2>{form.device_name || 'AES67 Node'}</h2>
          <p>Firmware {system.version || '—'} · uptime {uptime(system.uptime_s)}</p>
        </div>
        <div className="settings-hero-status">
          <Badge tone="ok" pulse>RUNNING</Badge>
          <span>Configuration changes are persisted automatically.</span>
        </div>
      </div>

      <div className="section-toolbar">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'config', label: 'Configuration' },
            { value: 'system', label: 'System & storage' },
            { value: 'firmware', label: 'Firmware' },
          ]}
        />
        {tab === 'config' && dirty && <Badge tone="warning">UNSAVED CHANGES</Badge>}
      </div>

      {tab === 'config' && (
        <form onSubmit={save} className="config-stack">
          <Card title="Node identity & media defaults" eyebrow="AES67 SESSION">
            <div className="form-grid form-grid-4">
              <Field label="Device name" className="field-span-2">
                <input value={form.device_name} maxLength={63} onChange={(event) => update('device_name', event.target.value)} />
              </Field>
              <Field label="Default multicast group">
                <input value={form.default_mcast_addr} onChange={(event) => update('default_mcast_addr', event.target.value)} />
              </Field>
              <ConfigField label="Default UDP port" field="default_port" form={form} update={update} min={1} max={65535} />
              <ConfigField label="Channels" field="default_channels" form={form} update={update} min={1} max={64} />
              <Field label="Bit depth">
                <select value={form.default_bit_depth} onChange={(event) => update('default_bit_depth', Number(event.target.value))}>
                  <option value={16}>16 bit</option><option value={24}>24 bit</option><option value={32}>32 bit</option>
                </select>
              </Field>
              <Field label="Sample rate">
                <select value={form.default_sample_rate} onChange={(event) => update('default_sample_rate', Number(event.target.value))}>
                  <option value={44100}>44.1 kHz</option><option value={48000}>48 kHz</option><option value={96000}>96 kHz</option>
                </select>
              </Field>
              <ConfigField label="Samples per packet" field="default_samples_per_pkt" form={form} update={update} min={1} max={255} />
              <ConfigField label="RTP payload type" field="default_payload_type" form={form} update={update} min={96} max={127} />
            </div>
          </Card>

          <Card title="PTP announce profile" eyebrow="PRECISION TIME">
            <div className="form-grid form-grid-4">
              <ConfigField label="Domain" field="ptp_domain" form={form} update={update} min={0} max={127} />
              <ConfigField label="Priority 1" field="ptp_priority1" form={form} update={update} min={0} max={255} />
              <ConfigField label="Priority 2" field="ptp_priority2" form={form} update={update} min={0} max={255} />
              <Field label="Clock class">
                <select value={form.ptp_clock_class} onChange={(event) => update('ptp_clock_class', Number(event.target.value))}>
                  <option value={6}>6 · Primary</option><option value={7}>7 · Holdover</option><option value={13}>13 · Application</option>
                  <option value={52}>52 · Degraded A</option><option value={187}>187 · Degraded B</option><option value={248}>248 · Freerun</option><option value={255}>255 · Follower only</option>
                </select>
              </Field>
              <Field label="Clock accuracy">
                <select value={form.ptp_clock_accuracy} onChange={(event) => update('ptp_clock_accuracy', Number(event.target.value))}>
                  <option value={32}>0x20 · ±25 ns</option><option value={33}>0x21 · ±100 ns</option><option value={34}>0x22 · ±250 ns</option>
                  <option value={35}>0x23 · ±1 µs</option><option value={36}>0x24 · ±2.5 µs</option><option value={37}>0x25 · ±10 µs</option>
                  <option value={38}>0x26 · ±25 µs</option><option value={39}>0x27 · ±100 µs</option><option value={40}>0x28 · ±250 µs</option>
                  <option value={41}>0x29 · ±1 ms</option><option value={42}>0x2A · ±2.5 ms</option><option value={43}>0x2B · ±10 ms</option>
                  <option value={48}>0x30 · &gt;10 ms</option><option value={254}>0xFE · Unknown</option>
                </select>
              </Field>
              <ConfigField label="Log sync interval" field="ptp_log_sync_interval" form={form} update={update} min={-7} max={4} hint="Signed log₂ seconds" />
              <ConfigField label="Log announce interval" field="ptp_log_announce_interval" form={form} update={update} min={-3} max={4} hint="Signed log₂ seconds" />
            </div>
          </Card>

          <Card title="PLL controller" eyebrow="SOFTWARE PI LOOP">
            <div className="form-grid form-grid-4">
              <ConfigField label="Kp numerator" field="pi_kp_num" form={form} update={update} />
              <ConfigField label="Kp denominator" field="pi_kp_den" form={form} update={update} />
              <ConfigField label="Ki numerator" field="pi_ki_num" form={form} update={update} />
              <ConfigField label="Ki denominator" field="pi_ki_den" form={form} update={update} />
              <ConfigField label="Integrator maximum" field="pi_imax" form={form} update={update} hint="ppb" />
              <ConfigField label="Outlier threshold" field="pi_outlier_ppb" form={form} update={update} hint="ppb" />
              <ConfigField label="Warm-up cycles" field="pi_warmup_cycles" form={form} update={update} min={0} />
            </div>
          </Card>

          <Card title="Session announcement" eyebrow="SAP">
            <div className="sap-settings">
              <Toggle label="Publish configured transmit streams" checked={form.sap_announce_enabled} onChange={(value) => update('sap_announce_enabled', value)} />
              <ConfigField label="Announce interval" field="sap_announce_interval_s" form={form} update={update} min={1} hint="Seconds" />
            </div>
          </Card>

          <div className="sticky-save-bar">
            <div>
              <strong>{dirty ? 'Configuration has unsaved changes' : 'Configuration is up to date'}</strong>
              <span>{dirty ? 'Review the values above before applying them to the node.' : 'The form matches the active device configuration.'}</span>
            </div>
            <Button type="button" onClick={() => void resetDefaults()} busy={saving}><ArchiveRestore size={15} /> Factory defaults</Button>
            <Button type="submit" variant="primary" busy={saving} disabled={!dirty}><Save size={15} /> Save configuration</Button>
          </div>
        </form>
      )}

      {tab === 'system' && (
        <>
          <div className="system-grid">
            <Card title="Runtime" eyebrow="FIRMWARE">
              <div className="system-icon system-icon-blue"><Cpu size={23} /></div>
              <div className="metric-list">
                <Metric label="Firmware version" value={system.version || '—'} mono />
                <Metric label="Uptime" value={uptime(system.uptime_s)} />
                <Metric label="Node status" value={<Badge tone="ok" pulse>RUNNING</Badge>} />
              </div>
            </Card>
            <Card title="SD configuration" eyebrow="REMOVABLE STORAGE">
              <div className="system-icon system-icon-orange"><HardDrive size={23} /></div>
              <div className="metric-list">
                <Metric label="Card mount" value={<Badge tone={system.sd_mounted ? 'ok' : 'danger'}>{system.sd_mounted ? 'MOUNTED' : 'NOT MOUNTED'}</Badge>} />
                <Metric label="Config source" value={<Badge tone={statusTone(system.sd_config_status)}>{statusLabel(system.sd_config_status)}</Badge>} />
              </div>
            </Card>
            <Card title="Flash configuration" eyebrow="NON-VOLATILE STORAGE">
              <div className="system-icon system-icon-violet"><Database size={23} /></div>
              <div className="metric-list">
                <Metric label="Config source" value={<Badge tone={statusTone(system.flash_config_status)}>{statusLabel(system.flash_config_status)}</Badge>} />
                <Metric label="Persistence" value={system.flash_config_status === 'disabled' ? 'Unavailable' : 'Enabled'} />
              </div>
            </Card>
          </div>

          <Card title="Maintenance actions" eyebrow="SYSTEM CONTROL">
            <div className="maintenance-list">
              <div>
                <div className="maintenance-icon"><RefreshCw size={19} /></div>
                <div><strong>Refresh device state</strong><span>Re-read configuration and storage status.</span></div>
                <Button busy={maintenanceBusy === 'refresh'} onClick={() => void polling.refresh()}>Refresh</Button>
              </div>
              <div>
                <div className="maintenance-icon warning"><HardDrive size={19} /></div>
                <div><strong>Format SD card</strong><span>Erase the card and prepare a fresh configuration volume.</span></div>
                <Button
                  variant="danger"
                  busy={maintenanceBusy === 'format'}
                  disabled={system.sd_config_status === 'disabled'}
                  onClick={() => void formatStorage()}
                >
                  Format card
                </Button>
              </div>
              <div>
                <div className="maintenance-icon danger"><RotateCw size={19} /></div>
                <div><strong>Reboot MCU</strong><span>Restart firmware and temporarily interrupt all node services.</span></div>
                <Button variant="danger" busy={maintenanceBusy === 'reboot'} onClick={() => void reboot()}>Reboot node</Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {tab === 'firmware' && (
        <FirmwarePanel firmware={polling.data.firmware} refresh={async () => { await polling.refresh() }} />
      )}
    </div>
  )
}
