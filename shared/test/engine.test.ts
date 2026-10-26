import { describe, expect, it } from 'vitest';
import {
  aggregate,
  availableFor,
  buildShoppingList,
  computeRecipe,
  consumeFromPantry,
  convert,
  DEFAULT_FACTORS,
  effectiveToBuy,
  equivalentPortions,
  formatQty,
  normalizeName,
  parseQuantity,
  prettyFromBase,
  roundForDisplay,
  roundUpForPurchase,
  toBase,
  useFirst,
  type Diner,
  type PantryItem,
  type Recipe,
} from '../src';

let n = 0;
const id = () => `id${++n}`;

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1',
  name: 'Arroz con pollo',
  category: 'pollo',
  refPortions: 4,
  ingredients: [
    { name: 'Arroz', qty: 300, unit: 'g', state: 'crudo', role: 'acompanamiento', category: 'almacen' },
    { name: 'Pollo', qty: 800, unit: 'g', state: 'crudo', role: 'principal', category: 'carniceria' },
    { name: 'Sal', qty: null, unit: null, role: 'condimento', category: 'condimentos', toTaste: true },
    { name: 'Caldo', qty: 1, unit: 'l', role: 'base', category: 'almacen' },
    { name: 'Morrón', qty: 1, unit: 'u', role: 'verdura', category: 'verduleria' },
    { name: 'Pimentón', qty: 4, unit: 'g', role: 'condimento', category: 'condimentos' },
  ],
  steps: ['Cocinar.'],
  timeMinutes: 45,
  conservation: { fridgeDays: 3, freezerMonths: 2, notes: '' },
  batchFriendly: true,
  allergens: [],
  substitutions: [],
  source: 'catalogo',
  ...over,
});

const adults = (count: number, profile: Diner['profile'] = 'normal'): Diner => ({ id: id(), category: 'adulto', profile, count });

describe('unidades', () => {
  it('convierte g↔kg y ml↔l', () => {
    expect(convert(1.5, 'kg', 'g')).toBe(1500);
    expect(convert(250, 'ml', 'l')).toBe(0.25);
  });
  it('no convierte medidas incompatibles', () => {
    expect(() => convert(1, 'u', 'g')).toThrow();
    expect(() => convert(1, 'l', 'kg')).toThrow();
  });
  it('lee números con coma o punto y rechaza texto', () => {
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity('0.25')).toBe(0.25);
    expect(parseQuantity('1.250,5')).toBe(1250.5);
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('1e400')).toBeNull();
  });
  it('muestra en kg o litros desde 1000', () => {
    expect(prettyFromBase(1500, 'masa')).toEqual({ qty: 1.5, unit: 'kg' });
    expect(prettyFromBase(999, 'volumen')).toEqual({ qty: 999, unit: 'ml' });
    expect(formatQty(1.5, 'kg')).toBe('1,5 kg');
    expect(formatQty(1, 'u')).toBe('1 unidad');
  });
  it('redondea con sentido práctico', () => {
    expect(roundForDisplay(347.2, 'g')).toBe(345);
    expect(roundForDisplay(2.3, 'u')).toBe(2.5);
    expect(roundForDisplay(0.1, 'u')).toBe(0.5);
    expect(roundUpForPurchase(2.1, 'u')).toBe(3);
    expect(roundUpForPurchase(2, 'u')).toBe(2);
  });
  it('normaliza nombres para sumarlos', () => {
    expect(normalizeName('Papas')).toBe(normalizeName('papa'));
    expect(normalizeName('Morrón rojo')).toBe(normalizeName('morron rojo'));
    expect(normalizeName('Dientes de ajo')).toBe(normalizeName('diente de ajo'));
    expect(normalizeName('Arroz')).toBe('arroz');
  });
});

