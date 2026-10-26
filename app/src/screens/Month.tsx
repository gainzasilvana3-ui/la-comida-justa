import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DINER_CATEGORIES,
  DINER_CATEGORY_LABELS,
  PROFILES,
  PROFILE_LABELS,
  SAFETY_TIPS,
  addDays,
  mealsNeeded,
  monthShoppingItems,
  monthStatus,
  plannedPortions,
  storageSplit,
  suggestSessions,
  type BatchLog,
  type MonthPlan,
  type Recipe,
} from '@lcj/shared';
import { db } from '../db/db';
import { factorsFrom, setPref, usePrefs } from '../db/prefs';
import { useAllRecipes } from '../catalog/catalog';
import { createList } from '../lib/shopping';
import { go } from '../lib/router';
import { formatDate, formatShortDay, newId, todayIso } from '../lib/id';
import { RecipePicker } from '../ui/RecipePicker';
import { Icon } from '../ui/Icon';
import { Empty, Field, Modal, NumberInput, Stepper, shareText, useConfirm, useSafeWrite, useToast } from '../ui/kit';

function newMonth(): MonthPlan {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: 'El mes de…',
    startDate: todayIso(),
    days: 30,
    lunches: true,
    dinners: true,
    diner: { id: 'mes', category: 'adulto', profile: 'normal', count: 1 },
    items: [],
    prepared: [],
    shipments: [],
    sessionEveryDays: 7,
    createdAt: now,
    updatedAt: now,
  };
}

function MonthForm({ initial, onClose }: { initial: MonthPlan; onClose: () => void }) {
  const [m, setM] = useState(initial);
  const safe = useSafeWrite();
  const isNew = !initial.items.length && !initial.prepared.length && initial.name === 'El mes de…';
  const valid = m.name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(m.startDate) && m.days >= 1 && m.days <= 62 && (m.lunches || m.dinners);
  return (
    <Modal title={isNew ? 'Nuevo mes resuelto' : 'Datos del mes'} onClose={onClose}>
      <Field label="Nombre" hint="ej. Comidas de Juli, abril">
        <input value={m.name} maxLength={80} onChange={(e) => setM({ ...m, name: e.target.value })} />
      </Field>
      <div className="grid2">
        <Field label="Desde">
          <input type="date" value={m.startDate} onChange={(e) => setM({ ...m, startDate: e.target.value })} />
        </Field>
        <Field label="Cantidad de días" hint="hasta 62">
          <NumberInput value={m.days} min={1} max={62} allowEmpty={false} onChange={(v) => v !== null && setM({ ...m, days: Math.round(v) })} />
        </Field>
      </div>
      <fieldset className="field">
        <legend>¿Qué comidas cubre?</legend>
        <label className="check">
          <input type="checkbox" checked={m.lunches} onChange={(e) => setM({ ...m, lunches: e.target.checked })} /> Almuerzos
        </label>
        <label className="check">
          <input type="checkbox" checked={m.dinners} onChange={(e) => setM({ ...m, dinners: e.target.checked })} /> Cenas
        </label>
      </fieldset>
      <div className="grid2">
        <Field label="Quién come">
          <select value={m.diner.category} onChange={(e) => setM({ ...m, diner: { ...m.diner, category: e.target.value as MonthPlan['diner']['category'] } })}>
            {DINER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DINER_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Apetito">
          <select value={m.diner.profile} onChange={(e) => setM({ ...m, diner: { ...m.diner, profile: e.target.value as MonthPlan['diner']['profile'] } })}>
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Cocinar cada cuántos días" hint="para el calendario sugerido">
        <NumberInput
          value={m.sessionEveryDays}
          min={1}
          max={31}
          allowEmpty={false}
          onChange={(v) => v !== null && setM({ ...m, sessionEveryDays: Math.round(v) })}
        />
      </Field>
      {!m.lunches && !m.dinners ? <p className="error">Elegí al menos almuerzos o cenas.</p> : null}
      <button
        className="btn block"
        disabled={!valid}
        onClick={async () => {
          const saved = { ...m, name: m.name.trim(), updatedAt: new Date().toISOString() };
          const ok = await safe(async () => {
            await db.monthPlans.put(saved);
            await setPref('activeMonthId', saved.id);
          }, 'Guardado.');
          if (ok) onClose();
        }}
      >
        Guardar
      </button>
    </Modal>
  );
}

/** Registrar una tanda cocinada o un envío: porciones por receta. */
function LogForm({
  month,
  kind,
  byId,
  onClose,
}: {
  month: MonthPlan;
  kind: 'prepared' | 'shipments';
  byId: Map<string, Recipe>;
  onClose: () => void;
}) {
  const status = monthStatus(month);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(status.map((s) => [s.recipeId, 0])),
  );
  const safe = useSafeWrite();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Modal title={kind === 'prepared' ? 'Registrar lo que cociné' : 'Registrar un envío'} onClose={onClose}>
      <Field label="Fecha">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <ul className="list">
        {status.map((s) => {
          const max = kind === 'prepared' ? 500 : s.pendingToSend;
          return (
            <li key={s.recipeId}>
              <span className="grow">
                {byId.get(s.recipeId)?.name ?? 'Receta borrada'}
                <br />
                <span className="small muted">
                  {kind === 'prepared' ? `faltan ${s.toPrepare}` : `listas para enviar: ${s.pendingToSend}`}
                </span>
              </span>
              <Stepper
                label={`porciones de ${byId.get(s.recipeId)?.name ?? 'receta'}`}
                value={counts[s.recipeId] ?? 0}
                min={0}
                max={max}
                onChange={(v) => setCounts((c) => ({ ...c, [s.recipeId]: v }))}
              />
            </li>
          );
        })}
      </ul>
      <Field label="Nota" hint="opcional">
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'shipments' ? 'ej. viajó en micro' : ''} />
      </Field>
      <button
        className="btn block"
        disabled={total === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
        onClick={async () => {
          const log: BatchLog = {
            id: newId(),
            date,
            items: Object.entries(counts)
              .filter(([, n]) => n > 0)
              .map(([recipeId, portions]) => ({ recipeId, portions })),
            note: note.trim() || undefined,
          };
          const ok = await safe(
            () => db.monthPlans.put({ ...month, [kind]: [...month[kind], log], updatedAt: new Date().toISOString() }),
            kind === 'prepared' ? `Registradas ${total} porciones cocinadas.` : `Registradas ${total} porciones enviadas.`,
          );
          if (ok) onClose();
        }}
      >
        Guardar ({total} {total === 1 ? 'porción' : 'porciones'})
      </button>
    </Modal>
  );
}

