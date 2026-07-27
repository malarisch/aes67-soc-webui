import {
  AlertTriangle,
  Check,
  ChevronRight,
  LoaderCircle,
  Radio,
  X,
} from 'lucide-react'
import {
  createContext,
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export function Card({
  children,
  className = '',
  title,
  eyebrow,
  action,
}: {
  children: ReactNode
  className?: string
  title?: ReactNode
  eyebrow?: string
  action?: ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      {(title || eyebrow || action) && (
        <header className="card-header">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {action && <div className="card-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  pulse = false,
}: {
  children: ReactNode
  tone?: 'ok' | 'danger' | 'warning' | 'info' | 'neutral'
  pulse?: boolean
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {pulse && <i className="badge-dot" />}
      {children}
    </span>
  )
}

export function Metric({
  label,
  value,
  mono = false,
  help,
}: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  help?: ReactNode
}) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${mono ? 'mono' : ''}`}>{value}</span>
      {help && <span className="metric-help">{help}</span>}
    </div>
  )
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  busy = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  busy?: boolean
}) {
  return (
    <button
      className={`button button-${variant} button-${size} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <LoaderCircle size={14} className="spin" />}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span />
      </button>
      <span>{label}</span>
    </label>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <Radio size={22} />}</div>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function LoadingState({ label = 'Reading device state…' }: { label?: string }) {
  return (
    <div className="loading-state">
      <LoaderCircle size={18} className="spin" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: Error
  onRetry?: () => void
}) {
  return (
    <div className="error-state">
      <AlertTriangle size={18} />
      <div>
        <strong>Device did not respond</strong>
        <p>{error.message}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  footer,
  width = 'medium',
}: {
  open: boolean
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'medium' | 'wide'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`modal modal-${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id="modal-title">{title}</h2>
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
}

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null)

  const confirm = useCallback<ConfirmContextValue>((options) =>
    new Promise<boolean>((resolve) => setRequest({ ...options, resolve })), [])

  const close = (result: boolean) => {
    request?.resolve(result)
    setRequest(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={request !== null}
        title={request?.title || ''}
        eyebrow={request?.destructive ? 'Confirm destructive action' : 'Please confirm'}
        onClose={() => close(false)}
        footer={(
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button
              variant={request?.destructive ? 'danger' : 'primary'}
              onClick={() => close(true)}
            >
              {request?.confirmLabel || 'Confirm'}
            </Button>
          </>
        )}
      >
        <p className="confirm-message">{request?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const value = useContext(ConfirmContext)
  if (!value) throw new Error('useConfirm must be used inside ConfirmProvider')
  return value
}

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; tone: ToastTone }
type ToastContextValue = (message: string, tone?: ToastTone) => void
const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const show = useCallback<ToastContextValue>((message, tone = 'success') => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setItems((current) => current.filter((toast) => toast.id !== id))
    }, 3600)
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.tone === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{toast.message}</span>
            <ChevronRight size={14} className="toast-chevron" />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
