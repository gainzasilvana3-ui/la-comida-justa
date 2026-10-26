import {
  aggregate,
  buildShoppingList,
  effectiveToBuy,
  groupByCategory,
  purchaseDisplay,
  formatQty,
  SHOP_CATEGORY_LABELS,
  BASE_UNIT,
  type QuantityItem,
  type ShoppingItem,
  type PantryItem,
  type Unit,
} from '@lcj/shared';
import { db, type ShoppingList } from '../db/db';
import { getPrefs, setPref } from '../db/prefs';
import { newId } from './id';

/** Arma renglones de compra a partir de cantidades de recetas, descontando la despensa. */
export async function itemsFrom(quantities: QuantityItem[]): Promise<ShoppingItem[]> {
  const pantry = await db.pantry.toArray();
  return buildShoppingList(aggregate(quantities), pantry, newId);
}

export async function createList(
  name: string,
  quantities: QuantityItem[],
  link: { planId?: string; monthPlanId?: string } = {},
): Promise<ShoppingList> {
  const now = new Date().toISOString();
  const list: ShoppingList = { id: newId(), name, createdAt: now, updatedAt: now, items: await itemsFrom(quantities), ...link };
  const prefs = await getPrefs();
  await db.transaction('rw', db.shoppingLists, db.prefs, async () => {
    // Sin historial, la lista activa anterior se reemplaza.
    if (!prefs.keepHistory && prefs.activeListId) await db.shoppingLists.delete(prefs.activeListId);
    await db.shoppingLists.put(list);
    await db.prefs.put({ key: 'activeListId', value: list.id });
  });
  return list;
}

/**
 * Recalcula una lista con cantidades nuevas sin perder lo que el usuario hizo:
 * conserva lo marcado como comprado, las cantidades editadas y los productos agregados a mano.
 */
export function mergeRecalculated(old: ShoppingItem[], fresh: ShoppingItem[]): ShoppingItem[] {
  const byKey = new Map(old.filter((i) => i.key && !i.manual).map((i) => [i.key!, i]));
  const merged = fresh.map((f) => {
    const prev = f.key ? byKey.get(f.key) : undefined;
    if (!prev) return f;
    return { ...f, id: prev.id, checked: prev.checked, manualQty: prev.manualQty, category: prev.category };
  });
  return [...merged, ...old.filter((i) => i.manual)];
}

export async function recalcList(listId: string, quantities: QuantityItem[]): Promise<void> {
  const list = await db.shoppingLists.get(listId);
  if (!list) return;
  const fresh = await itemsFrom(quantities);
  await db.shoppingLists.put({ ...list, items: mergeRecalculated(list.items, fresh), updatedAt: new Date().toISOString() });
}

/** Suma renglones a la lista activa (o crea una). Lo repetido se suma, no se duplica. */
export async function addToActiveList(quantities: QuantityItem[], fallbackName: string): Promise<ShoppingList> {
  const prefs = await getPrefs();
  const active = prefs.activeListId ? await db.shoppingLists.get(prefs.activeListId) : undefined;
  if (!active || active.archived) return createList(fallbackName, quantities);
  const existingAuto = active.items.filter((i) => !i.manual && i.calculated !== null);
  // Reconstruimos las cantidades de lo que ya estaba para sumarlas con lo nuevo.
  const asQuantities: QuantityItem[] = existingAuto.map((i) => ({
    name: i.name,
    qty: i.calculated,
    unit: i.dim ? BASE_UNIT[i.dim] : null,
    state: i.state,
    category: i.category,
    optional: i.optional,
  }));
  const toTaste = active.items.filter((i) => i.toTaste).map((i) => ({ name: i.name, qty: null, unit: null, category: i.category, toTaste: true }));
  const fresh = await itemsFrom([...asQuantities, ...toTaste, ...quantities]);
  const merged = mergeRecalculated(active.items, fresh);
  const updated = { ...active, items: merged, updatedAt: new Date().toISOString() };
  await db.shoppingLists.put(updated);
  return updated;
}

export function addManualItem(list: ShoppingList, name: string, qty: number | null, unit: Unit | null, category: ShoppingItem['category']): ShoppingList {
  const dim = unit ? ({ g: 'masa', kg: 'masa', ml: 'volumen', l: 'volumen', u: 'unidad' } as const)[unit] : null;
  const base = qty !== null && unit ? qty * ({ g: 1, kg: 1000, ml: 1, l: 1000, u: 1 } as const)[unit] : null;
  const item: ShoppingItem = {
    id: newId(),
    name: name.trim(),
    category,
    dim,
    calculated: null,
    available: 0,
    toBuy: base,
    manualQty: undefined,
    checked: false,
    manual: true,
    toTaste: base === null,
    optional: false,
    conflict: false,
    sources: [],
  };
  return { ...list, items: [...list.items, item], updatedAt: new Date().toISOString() };
}

export function itemQtyText(i: ShoppingItem): string {
  const q = effectiveToBuy(i);
  if (q === null || i.dim === null) return i.manual ? '' : 'a gusto';
  const p = purchaseDisplay(q, i.dim);
  return formatQty(p.qty, p.unit);
}

/** Texto para compartir por WhatsApp o copiar. */
export function listAsText(list: ShoppingList, includeChecked = false): string {
  const lines: string[] = [`🛒 ${list.name}`, ''];
  for (const g of groupByCategory(list.items)) {
    const items = g.items.filter((i) => (includeChecked || !i.checked) && (effectiveToBuy(i) ?? 1) > 0);
    if (!items.length) continue;
    lines.push(`*${SHOP_CATEGORY_LABELS[g.category]}*`);
    for (const i of items) {
      const q = itemQtyText(i);
      lines.push(`${i.checked ? '☑' : '☐'} ${i.name}${q ? ` — ${q}` : ''}`);
    }
    lines.push('');
  }
  lines.push('Hecho con La comida justa');
  return lines.join('\n');
}

/** Pasa lo comprado a "Lo que ya tengo". */
export async function checkedToPantry(list: ShoppingList): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const items: PantryItem[] = [];
  for (const i of list.items) {
    const q = effectiveToBuy(i);
    if (!i.checked || q === null || q <= 0 || i.dim === null) continue;
    const p = purchaseDisplay(q, i.dim);
    items.push({
      id: newId(),
      name: i.name,
      qty: p.qty,
      unit: p.unit,
      state: i.state,
      location: i.category === 'congelados' ? 'freezer' : i.category === 'carniceria' || i.category === 'lacteos_huevos' ? 'heladera' : 'despensa',
      addedAt: today,
    });
  }
  await db.pantry.bulkPut(items);
  return items.length;
}

export async function setActiveList(id: string | undefined): Promise<void> {
  await setPref('activeListId', id);
}