describe('calculadora de porciones', () => {
  it('4 adultos normales = cantidades de referencia', () => {
    const c = computeRecipe(recipe(), [adults(4)]);
    expect(c.lines[0]!.qty).toBeCloseTo(300);
    expect(c.lines[1]!.qty).toBeCloseTo(800);
    expect(c.equivalentPortions).toBeCloseTo(4);
    expect(c.people).toBe(4);
  });

  it('cada rol escala distinto para niños', () => {
    const c = computeRecipe(recipe(), [{ id: 'n', category: 'nino', profile: 'normal', count: 2 }]);
    // Pollo (principal): 200 g por porción × 2 × 0,5
    expect(c.lines[1]!.qty).toBeCloseTo(200);
    // Arroz (acompañamiento): 75 g × 2 × 0,6
    expect(c.lines[0]!.qty).toBeCloseTo(90);
  });

  it('el apetito afecta la comida pero no los condimentos', () => {
    const normal = computeRecipe(recipe(), [adults(4)]);
    const mucho = computeRecipe(recipe(), [adults(4, 'abundante')]);
    expect(mucho.lines[1]!.qty).toBeCloseTo(800 * 1.3);
    expect(mucho.lines[5]!.qty).toBeCloseTo(normal.lines[5]!.qty!);
  });

  it('respeta el ajuste individual', () => {
    const c = computeRecipe(recipe(), [{ ...adults(1), customFactor: 1.5 }]);
    expect(c.lines[1]!.qty).toBeCloseTo(300);
  });

  it('mezcla de comensales y "a gusto"', () => {
    const c = computeRecipe(recipe(), [adults(2), { id: 'a', category: 'adolescente', profile: 'abundante', count: 1 }]);
    expect(c.lines[1]!.qty).toBeCloseTo(200 * 2 + 200 * 1.1 * 1.3);
    expect(c.lines[2]!.qty).toBeNull();
    expect(c.lines[2]!.toTaste).toBe(true);
    expect(c.people).toBe(3);
  });

  it('acepta cantidades manuales y decimales', () => {
    const c = computeRecipe(recipe({ refPortions: 3 }), [adults(2)], DEFAULT_FACTORS, { 0: 123.5 });
    expect(c.lines[0]!.qty).toBe(123.5);
    expect(c.lines[0]!.manual).toBe(true);
    expect(c.lines[1]!.qty).toBeCloseTo((800 / 3) * 2);
  });

  it('cero comensales da cero, sin errores', () => {
    const c = computeRecipe(recipe(), []);
    expect(c.lines[1]!.qty).toBe(0);
    expect(equivalentPortions([])).toBe(0);
  });

  it('rechaza porciones de referencia inválidas', () => {
    expect(() => computeRecipe(recipe({ refPortions: 0 }), [adults(1)])).toThrow();
  });
});

describe('suma de ingredientes', () => {
  it('suma 300 g + 200 g de arroz = 500 g', () => {
    const a = aggregate([
      { name: 'Arroz', qty: 300, unit: 'g', state: 'crudo', category: 'almacen', from: 'A' },
      { name: 'arroz', qty: 200, unit: 'g', state: 'crudo', category: 'almacen', from: 'B' },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0]!.total).toBe(500);
    expect(a[0]!.sources).toEqual(['A', 'B']);
  });

  it('suma kg con g y l con ml', () => {
    const a = aggregate([
      { name: 'Papa', qty: 1.5, unit: 'kg', category: 'verduleria' },
      { name: 'Papas', qty: 500, unit: 'g', category: 'verduleria' },
      { name: 'Leche', qty: 1, unit: 'l', category: 'lacteos_huevos' },
      { name: 'Leche', qty: 250, unit: 'ml', category: 'lacteos_huevos' },
    ]);
    expect(a.find((x) => x.normName === 'papa')!.total).toBe(2000);
    expect(a.find((x) => x.normName === 'leche')!.total).toBe(1250);
  });

  it('no suma unidades con gramos: los marca como conflicto', () => {
    const a = aggregate([
      { name: 'Cebolla', qty: 2, unit: 'u', category: 'verduleria' },
      { name: 'Cebolla', qty: 300, unit: 'g', category: 'verduleria' },
    ]);
    expect(a).toHaveLength(2);
    expect(a.every((x) => x.conflict)).toBe(true);
  });

  it('no suma crudo con cocido', () => {
    const a = aggregate([
      { name: 'Arroz', qty: 200, unit: 'g', state: 'crudo', category: 'almacen' },
      { name: 'Arroz', qty: 300, unit: 'g', state: 'cocido', category: 'almacen' },
    ]);
    expect(a).toHaveLength(2);
    expect(a.map((x) => x.total).sort()).toEqual([200, 300]);
  });

  it('el "a gusto" desaparece si el mismo alimento tiene cantidad', () => {
    const a = aggregate([
      { name: 'Sal', qty: null, unit: null, category: 'condimentos', toTaste: true },
      { name: 'Sal', qty: 5, unit: 'g', category: 'condimentos' },
      { name: 'Orégano', qty: null, unit: null, category: 'condimentos', toTaste: true },
    ]);
    expect(a).toHaveLength(2);
    expect(a.find((x) => x.normName === 'oregano')!.toTaste).toBe(true);
  });

  it('ignora cantidades inválidas', () => {
    const a = aggregate([
      { name: 'Arroz', qty: -100, unit: 'g', category: 'almacen' },
      { name: 'Arroz', qty: Number.NaN, unit: 'g', category: 'almacen' },
      { name: 'Arroz', qty: 100, unit: 'g', category: 'almacen' },
    ]);
    expect(a[0]!.total).toBe(100);
  });
});

