import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { UNITS, UNIT_LABELS, formatQty, normalizeName, useFirst, type PantryItem, type PantryLocation, type Recipe } from '@lcj/shared';
import { db } from '../db/db';
import { useAllRecipes } from '../catalog/catalog';
import { formatDate, newId, todayIso } from '../lib/id';
import { Icon } from '../ui/Icon';
import { Empty, Field, Modal, NumberInput, useConfirm, useSafeWrite } from '../ui/kit';

const LOCATIONS: { id: PantryLocation; label: string }[] = [
  { id: 'despensa', label: 'Despensa' },
  { id: 'heladera', label: 'Heladera' },
  { id: 'freezer', label: 'Freezer' },
];

function ItemForm({ initial, onClose }: { initial?: PantryItem; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [qty, setQty] = useState<number | null>(initial?.qty ?? null);
  const [unit, setUnit] = useState(initial?.unit ?? 'g');
  const [state, setState] = useState(initial?.state ?? '');
  const [location, setLocation] = useState<PantryLocation>(initial?.location ?? 'despensa');
  const [addedAt, setAddedAt] = useState(initial?.addedAt ?? todayIso());
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? '');
  const safe = useSafeWrite();
  const valid = name.trim() && qty !== null && qty >= 0;
  return (
    <Modal title={initial ? 'Editar alimento' : 'Agregar alimento'} onClose={onClose}>
      <Field label="Alimento">
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ej. Arroz" />
      </Field>
      <div className="grid2">
        <Field label="Cantidad">
          <NumberInput value={qty} min={0} onChange={setQty} />
        </Field>
        <Field label="Unidad">
          <select value={unit} onChange={(e) => setUnit(e.target.value as PantryItem['unit'])}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="segmented" role="group" aria-label="Dónde está">
        {LOCATIONS.map((l) => (
          <button key={l.id} type="button" aria-pressed={location === l.id} onClick={() => setLocation(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      <Field label="Estado" hint="para no descontar arroz crudo contra arroz cocido">
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Tal como se compra (crudo)</option>
          <option value="cocido">Cocido</option>
        </select>
      </Field>
      <div className="grid2">
        <Field label="Fecha de ingreso" hint="opcional">
          <input type="date" value={addedAt} onChange={(e) => setAddedAt(e.target.value)} />
        </Field>
        <Field label="Vence o consumir antes de" hint="opcional">
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      </div>
      <button
        className="btn block"
        disabled={!valid}
        onClick={async () => {
          const item: PantryItem = {
            id: initial?.id ?? newId(),
            name: name.trim(),
            qty: qty!,
            unit,
            state: state === 'cocido' ? 'cocido' : undefined,
            location,
            addedAt: addedAt || undefined,
            expiresAt: expiresAt || undefined,
          };
          if (await safe(() => db.pantry.put(item), 'Guardado.')) onClose();
        }}
      >
        Guardar
      </button>
    </Modal>
  );
}

/** Recetas que aprovechan lo que hay: cuenta ingredientes principales disponibles. */
function suggestions(recipes: Recipe[], pantry: PantryItem[]): { recipe: Recipe; have: number; total: number }[] {
  const have = new Set(pantry.filter((p) => p.qty > 0).map((p) => normalizeName(p.name)));
  const scored = recipes.map((r) => {
    const main = r.ingredients.filter((i) => !i.toTaste && i.role !== 'condimento' && !i.optional && !i.skipShopping);
    const names = main.map((i) => normalizeName(i.name));
    const count = names.filter((n) => have.has(n) || [...have].some((h) => h.length > 3 && (n.startsWith(`${h} `) || n === h))).length;
    return { recipe: r, have: count, total: main.length };
  });
  return scored
    .filter((s) => s.have > 0)
    .sort((a, b) => b.have / b.total - a.have / a.total || b.have - a.have)
    .slice(0, 5);
}

export function Pantry({ limited }: { limited: boolean }) {
  const pantry = useLiveQuery(() => db.pantry.toArray(), []) ?? [];
  const { recipes } = useAllRecipes();
  const [tab, setTab] = useState<'todo' | PantryLocation>('todo');
  const [editing, setEditing] = useState<PantryItem | 'new' | null>(null);
  const safe = useSafeWrite();
  const confirm = useConfirm();

  const ordered = useFirst(pantry);
  const visible = ordered.filter((p) => tab === 'todo' || p.location === tab);
  const empties = pantry.filter((p) => p.qty <= 0);
  const sugg = useMemo(() => (limited ? [] : suggestions(recipes, pantry)), [recipes, pantry, limited]);

  const adjust = (p: PantryItem, delta: number) => safe(() => db.pantry.put({ ...p, qty: Math.max(0, Math.round((p.qty + delta) * 1000) / 1000) }));
  const step = (p: PantryItem) => (p.unit === 'u' ? 1 : p.unit === 'kg' || p.unit === 'l' ? 0.5 : 100);

  return (
    <div>
      <div className="notice small">
        Lo que cargues acá se descuenta solo de la lista de compras. Las fechas son las que cargás vos: la app no puede saber si un alimento está en buen
        estado. Ante la duda, seguí las indicaciones del envase y las recomendaciones oficiales.
      </div>

      <div className="segmented" role="group" aria-label="Lugar">
        <button aria-pressed={tab === 'todo'} onClick={() => setTab('todo')}>
          Todo
        </button>
        {LOCATIONS.map((l) => (
          <button key={l.id} aria-pressed={tab === l.id} onClick={() => setTab(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      {!limited ? (
        <button className="btn block" onClick={() => setEditing('new')} style={{ marginBottom: 14 }}>
          <Icon name="plus" /> Agregar alimento
        </button>
      ) : null}

      {visible.length === 0 ? (
        <Empty icon="box" title="No hay nada cargado acá">
          <p>Sumá lo que tenés en la alacena, la heladera y el freezer para comprar solo lo que falta.</p>
        </Empty>
      ) : (
        <div className="card">
          <ul className="list">
            {visible.map((p) => (
              <li key={p.id}>
                <button className="btn ghost small grow" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => !limited && setEditing(p)}>
                  <span className="grow">
                    <strong>{p.name}</strong> {p.state === 'cocido' ? <span className="badge">cocido</span> : null}
                    <br />
                    <span className="small muted">
                      {LOCATIONS.find((l) => l.id === p.location)?.label}
                      {p.expiresAt ? ` · fecha: ${formatDate(p.expiresAt)}` : ''}
                    </span>
                  </span>
                </button>
                {p.days !== null ? (
                  <span className={`badge ${p.days < 0 ? 'terra' : p.days <= 3 ? 'warn' : ''}`}>
                    {p.days < 0 ? 'fecha pasada' : p.days === 0 ? 'hoy' : `${p.days} d`}
                  </span>
                ) : null}
                <span className="qty">{formatQty(p.qty, p.unit)}</span>
                {!limited ? (
                  <span className="row nowrap" style={{ gap: 0 }}>
                    <button className="icon-btn" aria-label={`Restar ${p.name}`} onClick={() => void adjust(p, -step(p))}>
                      <Icon name="minus" />
                    </button>
                    <button className="icon-btn" aria-label={`Sumar ${p.name}`} onClick={() => void adjust(p, step(p))}>
                      <Icon name="plus" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {empties.length && !limited ? (
        <div className="card soft">
          <h3>Se terminaron</h3>
          <p className="small muted">{empties.map((p) => p.name).join(', ')}</p>
          <button
            className="btn small secondary"
            onClick={async () => {
              if (await confirm({ title: 'Limpiar', text: 'Quitar de la lista los alimentos que llegaron a cero.', ok: 'Quitar' })) {
                await safe(() => db.pantry.bulkDelete(empties.map((p) => p.id)));
              }
            }}
          >
            Quitar los que están en cero
          </button>
        </div>
      ) : null}

      {sugg.length ? (
        <div className="card">
          <h2>
            <Icon name="pot" /> Recetas con lo que tenés
          </h2>
          <ul className="list">
            {sugg.map((s) => (
              <li key={s.recipe.id}>
                <a className="grow" href={`#/receta/${s.recipe.id}`}>
                  {s.recipe.name}
                </a>
                <span className="badge green">
                  tenés {s.have} de {s.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? <ItemForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
