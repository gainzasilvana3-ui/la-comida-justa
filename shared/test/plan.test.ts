import { describe, expect, it } from 'vitest';
import {
  aggregate,
  addDays,
  duplicateWeek,
  formatMoney,
  mealsNeeded,
  monthShoppingItems,
  monthStatus,
  planTotals,
  recipeCost,
  computeRecipe,
  removeEntry,
  replaceRecipe,
  shoppingCost,
  storageSplit,
  suggestSessions,
  buildShoppingList,
  type Diner,
  type MonthPlan,
  type Plan,
  type PlanEntry,
  type PriceEntry,
  type Recipe,
} from '../src';

let n = 0;
const id = () => `x${++n}`;
const adults = (count: number): Diner[] => [{ id: 'd', category: 'adulto', profile: 'normal', count }];

const mk = (rid: string, name: string, arroz: number, extra: Partial<Recipe> = {}): Recipe => ({
  id: rid,
  name,
  category: 'pastas_y_arroces',
  refPortions: 4,
  ingredients: [{ name: 'Arroz', qty: arroz, unit: 'g', state: 'crudo', role: 'acompanamiento', category: 'almacen' }],
  steps: [],
  timeMinutes: 30,
  conservation: { fridgeDays: 3, freezerMonths: 2, notes: '' },
  batchFriendly: true,
  allergens: [],
  substitutions: [],
  source: 'catalogo',
  ...extra,
});

const recipes = new Map<string, Recipe>([
  ['a', mk('a', 'Receta A', 300)],
  ['b', mk('b', 'Receta B', 200)],
  ['c', mk('c', 'Ensalada', 0.0001, { conservation: { fridgeDays: 1, freezerMonths: null, notes: '' } })],
]);

const entry = (over: Partial<PlanEntry>): PlanEntry => ({
  id: id(),
  date: '2026-11-02',
  slot: 'almuerzo',
  recipeId: 'a',
  diners: adults(4),
  ...over,
});

