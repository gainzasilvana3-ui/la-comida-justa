import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  SLOTS,
  SLOT_LABELS,
  computeRecipe,
  consumeFromPantry,
  formatMoney,
  formatNumber,
  formatQty,
  recipeCost,
  type Diner,
  type Plan,
  type Slot,
} from '@lcj/shared';
import { db } from '../db/db';
import { factorsFrom, getPrefs, setPref, usePrefs } from '../db/prefs';
import { useAllRecipes } from '../catalog/catalog';
import { addToActiveList } from '../lib/shopping';
import { newId, todayIso, mondayOf, formatShortDay } from '../lib/id';
import { DinersEditor, defaultDiners } from '../ui/DinersEditor';
import { RecipePicker } from '../ui/RecipePicker';
import { Icon } from '../ui/Icon';
import { Field, Modal, NumberInput, useConfirm, useSafeWrite } from '../ui/kit';

async function defaultDinersFromPrefs(): Promise<Diner[]> {
  const prefs = await getPrefs();
  if (prefs.defaultGroupId) {
    const g = await db.dinerGroups.get(prefs.defaultGroupId);
    if (g) return g.diners.map((d) => ({ ...d, id: newId() }));
  }
  return defaultDiners();
}

export async function ensureActivePlan(): Promise<Plan> {
  const prefs = await getPrefs();
  if (prefs.activePlanId) {
    const p = await db.plans.get(prefs.activePlanId);
    if (p) return p;
  }
  const now = new Date().toISOString();
  const plan: Plan = {
    id: newId(),
    name: 'Mi menú',
    startDate: mondayOf(todayIso()),
    days: 7,
    defaultDiners: await defaultDinersFromPrefs(),
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.plans.put(plan);
  await setPref('activePlanId', plan.id);
  return plan;
}

/** Botón + ventana para sumar una receta al menú activo. */
export function AddToPlanButton({ recipeId, diners }: { recipeId: string; diners?: Diner[] }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [slot, setSlot] = useState<Slot>('almuerzo');
  const safe = useSafeWrite();
  return (
    <>
      <button className="btn secondary" onClick={() => setOpen(true)}>
        <Icon name="calendar" /> Agregar al menú
      </button>
      {open ? (
        <Modal title="Agregar al menú" onClose={() => setOpen(false)}>
          <Field label="Día">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="segmented" role="group" aria-label="Comida">
            {SLOTS.map((s) => (
              <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)}>
                {SLOT_LABELS[s]}
              </button>
            ))}
          </div>
          <button
            className="btn block"
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)}
            onClick={async () => {
              const ok = await safe(async () => {
                const plan = await ensureActivePlan();
                const end = Math.round((Date.parse(date) - Date.parse(plan.startDate)) / 86400000);
                let start = plan.startDate;
                let days = plan.days;
                if (end < 0) {
                  start = date;
                  days = plan.days - end;
                } else if (end >= plan.days) days = end + 1;
                await db.plans.put({
                  ...plan,
                  startDate: start,
                  days: Math.min(62, days),
                  entries: [...plan.entries, { id: newId(), date, slot, recipeId, diners: (diners ?? plan.defaultDiners).map((d) => ({ ...d, id: newId() })) }],
                  updatedAt: new Date().toISOString(),
                });
              }, `Agregado al menú: ${formatShortDay(date)}, ${SLOT_LABELS[slot].toLowerCase()}.`);
              if (ok) setOpen(false);
            }}
          >
            Agregar
          </button>
        </Modal>
      ) : null}
    </>
  );
}

