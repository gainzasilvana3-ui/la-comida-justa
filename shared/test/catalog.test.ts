import { describe, expect, it } from 'vitest';
import { catalogSchema, computeRecipe, recipeSchema, ALLERGENS } from '../src';
import { RECETAS } from '../../catalog/src/recetas';

describe('catálogo inicial', () => {
  it('tiene entre 25 y 30 recetas válidas', () => {
    expect(RECETAS.length).toBeGreaterThanOrEqual(25);
    expect(RECETAS.length).toBeLessThanOrEqual(30);
    const parsed = catalogSchema.safeParse({ version: 1, publishedAt: '2026-10-26', recipes: RECETAS });
    if (!parsed.success) console.error(parsed.error.issues.slice(0, 5));
    expect(parsed.success).toBe(true);
  });

  it('ids únicos y nombres únicos', () => {
    expect(new Set(RECETAS.map((r) => r.id)).size).toBe(RECETAS.length);
    expect(new Set(RECETAS.map((r) => r.name)).size).toBe(RECETAS.length);
  });

  it.each(RECETAS.map((r) => [r.name, r] as const))('%s: completa y calculable', (_name, r) => {
    expect(recipeSchema.safeParse(r).success).toBe(true);
    expect(r.steps.length).toBeGreaterThanOrEqual(3);
    expect(r.substitutions.length).toBeGreaterThanOrEqual(1);
    expect(r.conservation.fridgeDays).not.toBeNull();
    const c = computeRecipe(r, [{ id: 'a', category: 'adulto', profile: 'normal', count: r.refPortions }]);
    for (const [idx, line] of c.lines.entries()) {
      const ing = r.ingredients[idx]!;
      if (ing.qty !== null) expect(line.qty).toBeCloseTo(ing.qty);
    }
  });

  it('marca alérgenos evidentes por ingrediente', () => {
    const rules: [RegExp, (typeof ALLERGENS)[number]][] = [
      [/harina 000|pan rallado|fideos|tapas|panqueque|pan de/i, 'gluten'],
      [/^huevo/i, 'huevo'],
      [/leche|queso|manteca|muzzarella|ricota/i, 'leche'],
      [/soja/i, 'soja'],
      [/^apio/i, 'apio'],
    ];
    for (const r of RECETAS) {
      for (const ing of r.ingredients) {
        for (const [re, allergen] of rules) {
          if (re.test(ing.name)) expect(r.allergens, `${r.name}: ${ing.name}`).toContain(allergen);
        }
      }
    }
  });
});
