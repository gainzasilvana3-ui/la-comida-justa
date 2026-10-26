import type { Recipe, RecipeIngredient, Role, ShopCategory, Unit, FoodState } from '../../shared/src/types.ts';

type Extra = { state?: FoodState; optional?: boolean; skipShopping?: boolean; note?: string };

/** Ingrediente con cantidad (total para las porciones de referencia). */
export function i(name: string, qty: number, unit: Unit, role: Role, category: ShopCategory, extra: Extra = {}): RecipeIngredient {
  return { name, qty, unit, role, category, ...extra };
}

/** Ingrediente "a gusto": se lista pero no se calcula. */
export function g(name: string, category: ShopCategory = 'condimentos', extra: Extra = {}): RecipeIngredient {
  return { name, qty: null, unit: null, role: 'condimento', category, toTaste: true, ...extra };
}

export const crudo = { state: 'crudo' } as const;

export function recipe(r: Omit<Recipe, 'source'>): Recipe {
  return { ...r, source: 'catalogo' };
}

/** Conservación orientativa estándar para comidas cocidas. */
export const COCIDO_CONGELABLE = {
  fridgeDays: 3,
  freezerMonths: 3,
  notes: 'Enfriar rápido y guardar tapado en heladera antes de 2 horas. Congelar en porciones. Descongelar en heladera.',
};
