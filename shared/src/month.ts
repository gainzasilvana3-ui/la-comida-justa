import type { Diner, PortionFactors, Recipe } from './types';
import { computeRecipe, DEFAULT_FACTORS } from './portions';
import type { QuantityItem } from './aggregate';
import { addDays } from './plan';

/** "El mes resuelto": comidas por tandas para un hijo o hija que estudia fuera. */
export type StorageKind = 'heladera' | 'freezer';

export interface MonthItem {
  recipeId: string;
  /** Porciones planificadas de esta receta. */
  portions: number;
  /** Porciones por recipiente. */
  perContainer: number;
}

export interface BatchLog {
  id: string;
  date: string;
  items: { recipeId: string; portions: number }[];
  note?: string;
}

export interface MonthPlan {
  id: string;
  name: string;
  startDate: string;
  days: number;
  lunches: boolean;
  dinners: boolean;
  /** Quien come: por defecto, un adulto que come normal. */
  diner: Diner;
  items: MonthItem[];
  /** Tandas ya cocinadas. */
  prepared: BatchLog[];
  /** Envíos registrados. */
  shipments: BatchLog[];
  /** Días entre una sesión de cocina y la siguiente, para el calendario. */
  sessionEveryDays: number;
  createdAt: string;
  updatedAt: string;
}

export function mealsNeeded(m: Pick<MonthPlan, 'days' | 'lunches' | 'dinners'>): number {
  return Math.max(0, m.days) * ((m.lunches ? 1 : 0) + (m.dinners ? 1 : 0));
}

export function plannedPortions(m: Pick<MonthPlan, 'items'>): number {
  return m.items.reduce((a, i) => a + Math.max(0, Math.floor(i.portions)), 0);
}

function sumLogs(logs: BatchLog[], recipeId: string): number {
  return logs.reduce(
    (a, l) => a + l.items.filter((i) => i.recipeId === recipeId).reduce((b, i) => b + Math.max(0, i.portions), 0),
    0,
  );
}

export interface MonthItemStatus {
  recipeId: string;
  planned: number;
  prepared: number;
  /** Lo que falta cocinar (nunca negativo: no se duplica lo ya hecho). */
  toPrepare: number;
  sent: number;
  /** Cocinado pero todavía no enviado. */
  pendingToSend: number;
  containers: number;
}

export function monthStatus(m: MonthPlan): MonthItemStatus[] {
  return m.items.map((i) => {
    const planned = Math.max(0, Math.floor(i.portions));
    const prepared = sumLogs(m.prepared, i.recipeId);
    const sent = sumLogs(m.shipments, i.recipeId);
    const per = Math.max(1, Math.floor(i.perContainer));
    return {
      recipeId: i.recipeId,
      planned,
      prepared,
      toPrepare: Math.max(0, planned - prepared),
      sent,
      pendingToSend: Math.max(0, prepared - sent),
      containers: Math.ceil(planned / per),
    };
  });
}

/** Ingredientes de lo que falta cocinar. */
export function monthShoppingItems(
  m: MonthPlan,
  recipes: Map<string, Recipe>,
  factors: PortionFactors = DEFAULT_FACTORS,
): QuantityItem[] {
  const items: QuantityItem[] = [];
  for (const s of monthStatus(m)) {
    const r = recipes.get(s.recipeId);
    if (!r || s.toPrepare === 0) continue;
    const diners: Diner[] = [{ ...m.diner, id: 'mes', count: s.toPrepare }];
    const c = computeRecipe(r, diners, factors);
    for (const l of c.lines) {
      items.push({ name: l.name, qty: l.qty, unit: l.unit, state: l.state, category: l.category, toTaste: l.toTaste, optional: l.optional, skipShopping: l.skipShopping, from: r.name });
    }
  }
  return items;
}

/**
 * Sugiere dónde guardar cada porción. Criterio prudente: en heladera solo
 * lo que se come dentro de los días recomendados por la receta (máximo 3),
 * el resto al freezer si la receta lo admite.
 */
