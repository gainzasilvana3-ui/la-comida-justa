import type { AggregatedItem } from './aggregate';
import type { Dimension, FoodState, ShopCategory, Unit } from './types';
import { SHOP_CATEGORIES } from './types';
import { dimensionOf, normalizeName, toBase, roundUpForPurchase, prettyFromBase, BASE_UNIT, convert } from './units';

export type PantryLocation = 'despensa' | 'heladera' | 'freezer';

export interface PantryItem {
  id: string;
  name: string;
  qty: number;
  unit: Unit;
  state?: FoodState;
  location: PantryLocation;
  addedAt?: string;
  /** Fecha que cargó el usuario (vencimiento o consumo preferente). */
  expiresAt?: string;
}

export interface ShoppingItem {
  id: string;
  key?: string;
  name: string;
  category: ShopCategory;
  dim: Dimension | null;
  state?: FoodState;
  /** Cantidades en unidad base (g, ml o u). */
  calculated: number | null;
  available: number;
  toBuy: number | null;
  /** Si el usuario la editó, reemplaza a toBuy. */
  manualQty?: number | null;
  checked: boolean;
  manual: boolean;
  toTaste: boolean;
  optional: boolean;
  conflict: boolean;
  sources: string[];
}

/** Lo disponible en la despensa para un alimento, en unidad base. */
export function availableFor(
  normName: string,
  state: FoodState | undefined,
  dim: Dimension,
  pantry: PantryItem[],
): number {
  let total = 0;
  for (const p of pantry) {
    if (!(p.qty > 0)) continue;
    if (normalizeName(p.name) !== normName) continue;
    if (dimensionOf(p.unit) !== dim) continue;
    // Lo guardado sin estado se considera crudo/tal cual se compra.
    const pState = p.state ?? 'crudo';
    const iState = state ?? 'crudo';
    if (pState !== iState) continue;
    total += toBase(p.qty, p.unit).value;
  }
  return total;
}

/**
 * Arma la lista de compras: total calculado, lo que ya hay y lo que falta.
 * Nunca da cantidades negativas.
 */
export function buildShoppingList(
  aggregated: AggregatedItem[],
  pantry: PantryItem[],
  makeId: () => string,
): ShoppingItem[] {
  return aggregated.map((a) => {
    if (a.dim === null || a.total === null) {
      return {
        id: makeId(),
        key: a.key,
        name: a.name,
        category: a.category,
        dim: null,
        state: a.state,
        calculated: null,
        available: 0,
        toBuy: null,
        checked: false,
        manual: false,
        toTaste: true,
        optional: a.optional,
        conflict: false,
        sources: a.sources,
      };
    }
    const avail = availableFor(a.normName, a.state, a.dim, pantry);
    const used = Math.min(avail, a.total);
    return {
      id: makeId(),
      key: a.key,
      name: a.name,
      category: a.category,
      dim: a.dim,
      state: a.state,
      calculated: a.total,
      available: used,
      toBuy: Math.max(0, a.total - used),
      checked: false,
      manual: false,
      toTaste: false,
      optional: a.optional,
      conflict: a.conflict,
      sources: a.sources,
    };
  });
}

/** Cantidad final a comprar de un renglón (respeta la edición manual). */
export function effectiveToBuy(item: ShoppingItem): number | null {
  if (item.manualQty !== undefined && item.manualQty !== null) return Math.max(0, item.manualQty);
  return item.toBuy;
}

export function groupByCategory(items: ShoppingItem[]): { category: ShopCategory; items: ShoppingItem[] }[] {
  return SHOP_CATEGORIES.map((category) => ({
    category,
    items: items
      .filter((i) => i.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  })).filter((g) => g.items.length > 0);
}

/** Muestra una cantidad base redondeada para comprar (en kg/l si corresponde). */
export function purchaseDisplay(value: number, dim: Dimension): { qty: number; unit: Unit } {
  const p = prettyFromBase(value, dim);
  return { qty: roundUpForPurchase(p.qty, p.unit), unit: p.unit };
}

/** Pasa una cantidad escrita por el usuario a unidad base para guardarla. */
export function userQtyToBase(qty: number, unit: Unit, dim: Dimension): number {
  return convert(qty, unit, BASE_UNIT[dim]);
}

/**
 * Descuenta de la despensa lo usado al cocinar. Devuelve una copia.
 * Consume primero lo que vence antes. Nunca deja cantidades negativas.
 */
export function consumeFromPantry(
  pantry: PantryItem[],
  used: { name: string; qty: number; unit: Unit; state?: FoodState }[],
): PantryItem[] {
  const next = pantry.map((p) => ({ ...p }));
  for (const u of used) {
    if (!(u.qty > 0)) continue;
    const norm = normalizeName(u.name);
    const dim = dimensionOf(u.unit);
    let remaining = toBase(u.qty, u.unit).value;
    const candidates = next
      .filter(
        (p) =>
          normalizeName(p.name) === norm &&
          dimensionOf(p.unit) === dim &&
          (p.state ?? 'crudo') === (u.state ?? 'crudo') &&
          p.qty > 0,
      )
      .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
    for (const p of candidates) {
      if (remaining <= 0) break;
      const pBase = toBase(p.qty, p.unit).value;
      const take = Math.min(pBase, remaining);
      remaining -= take;
      p.qty = convert(pBase - take, BASE_UNIT[dim], p.unit);
      if (p.qty < 1e-9) p.qty = 0;
    }
  }
  return next;
}

/** Días hasta la fecha cargada por el usuario (negativo si ya pasó). */
export function daysUntil(dateIso: string, today: Date = new Date()): number {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

/** Ordena la despensa para mostrar primero lo que conviene usar antes. */
export function useFirst(pantry: PantryItem[], today: Date = new Date()): (PantryItem & { days: number | null })[] {
  return pantry
    .filter((p) => p.qty > 0)
    .map((p) => ({ ...p, days: p.expiresAt ? daysUntil(p.expiresAt, today) : null }))
    .sort((a, b) => {
      if (a.days === null && b.days === null) return a.name.localeCompare(b.name, 'es');
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });
}
