import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_FACTORS,
  DINER_CATEGORIES,
  DINER_CATEGORY_LABELS,
  FACTOR_LIMITS,
  PROFILES,
  PROFILE_LABELS,
  ROLES,
  ROLE_LABELS,
  type PortionFactors,
} from '@lcj/shared';
import { db, requestPersistence, USER_TABLES } from '../db/db';
import { factorsFrom, setPref, usePrefs } from '../db/prefs';
import { backupFileName, createBackup, parseBackup, restoreBackup, type ParseResult } from '../db/backup';
import { useAccess, useOnline } from '../license/AccessProvider';
import { forgetLicense } from '../license/client';
import { formatDate, todayIso } from '../lib/id';
import { dinersSummary } from '../ui/DinersEditor';
import { Icon } from '../ui/Icon';
import { Field, Modal, NumberInput, downloadFile, useConfirm, useSafeWrite, useToast } from '../ui/kit';
import { RecoveryCodeBox } from './Activation';
import { APP_VERSION } from '../config';

function dateFromMs(ms: number): string {
  return formatDate(todayIso(new Date(ms)));
}

function LicenseSection() {
  const { state, renewNow, refresh } = useAccess();
  const online = useOnline();
  const row = useLiveQuery(() => db.license.get('current'), []);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  let status = '';
  if (state.kind === 'active') {
    status =
      state.status.kind === 'valid'
        ? `Activo. La autorización se renueva sola con conexión (vence el ${dateFromMs(state.status.expiresAt)} si no hay conexión antes).`
        : `Sin renovar: conectate antes del ${dateFromMs(state.status.graceEndsAt)}.`;
  } else if (state.kind === 'expired') status = 'Pausado por falta de conexión. Conectate para renovar.';
  else if (state.kind === 'blocked') status = state.message || 'Este acceso fue desactivado.';

  return (
    <div className="card">
      <h2>
        <Icon name="key" /> Acceso
      </h2>
      <p>{status}</p>
      {row?.lastRenewAt ? <p className="small muted">Última renovación: {dateFromMs(row.lastRenewAt)}.</p> : null}
      <div className="actions">
        <button
          className="btn secondary"
          disabled={!online || busy || state.kind === 'blocked'}
          onClick={async () => {
            setBusy(true);
            const err = await renewNow();
            setBusy(false);
            toast(err ?? 'Autorización renovada.', Boolean(err));
          }}
        >
          <Icon name="refresh" /> Renovar ahora
        </button>
        {row?.recoveryCode ? (
          <button className="btn secondary" onClick={() => setShowCode((s) => !s)}>
            <Icon name="lock" /> {showCode ? 'Ocultar' : 'Ver'} código de recuperación
          </button>
        ) : null}
      </div>
      {!online ? <p className="small muted">Sin conexión: la renovación se hace sola cuando vuelva internet.</p> : null}
      {showCode && row?.recoveryCode ? (
        <div style={{ marginTop: 12 }}>
          <p className="small">
            Guardalo fuera del teléfono (anotado o en tu mail). Sirve para pasar la app a otro teléfono. No se incluye en el respaldo.
          </p>
          <RecoveryCodeBox code={row.recoveryCode} />
        </div>
      ) : null}
      {state.kind === 'blocked' || state.kind === 'expired' ? (
        <button
          className="btn ghost"
          onClick={async () => {
            const ok = await confirm({
              title: 'Usar otro código',
              text: 'Se quita el acceso guardado en este teléfono para ingresar un código nuevo. Tus recetas, listas y despensa no se borran.',
              ok: 'Continuar',
            });
            if (ok) {
              await forgetLicense();
              await refresh();
            }
          }}
        >
          Ingresar otro código
        </button>
      ) : null}
    </div>
  );
}

