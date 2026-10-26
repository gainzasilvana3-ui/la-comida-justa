import type { Dimension, Unit } from './types';
import { dimensionOf, normalizeName, toBase } from './units';
import type { ComputedLine } from './portions';
import type { ShoppingItem } from './shopping';
import { effectiveToBuy } from './shopping';

/**
 * Precio cargado a mano por el usuario. No es un precio actual de mercado:
 * se guarda la fecha para que el usuario sepa cuándo lo anotó.
 */
export interface PriceEntry {
  id: string;
  name: string;
  /** Cantidad a la que corresponde el precio, ej. 1 kg, 500 g, 12 u. */
  amount: number;
  unit: Unit;
  price: number;
  updatedAt: string;
}

export function pricePerBase(p: PriceEntry): { dim: Dimension; value: number } | null {
  if (!(p.amount > 0) || !(p.price >= 0)) return null;
  const base = toBase(p.amount, p.unit);
  return { dim: base.dim, value: p.price / base.value };
}

export function findPrice(prices: PriceEntry[], name: string, dim: Dimension): PriceEntry | undefined {
  const norm = normalizeName(name);
  return prices
    .filter((p) => normalizeName(p.name) === norm && dimensionOf(p.unit) === dim)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export interface CostResult {
  total: number;
  priced: number;
  unpriced: string[];
}

/** Costo estimado de una receta calculada con los precios cargados. */
export function recipeCost(lines: ComputedLine[], prices: PriceEntry[]): CostResult {
  let total = 0;
  let priced = 0;
  const unpriced: string[] = [];
  for (const l of lines) {
    if (l.qty === null || l.unit === null || l.toTaste) continue;
    const base = toBase(l.qty, l.unit);
    const p = findPrice(prices, l.name, base.dim);
    const ppb = p ? pricePerBase(p) : null;
    if (!ppb) {
      if (!l.optional) unpriced.push(l.name);
      continue;
    }
    total += base.value * ppb.value;
    priced += 1;
  }
  return { total, priced, unpriced };
}

/** Costo estimado de lo que falta comprar. */
export function shoppingCost(items: ShoppingItem[], prices: PriceEntry[]): CostResult {
  let total = 0;
  let priced = 0;
  const unpriced: string[] = [];
  for (const i of items) {
    const qty = effectiveToBuy(i);
    if (i.dim === null || qty === null || qty <= 0) continue;
    const p = findPrice(prices, i.name, i.dim);
    const ppb = p ? pricePerBase(p) : null;
    if (!ppb) {
      unpriced.push(i.name);
      continue;
    }
    total += qty * ppb.value;
    priced += 1;
  }
  return { total, priced, unpriced };
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export function formatMoney(n: number): string {
  return money.format(Math.round(n));
}
