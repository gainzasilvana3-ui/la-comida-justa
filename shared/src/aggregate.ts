import type { Dimension, FoodState, ShopCategory, Unit } from './types';
import { normalizeName, toBase, dimensionOf } from './units';

/** Una cantidad de un alimento, tal como sale de una receta calculada. */
export interface QuantityItem {
  name: string;
  qty: number | null;
  unit: Unit | null;
  state?: FoodState;
  category: ShopCategory;
  toTaste?: boolean;
  optional?: boolean;
  skipShopping?: boolean;
  /** De qué receta viene (para mostrar el detalle). */
  from?: string;
}

export interface AggregatedItem {
  /** nombre normalizado | estado | dimensión */
  key: string;
  name: string;
  normName: string;
  state?: FoodState;
  dim: Dimension | null;
  /** Total en unidad base (g, ml o u). null para "a gusto". */
  total: number | null;
  category: ShopCategory;
  toTaste: boolean;
  optional: boolean;
  sources: string[];
  /**
   * true si el mismo alimento aparece con medidas incompatibles
   * (por ejemplo, en gramos y en unidades) y por eso no se sumó.
   */
  conflict: boolean;
}

export function itemKey(normName: string, state: FoodState | undefined, dim: Dimension | null): string {
  return `${normName}|${state ?? ''}|${dim ?? 'agusto'}`;
}

/**
 * Suma ingredientes compatibles. Nunca suma unidades con gramos, ni crudo
 * con cocido: esos quedan como renglones separados y se marcan.
 */
export function aggregate(items: QuantityItem[]): AggregatedItem[] {
  const map = new Map<string, AggregatedItem>();
  for (const it of items) {
    if (it.skipShopping) continue;
    const normName = normalizeName(it.name);
    if (!normName) continue;
    const isToTaste = Boolean(it.toTaste) || it.qty === null || it.unit === null;
    const dim = isToTaste ? null : dimensionOf(it.unit as Unit);
    const key = itemKey(normName, it.state, dim);
    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        name: it.name.trim(),
        normName,
        state: it.state,
        dim,
        total: isToTaste ? null : 0,
        category: it.category,
        toTaste: isToTaste,
        // Es opcional solo si en todas las recetas es opcional.
        optional: Boolean(it.optional),
        sources: [],
        conflict: false,
      };
      map.set(key, agg);
    }
    if (!isToTaste) {
      const qty = it.qty as number;
      if (!Number.isFinite(qty) || qty < 0) continue;
      agg.total = (agg.total ?? 0) + toBase(qty, it.unit as Unit).value;
    }
    agg.optional = agg.optional && Boolean(it.optional);
    if (it.from && !agg.sources.includes(it.from)) agg.sources.push(it.from);
  }

  const result = [...map.values()];
  // Marcar alimentos que quedaron partidos por medidas incompatibles.
  const dimsByName = new Map<string, Set<string>>();
  for (const a of result) {
    if (a.dim === null) continue;
    const k = `${a.normName}|${a.state ?? ''}`;
    const set = dimsByName.get(k) ?? new Set<string>();
    set.add(a.dim);
    dimsByName.set(k, set);
  }
  for (const a of result) {
    if (a.dim === null) continue;
    if ((dimsByName.get(`${a.normName}|${a.state ?? ''}`)?.size ?? 0) > 1) a.conflict = true;
  }
  // Si algo ya figura con cantidad, el renglón "a gusto" del mismo alimento sobra.
  return result.filter(
    (a) => !(a.dim === null && result.some((b) => b !== a && b.dim !== null && b.normName === a.normName)),
  );
}