function BackupSection() {
  const prefs = usePrefs();
  const [parsed, setParsed] = useState<Extract<ParseResult, { ok: true }> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const safe = useSafeWrite();
  const confirm = useConfirm();

  const exportNow = async () => {
    try {
      const backup = await createBackup();
      downloadFile(backupFileName(), JSON.stringify(backup, null, 1), 'application/json');
      await setPref('lastBackupAt', new Date().toISOString());
      toast('Respaldo descargado. Guardalo en un lugar seguro (mail, Drive o la computadora).');
    } catch (e) {
      toast((e as Error).message || 'No se pudo armar el respaldo.', true);
    }
  };

  const doRestore = async (mode: 'replace' | 'merge') => {
    if (!parsed) return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Reemplazar todo',
        text: 'Se borran las recetas propias, menús, listas, despensa y precios de este teléfono y se ponen los del respaldo. No se puede deshacer.',
        ok: 'Reemplazar',
        danger: true,
      });
      if (!ok) return;
    }
    if (await safe(() => restoreBackup(parsed.backup, mode), mode === 'replace' ? 'Respaldo restaurado.' : 'Respaldo combinado con tus datos.')) {
      setParsed(null);
    }
  };

  const last = prefs?.lastBackupAt;
  const daysSince = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;

  return (
    <div className="card">
      <h2>
        <Icon name="download" /> Copia de seguridad
      </h2>
      <p className="small">
        Tus datos viven solo en este teléfono. Si se rompe, se pierde o borrás los datos del navegador, se pierden. Descargá un respaldo cada
        tanto. El respaldo no incluye tu código de acceso.
      </p>
      <p className="small muted">
        {last ? `Último respaldo: ${formatDate(last.slice(0, 10))}${daysSince !== null && daysSince > 30 ? ' (hace más de un mes)' : ''}.` : 'Todavía no hiciste ningún respaldo.'}
      </p>
      <div className="actions">
        <button className="btn" onClick={() => void exportNow()}>
          <Icon name="download" /> Descargar respaldo
        </button>
        <button className="btn secondary" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" /> Importar respaldo
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const r = parseBackup(await f.text());
          if (!r.ok) toast(r.error, true);
          else setParsed(r);
        }}
      />
      {parsed ? (
        <Modal title="Importar respaldo" onClose={() => setParsed(null)}>
          <p>Respaldo del {formatDate(parsed.summary.exportedAt.slice(0, 10))}. Contiene:</p>
          <ul className="small">
            <li>{parsed.summary.recipes} recetas propias</li>
            <li>{parsed.summary.plans} menús</li>
            <li>{parsed.summary.shoppingLists} listas de compras</li>
            <li>{parsed.summary.pantry} alimentos en "Lo que ya tengo"</li>
            <li>{parsed.summary.prices} precios</li>
            <li>{parsed.summary.monthPlans} meses resueltos</li>
            <li>{parsed.summary.dinerGroups} grupos de comensales</li>
          </ul>
          <p className="small muted">
            <strong>Combinar</strong> suma lo del respaldo a lo que ya tenés. <strong>Reemplazar</strong> deja este teléfono igual al respaldo.
          </p>
          <div className="actions">
            <button className="btn" onClick={() => void doRestore('merge')}>
              Combinar
            </button>
            <button className="btn danger" onClick={() => void doRestore('replace')}>
              Reemplazar todo
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function FactorsSection() {
  const prefs = usePrefs();
  const [draft, setDraft] = useState<PortionFactors | null>(null);
  const safe = useSafeWrite();
  const current = draft ?? factorsFrom(prefs);
  const custom = Boolean(prefs?.factors);

  const setCat = (c: (typeof DINER_CATEGORIES)[number], r: (typeof ROLES)[number], v: number) =>
    setDraft({ ...current, category: { ...current.category, [c]: { ...current.category[c], [r]: v } } });

  return (
    <div className="card">
      <h2>
        <Icon name="scale" /> Factores de porciones
      </h2>
      <p className="small">
        Cuánto come cada uno comparado con un adulto (1 = una porción de adulto). Son valores orientativos: ajustalos a tu familia.
        {custom ? ' Estás usando valores propios.' : ''}
      </p>
      {DINER_CATEGORIES.map((c) => (
        <fieldset key={c} className="field">
          <legend>{DINER_CATEGORY_LABELS[c]}</legend>
          <div className="grid2">
            {ROLES.map((r) => (
              <Field key={r} label={ROLE_LABELS[r]}>
                <NumberInput
                  value={current.category[c][r]}
                  min={FACTOR_LIMITS.min}
                  max={FACTOR_LIMITS.max}
                  allowEmpty={false}
                  onChange={(v) => v !== null && setCat(c, r, v)}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="field">
        <legend>Apetito</legend>
        <div className="grid2">
          {PROFILES.map((p) => (
            <Field key={p} label={PROFILE_LABELS[p]}>
              <NumberInput
                value={current.profile[p]}
                min={FACTOR_LIMITS.min}
                max={FACTOR_LIMITS.max}
                allowEmpty={false}
                onChange={(v) => v !== null && setDraft({ ...current, profile: { ...current.profile, [p]: v } })}
              />
            </Field>
          ))}
        </div>
        <p className="small muted">Los condimentos no cambian según el apetito.</p>
      </fieldset>
      <div className="actions">
        <button
          className="btn"
          disabled={!draft}
          onClick={async () => {
            if (draft && (await safe(() => setPref('factors', draft), 'Factores guardados.'))) setDraft(null);
          }}
        >
          Guardar factores
        </button>
        <button
          className="btn secondary"
          disabled={!custom && !draft}
          onClick={async () => {
            if (await safe(() => setPref('factors', undefined), 'Volvimos a los valores sugeridos.')) setDraft(null);
          }}
        >
          Restaurar valores sugeridos
        </button>
      </div>
      {draft ? <p className="small muted">Tenés cambios sin guardar.</p> : null}
      <details className="small">
        <summary>Ver valores sugeridos</summary>
        <p>
          Adolescente: plato principal ×{DEFAULT_FACTORS.category.adolescente.principal}, acompañamiento ×{DEFAULT_FACTORS.category.adolescente.acompanamiento}. Niño o
          niña: plato principal ×{DEFAULT_FACTORS.category.nino.principal}. Come poco ×{DEFAULT_FACTORS.profile.poco}, come mucho ×{DEFAULT_FACTORS.profile.abundante}.
        </p>
      </details>
    </div>
  );
}

function GroupsSection() {
  const prefs = usePrefs();
  const groups = useLiveQuery(() => db.dinerGroups.toArray(), []) ?? [];
  const safe = useSafeWrite();
  const confirm = useConfirm();
  return (
    <div className="card">
      <h2>
        <Icon name="people" /> Comensales habituales
      </h2>
      {groups.length === 0 ? (
        <p className="small muted">
          Todavía no guardaste grupos. Podés guardarlos desde "¿Quiénes comen?" en <a href="#/porciones">Calcular porciones</a>.
        </p>
      ) : (
        <ul className="list">
          {groups.map((g) => (
            <li key={g.id}>
              <span className="grow">
                <strong>{g.name}</strong> <span className="small muted">· {dinersSummary(g.diners)}</span>
              </span>
              <label className="check small">
                <input
                  type="radio"
                  name="default-group"
                  checked={prefs?.defaultGroupId === g.id}
                  onChange={() => void safe(() => setPref('defaultGroupId', g.id), `"${g.name}" queda como grupo por defecto.`)}
                />
                Por defecto
              </label>
              <button
                className="icon-btn"
                aria-label={`Borrar grupo ${g.name}`}
                onClick={async () => {
                  if (await confirm({ title: 'Borrar grupo', text: `¿Borrar "${g.name}"?`, ok: 'Borrar', danger: true })) {
                    await safe(async () => {
                      await db.dinerGroups.delete(g.id);
                      if (prefs?.defaultGroupId === g.id) await setPref('defaultGroupId', undefined);
                    });
                  }
                }}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {prefs?.defaultGroupId ? (
        <button className="btn ghost small" onClick={() => void setPref('defaultGroupId', undefined)}>
          Quitar grupo por defecto
        </button>
      ) : null}
    </div>
  );
}

function OptionsSection() {
  const prefs = usePrefs();
  const safe = useSafeWrite();
  return (
    <div className="card">
      <h2>
        <Icon name="settings" /> Opciones
      </h2>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(prefs?.keepHistory)}
          onChange={(e) => void safe(() => setPref('keepHistory', e.target.checked))}
        />
        Guardar listas de compras anteriores (si no, cada lista nueva reemplaza a la anterior)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs?.sendErrors !== false}
          onChange={(e) => void safe(() => setPref('sendErrors', e.target.checked))}
        />
        Enviar avisos de errores técnicos para poder corregirlos (solo el mensaje de error, nunca tus recetas ni listas)
      </label>
    </div>
  );
}

function StorageSection() {
  const [info, setInfo] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);
  const toast = useToast();
  const load = async () => {
    try {
      const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
      const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : undefined;
      setInfo({ usage: est.usage, quota: est.quota, persisted });
    } catch {
      setInfo({});
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const mb = (n?: number) => (n === undefined ? '—' : `${(n / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`);
  return (
    <div className="card">
      <h2>
        <Icon name="box" /> Espacio en el teléfono
      </h2>
      {info ? (
        <>
          <p className="small">
            La app usa {mb(info.usage)}
            {info.quota ? ` de ${mb(info.quota)} disponibles para este sitio` : ''}.
          </p>
          {info.persisted === false ? (
            <>
              <p className="small muted">
                El navegador podría borrar los datos si el teléfono se queda sin espacio. Podés pedirle que los conserve (algunos navegadores lo
                deciden solos).
              </p>
              <button
                className="btn small secondary"
                onClick={async () => {
                  const ok = await requestPersistence();
                  toast(ok ? 'Listo: el navegador va a conservar los datos.' : 'El navegador no lo permitió. Hacé respaldos seguido.', !ok);
                  void load();
                }}
              >
                Pedir que se conserven
              </button>
            </>
          ) : info.persisted ? (
            <p className="small muted">El navegador marcó estos datos como permanentes.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DeleteSection() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const safe = useSafeWrite();
  return (
    <div className="card">
      <h2>
        <Icon name="trash" /> Borrar mis datos
      </h2>
      <p className="small">Borra recetas propias, menús, listas, despensa, precios, meses y ajustes de este teléfono. El acceso a la app se mantiene.</p>
      <button className="btn danger" onClick={() => setOpen(true)}>
        Borrar todos mis datos
      </button>
      {open ? (
        <Modal title="Borrar todos mis datos" onClose={() => setOpen(false)}>
          <p>
            Esto no se puede deshacer. Si querés conservar algo, descargá antes un respaldo. Para confirmar, escribí <strong>BORRAR</strong>.
          </p>
          <Field label="Confirmación">
            <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </Field>
          <button
            className="btn danger block"
            disabled={text.trim().toUpperCase() !== 'BORRAR'}
            onClick={async () => {
              const ok = await safe(
                () =>
                  db.transaction('rw', USER_TABLES.map((t) => db.table(t)), async () => {
                    for (const t of USER_TABLES) await db.table(t).clear();
                  }),
                'Se borraron tus datos.',
              );
              if (ok) {
                setOpen(false);
                setText('');
              }
            }}
          >
            Borrar definitivamente
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

export function Settings() {
  return (
    <div>
      <LicenseSection />
      <BackupSection />
      <FactorsSection />
      <GroupsSection />
      <OptionsSection />
      <StorageSection />
      <DeleteSection />
      <p className="small muted center">
        La comida justa · versión {APP_VERSION} · <a href="#/privacidad">Privacidad</a>
      </p>
    </div>
  );
}