describe('planificador', () => {
  it('suma ingredientes de todo el período', () => {
    const t = planTotals([entry({ recipeId: 'a' }), entry({ recipeId: 'b', slot: 'cena' })], recipes);
    const agg = aggregate(t.items);
    expect(agg[0]!.total).toBe(500);
  });

  it('repetir una receta en días distintos cuenta cada vez', () => {
    const t = planTotals([entry({ date: '2026-11-02' }), entry({ date: '2026-11-04' })], recipes);
    expect(aggregate(t.items)[0]!.total).toBe(600);
    expect(t.perRecipe[0]).toMatchObject({ meals: 2, timesCooked: 2, equivalentPortions: 8 });
  });

  it('las sobras no duplican ingredientes: se cocina una vez para ambos', () => {
    const lunch = entry({ id: 'L1', diners: adults(2) });
    const dinner = entry({ id: 'D1', slot: 'cena', diners: adults(2), leftoversOf: 'L1' });
    const t = planTotals([lunch, dinner], recipes);
    expect(aggregate(t.items)[0]!.total).toBe(300);
    expect(t.perRecipe[0]).toMatchObject({ meals: 2, timesCooked: 1, people: 4 });
  });

  it('una sobra que apunta a otra receta se cuenta como comida normal', () => {
    const t = planTotals([entry({ id: 'L', recipeId: 'b' }), entry({ recipeId: 'a', leftoversOf: 'L' })], recipes);
    expect(aggregate(t.items)[0]!.total).toBe(500);
  });

  it('informa recetas que ya no existen', () => {
    const t = planTotals([entry({ recipeId: 'borrada' })], recipes);
    expect(t.missingRecipes).toEqual(['borrada']);
  });

  const plan = (): Plan => ({
    id: 'p',
    name: 'Semana',
    startDate: '2026-11-02',
    days: 7,
    defaultDiners: adults(4),
    entries: [entry({ id: 'e1', date: '2026-11-02' }), entry({ id: 'e2', date: '2026-11-03', leftoversOf: 'e1' })],
    createdAt: '',
    updatedAt: '',
  });

  it('duplica una semana con sus sobras', () => {
    const p = duplicateWeek(plan(), '2026-11-02', '2026-11-09', id);
    expect(p.entries).toHaveLength(4);
    expect(p.days).toBe(14);
    const copies = p.entries.filter((e) => e.date >= '2026-11-09');
    const first = copies.find((e) => e.date === '2026-11-09')!;
    const second = copies.find((e) => e.date === '2026-11-10')!;
    expect(second.leftoversOf).toBe(first.id);
  });

  it('cambiar una receta no pierde el resto', () => {
    const p = replaceRecipe(plan(), 'e1', 'b');
    expect(p.entries).toHaveLength(2);
    expect(p.entries[0]!.recipeId).toBe('b');
    expect(p.entries[1]!.leftoversOf).toBeUndefined();
  });

  it('eliminar una comida libera sus sobras', () => {
    const p = removeEntry(plan(), 'e1');
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]!.leftoversOf).toBeUndefined();
  });

  it('suma de días sin problemas de horario', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('presupuesto', () => {
  const prices: PriceEntry[] = [
    { id: '1', name: 'Arroz', amount: 1, unit: 'kg', price: 2000, updatedAt: '2026-10-01' },
    { id: '2', name: 'arroz', amount: 500, unit: 'g', price: 1500, updatedAt: '2026-10-20' },
  ];

  it('costo por receta y por porción con el precio más reciente', () => {
    const c = computeRecipe(mk('a', 'A', 300), adults(4));
    const cost = recipeCost(c.lines, prices);
    // precio más reciente: 3 $/g → 300 g = 900
    expect(cost.total).toBeCloseTo(900);
    expect(cost.total / c.equivalentPortions).toBeCloseTo(225);
  });

  it('lista ingredientes sin precio', () => {
    const c = computeRecipe(mk('a', 'A', 300), adults(4));
    const cost = recipeCost(c.lines, []);
    expect(cost.unpriced).toEqual(['Arroz']);
    expect(cost.total).toBe(0);
  });

  it('costo de la lista usa lo que falta comprar', () => {
    const list = buildShoppingList(
      aggregate([{ name: 'Arroz', qty: 500, unit: 'g', category: 'almacen' }]),
      [{ id: 'p', name: 'Arroz', qty: 200, unit: 'g', location: 'despensa' }],
      id,
    );
    expect(shoppingCost(list, prices).total).toBeCloseTo(900);
    expect(formatMoney(900)).toMatch(/900/);
  });
});

describe('el mes resuelto', () => {
  const month = (over: Partial<MonthPlan> = {}): MonthPlan => ({
    id: 'm',
    name: 'Noviembre',
    startDate: '2026-11-01',
    days: 14,
    lunches: true,
    dinners: true,
    diner: { id: 's', category: 'adulto', profile: 'normal', count: 1 },
    items: [
      { recipeId: 'a', portions: 10, perContainer: 2 },
      { recipeId: 'b', portions: 6, perContainer: 1 },
    ],
    prepared: [],
    shipments: [],
    sessionEveryDays: 7,
    createdAt: '',
    updatedAt: '',
    ...over,
  });

  it('cuenta comidas y recipientes', () => {
    expect(mealsNeeded(month())).toBe(28);
    const s = monthStatus(month());
    expect(s[0]).toMatchObject({ planned: 10, toPrepare: 10, containers: 5 });
  });

  it('no duplica lo ya preparado y registra envíos', () => {
    const m = month({
      prepared: [{ id: '1', date: '2026-10-31', items: [{ recipeId: 'a', portions: 4 }] }],
      shipments: [{ id: '2', date: '2026-11-01', items: [{ recipeId: 'a', portions: 3 }] }],
    });
    const s = monthStatus(m)[0]!;
    expect(s).toMatchObject({ prepared: 4, toPrepare: 6, sent: 3, pendingToSend: 1 });
    // compras solo para lo que falta: 6 porciones de A (75 g c/u) + 6 de B (50 g c/u)
    const agg = aggregate(monthShoppingItems(m, recipes));
    expect(agg[0]!.total).toBeCloseTo(6 * 75 + 6 * 50);
  });

  it('prepara de más no da negativo', () => {
    const m = month({ prepared: [{ id: '1', date: '2026-10-31', items: [{ recipeId: 'a', portions: 50 }] }] });
    expect(monthStatus(m)[0]!.toPrepare).toBe(0);
  });

  it('separa heladera y freezer con criterio prudente', () => {
    expect(storageSplit(recipes.get('a')!, 10, 2)).toEqual({ heladera: 3, freezer: 7, noFreeze: false });
    const noFreeze = storageSplit(recipes.get('c')!, 5, 2);
    expect(noFreeze.freezer).toBe(0);
    expect(noFreeze.noFreeze).toBe(true);
  });

  it('arma un calendario de cocina que cubre lo pendiente', () => {
    const sessions = suggestSessions(month());
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.date).toBe('2026-10-31');
    const total = sessions.flatMap((s) => s.items).reduce((a, i) => a + i.portions, 0);
    expect(total).toBe(16);
  });
});
