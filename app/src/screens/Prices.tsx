import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { UNITS, UNIT_LABELS, formatMoney, formatQty, normalizeName, pricePerBase, type PriceEntry, type Unit } from '@lcj/shared';
import { db } from '../db/db';
import { formatDate, newId, todayIso } from '../lib/id';
import { Icon } from '../ui/Icon';
import { Empty, Field, Modal, NumberInput, useConfirm, useSafeWrite } from '../ui/kit';

function PriceForm({ initial, onClose }: { initial?: PriceEntry; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? 1);
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'kg');
  const [price, setPrice] = useState<number | null>(initial?.price ?? null);
  const safe = useSafeWrite();
  const valid = name.trim() && amount !== null && amount > 0 && price !== null && price >= 0;
  return (
    <Modal title={initial ? 'Editar precio' : 'Cargar precio'} onClose={onClose}>
      <Field label="Producto" hint="con el mismo nombre que en las recetas">
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ej. Papa" />
      </Field>
      <div className="grid2">
        <Field label="Cantidad">
          <NumberInput value={amount} min={0.001} onChange={setAmount} />
        </Field>
        <Field label="Unidad">
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Precio que pagaste" hint="en pesos">
        <NumberInput value={price} min={0} max={1e10} placeholder="$" onChange={setPrice} />
      </Field>
      <button
        className="btn block"
        disabled={!valid}
        onClick={async () => {
          const entry: PriceEntry = {
            id: initial?.id ?? newId(),
            name: name.trim(),
            amount: amount!,
            unit,
            price: price!,
            updatedAt: new Date().toISOString(),
          };
          if (await safe(() => db.prices.put(entry), 'Precio guardado.')) onClose();
        }}
      >
        Guardar
      </button>
    </Modal>
  );
}

function perUnitText(p: PriceEntry): string {
  const ppb = pricePerBase(p);
  if (!ppb) return '';
  if (ppb.dim === 'masa') return `${formatMoney(ppb.value * 1000)} el kilo`;
  if (ppb.dim === 'volumen') return `${formatMoney(ppb.value * 1000)} el litro`;
  return `${formatMoney(ppb.value)} la unidad`;
}

export function Prices() {
  const prices = useLiveQuery(() => db.prices.toArray(), []) ?? [];
  const [editing, setEditing] = useState<PriceEntry | 'new' | null>(null);
  const [q, setQ] = useState('');
  const safe = useSafeWrite();
  const confirm = useConfirm();

  const visible = useMemo(() => {
    const n = normalizeName(q);
    return prices.filter((p) => !n || normalizeName(p.name).includes(n)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [prices, q]);

  const old = prices.filter((p) => Date.parse(todayIso()) - Date.parse(p.updatedAt.slice(0, 10)) > 30 * 86400000).length;

  return (
    <div>
      <div className="notice small">
        Estos precios los cargás vos y quedan solo en este teléfono. <strong>No son precios actuales</strong> de ningún comercio: sirven para
        estimar cuánto cuesta una receta o una lista. Actualizalos cuando vayas a comprar.
      </div>

      <button className="btn block" onClick={() => setEditing('new')} style={{ marginBottom: 14 }}>
        <Icon name="plus" /> Cargar precio
      </button>

      {prices.length > 6 ? (
        <Field label="Buscar">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ej. arroz" />
        </Field>
      ) : null}

      {old ? <p className="small muted">{old === 1 ? 'Un precio tiene' : `${old} precios tienen`} más de un mes: puede que haya cambiado.</p> : null}

      {visible.length === 0 ? (
        <Empty icon="tag" title={prices.length ? 'No hay precios con ese nombre' : 'Todavía no cargaste precios'}>
          <p>Con algunos precios cargados, la app te muestra el costo estimado de cada receta y de la lista de compras.</p>
        </Empty>
      ) : (
        <div className="card">
          <ul className="list">
            {visible.map((p) => (
              <li key={p.id}>
                <button className="btn ghost small grow" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setEditing(p)}>
                  <span className="grow">
                    <strong>{p.name}</strong>: {formatMoney(p.price)} por {formatQty(p.amount, p.unit)}
                    <br />
                    <span className="small muted">
                      {perUnitText(p)} · anotado el {formatDate(p.updatedAt.slice(0, 10))}
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Borrar precio de ${p.name}`}
                  onClick={async () => {
                    if (await confirm({ title: 'Borrar precio', text: `¿Borrar el precio de ${p.name}?`, ok: 'Borrar', danger: true })) {
                      await safe(() => db.prices.delete(p.id), 'Precio borrado.');
                    }
                  }}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card soft">
        <h3>¿Dónde se usa?</h3>
        <ul className="small">
          <li>
            En <a href="#/porciones">Calcular porciones</a>: costo estimado de la receta y por porción.
          </li>
          <li>
            En la <a href="#/compras">Lista de compras</a>: costo de lo que falta comprar y comparación con tu presupuesto.
          </li>
          <li>Si un producto no tiene precio cargado, la app lo avisa en lugar de inventar un valor.</li>
        </ul>
      </div>

      {editing ? <PriceForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
