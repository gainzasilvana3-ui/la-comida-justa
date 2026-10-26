import type { Dimension, Unit } from './types';

const UNIT_INFO: Record<Unit, { dim: Dimension; toBase: number }> = {
  g: { dim: 'masa', toBase: 1 },
  kg: { dim: 'masa', toBase: 1000 },
  ml: { dim: 'volumen', toBase: 1 },
  l: { dim: 'volumen', toBase: 1000 },
  u: { dim: 'unidad', toBase: 1 },
};

export const UNIT_LABELS: Record<Unit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'litros',
  u: 'unidades',
};

export const BASE_UNIT: Record<Dimension, Unit> = { masa: 'g', volumen: 'ml', unidad: 'u' };

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && value in UNIT_INFO;
}

export function dimensionOf(unit: Unit): Dimension {
  return UNIT_INFO[unit].dim;
}

/** Convierte a la unidad base de su dimensión (g, ml o u). */
export function toBase(qty: number, unit: Unit): { dim: Dimension; value: number } {
  const info = UNIT_INFO[unit];
  return { dim: info.dim, value: qty * info.toBase };
}

/** Convierte una cantidad entre unidades. Lanza error si las dimensiones no coinciden. */
export function convert(qty: number, from: Unit, to: Unit): number {
  const a = UNIT_INFO[from];
  const b = UNIT_INFO[to];
  if (a.dim !== b.dim) {
    throw new Error(`No se puede convertir ${from} a ${to}: son medidas distintas.`);
  }
  return (qty * a.toBase) / b.toBase;
}

export function areCompatible(a: Unit, b: Unit): boolean {
  return UNIT_INFO[a].dim === UNIT_INFO[b].dim;
}

/** Elige la unidad más legible para mostrar un valor en unidad base. */
export function prettyFromBase(value: number, dim: Dimension): { qty: number; unit: Unit } {
  if (dim === 'masa' && Math.abs(value) >= 1000) return { qty: value / 1000, unit: 'kg' };
  if (dim === 'volumen' && Math.abs(value) >= 1000) return { qty: value / 1000, unit: 'l' };
  return { qty: value, unit: BASE_UNIT[dim] };
}

/** Redondeo amable para mostrar: evita "347,23 g". */
export function roundForDisplay(qty: number, unit: Unit): number {
  if (!Number.isFinite(qty)) return 0;
  switch (unit) {
    case 'g':
    case 'ml':
      if (qty >= 100) return Math.round(qty / 5) * 5;
      if (qty >= 10) return Math.round(qty);
      return Math.round(qty * 10) / 10;
    case 'kg':
    case 'l':
      return Math.round(qty * 100) / 100;
    case 'u':
      // Media unidad es lo mínimo práctico (medio morrón, media cebolla).
      return Math.max(qty > 0 ? 0.5 : 0, Math.round(qty * 2) / 2);
  }
}

/** Para comprar no tiene sentido media unidad de algo envasado: se redondea hacia arriba. */
export function roundUpForPurchase(qty: number, unit: Unit): number {
  if (unit === 'u') return Math.ceil(qty - 1e-9);
  return roundForDisplay(qty, unit);
}

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export function formatNumber(n: number): string {
  return nf.format(n);
}

export function formatQty(qty: number, unit: Unit): string {
  const rounded = roundForDisplay(qty, unit);
  if (unit === 'u') {
    return `${nf.format(rounded)} ${rounded === 1 ? 'unidad' : 'unidades'}`;
  }
  if (unit === 'l') return `${nf.format(rounded)} ${rounded === 1 ? 'litro' : 'litros'}`;
  return `${nf.format(rounded)} ${unit}`;
}

export function formatBase(value: number, dim: Dimension): string {
  const p = prettyFromBase(value, dim);
  return formatQty(p.qty, p.unit);
}

/**
 * Lee un número escrito por el usuario: acepta coma o punto decimal.
 * Devuelve null si no es un número finito.
 */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(/\s+/g, '');
  if (s === '') return null;
  let normalized = s;
  if (s.includes(',') && s.includes('.')) {
    // "1.250,5" -> 1250.5
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    normalized = s.replace(',', '.');
  }
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza un nombre de alimento para poder sumar "Papas" y "papa". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}
