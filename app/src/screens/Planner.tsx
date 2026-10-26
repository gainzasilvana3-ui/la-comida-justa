import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  SLOTS,
  SLOT_LABELS,
  addDays,
  aggregate,
  duplicateWeek,
  formatBase,
  formatNumber,
  planDates,
  planTotals,
  removeEntry,
  replaceRecipe,
  type Diner,
  type Plan,
  type PlanEntry,
  type Slot,
} from '@lcj/shared';
import { db } from '../db/db';
import { factorsFrom, setPref, usePrefs } from '../db/prefs';
import { useAllRecipes } from '../catalog/catalog';
import { createList, recalcList } from '../lib/shopping';
import { formatDay, formatShortDay, mondayOf, newId, todayIso } from '../lib/id';
import { go } from '../lib/router';
import { DinersEditor, defaultDiners, dinersSummary } from '../ui/DinersEditor';
import { RecipePicker } from '../ui/RecipePicker';
import { dishImage } from '../ui/dishImage';
import { Icon } from '../ui/Icon';
import { Empty, Field, Modal, NumberInput, useConfirm, useSafeWrite } from '../ui/kit';

function PlanForm({ initial, onSave, onClose }: { initial?: Plan; onSave: (p: Plan) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? 'Menú de la semana');
  const [start, setStart] = useState(initial?.startDate ?? mondayOf(todayIso()));
  const [days, setDays] = useState<number | null>(initial?.days ?? 7);
  const [diners, setDiners] = useState<Diner[]>(initial?.defaultDiners ?? defaultDiners());
  const valid = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(start) && days !== null && days >= 1 && days <= 62;
  return (
    <Modal title={initial ? 'Datos del menú' : 'Nuevo menú'} onClose={onClose}>
      <Field label="Nombre">
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label="Empieza el">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Cantidad de días" hint="1 a 62">
          <NumberInput value={days} min={1} max={62} onChange={(v) => setDays(v === null ? null : Math.round(v))} />
        </Field>
      </div>
      <h3>Comensales habituales de este menú</h3>
      <DinersEditor value={diners} onChange={setDiners} />
      <button
        className="btn block"
        style={{ marginTop: 12 }}
        disabled={!valid}
        onClick={() => {
          const now = new Date().toISOString();
          onSave({
            id: initial?.id ?? newId(),
            name: name.trim(),
            startDate: start,
            days: days!,
            defaultDiners: diners,
            entries: initial?.entries ?? [],
            createdAt: initial?.createdAt ?? now,
            updatedAt: now,
          });
        }}
      >
        Guardar
      </button>
    </Modal>
  );
}

type EntryModal = { kind: 'add'; date: string; slot: Slot } | { kind: 'change'; entry: PlanEntry } | { kind: 'diners'; entry: PlanEntry } | { kind: 'menu'; entry: PlanEntry };

