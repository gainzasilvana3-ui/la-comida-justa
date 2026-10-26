import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  SHOP_CATEGORIES,
  SHOP_CATEGORY_LABELS,
  UNITS,
  UNIT_LABELS,
  effectiveToBuy,
  formatBase,
  formatMoney,
  groupByCategory,
  prettyFromBase,
  shoppingCost,
  userQtyToBase,
  type ShoppingItem,
  type Unit,
} from '@lcj/shared';
import { db, type ShoppingList } from '../db/db';
import { setPref, usePrefs } from '../db/prefs';
import { addManualItem, checkedToPantry, createList, itemQtyText, listAsText } from '../lib/shopping';
import { formatDate } from '../lib/id';
import { Icon } from '../ui/Icon';
import { Empty, Field, Modal, NumberInput, downloadFile, shareText, useConfirm, useSafeWrite, useToast } from '../ui/kit';

function ItemRow({ item, onChange, onDelete, readOnly }: { item: ShoppingItem; onChange: (i: ShoppingItem) => void; onDelete: () => void; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const qty = itemQtyText(item);
  const display = item.dim && effectiveToBuy(item) !== null ? prettyFromBase(effectiveToBuy(item)!, item.dim) : null;
  return (
    <div className={`shop-item${item.checked ? ' done' : ''}`}>
      <input
        type="checkbox"
        checked={item.checked}
        disabled={readOnly}
        onChange={(e) => onChange({ ...item, checked: e.target.checked })}
        aria-label={`Comprado: ${item.name}`}
      />
      <div className="grow">
        <button className="btn ghost small block" style={{ justifyContent: 'space-between', padding: '6px 0', textAlign: 'left' }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="name">
            {item.name}
            {item.state ? <span className="badge" style={{ marginLeft: 6 }}>{item.state}</span> : null}
            {item.conflict ? <span className="badge warn" style={{ marginLeft: 6 }}>revisar</span> : null}
            {item.manualQty !== undefined && item.manualQty !== null ? <span className="badge terra" style={{ marginLeft: 6 }}>editado</span> : null}
          </span>
          <span className="qty">{qty}</span>
        </button>
        {open ? (
          <div className="shop-detail">
            {item.calculated !== null && item.dim ? (
              <p style={{ margin: '4px 0' }}>
                Calculado: {formatBase(item.calculated, item.dim)} · Ya tenés: {formatBase(item.available, item.dim)} · Falta:{' '}
                {formatBase(item.toBuy ?? 0, item.dim)}
              </p>
            ) : null}
            {item.conflict ? (
              <p style={{ margin: '4px 0' }}>
                Este alimento aparece en otra receta con otra medida (por ejemplo, en unidades y en gramos). No se sumaron para no dar un total equivocado.
              </p>
            ) : null}
            {item.sources.length ? <p style={{ margin: '4px 0' }}>Para: {item.sources.join(', ')}</p> : null}
            {!readOnly ? (
              <div className="row" style={{ marginTop: 6 }}>
                {item.dim && display ? (
                  <Field label={`Cantidad a comprar (${UNIT_LABELS[display.unit]})`}>
                    <NumberInput
                      value={Math.round(display.qty * 100) / 100}
                      min={0}
                      onChange={(v) => {
                        if (v !== null) onChange({ ...item, manualQty: userQtyToBase(v, display.unit, item.dim!) });
                      }}
                    />
                  </Field>
                ) : null}
                {item.manualQty !== undefined && item.manualQty !== null && !item.manual ? (
                  <button className="btn small ghost" onClick={() => onChange({ ...item, manualQty: undefined })}>
                    Volver al cálculo
                  </button>
                ) : null}
                <button className="btn small danger secondary" onClick={onDelete}>
                  <Icon name="trash" /> Quitar
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AddItem({ list, onClose }: { list: ShoppingList; onClose: () => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>('u');
  const [category, setCategory] = useState<ShoppingItem['category']>('otros');
  const safe = useSafeWrite();
  return (
    <Modal title="Agregar a la lista" onClose={onClose}>
      <Field label="Producto">
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ej. Yerba, detergente" />
      </Field>
      <div className="grid2">
        <Field label="Cantidad (opcional)">
          <NumberInput value={qty} min={0.001} onChange={setQty} />
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
      <Field label="Sección">
        <select value={category} onChange={(e) => setCategory(e.target.value as ShoppingItem['category'])}>
          {SHOP_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SHOP_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <button
        className="btn block"
        disabled={!name.trim()}
        onClick={async () => {
          if (await safe(() => db.shoppingLists.put(addManualItem(list, name, qty, qty === null ? null : unit, category)), 'Agregado.')) onClose();
        }}
      >
        Agregar
      </button>
    </Modal>
  );
}

export function Shopping({ limited }: { limited: boolean }) {
  const prefs = usePrefs();
  const lists = useLiveQuery(() => db.shoppingLists.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const prices = useLiveQuery(() => db.prices.toArray(), []) ?? [];
  const safe = useSafeWrite();
  const confirm = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);

  const list = lists.find((l) => l.id === prefs?.activeListId) ?? lists.find((l) => !l.archived);

  if (!list) {
    return (
      <Empty icon="cart" title="Todavía no hay lista de compras">
        <p>Armala desde tu menú semanal o sumá ingredientes desde la calculadora de porciones.</p>
        {!limited ? (
          <div className="actions">
            <a className="btn" href="#/menu">
              Ir al menú
            </a>
            <button className="btn secondary" onClick={() => void safe(() => createList('Lista de compras', []))}>
              Empezar una lista vacía
            </button>
          </div>
        ) : null}
      </Empty>
    );
  }

  const save = (l: ShoppingList) => safe(() => db.shoppingLists.put({ ...l, updatedAt: new Date().toISOString() }));
  const updateItem = (item: ShoppingItem) => save({ ...list, items: list.items.map((i) => (i.id === item.id ? item : i)) });
  const removeItem = async (item: ShoppingItem) => {
    if (await confirm({ title: 'Quitar de la lista', text: `¿Quitar "${item.name}"?`, ok: 'Quitar', danger: true })) {
      await save({ ...list, items: list.items.filter((i) => i.id !== item.id) });
    }
  };

  const groups = groupByCategory(list.items.filter((i) => !i.toTaste || i.manual));
  const toTaste = list.items.filter((i) => i.toTaste && !i.manual);
  const pendingCount = list.items.filter((i) => !i.checked && !i.toTaste && (effectiveToBuy(i) ?? 1) > 0).length;
  const cost = shoppingCost(list.items.filter((i) => !i.checked), prices);
  const budget = list.budget ?? null;

  return (
    <div>
      <div className="card">
        <div className="row between nowrap">
          <div className="grow">
            <h2 style={{ marginBottom: 0 }}>{list.name}</h2>
            <span className="small muted">
              {pendingCount} por comprar · creada el {formatDate(list.createdAt.slice(0, 10))}
            </span>
          </div>
        </div>
        {lists.length > 1 ? (
          <div className="chips" style={{ marginTop: 10 }}>
            {lists.map((l) => (
              <button key={l.id} className="chip" aria-pressed={l.id === list.id} onClick={() => void setPref('activeListId', l.id)}>
                {l.name}
                {l.archived ? ' (archivada)' : ''}
              </button>
            ))}
          </div>
        ) : null}
        <div className="actions">
          {!limited ? (
            <button className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Agregar producto
            </button>
          ) : null}
          <button
            className="btn secondary"
            onClick={async () => {
              const r = await shareText(list.name, listAsText(list));
              if (r === 'copied') toast('Lista copiada. Pegala en WhatsApp o donde quieras.');
              else if (r === 'failed') downloadFile(`${list.name}.txt`, listAsText(list));
            }}
          >
            <Icon name="share" /> Compartir
          </button>
          <button className="btn ghost" onClick={() => downloadFile(`${list.name}.txt`, listAsText(list, true))}>
            <Icon name="download" /> Descargar
          </button>
        </div>
      </div>

      <div className="card">
        <h2>
          <Icon name="tag" /> Presupuesto
        </h2>
        <div className="grid2">
          <Field label="Tu presupuesto (opcional)">
            <NumberInput value={budget} min={0} max={1e10} placeholder="$" onChange={(v) => void save({ ...list, budget: v })} />
          </Field>
          <div>
            <div className="muted small">Costo estimado de lo que falta</div>
            <div className="qty" style={{ fontSize: '1.3rem' }}>
              {cost.priced ? formatMoney(cost.total) : '—'}
            </div>
          </div>
        </div>
        {budget !== null && cost.priced ? (
          <p className={cost.total > budget ? 'notice warn' : 'notice'}>
            {cost.total > budget ? `Te pasás del presupuesto por ${formatMoney(cost.total - budget)}.` : `Te quedan ${formatMoney(budget - cost.total)} del presupuesto.`}
          </p>
        ) : null}
        <p className="small muted">
          {cost.unpriced.length ? `${cost.unpriced.length} productos sin precio. ` : ''}
          El costo usa los precios que cargaste vos en <a href="#/precios">Precios</a>; no son precios actuales de ningún comercio.
        </p>
      </div>

      <label className="check">
        <input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} />
        Ocultar lo que ya compré
      </label>

      {groups.map((g) => {
        const items = g.items.filter((i) => !(hideChecked && i.checked));
        if (!items.length) return null;
        return (
          <div key={g.category} className="card">
            <h3>{SHOP_CATEGORY_LABELS[g.category]}</h3>
            {items.map((i) => (
              <ItemRow key={i.id} item={i} readOnly={limited} onChange={(x) => void updateItem(x)} onDelete={() => void removeItem(i)} />
            ))}
          </div>
        );
      })}

      {toTaste.length ? (
        <div className="card soft">
          <h3>Revisá si tenés (a gusto)</h3>
          <p className="small muted">{toTaste.map((i) => i.name).join(', ')}</p>
        </div>
      ) : null}

      {!limited ? (
        <div className="actions">
          <button
            className="btn secondary"
            disabled={!list.items.some((i) => i.checked)}
            onClick={async () => {
              const ok = await confirm({
                title: 'Guardar lo comprado',
                text: 'Lo que marcaste como comprado se suma a "Lo que ya tengo".',
                ok: 'Guardar',
              });
              if (ok) {
                const n = await checkedToPantry(list);
                toast(`${n} productos guardados en Lo que ya tengo.`);
              }
            }}
          >
            <Icon name="box" /> Pasar lo comprado a Lo que ya tengo
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              const ok = await confirm({
                title: prefs?.keepHistory ? 'Archivar lista' : 'Borrar lista',
                text: prefs?.keepHistory ? 'La lista queda guardada en tu historial.' : 'La lista se borra. Podés activar el historial en Ajustes para guardarlas.',
                ok: prefs?.keepHistory ? 'Archivar' : 'Borrar',
                danger: !prefs?.keepHistory,
              });
              if (!ok) return;
              if (prefs?.keepHistory) await save({ ...list, archived: true });
              else await safe(() => db.shoppingLists.delete(list.id));
              await setPref('activeListId', undefined);
            }}
          >
            {prefs?.keepHistory ? 'Archivar lista' : 'Borrar lista'}
          </button>
        </div>
      ) : null}

      {adding ? <AddItem list={list} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