export function storageSplit(recipe: Recipe, portions: number, mealsPerDay: number): { heladera: number; freezer: number; noFreeze: boolean } {
  const fridgeDays = Math.min(3, recipe.conservation.fridgeDays ?? 0);
  const canFreeze = recipe.conservation.freezerMonths !== null && recipe.conservation.freezerMonths > 0;
  const fridgeMax = Math.max(0, fridgeDays * Math.max(1, mealsPerDay));
  if (!canFreeze) return { heladera: Math.min(portions, fridgeMax), freezer: 0, noFreeze: portions > fridgeMax };
  const heladera = Math.min(portions, Math.ceil(fridgeMax / 2));
  return { heladera, freezer: portions - heladera, noFreeze: false };
}

export interface PrepSession {
  date: string;
  coversFrom: string;
  coversTo: string;
  items: { recipeId: string; portions: number }[];
}

/**
 * Calendario de cocina sugerido: una sesión cada N días, el día anterior al
 * período que cubre. Reparte las porciones pendientes en orden.
 */
export function suggestSessions(m: MonthPlan): PrepSession[] {
  const status = monthStatus(m);
  const queue: string[] = [];
  // Intercala recetas para no comer lo mismo toda una semana.
  const pending = status.map((s) => ({ id: s.recipeId, left: s.toPrepare }));
  let added = true;
  while (added) {
    added = false;
    for (const p of pending) {
      if (p.left > 0) {
        queue.push(p.id);
        p.left -= 1;
        added = true;
      }
    }
  }
  const perDay = (m.lunches ? 1 : 0) + (m.dinners ? 1 : 0);
  if (perDay === 0 || queue.length === 0) return [];
  const every = Math.max(1, Math.floor(m.sessionEveryDays));
  const sessions: PrepSession[] = [];
  let cursor = 0;
  for (let day = 0; day < m.days && cursor < queue.length; day += every) {
    const span = Math.min(every, m.days - day);
    const take = queue.slice(cursor, cursor + span * perDay);
    cursor += take.length;
    const counts = new Map<string, number>();
    for (const id of take) counts.set(id, (counts.get(id) ?? 0) + 1);
    sessions.push({
      date: addDays(m.startDate, day - 1),
      coversFrom: addDays(m.startDate, day),
      coversTo: addDays(m.startDate, day + span - 1),
      items: [...counts.entries()].map(([recipeId, portions]) => ({ recipeId, portions })),
    });
  }
  return sessions;
}

/** Recomendaciones prudentes de conservación y transporte (texto fijo, no promete seguridad). */
export const SAFETY_TIPS: string[] = [
  'Enfriá rápido: separá la comida en recipientes chicos y llevala a la heladera antes de que pasen 2 horas desde la cocción. No la dejes enfriar toda la noche afuera.',
  'Heladera a 5 °C o menos. Freezer a -18 °C o menos.',
  'Etiquetá cada recipiente con el nombre de la comida y la fecha en que se cocinó.',
  'Las comidas cocidas en heladera se consumen dentro de pocos días; la app usa como máximo 3 días como referencia prudente.',
  'Descongelá en la heladera, no sobre la mesada. Lo descongelado no se vuelve a congelar.',
  'Recalentá hasta que quede bien caliente en todo su interior (que humee y burbujee), y recalentá solo la porción que se va a comer.',
  'Para viajar: conservadora o bolso térmico con refrigerantes, recipientes congelados juntos y bien cerrados. Al llegar, directo a heladera o freezer.',
  'Si una comida estuvo fuera de la heladera más de 2 horas, o tiene olor o aspecto raro, no la consumas.',
  'Estas son recomendaciones generales. Seguí siempre las indicaciones oficiales de seguridad alimentaria (ANMAT y Ministerio de Salud de la Nación).',
];
