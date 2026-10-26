import { z } from 'zod';
import {
  ALLERGENS,
  DINER_CATEGORIES,
  FOOD_STATES,
  PROFILES,
  RECIPE_CATEGORIES,
  ROLES,
  SHOP_CATEGORIES,
  UNITS,
} from './types';

const MAX_QTY = 100_000; // 100 kg / 100 l / 100.000 unidades: más que eso es un error de tipeo.
const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);

export const ingredientSchema = z
  .object({
    name: text(80).min(1, 'Falta el nombre del ingrediente.'),
    qty: z
      .number({ message: 'La cantidad tiene que ser un número.' })
      .finite('La cantidad tiene que ser un número.')
      .positive('La cantidad tiene que ser mayor que cero.')
      .max(MAX_QTY, 'La cantidad es demasiado grande.')
      .nullable(),
    unit: z.enum(UNITS, { message: 'Elegí una unidad válida.' }).nullable(),
    state: z.enum(FOOD_STATES).optional(),
    role: z.enum(ROLES),
    category: z.enum(SHOP_CATEGORIES),
    toTaste: z.boolean().optional(),
    optional: z.boolean().optional(),
    skipShopping: z.boolean().optional(),
    note: text(120).optional(),
  })
  .superRefine((ing, ctx) => {
    if (ing.toTaste) return;
    if (ing.qty === null) ctx.addIssue({ code: 'custom', path: ['qty'], message: 'Poné una cantidad o marcá "a gusto".' });
    if (ing.unit === null) ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Elegí una unidad o marcá "a gusto".' });
  });

export const recipeSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Identificador inválido.'),
  name: text(80).min(2, 'El nombre es muy corto.'),
  category: z.enum(RECIPE_CATEGORIES),
  refPortions: z
    .number()
    .int('Las porciones tienen que ser un número entero.')
    .min(1, 'Tiene que rendir al menos 1 porción.')
    .max(100, 'Máximo 100 porciones.'),
  ingredients: z.array(ingredientSchema).min(1, 'Agregá al menos un ingrediente.').max(60),
  steps: z.array(text(600).min(1)).max(40),
  timeMinutes: z.number().int().min(0).max(24 * 60),
  conservation: z.object({
    fridgeDays: z.number().int().min(0).max(7).nullable(),
    freezerMonths: z.number().int().min(0).max(12).nullable(),
    notes: text(400),
  }),
  batchFriendly: z.boolean(),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  substitutions: z.array(text(200)).max(20),
  photo: z
    .string()
    .max(400_000)
    .regex(/^(data:image\/(webp|jpeg|png);base64,|\/recetas\/)/, 'Foto inválida.')
    .optional(),
  source: z.enum(['catalogo', 'propia']),
  copiedFrom: z.string().max(64).optional(),
  createdAt: z.string().max(40).optional(),
  updatedAt: z.string().max(40).optional(),
});

export const catalogSchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.string().max(40),
  recipes: z.array(recipeSchema).min(1).max(1000),
});

export const dinerSchema = z.object({
  id: z.string().min(1).max(64),
  category: z.enum(DINER_CATEGORIES),
  profile: z.enum(PROFILES),
  count: z.number().int().min(0).max(50),
  customFactor: z.number().min(0.3).max(3).optional(),
  label: text(40).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.');

export const planEntrySchema = z.object({
  id: z.string().min(1).max(64),
  date: isoDate,
  slot: z.enum(['almuerzo', 'cena']),
  recipeId: z.string().min(1).max(64),
  diners: z.array(dinerSchema).max(30),
  leftoversOf: z.string().max(64).optional(),
  overrides: z.record(z.string(), z.number().min(0).max(MAX_QTY)).optional(),
});

export const planSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(80),
  startDate: isoDate,
  days: z.number().int().min(1).max(62),
  defaultDiners: z.array(dinerSchema).max(30),
  entries: z.array(planEntrySchema).max(62 * 6),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});

export const dinerGroupSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(60).min(1),
  diners: z.array(dinerSchema).max(30),
});

