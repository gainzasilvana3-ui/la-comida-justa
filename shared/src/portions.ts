import type { Diner, DinerCategory, PortionFactors, Recipe, RecipeIngredient, Role, Unit, FoodState } from './types';

/**
 * Factores orientativos por defecto. Son editables por el usuario.
 * Un adulto que come "normal" equivale a 1 porción de referencia de la receta.
 */
export const DEFAULT_FACTORS: PortionFactors = {
  category: {
    adulto: { principal: 1, acompanamiento: 1, verdura: 1, base: 1, condimento: 1 },
    adolescente: { principal: 1.1, acompanamiento: 1.2, verdura: 1, base: 1.1, condimento: 1 },
    nino: { principal: 0.5, acompanamiento: 0.6, verdura: 0.5, base: 0.6, condimento: 0.6 },
  },
  profile: { poco: 0.75, normal: 1, abundante: 1.3 },
};

export const FACTOR_LIMITS = { min: 0.1, max: 3 };
export const CUSTOM_FACTOR_LIMITS = { min: 0.3, max: 3 };

function clampFactor(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(min, n));
}

/** Factor de un grupo de comensales para un rol dado. */
export function dinerRoleFactor(diner: Diner, role: Role, factors: PortionFactors = DEFAULT_FACTORS): number {
  const count = Math.max(0, Math.floor(diner.count));
  if (count === 0) return 0;
  const cat = clampFactor(factors.category[diner.category][role], FACTOR_LIMITS.min, FACTOR_LIMITS.max);
  // El apetito no cambia cuánta sal o especias lleva un plato.
  const prof = role === 'condimento' ? 1 : clampFactor(factors.profile[diner.profile], FACTOR_LIMITS.min, FACTOR_LIMITS.max);
  const custom =
    diner.customFactor === undefined ? 1 : clampFactor(diner.customFactor, CUSTOM_FACTOR_LIMITS.min, CUSTOM_FACTOR_LIMITS.max);
  return count * cat * prof * custom;
}

export function totalPeople(diners: Diner[]): number {
  return diners.reduce((acc, d) => acc + Math.max(0, Math.floor(d.count)), 0);
}

const MAIN_ROLES: Role[] = ['principal', 'acompanamiento', 'verdura', 'base'];

/**
 * Porciones equivalentes: cuántas porciones "de adulto normal" representan
 * los comensales, promediando los roles principales del plato.
 */
export function equivalentPortions(diners: Diner[], factors: PortionFactors = DEFAULT_FACTORS): number {
  let sum = 0;
  for (const d of diners) {
    const avg = MAIN_ROLES.reduce((a, r) => a + dinerRoleFactor(d, r, factors), 0) / MAIN_ROLES.length;
    sum += avg;
  }
  return sum;
}

export interface ComputedLine {
  index: number;
  name: string;
  qty: number | null;
  unit: Unit | null;
  state?: FoodState;
  role: Role;
  category: RecipeIngredient['category'];
  toTaste: boolean;
  optional: boolean;
  skipShopping: boolean;
  /** true si el usuario cambió la cantidad a mano. */
  manual: boolean;
  note?: string;
}

export interface ComputedRecipe {
  recipeId: string;
  people: number;
  equivalentPortions: number;
  lines: ComputedLine[];
}

/**
 * Calcula las cantidades de una receta para un grupo de comensales.
 * Cada ingrediente escala según su rol: la carne de un niño no se ajusta
 * igual que la sal o el arroz.
 * `overrides` permite fijar a mano la cantidad (en la unidad de la receta).
 */
export function computeRecipe(
  recipe: Pick<Recipe, 'id' | 'refPortions' | 'ingredients'>,
  diners: Diner[],
  factors: PortionFactors = DEFAULT_FACTORS,
  overrides: Record<number, number> = {},
): ComputedRecipe {
  if (!(recipe.refPortions > 0)) {
    throw new Error('La receta tiene que tener al menos 1 porción de referencia.');
  }
  const roleTotals = new Map<Role, number>();
  const roleTotal = (role: Role) => {
    let v = roleTotals.get(role);
    if (v === undefined) {
      v = diners.reduce((a, d) => a + dinerRoleFactor(d, role, factors), 0);
      roleTotals.set(role, v);
    }
    return v;
  };

  const lines: ComputedLine[] = recipe.ingredients.map((ing, index) => {
    const base = {
      index,
      name: ing.name,
      unit: ing.unit,
      state: ing.state,
      role: ing.role,
      category: ing.category,
      toTaste: Boolean(ing.toTaste),
      optional: Boolean(ing.optional),
      skipShopping: Boolean(ing.skipShopping),
      note: ing.note,
    };
    if (ing.toTaste || ing.qty === null || ing.unit === null) {
      return { ...base, qty: null, manual: false };
    }
    const override = overrides[index];
    if (override !== undefined && Number.isFinite(override) && override >= 0) {
      return { ...base, qty: override, manual: true };
    }
    const perPortion = ing.qty / recipe.refPortions;
    return { ...base, qty: perPortion * roleTotal(ing.role), manual: false };
  });

  return {
    recipeId: recipe.id,
    people: totalPeople(diners),
    equivalentPortions: equivalentPortions(diners, factors),
    lines,
  };
}

/** Diners equivalentes a N porciones de adulto normal (útil para cocinar por tandas). */
export function dinersForPortions(portions: number, category: DinerCategory = 'adulto'): Diner[] {
  return [{ id: 'porciones', category, profile: 'normal', count: Math.max(0, Math.floor(portions)) }];
}