describe('despensa y lista de compras', () => {
  const pantry: PantryItem[] = [
    { id: 'p1', name: 'arroz', qty: 200, unit: 'g', location: 'despensa' },
    { id: 'p2', name: 'Leche', qty: 3, unit: 'l', location: 'heladera' },
    { id: 'p3', name: 'Cebolla', qty: 2, unit: 'u', location: 'despensa' },
  ];

  it('si tengo 200 g de 500 g, compro 300 g', () => {
    const list = buildShoppingList(
      aggregate([
        { name: 'Arroz', qty: 300, unit: 'g', category: 'almacen' },
        { name: 'Arroz', qty: 200, unit: 'g', category: 'almacen' },
      ]),
      pantry,
      id,
    );
    expect(list[0]!.calculated).toBe(500);
    expect(list[0]!.available).toBe(200);
    expect(list[0]!.toBuy).toBe(300);
  });

  it('nunca da cantidades negativas', () => {
    const list = buildShoppingList(aggregate([{ name: 'Leche', qty: 500, unit: 'ml', category: 'lacteos_huevos' }]), pantry, id);
    expect(list[0]!.toBuy).toBe(0);
    expect(list[0]!.available).toBe(500);
  });

  it('no descuenta unidades contra gramos', () => {
    const list = buildShoppingList(aggregate([{ name: 'Cebolla', qty: 400, unit: 'g', category: 'verduleria' }]), pantry, id);
    expect(list[0]!.available).toBe(0);
    expect(list[0]!.toBuy).toBe(400);
  });

  it('no descuenta crudo contra cocido', () => {
    expect(availableFor('arroz', 'cocido', 'masa', pantry)).toBe(0);
    expect(availableFor('arroz', 'crudo', 'masa', pantry)).toBe(200);
  });

  it('la edición manual reemplaza el cálculo', () => {
    const [item] = buildShoppingList(aggregate([{ name: 'Fideos', qty: 500, unit: 'g', category: 'almacen' }]), [], id);
    expect(effectiveToBuy(item!)).toBe(500);
    expect(effectiveToBuy({ ...item!, manualQty: 1000 })).toBe(1000);
    expect(effectiveToBuy({ ...item!, manualQty: -5 })).toBe(0);
  });

  it('descuenta lo cocinado de la despensa sin pasar a negativo', () => {
    const after = consumeFromPantry(pantry, [
      { name: 'Arroz', qty: 0.5, unit: 'kg' },
      { name: 'Leche', qty: 250, unit: 'ml' },
    ]);
    expect(after.find((p) => p.id === 'p1')!.qty).toBe(0);
    expect(after.find((p) => p.id === 'p2')!.qty).toBeCloseTo(2.75);
    // el original no cambia
    expect(pantry[0]!.qty).toBe(200);
  });

  it('consume primero lo que vence antes', () => {
    const after = consumeFromPantry(
      [
        { id: 'a', name: 'Leche', qty: 1, unit: 'l', location: 'heladera', expiresAt: '2026-12-01' },
        { id: 'b', name: 'Leche', qty: 1, unit: 'l', location: 'heladera', expiresAt: '2026-11-01' },
      ],
      [{ name: 'Leche', qty: 1200, unit: 'ml' }],
    );
    expect(after.find((p) => p.id === 'b')!.qty).toBe(0);
    expect(after.find((p) => p.id === 'a')!.qty).toBeCloseTo(0.8);
  });

  it('ordena por lo que conviene usar primero', () => {
    const list = useFirst(
      [
        { id: 'a', name: 'Yogur', qty: 1, unit: 'u', location: 'heladera', expiresAt: '2026-11-05' },
        { id: 'b', name: 'Arroz', qty: 1, unit: 'kg', location: 'despensa' },
        { id: 'c', name: 'Queso', qty: 200, unit: 'g', location: 'heladera', expiresAt: '2026-11-02' },
      ],
      new Date(2026, 9, 31),
    );
    expect(list.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(list[0]!.days).toBe(2);
  });

  it('toBase es consistente', () => {
    expect(toBase(2, 'kg')).toEqual({ dim: 'masa', value: 2000 });
    expect(toBase(3, 'u')).toEqual({ dim: 'unidad', value: 3 });
  });
});