export function Planner() {
  const prefs = usePrefs();
  const plans = useLiveQuery(() => db.plans.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const { recipes, byId } = useAllRecipes();
  const safe = useSafeWrite();
  const confirm = useConfirm();
  const [form, setForm] = useState<'new' | 'edit' | null>(null);
  const [modal, setModal] = useState<EntryModal | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [editDiners, setEditDiners] = useState<Diner[]>([]);

  const plan = plans.find((p) => p.id === prefs?.activePlanId) ?? plans[0];
  const factors = factorsFrom(prefs);
  const totals = useMemo(() => (plan ? planTotals(plan.entries, byId, factors) : null), [plan, byId, factors]);
  const aggregated = useMemo(() => (totals ? aggregate(totals.items) : []), [totals]);

  const savePlan = (p: Plan, msg?: string) => safe(() => db.plans.put({ ...p, updatedAt: new Date().toISOString() }), msg);

  if (!plan) {
    return (
      <div>
        <Empty icon="calendar" title="Todavía no tenés un menú">
          <p>Armá tu semana: elegí qué cocinar en cada almuerzo y cena, y la app calcula todo lo que hay que comprar.</p>
          <button className="btn" onClick={() => setForm('new')}>
            <Icon name="plus" /> Crear menú
          </button>
        </Empty>
        {form ? (
          <PlanForm
            onClose={() => setForm(null)}
            onSave={async (p) => {
              if (await safe(() => db.plans.put(p))) {
                await setPref('activePlanId', p.id);
                setForm(null);
              }
            }}
          />
        ) : null}
      </div>
    );
  }

  const dates = planDates(plan);
  const weeks = Array.from({ length: Math.ceil(plan.days / 7) }, (_, i) => addDays(plan.startDate, i * 7));
  const recipeName = (id: string) => byId.get(id)?.name ?? 'Receta no disponible';

  const generateList = async () => {
    if (!totals) return;
    const linked = await db.shoppingLists.filter((l) => l.planId === plan.id && !l.archived).first();
    if (linked) {
      const ok = await confirm({
        title: 'Actualizar la lista',
        text: `Ya hay una lista para este menú ("${linked.name}"). La actualizamos con el menú actual, sin perder lo que marcaste ni lo que agregaste a mano.`,
        ok: 'Actualizar',
      });
      if (!ok) return;
      if (await safe(() => recalcList(linked.id, totals.items), 'Lista actualizada.')) {
        await setPref('activeListId', linked.id);
        go('/compras');
      }
      return;
    }
    if (await safe(() => createList(`Compras · ${plan.name}`, totals.items, { planId: plan.id }), 'Lista de compras creada.')) go('/compras');
  };

  return (
    <div>
      <div className="card">
        <div className="row between nowrap">
          <div className="grow">
            <h2 style={{ marginBottom: 0 }}>{plan.name}</h2>
            <span className="small muted">
              {formatShortDay(plan.startDate)} al {formatShortDay(addDays(plan.startDate, plan.days - 1))} · {dinersSummary(plan.defaultDiners)}
            </span>
          </div>
          <button className="icon-btn" aria-label="Editar datos del menú" onClick={() => setForm('edit')}>
            <Icon name="edit" />
          </button>
        </div>
        {plans.length > 1 ? (
          <div className="chips" style={{ marginTop: 10 }}>
            {plans.map((p) => (
              <button key={p.id} className="chip" aria-pressed={p.id === plan.id} onClick={() => void setPref('activePlanId', p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="actions">
          <button className="btn" onClick={() => setShowSummary((v) => !v)}>
            <Icon name="cart" /> {showSummary ? 'Ocultar resumen' : 'Resumen y compras'}
          </button>
          <button className="btn secondary" onClick={() => setDupOpen(true)}>
            <Icon name="copy" /> Duplicar semana
          </button>
          <button className="btn ghost" onClick={() => setForm('new')}>
            <Icon name="plus" /> Otro menú
          </button>
        </div>
      </div>

      {showSummary && totals ? (
        <div className="card">
          <h2>Resumen del período</h2>
          {totals.perRecipe.length === 0 ? <p className="muted">Todavía no agregaste comidas.</p> : null}
          {totals.perRecipe.length ? (
            <table className="ingredients-table">
              <tbody>
                {totals.perRecipe.map((s) => (
                  <tr key={s.recipeId}>
                    <td>
                      <strong>{s.name}</strong>
                      <div className="small muted">
                        {s.meals} {s.meals === 1 ? 'comida' : 'comidas'} · se cocina {s.timesCooked} {s.timesCooked === 1 ? 'vez' : 'veces'}
                      </div>
                    </td>
                    <td className="num">{formatNumber(Math.round(s.equivalentPortions * 10) / 10)} porc.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {totals.missingRecipes.length ? (
            <p className="notice warn small">Hay {totals.missingRecipes.length} comida(s) con recetas que ya no existen. No se cuentan.</p>
          ) : null}
          {aggregated.length ? (
            <>
              <h3 style={{ marginTop: 14 }}>Ingredientes de todo el período</h3>
              <ul className="list">
                {aggregated.map((a) => (
                  <li key={a.key}>
                    <span className="grow">
                      {a.name}
                      {a.state ? <span className="badge" style={{ marginLeft: 6 }}>{a.state}</span> : null}
                      {a.conflict ? <span className="badge warn" style={{ marginLeft: 6 }}>medidas distintas: no se suman</span> : null}
                    </span>
                    <span className="qty">{a.total === null || a.dim === null ? 'a gusto' : formatBase(a.total, a.dim)}</span>
                  </li>
                ))}
              </ul>
              <button className="btn block" style={{ marginTop: 12 }} onClick={() => void generateList()}>
                <Icon name="cart" /> Armar lista de compras
              </button>
              <p className="small muted" style={{ marginTop: 8 }}>
                La lista descuenta lo que cargaste en "Lo que ya tengo". Las comidas marcadas como sobras no suman ingredientes.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {weeks.length > 1 ? (
        <div className="chips" aria-label="Ir a la semana">
          {weeks.map((w, i) => (
            <a key={w} className="chip" href={`#/menu`} onClick={(e) => { e.preventDefault(); document.getElementById(`dia-${w}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
              Semana {i + 1}
            </a>
          ))}
        </div>
      ) : null}

      {dates.map((date) => (
        <section key={date} className="day" id={`dia-${date}`} aria-label={formatDay(date)}>
          <h3>
            {formatDay(date)} {date === todayIso() ? <span className="badge green">hoy</span> : null}
          </h3>
          {SLOTS.map((slot) => {
            const entries = plan.entries.filter((e) => e.date === date && e.slot === slot);
            return (
              <div key={slot} className="slot">
                <div className="row between nowrap">
                  <span className="slot-title">{SLOT_LABELS[slot]}</span>
                  <button className="btn ghost small" onClick={() => setModal({ kind: 'add', date, slot })} aria-label={`Agregar ${SLOT_LABELS[slot].toLowerCase()} del ${formatDay(date)}`}>
                    <Icon name="plus" /> Agregar
                  </button>
                </div>
                {entries.map((e) => (
                  <div key={e.id} className="meal">
                    <button className="btn ghost small grow" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setModal({ kind: 'menu', entry: e })}>
                      {byId.get(e.recipeId) ? <img className="mini-thumb" src={dishImage(byId.get(e.recipeId)!)} alt="" loading="lazy" /> : null}
                      <span className="grow">
                        {recipeName(e.recipeId)}
                        <br />
                        <span className="small muted">
                          {dinersSummary(e.diners)}
                          {e.leftoversOf ? ' · con sobras' : ''}
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      ))}

      {form ? (
        <PlanForm
          initial={form === 'edit' ? plan : undefined}
          onClose={() => setForm(null)}
          onSave={async (p) => {
            if (await savePlan(p, 'Menú guardado.')) {
              await setPref('activePlanId', p.id);
              setForm(null);
            }
          }}
        />
      ) : null}

      {modal?.kind === 'add' ? (
        <RecipePicker
          recipes={recipes}
          title={`${SLOT_LABELS[modal.slot]} · ${formatShortDay(modal.date)}`}
          onClose={() => setModal(null)}
          onPick={async (r) => {
            await savePlan({
              ...plan,
              entries: [...plan.entries, { id: newId(), date: modal.date, slot: modal.slot, recipeId: r.id, diners: plan.defaultDiners.map((d) => ({ ...d, id: newId() })) }],
            });
            setModal(null);
          }}
        />
      ) : null}

      {modal?.kind === 'change' ? (
        <RecipePicker
          recipes={recipes}
          title="Cambiar receta"
          onClose={() => setModal(null)}
          onPick={async (r) => {
            await savePlan(replaceRecipe(plan, modal.entry.id, r.id), 'Receta cambiada.');
            setModal(null);
          }}
        />
      ) : null}

      {modal?.kind === 'menu' ? (
        <Modal title={recipeName(modal.entry.recipeId)} onClose={() => setModal(null)}>
          <p className="muted">
            {formatDay(modal.entry.date)} · {SLOT_LABELS[modal.entry.slot]} · {dinersSummary(modal.entry.diners)}
          </p>
          <div className="stack">
            <a className="btn secondary block" href={`#/porciones?receta=${modal.entry.recipeId}`}>
              <Icon name="scale" /> Ver cantidades
            </a>
            <button className="btn secondary block" onClick={() => setModal({ kind: 'change', entry: modal.entry })}>
              <Icon name="refresh" /> Cambiar receta
            </button>
            <button
              className="btn secondary block"
              onClick={() => {
                setEditDiners(modal.entry.diners);
                setModal({ kind: 'diners', entry: modal.entry });
              }}
            >
              <Icon name="people" /> Cambiar comensales
            </button>
            <LeftoversSelect plan={plan} entry={modal.entry} recipeName={recipeName} onChange={(src) => void savePlan({ ...plan, entries: plan.entries.map((x) => (x.id === modal.entry.id ? { ...x, leftoversOf: src } : x)) }, src ? 'Marcada como sobras.' : 'Se cocina aparte.')} />
            <button
              className="btn danger secondary block"
              onClick={async () => {
                await savePlan(removeEntry(plan, modal.entry.id), 'Comida eliminada.');
                setModal(null);
              }}
            >
              <Icon name="trash" /> Quitar esta comida
            </button>
          </div>
        </Modal>
      ) : null}

      {modal?.kind === 'diners' ? (
        <Modal title="Comensales de esta comida" onClose={() => setModal(null)}>
          <DinersEditor value={editDiners} onChange={setEditDiners} />
          <button
            className="btn block"
            style={{ marginTop: 12 }}
            onClick={async () => {
              await savePlan({ ...plan, entries: plan.entries.map((x) => (x.id === modal.entry.id ? { ...x, diners: editDiners } : x)) }, 'Comensales actualizados.');
              setModal(null);
            }}
          >
            Guardar
          </button>
        </Modal>
      ) : null}

      {dupOpen ? (
        <DuplicateWeek
          plan={plan}
          weeks={weeks}
          onClose={() => setDupOpen(false)}
          onDone={async (p) => {
            if (await savePlan(p, 'Semana duplicada.')) setDupOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function LeftoversSelect({ plan, entry, recipeName, onChange }: { plan: Plan; entry: PlanEntry; recipeName: (id: string) => string; onChange: (src: string | undefined) => void }) {
  const candidates = plan.entries.filter(
    (e) => e.id !== entry.id && e.recipeId === entry.recipeId && !e.leftoversOf && (e.date < entry.date || (e.date === entry.date && e.slot === 'almuerzo' && entry.slot === 'cena')),
  );
  if (!candidates.length && !entry.leftoversOf) {
    return <p className="small muted">Si esta comida se arma con lo que sobra de otra con la misma receta, vas a poder marcarla acá para no comprar dos veces.</p>;
  }
  return (
    <Field label="¿Se cubre con sobras de otra comida?" hint="así no se compra dos veces">
      <select value={entry.leftoversOf ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">No, se cocina aparte</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            Sí, de {formatShortDay(c.date)} ({SLOT_LABELS[c.slot].toLowerCase()}) · {recipeName(c.recipeId)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DuplicateWeek({ plan, weeks, onClose, onDone }: { plan: Plan; weeks: string[]; onClose: () => void; onDone: (p: Plan) => void }) {
  const [from, setFrom] = useState(weeks[0]!);
  const [replace, setReplace] = useState(false);
  const to = addDays(from, 7);
  const toCount = plan.entries.filter((e) => e.date >= to && e.date <= addDays(to, 6)).length;
  return (
    <Modal title="Duplicar semana" onClose={onClose}>
      <Field label="Copiar la semana que empieza el">
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {weeks.map((w) => (
            <option key={w} value={w}>
              {formatDay(w)}
            </option>
          ))}
        </select>
      </Field>
      <p>Se copia a la semana del {formatDay(to)}.</p>
      {toCount ? (
        <label className="check">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Reemplazar las {toCount} comidas que ya hay esa semana
        </label>
      ) : null}
      {Math.round((Date.parse(addDays(to, 6)) - Date.parse(plan.startDate)) / 86400000) + 1 > 62 ? (
        <p className="notice warn">Un menú puede tener hasta 62 días. Creá un menú nuevo para seguir planificando.</p>
      ) : (
        <button className="btn block" onClick={() => onDone(duplicateWeek(plan, from, to, newId, replace))}>
          Duplicar
        </button>
      )}
    </Modal>
  );
}