function tipsText(m: MonthPlan, byId: Map<string, Recipe>): string {
  const lines = [`${m.name}`, '', 'Qué hay:'];
  for (const s of monthStatus(m)) {
    const r = byId.get(s.recipeId);
    if (!r) continue;
    const c = r.conservation;
    const keep = [
      c.fridgeDays ? `heladera hasta ${Math.min(3, c.fridgeDays)} días` : null,
      c.freezerMonths ? `freezer hasta ${c.freezerMonths} ${c.freezerMonths === 1 ? 'mes' : 'meses'}` : 'no conviene congelar',
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`• ${r.name}: ${s.planned} porciones (${keep})`);
  }
  lines.push('', 'Cómo conservar y recalentar:', ...SAFETY_TIPS.map((t) => `• ${t}`));
  return lines.join('\n');
}

export function Month() {
  const prefs = usePrefs();
  const months = useLiveQuery(() => db.monthPlans.orderBy('updatedAt').reverse().toArray(), []);
  const { recipes, byId } = useAllRecipes();
  const [form, setForm] = useState<MonthPlan | null>(null);
  const [picking, setPicking] = useState(false);
  const [logKind, setLogKind] = useState<'prepared' | 'shipments' | null>(null);
  const safe = useSafeWrite();
  const confirm = useConfirm();
  const toast = useToast();

  const month = months?.find((m) => m.id === prefs?.activeMonthId) ?? months?.[0];
  const status = useMemo(() => (month ? monthStatus(month) : []), [month]);
  const sessions = useMemo(() => (month ? suggestSessions(month) : []), [month]);

  if (!months || !prefs) return null;

  if (!month) {
    return (
      <div>
        <div className="card">
          <h2>
            <Icon name="student" /> Para hijos que estudian lejos
          </h2>
          <p>
            Armá las comidas de un mes por tandas: elegís recetas que se pueden congelar, la app calcula porciones y recipientes, te sugiere
            qué va a la heladera y qué al freezer, y arma la lista de compras de lo que falta cocinar.
          </p>
        </div>
        <Empty icon="snow" title="Todavía no armaste ningún mes">
          <button className="btn" onClick={() => setForm(newMonth())}>
            <Icon name="plus" /> Empezar un mes
          </button>
        </Empty>
        {form ? <MonthForm initial={form} onClose={() => setForm(null)} /> : null}
      </div>
    );
  }

  const save = (patch: Partial<MonthPlan>) => safe(() => db.monthPlans.put({ ...month, ...patch, updatedAt: new Date().toISOString() }));
  const needed = mealsNeeded(month);
  const planned = plannedPortions(month);
  const perDay = (month.lunches ? 1 : 0) + (month.dinners ? 1 : 0);
  const end = addDays(month.startDate, month.days - 1);
  const totals = status.reduce(
    (a, s) => ({ toPrepare: a.toPrepare + s.toPrepare, pending: a.pending + s.pendingToSend, containers: a.containers + s.containers }),
    { toPrepare: 0, pending: 0, containers: 0 },
  );

  return (
    <div>
      {months.length > 1 ? (
        <Field label="Mes">
          <select value={month.id} onChange={(e) => void setPref('activeMonthId', e.target.value)}>
            {months.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="card">
        <div className="row between nowrap">
          <h2 style={{ margin: 0 }}>{month.name}</h2>
          <button className="icon-btn" aria-label="Editar datos del mes" onClick={() => setForm(month)}>
            <Icon name="edit" />
          </button>
        </div>
        <p className="small muted">
          Del {formatDate(month.startDate)} al {formatDate(end)} · {month.lunches && month.dinners ? 'almuerzo y cena' : month.lunches ? 'almuerzos' : 'cenas'} ·{' '}
          {DINER_CATEGORY_LABELS[month.diner.category].toLowerCase()}, {PROFILE_LABELS[month.diner.profile].toLowerCase()}
        </p>
        <div className="grid2" aria-live="polite">
          <div>
            <div className="muted small">Comidas a cubrir</div>
            <div className="qty" style={{ fontSize: '1.4rem' }}>
              {needed}
            </div>
          </div>
          <div>
            <div className="muted small">Porciones planificadas</div>
            <div className="qty" style={{ fontSize: '1.4rem' }}>
              {planned}
            </div>
          </div>
        </div>
        {planned < needed ? (
          <p className="notice small" style={{ marginTop: 10 }}>
            Faltan {needed - planned} porciones para cubrir todo el período.
          </p>
        ) : planned > needed ? (
          <p className="notice small" style={{ marginTop: 10 }}>
            Planificaste {planned - needed} porciones de más.
          </p>
        ) : needed > 0 ? (
          <p className="notice small ok" style={{ marginTop: 10 }}>
            <Icon name="check" /> Están cubiertas todas las comidas.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>
          <Icon name="pot" /> Recetas del mes
        </h2>
        {month.items.length === 0 ? <p className="muted">Sumá recetas que se puedan cocinar por tandas.</p> : null}
        <ul className="list">
          {month.items.map((it, idx) => {
            const r = byId.get(it.recipeId);
            const s = status[idx];
            const split = r && s ? storageSplit(r, s.planned, perDay) : null;
            return (
              <li key={it.recipeId} style={{ display: 'block' }}>
                <div className="row between nowrap">
                  <strong className="grow">{r?.name ?? 'Receta no disponible'}</strong>
                  <button
                    className="icon-btn"
                    aria-label={`Quitar ${r?.name ?? 'receta'}`}
                    onClick={async () => {
                      if (await confirm({ title: 'Quitar receta', text: 'Se quita del mes. Lo ya registrado como cocinado o enviado se conserva en el historial.', ok: 'Quitar' })) {
                        await save({ items: month.items.filter((_, i) => i !== idx) });
                      }
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                <div className="grid2" style={{ marginTop: 6 }}>
                  <Field label="Porciones">
                    <NumberInput
                      value={it.portions}
                      min={0}
                      max={500}
                      allowEmpty={false}
                      onChange={(v) => v !== null && void save({ items: month.items.map((x, i) => (i === idx ? { ...x, portions: Math.round(v) } : x)) })}
                    />
                  </Field>
                  <Field label="Porciones por recipiente">
                    <NumberInput
                      value={it.perContainer}
                      min={1}
                      max={10}
                      allowEmpty={false}
                      onChange={(v) => v !== null && void save({ items: month.items.map((x, i) => (i === idx ? { ...x, perContainer: Math.round(v) } : x)) })}
                    />
                  </Field>
                </div>
                {s ? (
                  <p className="small">
                    {s.containers} {s.containers === 1 ? 'recipiente' : 'recipientes'} · cocinadas {s.prepared} · faltan <strong>{s.toPrepare}</strong> · enviadas{' '}
                    {s.sent}
                  </p>
                ) : null}
                {split && s && s.planned > 0 ? (
                  <p className="small muted">
                    <Icon name="fridge" className="inline-icon" /> Heladera: {split.heladera} · <Icon name="snow" className="inline-icon" /> Freezer: {split.freezer}
                    {split.noFreeze ? (
                      <span className="badge terra" style={{ marginLeft: 6 }}>
                        no conviene congelar: cocinala cerca del día en que se come
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button className="btn secondary block" onClick={() => setPicking(true)} disabled={month.items.length >= 60}>
          <Icon name="plus" /> Agregar receta
        </button>
      </div>

      {month.items.length ? (
        <>
          <div className="actions">
            <button className="btn" onClick={() => setLogKind('prepared')}>
              <Icon name="check" /> Registrar lo que cociné
            </button>
            <button className="btn secondary" onClick={() => setLogKind('shipments')} disabled={totals.pending === 0}>
              <Icon name="truck" /> Registrar envío
            </button>
            <button
              className="btn secondary"
              disabled={totals.toPrepare === 0}
              onClick={async () => {
                const ok = await safe(async () => {
                  const items = monthShoppingItems(month, byId, factorsFrom(prefs));
                  await createList(`Compras: ${month.name}`, items, { monthPlanId: month.id });
                });
                if (ok) {
                  toast('Lista armada con lo que falta cocinar.');
                  go('/compras');
                }
              }}
            >
              <Icon name="cart" /> Lista de compras de lo que falta
            </button>
          </div>
          <p className="small muted">
            En total: faltan cocinar {totals.toPrepare} porciones · {totals.pending} cocinadas sin enviar · {totals.containers} recipientes.
          </p>
        </>
      ) : null}

      {sessions.length ? (
        <div className="card">
          <h2>
            <Icon name="calendar" /> Calendario de cocina sugerido
          </h2>
          <p className="small muted">Una sesión cada {month.sessionEveryDays} días, el día antes del período que cubre. Es solo una sugerencia.</p>
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.date} style={{ display: 'block' }}>
                <strong>{s.date < todayIso() ? 'Hoy' : formatShortDay(s.date)}</strong>{' '}
                <span className="small muted">
                  (cubre {formatShortDay(s.coversFrom)} a {formatShortDay(s.coversTo)})
                </span>
                <div className="small">{s.items.map((i) => `${byId.get(i.recipeId)?.name ?? 'Receta'}: ${i.portions}`).join(' · ')}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {month.prepared.length || month.shipments.length ? (
        <div className="card">
          <h2>
            <Icon name="clock" /> Historial
          </h2>
          <ul className="list">
            {[
              ...month.prepared.map((l) => ({ l, kind: 'prepared' as const })),
              ...month.shipments.map((l) => ({ l, kind: 'shipments' as const })),
            ]
              .sort((a, b) => b.l.date.localeCompare(a.l.date))
              .map(({ l, kind }) => (
                <li key={l.id}>
                  <span className="grow">
                    <strong>{kind === 'prepared' ? 'Cocinado' : 'Enviado'}</strong> · {formatDate(l.date)}
                    <br />
                    <span className="small muted">
                      {l.items.map((i) => `${byId.get(i.recipeId)?.name ?? 'Receta'}: ${i.portions}`).join(' · ')}
                      {l.note ? ` · ${l.note}` : ''}
                    </span>
                  </span>
                  <button
                    className="icon-btn"
                    aria-label="Borrar registro"
                    onClick={async () => {
                      if (await confirm({ title: 'Borrar registro', text: 'Se recalculan las porciones que faltan.', ok: 'Borrar', danger: true })) {
                        await save({ [kind]: month[kind].filter((x) => x.id !== l.id) });
                      }
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="card soft">
        <h2>
          <Icon name="snow" /> Conservar, transportar y recalentar
        </h2>
        <ul>
          {SAFETY_TIPS.map((t) => (
            <li key={t} className="small">
              {t}
            </li>
          ))}
        </ul>
        <button
          className="btn secondary"
          onClick={async () => {
            const r = await shareText(month.name, tipsText(month, byId));
            toast(r === 'shared' ? 'Compartido.' : r === 'copied' ? 'Copiado: pegalo en un mensaje.' : 'No se pudo compartir.', r === 'failed');
          }}
        >
          <Icon name="share" /> Compartir instrucciones
        </button>
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={() => setForm(newMonth())}>
          <Icon name="plus" /> Nuevo mes
        </button>
        <button
          className="btn ghost"
          onClick={async () => {
            if (await confirm({ title: 'Borrar este mes', text: `Se borra "${month.name}" con su historial. Las recetas no se tocan.`, ok: 'Borrar', danger: true })) {
              await safe(async () => {
                await db.monthPlans.delete(month.id);
                await setPref('activeMonthId', undefined);
              }, 'Mes borrado.');
            }
          }}
        >
          <Icon name="trash" /> Borrar este mes
        </button>
      </div>

      {form ? <MonthForm initial={form} onClose={() => setForm(null)} /> : null}
      {logKind ? <LogForm month={month} kind={logKind} byId={byId} onClose={() => setLogKind(null)} /> : null}
      {picking ? (
        <RecipePicker
          recipes={recipes.filter((r) => !month.items.some((i) => i.recipeId === r.id))}
          batchOnly
          title="Recetas para cocinar por tandas"
          onClose={() => setPicking(false)}
          onPick={(r) => {
            setPicking(false);
            const remaining = Math.max(0, needed - planned);
            void save({ items: [...month.items, { recipeId: r.id, portions: Math.min(500, remaining || 4), perContainer: 1 }] });
          }}
        />
      ) : null}
    </div>
  );
}
