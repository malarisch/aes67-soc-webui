export type PtpRole = 'leader' | 'follower' | 'listening'

export interface NetworkStatus {
  ip?: string
  netmask?: string
  gateway?: string
  mac?: string
  link_up?: boolean
  phy_link_up?: boolean
  phy_speed?: string
}

export interface ForeignMaster {
  sender_id: string
  gm_identity: string
  priority1: number
  priority2: number
  clock_class: number
  clock_accuracy: number
  steps_removed: number
  announce_count: number
}

export interface PtpStatus {
  mode: 'software' | 'hardware' | string
  role: PtpRole
  clock_identity: string
  best_master: string
  offset_ns: number
  path_delay_ns: number
  locked: boolean
  steps_removed: number
  own_priority1: number
  own_priority2: number
  own_clock_class: number
  own_clock_accuracy: number
  foreign_masters: ForeignMaster[]
}

export interface FpgaStatus {
  error?: string
  ppb_valid: boolean
  wc_locked: boolean
  wc_phasejump: boolean
  wc_configured: boolean
  ptp_leader_lost: boolean
  link_up: boolean
  path_delay_ns: number
  leader_offset_ns: number
  ppb_offset: number
  phy_speed: string
  rx_underrun: number
  rx_mute: number
}

export interface Summary {
  network: NetworkStatus
  ptp: PtpStatus
  fpga: FpgaStatus
}

export interface PtpTuning {
  kp_gain: number
  ki_gain: number
  gain_shift: number
  gain_shift_locked: number
  ki_extra_shift: number
  filter_shift: number
  warmup_samples: number
  lock_threshold_ns: number
  unlock_threshold_ns: number
  lock_count_threshold: number
  min_filter_enable: boolean
  min_filter_active_depth: number
}

export interface PtpMonitor {
  filtered_offset: number
  integral_sum: number
  pi_proportional: number
  pi_sum_raw: number
  effective_gain_shift: number
  lock_counter: number
  sample_count: number
  first_lock_achieved: boolean
}

export interface PtpTuningResponse {
  tuning: PtpTuning
  monitor: PtpMonitor
}

export interface TxStream {
  stream_id: number
  name: string
  dst_ip: string
  channel_count: number
  samples_per_packet: number
  ch_ids: number[]
}

export interface RxStream {
  stream_id: number
  name: string
  sender_name: string
  sender_ip: string
  dst_ip: string
  dst_port: number
  channel_count: number
  output_delay: number
  samples_per_channel: number
  underrun: boolean
  ch_map: number[]
}

export interface DiscoveredStream {
  name: string
  sender_name: string
  mcast_addr: string
  port: number
  channels: number
  bit_depth: number
  sample_rate: number
  samples_per_packet: number
  ssrc: string
  origin_addr: string
  via: string
}

export interface StreamData {
  tx: TxStream[]
  rx: RxStream[]
  discovered: DiscoveredStream[]
}

export interface TxStreamInput {
  name: string
  dst_ip: string
  channel_count: number
  samples_per_pkt: number
  ch_ids: number[]
}

export interface RxStreamInput {
  name: string
  sender_name: string
  sender_ip: string
  dst_ip: string
  dst_port: number
  channel_count: number
  output_delay: number
  samples_per_channel: number
  ch_map: number[]
}

export interface CardSlot {
  slot: number
  present: boolean
  initialized?: boolean
  type: string
  type_id: number
  board_id?: number
  soft_id?: number
  hard_rev?: number
}

export interface CardsOverview {
  slots: CardSlot[]
  i2c_devices: number[]
}

export interface InputChannel {
  id: number
  gain: number
  phantom: boolean
  muted: boolean
  clip?: boolean
}

export interface OutputChannel {
  id: number
  clip: number
  muted: boolean
}

export interface MiCardStatus {
  hpf: boolean
  f96khz: boolean
  channels: InputChannel[]
}

export interface LoCardStatus {
  f96khz: boolean
  output_enable: boolean
  channels: OutputChannel[]
}

export interface IoCardStatus {
  f96khz?: boolean
  output_enable: boolean
  inputs: InputChannel[]
  outputs: OutputChannel[]
}

export interface AuracastStatus {
  present: boolean
  ready: boolean
  stats_valid: boolean
  fw_version: string
  state: number
  state_name: string
  error: number
  error_name: string
  error_reg: number
  error_reg_name: string
  reset_reason: number
  pipe_state: number
  pipe_state_name: string
  i2s_signal: boolean
  bis_streaming: boolean
  fifo_fill: number
  drift_ppm: number
  in_ppm: number
  i2s_bits: string
  underrun: number
  overflow: number
  lost: number
  send_err: number
  sent: number
  active_id: string | null
  uptime_ms: number
  last_errno: number
  age_ms: number
}

export interface AuracastConfig {
  enabled: boolean
  preset: number
  channels: number
  context: number
  flags: number
  tx_power: number
  pd_us: number
  fifo_target: number
  broadcast_id: number
  broadcast_id_random: boolean
  name: string
  code: string
  /** Optional second (48 kHz High Quality) subgroup; 255 = none. */
  hq_preset: number
  hq_enabled: boolean
  hq_channels: number
  hq_context: number
}

export interface AuracastCard {
  status: AuracastStatus
  config: AuracastConfig
  presets: { id: number; label: string }[]
  hq_presets: { id: number; label: string }[]
  channel_modes: { id: number; label: string }[]
}

export interface DeviceConfig {
  device_name: string
  default_mcast_addr: string
  default_port: number
  default_channels: number
  default_bit_depth: number
  default_sample_rate: number
  default_samples_per_pkt: number
  default_payload_type: number
  ptp_domain: number
  ptp_priority1: number
  ptp_priority2: number
  ptp_clock_class: number
  ptp_clock_accuracy: number
  ptp_log_sync_interval: number
  ptp_log_announce_interval: number
  pi_kp_num: number
  pi_kp_den: number
  pi_ki_num: number
  pi_ki_den: number
  pi_imax: number
  pi_outlier_ppb: number
  pi_warmup_cycles: number
  sap_announce_interval_s: number
  sap_announce_enabled: boolean
}

export interface SystemStatus {
  sd_mounted: boolean
  sd_config_status: string
  flash_config_status: string
  version: string
  uptime_s: number
}

export interface FirmwareStatus {
  phase?: 'idle' | 'writing' | 'done' | 'error'
  status?: string
  jedec_id?: string
  fw_size?: number
  fw_crc?: string
  bytes?: number
  written?: number
  crc_ok?: boolean
  error?: string | number
}

export interface ApiResult {
  ok?: boolean
  message?: string
}