export function Portions({ recipeId }: { recipeId?: string }) {
  const { recipes, byId } = useAllRecipes();
  const prefs = usePrefs();
  const prices = useLiveQuery(() => db.prices.toArray(), []) ?? [];
  const [selected, setSelected] = useState<string | undefined>(recipeId);
  const [picking, setPicking] = useState(false);
  const [diners, setDiners] = useState<Diner[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const safe = useSafeWrite();
  const confirm = useConfirm();

  useEffect(() => setSelected(recipeId), [recipeId]);
  useEffect(() => {
    if (diners === null) void defaultDinersFromPrefs().then(setDiners);
  }, [diners]);
  useEffect(() => setOverrides({}), [selected]);

  const recipe = selected ? byId.get(selected) : undefined;
  const factors = factorsFrom(prefs);
  const computed = useMemo(
    () => (recipe && diners ? computeRecipe(recipe, diners, factors, overrides) : null),
    [recipe, diners, factors, overrides],
  );
  const cost = computed ? recipeCost(computed.lines, prices) : null;

  return (
    <div>
      <div className="card">
        <h2>
          <Icon name="book" /> Receta
        </h2>
        {recipe ? (
          <div className="row between nowrap">
            <a className="grow" href={`#/receta/${recipe.id}`}>
              <strong>{recipe.name}</strong>
            </a>
            <button className="btn small secondary" onClick={() => setPicking(true)}>
              Cambiar
            </button>
          </div>
        ) : (
          <button className="btn block" onClick={() => setPicking(true)}>
            Elegir receta
          </button>
        )}
      </div>

      <div className="card">
        <h2>
          <Icon name="people" /> ¿Quiénes comen?
        </h2>
        {diners ? <DinersEditor value={diners} onChange={setDiners} /> : null}
      </div>

      {computed && recipe ? (
        <>
          <div className="card" aria-live="polite">
            <h2>Resumen</h2>
            <div className="grid2">
              <div>
                <div className="muted small">Comensales</div>
                <div className="qty" style={{ fontSize: '1.4rem' }}>
                  {computed.people}
                </div>
              </div>
              <div>
                <div className="muted small">Porciones equivalentes</div>
                <div className="qty" style={{ fontSize: '1.4rem' }}>
                  {formatNumber(Math.round(computed.equivalentPortions * 10) / 10)}
                </div>
              </div>
            </div>
            {cost && cost.priced > 0 && computed.equivalentPortions > 0 ? (
              <p style={{ marginTop: 10 }}>
                Costo estimado: <strong>{formatMoney(cost.total)}</strong> · {formatMoney(cost.total / computed.equivalentPortions)} por porción
                {cost.unpriced.length ? <span className="small muted"> (sin precio: {cost.unpriced.join(', ')})</span> : null}
              </p>
            ) : null}
            <p className="small muted" style={{ marginTop: 8 }}>
              Las cantidades son estimaciones: pueden variar según la receta, el tamaño de los ingredientes y el apetito de cada uno. Tocá una
              cantidad para ajustarla a mano.
            </p>
          </div>

          <div className="card">
            <h2>Ingredientes totales</h2>
            <table className="ingredients-table">
              <tbody>
                {computed.lines.map((l) => (
                  <tr key={l.index}>
                    <td>
                      {l.name}
                      {l.state ? <span className="badge" style={{ marginLeft: 6 }}>{l.state}</span> : null}
                      {l.optional ? <span className="badge" style={{ marginLeft: 6 }}>opcional</span> : null}
                      {l.manual ? <span className="badge terra" style={{ marginLeft: 6 }}>a mano</span> : null}
                    </td>
                    <td className="num">
                      {l.qty === null || l.unit === null ? (
                        'a gusto'
                      ) : editing === l.index ? (
                        <span className="row nowrap">
                          <NumberInput
                            ariaLabel={`Cantidad de ${l.name} en ${l.unit}`}
                            value={Math.round(l.qty * 100) / 100}
                            min={0}
                            onChange={(v) => {
                              if (v !== null) setOverrides((o) => ({ ...o, [l.index]: v }));
                            }}
                          />
                          <span>{l.unit}</span>
                          <button className="icon-btn" aria-label="Listo" onClick={() => setEditing(null)}>
                            <Icon name="check" />
                          </button>
                        </span>
                      ) : (
                        <button className="btn ghost small" onClick={() => setEditing(l.index)} aria-label={`Ajustar ${l.name}`}>
                          {formatQty(l.qty, l.unit)} <Icon name="edit" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.keys(overrides).length ? (
              <button className="btn ghost small" onClick={() => setOverrides({})}>
                Volver a las cantidades calculadas
              </button>
            ) : null}
          </div>

          <div className="actions">
            <button
              className="btn"
              onClick={() =>
                void safe(
                  () =>
                    addToActiveList(
                      computed.lines.map((l) => ({
                        name: l.name,
                        qty: l.qty,
                        unit: l.unit,
                        state: l.state,
                        category: l.category,
                        toTaste: l.toTaste,
                        optional: l.optional,
                        skipShopping: l.skipShopping,
                        from: recipe.name,
                      })),
                      'Lista de compras',
                    ),
                  'Ingredientes sumados a la lista de compras.',
                )
              }
            >
              <Icon name="cart" /> Sumar a la lista de compras
            </button>
            <AddToPlanButton recipeId={recipe.id} diners={diners ?? undefined} />
            <button
              className="btn secondary"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Descontar de lo que tengo',
                  text: 'Se van a restar estas cantidades de "Lo que ya tengo" (solo los alimentos que estén cargados con la misma medida).',
                  ok: 'Descontar',
                });
                if (!ok) return;
                await safe(async () => {
                  const pantry = await db.pantry.toArray();
                  const used = computed.lines
                    .filter((l) => l.qty !== null && l.unit !== null)
                    .map((l) => ({ name: l.name, qty: l.qty!, unit: l.unit!, state: l.state }));
                  await db.pantry.bulkPut(consumeFromPantry(pantry, used));
                }, 'Listo, actualizamos lo que tenés.');
              }}
            >
              <Icon name="check" /> Ya lo cociné
            </button>
          </div>
        </>
      ) : null}

      {picking ? (
        <RecipePicker
          recipes={recipes}
          onClose={() => setPicking(false)}
          onPick={(r) => {
            setSelected(r.id);
            setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}