export const pantryItemSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(80).min(1),
  qty: z.number().finite().min(0).max(MAX_QTY),
  unit: z.enum(UNITS),
  state: z.enum(FOOD_STATES).optional(),
  location: z.enum(['despensa', 'heladera', 'freezer']),
  addedAt: isoDate.optional(),
  expiresAt: isoDate.optional(),
});

export const shoppingItemSchema = z.object({
  id: z.string().min(1).max(64),
  key: z.string().max(200).optional(),
  name: text(80).min(1),
  category: z.enum(SHOP_CATEGORIES),
  dim: z.enum(['masa', 'volumen', 'unidad']).nullable(),
  state: z.enum(FOOD_STATES).optional(),
  calculated: z.number().min(0).nullable(),
  available: z.number().min(0),
  toBuy: z.number().min(0).nullable(),
  manualQty: z.number().min(0).nullable().optional(),
  checked: z.boolean(),
  manual: z.boolean(),
  toTaste: z.boolean(),
  optional: z.boolean(),
  conflict: z.boolean(),
  sources: z.array(z.string().max(100)).max(100),
});

export const shoppingListSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(80),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  planId: z.string().max(64).optional(),
  budget: z.number().min(0).max(1e10).nullable().optional(),
  archived: z.boolean().optional(),
  items: z.array(shoppingItemSchema).max(500),
});

export const priceSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(80).min(1),
  amount: z.number().positive().max(MAX_QTY),
  unit: z.enum(UNITS),
  price: z.number().min(0).max(1e9),
  updatedAt: z.string().max(40),
});

const batchLogSchema = z.object({
  id: z.string().min(1).max(64),
  date: isoDate,
  items: z.array(z.object({ recipeId: z.string().min(1).max(64), portions: z.number().int().min(0).max(500) })).max(100),
  note: text(200).optional(),
});

export const monthPlanSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(80),
  startDate: isoDate,
  days: z.number().int().min(1).max(62),
  lunches: z.boolean(),
  dinners: z.boolean(),
  diner: dinerSchema,
  items: z
    .array(
      z.object({
        recipeId: z.string().min(1).max(64),
        portions: z.number().int().min(0).max(500),
        perContainer: z.number().int().min(1).max(10),
      }),
    )
    .max(60),
  prepared: z.array(batchLogSchema).max(200),
  shipments: z.array(batchLogSchema).max(200),
  sessionEveryDays: z.number().int().min(1).max(31),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});

const factorsByRole = z.object({
  principal: z.number().min(0.1).max(3),
  acompanamiento: z.number().min(0.1).max(3),
  verdura: z.number().min(0.1).max(3),
  base: z.number().min(0.1).max(3),
  condimento: z.number().min(0.1).max(3),
});

export const factorsSchema = z.object({
  category: z.object({ nino: factorsByRole, adolescente: factorsByRole, adulto: factorsByRole }),
  profile: z.object({ poco: z.number().min(0.1).max(3), normal: z.number().min(0.1).max(3), abundante: z.number().min(0.1).max(3) }),
});

export const preferencesSchema = z.object({
  factors: factorsSchema.optional(),
  favorites: z.array(z.string().max(64)).max(2000).optional(),
  keepHistory: z.boolean().optional(),
  defaultGroupId: z.string().max(64).optional(),
});

/** Formato de la copia de seguridad. Nunca incluye licencia ni claves. */
export const BACKUP_FORMAT = 'la-comida-justa-respaldo';
export const BACKUP_VERSION = 1;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().max(40),
  appVersion: z.string().max(20),
  data: z.object({
    recipes: z.array(recipeSchema.extend({ source: z.literal('propia') })).max(2000),
    plans: z.array(planSchema).max(500),
    dinerGroups: z.array(dinerGroupSchema).max(100),
    pantry: z.array(pantryItemSchema).max(2000),
    shoppingLists: z.array(shoppingListSchema).max(500),
    prices: z.array(priceSchema).max(2000),
    monthPlans: z.array(monthPlanSchema).max(100),
    preferences: preferencesSchema,
  }),
});

export type Backup = z.infer<typeof backupSchema>;

/** Primer mensaje de error legible de un resultado de zod. */
export function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Datos inválidos.';
  return issue.message;
}
