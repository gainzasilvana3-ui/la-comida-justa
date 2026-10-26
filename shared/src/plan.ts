import type { Diner, PortionFactors, Recipe } from './types';
import { computeRecipe, equivalentPortions, totalPeople, DEFAULT_FACTORS } from './portions';
import type { QuantityItem } from './aggregate';

export const SLOTS = ['almuerzo', 'cena'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABELS: Record<Slot, string> = { almuerzo: 'Almuerzo', cena: 'Cena' };

export interface PlanEntry {
  id: string;
  /** Fecha ISO (AAAA-MM-DD). */
  date: string;
  slot: Slot;
  recipeId: string;
  /** Comensales de esta comida. */
  diners: Diner[];
  /**
   * Si esta comida se cubre con lo que sobra de otra (se cocina una sola vez),
   * id de esa otra comida. Así no se duplican ingredientes.
   */
  leftoversOf?: string;
  overrides?: Record<number, number>;
}

export interface Plan {
  id: string;
  name: string;
  startDate: string;
  days: number;
  defaultDiners: Diner[];
  entries: PlanEntry[];
  createdAt: string;
  updatedAt: string;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function planDates(plan: Pick<Plan, 'startDate' | 'days'>): string[] {
  return Array.from({ length: Math.max(0, plan.days) }, (_, i) => addDays(plan.startDate, i));
}

/**
 * Comidas que se cocinan de verdad, cada una con los comensales propios
 * más los de las comidas que se cubren con sus sobras.
 */
export function cookingEntries(entries: PlanEntry[]): { entry: PlanEntry; diners: Diner[] }[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const extra = new Map<string, Diner[]>();
  for (const e of entries) {
    if (!e.leftoversOf) continue;
    const src = byId.get(e.leftoversOf);
    // Una referencia rota o en cadena se trata como comida normal.
    if (!src || src.leftoversOf || src.recipeId !== e.recipeId) continue;
    extra.set(src.id, [...(extra.get(src.id) ?? []), ...e.diners]);
  }
  return entries
    .filter((e) => {
      if (!e.leftoversOf) return true;
      const src = byId.get(e.leftoversOf);
      return !src || Boolean(src.leftoversOf) || src.recipeId !== e.recipeId;
    })
    .map((e) => ({ entry: e, diners: [...e.diners, ...(extra.get(e.id) ?? [])] }));
}

export interface RecipeSummary {
  recipeId: string;
  name: string;
  meals: number;
  timesCooked: number;
  people: number;
  equivalentPortions: number;
}

export interface PlanTotals {
  items: QuantityItem[];
  perRecipe: RecipeSummary[];
  missingRecipes: string[];
}

/** Junta los ingredientes de todo el período, sin contar dos veces una misma tanda. */
export function planTotals(
  entries: PlanEntry[],
  recipes: Map<string, Recipe>,
  factors: PortionFactors = DEFAULT_FACTORS,
): PlanTotals {
  const items: QuantityItem[] = [];
  const summary = new Map<string, RecipeSummary>();
  const missing = new Set<string>();

  for (const e of entries) {
    const r = recipes.get(e.recipeId);
    if (!r) continue;
    const s = summary.get(r.id) ?? { recipeId: r.id, name: r.name, meals: 0, timesCooked: 0, people: 0, equivalentPortions: 0 };
    s.meals += 1;
    summary.set(r.id, s);
  }

  for (const { entry, diners } of cookingEntries(entries)) {
    const r = recipes.get(entry.recipeId);
    if (!r) {
      missing.add(entry.recipeId);
      continue;
    }
    const computed = computeRecipe(r, diners, factors, entry.overrides ?? {});
    const s = summary.get(r.id)!;
    s.timesCooked += 1;
    s.people += totalPeople(diners);
    s.equivalentPortions += equivalentPortions(diners, factors);
    for (const l of computed.lines) {
      items.push({
        name: l.name,
        qty: l.qty,
        unit: l.unit,
        state: l.state,
        category: l.category,
        toTaste: l.toTaste,
        optional: l.optional,
        skipShopping: l.skipShopping,
        from: r.name,
      });
    }
  }
  return { items, perRecipe: [...summary.values()], missingRecipes: [...missing] };
}

/** Copia las comidas de una semana a otra, sin tocar lo que ya hay en la semana destino salvo que se pida. */
export function duplicateWeek(
  plan: Plan,
  fromStart: string,
  toStart: string,
  makeId: () => string,
  replaceExisting = false,
): Plan {
  const fromDates = new Set(Array.from({ length: 7 }, (_, i) => addDays(fromStart, i)));
  const toDates = new Set(Array.from({ length: 7 }, (_, i) => addDays(toStart, i)));
  const offset = Math.round((Date.parse(toStart) - Date.parse(fromStart)) / 86_400_000);
  const source = plan.entries.filter((e) => fromDates.has(e.date));
  const idMap = new Map(source.map((e) => [e.id, makeId()]));
  const copies: PlanEntry[] = source.map((e) => ({
    ...e,
    id: idMap.get(e.id)!,
    date: addDays(e.date, offset),
    diners: e.diners.map((d) => ({ ...d })),
    leftoversOf: e.leftoversOf ? idMap.get(e.leftoversOf) : undefined,
  }));
  const kept = replaceExisting ? plan.entries.filter((e) => !toDates.has(e.date)) : plan.entries;
  const lastDate = addDays(toStart, 6);
  const neededDays = Math.round((Date.parse(lastDate) - Date.parse(plan.startDate)) / 86_400_000) + 1;
  return {
    ...plan,
    days: Math.max(plan.days, neededDays),
    entries: [...kept, ...copies],
    updatedAt: new Date().toISOString(),
  };
}

/** Cambia la receta de una comida sin tocar el resto del plan. */
export function replaceRecipe(plan: Plan, entryId: string, recipeId: string): Plan {
  return {
    ...plan,
    entries: plan.entries.map((e) => {
      if (e.id === entryId) return { ...e, recipeId, overrides: undefined, leftoversOf: undefined };
      // Las sobras de la receta vieja dejan de ser sobras.
      if (e.leftoversOf === entryId) return { ...e, leftoversOf: undefined };
      return e;
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function removeEntry(plan: Plan, entryId: string): Plan {
  return {
    ...plan,
    entries: plan.entries
      .filter((e) => e.id !== entryId)
      .map((e) => (e.leftoversOf === entryId ? { ...e, leftoversOf: undefined } : e)),
    updatedAt: new Date().toISOString(),
  };
}
