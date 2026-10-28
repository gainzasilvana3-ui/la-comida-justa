import { useCallback, useState } from 'react';
import { configProblem, config } from '../config';
import { activate, claim, recover, ApiError } from '../license/client';
import { syncCatalog } from '../catalog/catalog';
import { useAccess } from '../license/AccessProvider';
import { Turnstile, turnstileRequired } from '../license/Turnstile';
import { Field, shareText, useToast } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { InstallHelp } from './Help';

export function RecoveryCodeBox({ code }: { code: string }) {
  const toast = useToast();
  return (
    <div className="stack">
      <div className="recovery-code" aria-label="Código de recuperación">
        {code}
      </div>
      <div className="actions">
        <button
          className="btn secondary"
          onClick={async () => {
            const r = await shareText('Código de recuperación de La comida justa', `Mi código de recuperación de La comida justa: ${code}`);
            toast(r === 'copied' ? 'Código copiado.' : r === 'shared' ? 'Listo.' : 'Copialo a mano, por favor.');
          }}
        >
          <Icon name="share" /> Guardar o enviar
        </button>
      </div>
    </div>
  );
}

export function Activation() {
  const { refresh } = useAccess();
  const [mode, setMode] = useState<'purchase' | 'code' | 'recovery'>('purchase');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const problem = configProblem();
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const ready = mode === 'purchase' ? email.includes('@') && /\d/.test(orderNumber) : code.trim().length >= 10;

  const switchMode = (m: typeof mode) => {
    setMode(m);
    setError(null);
    setCode('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!navigator.onLine) {
      setError('Para activar necesitás conexión a internet. Después la app funciona sin conexión.');
      return;
    }
    if (turnstileRequired() && !token) {
      setError('Esperá a que termine la verificación de seguridad (el recuadro de arriba del botón).');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'purchase' || mode === 'code') {
        const r = mode === 'purchase' ? await claim(email, orderNumber, token ?? undefined) : await activate(code, token ?? undefined);
        void syncCatalog();
        setRecoveryCode(r.recoveryCode);
      } else {
        const r = await recover(code, token ?? undefined);
        void syncCatalog();
        if (r.transferred) {
          alert('Listo. La app quedó activada en este dispositivo. El dispositivo que usaste hace más tiempo dejará de tener acceso a las recetas del catálogo.');
        }
        await refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ocurrió un error. Probá de nuevo.');
      setResetKey((k) => k + 1);
      setToken(null);
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCode) {
    return (
      <div className="activation">
        <img className="logo" src="/pwa-192.png" alt="" />
        <h1 className="center">¡Listo, ya podés usar la app!</h1>
        <div className="card">
          <h2>
            <Icon name="key" /> Guardá tu código de recuperación
          </h2>
          <p>
            Lo vas a necesitar si cambiás de celular, si borrás los datos del navegador o para usar la app en otro dispositivo. Guardalo en
            tus notas, en un mail para vos o sacale una foto.
          </p>
          <RecoveryCodeBox code={recoveryCode} />
          <p className="small muted" style={{ marginTop: 12 }}>
            También lo vas a encontrar en Ajustes mientras uses este dispositivo.
          </p>
          <label className="check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            Ya lo guardé en un lugar seguro
          </label>
          <button className="btn block" disabled={!saved} onClick={() => void refresh()}>
            Empezar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="activation">
      <img className="logo" src="/pwa-192.png" alt="" />
      <h1 className="center">La comida justa</h1>
      <p className="center muted">De la colección Llegar a fin de mes</p>

      {problem ? (
        <div className="notice danger">
          <p>
            <strong>La app no está configurada todavía.</strong> {problem}
          </p>
        </div>
      ) : null}

      <div className="card">
        <div className="segmented" role="group" aria-label="Forma de activar">
          <button type="button" aria-pressed={mode !== 'recovery'} onClick={() => switchMode('purchase')}>
            Ya compré
          </button>
          <button type="button" aria-pressed={mode === 'recovery'} onClick={() => switchMode('recovery')}>
            Cambié de celular
          </button>
        </div>
        <form onSubmit={submit}>
          {mode === 'purchase' ? (
            <>
              <p>Ingresá el mail con el que pagaste y el número de pedido que figura en tu mail de compra.</p>
              <Field label="Mail de la compra" error={null}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tunombre@mail.com"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  required
                  maxLength={320}
                />
              </Field>
              <Field label="Número de pedido" error={error}>
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="Ej.: 4821"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  maxLength={30}
                  aria-invalid={error ? true : undefined}
                />
              </Field>
            </>
          ) : (
            <>
              {mode === 'code' ? (
                <p>Ingresá el código de compra que te mandamos.</p>
              ) : (
                <p>Ingresá el código de recuperación que guardaste cuando activaste la app por primera vez.</p>
              )}
              <Field label={mode === 'code' ? 'Código de compra' : 'Código de recuperación'} error={error}>
                <input
                  className="code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={mode === 'code' ? 'LCJ-XXXX-XXXX-XXXX-XXXX' : 'RCP-XXXX-XXXX-XXXX-XXXX-XXXX'}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  maxLength={60}
                  aria-invalid={error ? true : undefined}
                />
              </Field>
            </>
          )}
          <Turnstile onToken={onToken} resetKey={resetKey} />
          <button className="btn block" type="submit" disabled={busy || Boolean(problem) || !ready}>
            {busy ? 'Activando…' : 'Activar'}
          </button>
          {mode !== 'recovery' ? (
            <button type="button" className="btn ghost block" onClick={() => switchMode(mode === 'code' ? 'purchase' : 'code')}>
              {mode === 'code' ? 'Activar con mi mail y número de pedido' : 'Tengo un código LCJ'}
            </button>
          ) : null}
        </form>
      </div>

      <div className="card soft">
        <h2>
          <Icon name="info" /> Bueno saber
        </h2>
        <ul>
          <li>Cada compra permite usar la app en hasta 2 dispositivos.</li>
          <li>Tus recetas, menús y listas se guardan solo en tu teléfono. El mail solo sirve para encontrar tu compra: no lo guardamos en texto ni lo usamos para otra cosa.</li>
          <li>Si cambiás de celular o borrás los datos del navegador, volvé a entrar con tu código de recuperación. Para no perder tus recetas y listas, exportá un respaldo desde Ajustes antes.</li>
          <li>Para activar hace falta internet. Después funciona sin conexión.</li>
        </ul>
        {config.supportContact ? <p className="small">¿Problemas con tu código? Escribinos: {config.supportContact}</p> : null}
        <div className="actions">
          <button className="btn ghost" onClick={() => setShowHelp((v) => !v)}>
            <Icon name="phone" /> Cómo instalar la app
          </button>
          <a className="btn ghost" href="#/privacidad">
            Política de privacidad
          </a>
        </div>
        {showHelp ? <InstallHelp /> : null}
      </div>
    </div>
  );
}
