import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { parseQuantity, formatNumber } from '@lcj/shared';
import { Icon } from './Icon';
import { storageMessage } from '../db/db';

// ---------- toasts ----------
interface ToastMsg {
  id: number;
  text: string;
  error?: boolean;
}
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, error }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), error ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Ejecuta una escritura y muestra un mensaje claro si falla. Devuelve true si salió bien. */
export function useSafeWrite() {
  const toast = useToast();
  return useCallback(
    async (fn: () => Promise<unknown>, okText?: string): Promise<boolean> => {
      try {
        await fn();
        if (okText) toast(okText);
        return true;
      } catch (e) {
        console.error(e);
        toast(storageMessage(e), true);
        return false;
      }
    },
    [toast],
  );
}

// ---------- modal ----------
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-btn)')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

// ---------- confirmación ----------
type ConfirmOpts = { title: string; text: string; ok?: string; cancel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state ? (
        <Modal title={state.title} onClose={() => close(false)}>
          <p>{state.text}</p>
          <div className="actions">
            <button className="btn secondary" onClick={() => close(false)}>
              {state.cancel ?? 'Cancelar'}
            </button>
            <button className={`btn${state.danger ? ' danger' : ''}`} onClick={() => close(true)}>
              {state.ok ?? 'Aceptar'}
            </button>
          </div>
        </Modal>
      ) : null}
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ---------- campos ----------
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label} {hint ? <span className="hint">· {hint}</span> : null}
      </span>
      {children}
      {error ? <span className="error">{error}</span> : null}
    </label>
  );
}

/**
 * Campo numérico que acepta coma decimal (teclado argentino) y rechaza
 * negativos o texto. Llama a onChange con null mientras el valor no es válido.
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 100000,
  step,
  placeholder,
  ariaLabel,
  allowEmpty = true,
  id,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  ariaLabel?: string;
  allowEmpty?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : formatNumber(value).replace(/\./g, ''));
  const [invalid, setInvalid] = useState(false);
  const lastExternal = useRef(value);
  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setText(value === null || value === undefined ? '' : formatNumber(value).replace(/\./g, ''));
      setInvalid(false);
    }
  }, [value]);
  return (
    <input
      id={id}
      inputMode="decimal"
      type="text"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      data-step={step}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') {
          setInvalid(!allowEmpty);
          lastExternal.current = null;
          onChange(null);
          return;
        }
        const n = parseQuantity(t);
        const ok = n !== null && n >= min && n <= max;
        setInvalid(!ok);
        lastExternal.current = ok ? n : null;
        onChange(ok ? n : null);
      }}
    />
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 50,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Restar ${label}`}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Sumar ${label}`}>
        +
      </button>
    </div>
  );
}

export function Empty({ icon = 'leaf', title, children }: { icon?: Parameters<typeof Icon>[0]['name']; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <p>
        <strong>{title}</strong>
      </p>
      {children}
    </div>
  );
}

/** Comparte texto con el menú del teléfono; si no se puede, lo copia. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function downloadFile(name: string, content: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
