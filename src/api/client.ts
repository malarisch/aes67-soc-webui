import type {
  ApiResult,
  AuracastCard,
  AuracastConfig,
  CardsOverview,
  DeviceConfig,
  DiscoveredStream,
  FirmwareStatus,
  IoCardStatus,
  LoCardStatus,
  MiCardStatus,
  PtpStatus,
  PtpTuning,
  PtpTuningResponse,
  RxStream,
  RxStreamInput,
  Summary,
  SystemStatus,
  TxStream,
  TxStreamInput,
} from './types'

const API = '/api'

export class ApiError extends Error {
  status: number
  code?: number
  /** Full error body, e.g. the Auracast 422 reply with error_reg_name. */
  detail?: Record<string, unknown>

  constructor(message: string, status: number, code?: number, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, {
    cache: 'no-store',
    ...init,
    headers: init?.body instanceof ArrayBuffer
      ? init.headers
      : { 'Content-Type': 'application/json', ...init?.headers },
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (HTTP ${response.status})`
    throw new ApiError(message, response.status, data?.code, data ?? undefined)
  }

  return (data ?? {}) as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  summary: () => request<Summary>('/summary'),
  ptp: () => request<PtpStatus>('/ptp'),
  ptpTuning: () => request<PtpTuningResponse>('/ptp/tuning'),
  updatePtpTuning: (value: PtpTuning) =>
    request<PtpTuningResponse>('/ptp/tuning', json('PATCH', value)),
  resetPtp: () => request<ApiResult>('/ptp/reset', json('POST', {})),

  txStreams: async () => (await request<{ tx_streams: TxStream[] }>('/streams/tx')).tx_streams || [],
  rxStreams: async () => (await request<{ rx_streams: RxStream[] }>('/streams/rx')).rx_streams || [],
  discoveredStreams: async () =>
    (await request<{ discovered_streams: DiscoveredStream[] }>('/streams/discovered')).discovered_streams || [],
  saveTxStream: (id: number, value: TxStreamInput) =>
    request<ApiResult>(`/streams/tx/${id}`, json('PUT', value)),
  saveRxStream: (id: number, value: RxStreamInput) =>
    request<ApiResult>(`/streams/rx/${id}`, json('PUT', value)),
  deleteTxStream: (id: number) => request<ApiResult>(`/streams/tx/${id}`, json('DELETE')),
  deleteRxStream: (id: number) => request<ApiResult>(`/streams/rx/${id}`, json('DELETE')),

  cards: () => request<CardsOverview>('/cards'),
  rescanCards: () => request<CardsOverview>('/cards/rescan', json('POST', {})),
  miCard: () => request<MiCardStatus>('/cards/mi'),
  updateMiCard: (value: Partial<Pick<MiCardStatus, 'hpf' | 'f96khz'>>) =>
    request<MiCardStatus>('/cards/mi', json('PATCH', value)),
  updateMiChannel: (id: number, value: Partial<MiCardStatus['channels'][number]>) =>
    request<MiCardStatus>(`/cards/mi/channels/${id}`, json('PATCH', value)),
  loCard: () => request<LoCardStatus>('/cards/lo'),
  updateLoCard: (value: Partial<Pick<LoCardStatus, 'f96khz' | 'output_enable'>>) =>
    request<LoCardStatus>('/cards/lo', json('PATCH', value)),
  updateLoChannel: (id: number, value: Partial<LoCardStatus['channels'][number]>) =>
    request<LoCardStatus>(`/cards/lo/channels/${id}`, json('PATCH', value)),
  ioCard: () => request<IoCardStatus>('/cards/io'),
  updateIoCard: (value: Partial<Pick<IoCardStatus, 'f96khz' | 'output_enable'>>) =>
    request<IoCardStatus>('/cards/io', json('PATCH', value)),
  updateIoInput: (id: number, value: Partial<IoCardStatus['inputs'][number]>) =>
    request<IoCardStatus>(`/cards/io/inputs/${id}`, json('PATCH', value)),
  updateIoOutput: (id: number, value: Partial<IoCardStatus['outputs'][number]>) =>
    request<IoCardStatus>(`/cards/io/outputs/${id}`, json('PATCH', value)),
  resetCard: (type: 'mi' | 'lo' | 'io') =>
    request<ApiResult>(`/cards/${type}/reset`, json('POST', {})),
  auracastCard: () => request<AuracastCard>('/cards/auracast'),
  updateAuracastCard: (value: Partial<AuracastConfig>) =>
    request<AuracastCard>('/cards/auracast', json('PATCH', value)),
  auracastStart: () => request<AuracastCard>('/cards/auracast/start', json('POST', {})),
  auracastStop: () => request<AuracastCard>('/cards/auracast/stop', json('POST', {})),
  auracastReset: () => request<AuracastCard>('/cards/auracast/reset', json('POST', {})),

  config: () => request<DeviceConfig>('/config'),
  updateConfig: (value: Partial<DeviceConfig>) =>
    request<DeviceConfig>('/config', json('PATCH', value)),
  system: () => request<SystemStatus>('/system'),
  formatStorage: () => request<ApiResult>('/system/storage/format', json('POST', {})),
  reboot: () => request<ApiResult>('/system/reboot', json('POST', {})),
  firmware: () => request<FirmwareStatus>('/fw_update'),
}

export function uploadFirmware(
  file: File,
  onProgress: (percent: number) => void,
): Promise<FirmwareStatus> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/fw_update`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onerror = () => reject(new ApiError('Network error during upload', 0))
    xhr.onload = () => {
      let data: FirmwareStatus = {}
      try {
        data = JSON.parse(xhr.responseText) as FirmwareStatus
      } catch {
        // The status below still produces a useful error.
      }
      if (xhr.status < 200 || xhr.status >= 300 || data.status === 'error') {
        reject(new ApiError(String(data.error || `Upload failed (HTTP ${xhr.status})`), xhr.status))
      } else {
        resolve(data)
      }
    }
    xhr.send(file)
  })
}
