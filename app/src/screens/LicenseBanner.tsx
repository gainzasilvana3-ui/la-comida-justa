import { useState } from 'react';
import { useAccess, useOnline } from '../license/AccessProvider';
import { forgetLicense } from '../license/client';
import { APP_VERSION } from '../config';
import { formatDate, todayIso } from '../lib/id';
import { Icon } from '../ui/Icon';
import { useConfirm, useToast } from '../ui/kit';

function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

export function LicenseBanner() {
  const { state, renewNow, catalogMessage, latestAppVersion } = useAccess();
  const online = useOnline();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const tryRenew = async () => {
    setBusy(true);
    const err = await renewNow();
    setBusy(false);
    toast(err ?? 'Autorización renovada.', Boolean(err));
  };

  const banners = [];
  if (latestAppVersion && newer(latestAppVersion, APP_VERSION)) {
    banners.push(
      <div key="ver" className="notice">
        Hay una versión nueva de la app ({latestAppVersion}). Cerrala y volvé a abrirla con conexión para actualizarla.
      </div>,
    );
  }
  if (state.kind === 'active' && state.status.kind === 'grace') {
    banners.push(
      <div key="grace" className="notice warn">
        <p>
          <strong>Conectate a internet para renovar el acceso.</strong> Tenés tiempo hasta el{' '}
          {formatDate(todayIso(new Date(state.status.graceEndsAt)))}. Tus datos están a salvo.
        </p>
        <button className="btn small" disabled={!online || busy} onClick={() => void tryRenew()}>
          <Icon name="refresh" /> Renovar ahora
        </button>
      </div>,
    );
  }
  if (state.kind === 'expired') {
    banners.push(
      <div key="exp" className="notice danger">
        <p>
          <strong>El acceso está pausado porque pasó mucho tiempo sin conexión.</strong> Conectate para renovarlo. Mientras tanto podés ver y
          exportar tus recetas, listas y despensa.
        </p>
        <button className="btn small" disabled={!online || busy} onClick={() => void tryRenew()}>
          <Icon name="refresh" /> Renovar ahora
        </button>
      </div>,
    );
  }
  if (state.kind === 'blocked') banners.push(<BlockedNotice key="blk" />);
  if (catalogMessage && state.kind === 'active') {
    banners.push(
      <div key="cat" className="notice warn">
        {catalogMessage}
      </div>,
    );
  }
  return <>{banners}</>;
}

function BlockedNotice() {
  const { state, refresh } = useAccess();
  const confirm = useConfirm();
  if (state.kind !== 'blocked') return null;
  return (
    <div className="notice danger">
      <p>
        <strong>{state.reason === 'revoked' ? 'Esta licencia fue dada de baja.' : 'Esta licencia se está usando en otro dispositivo.'}</strong>
      </p>
      <p>Tus recetas propias, listas y despensa siguen guardadas: podés verlas y exportarlas desde Ajustes.</p>
      <button
        className="btn small secondary"
        onClick={async () => {
          const ok = await confirm({
            title: 'Activar con otro código',
            text: 'Vas a poder ingresar tu código de recuperación o un código nuevo. Tus datos guardados no se borran.',
            ok: 'Continuar',
          });
          if (ok) {
            await forgetLicense();
            await refresh();
          }
        }}
      >
        <Icon name="key" /> Ingresar otro código
      </button>
    </div>
  );
}

export function LimitedNotice() {
  return (
    <div className="card">
      <h2>
        <Icon name="lock" /> Función pausada
      </h2>
      <p>Esta sección necesita una licencia activa. Mientras tanto podés ver tus recetas propias, tu lista de compras, lo que tenés guardado y exportar un respaldo.</p>
      <a className="btn" href="#/ajustes">
        Ir a Ajustes y respaldo
      </a>
    </div>
  );
}
