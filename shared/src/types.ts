// Tipos de dominio compartidos por la app y el servidor.

export const UNITS = ['g', 'kg', 'ml', 'l', 'u'] as const;
export type Unit = (typeof UNITS)[number];

export type Dimension = 'masa' | 'volumen' | 'unidad';

/** Estado del alimento: distingue pesos crudos de cocidos. */
export const FOOD_STATES = ['crudo', 'cocido'] as const;
export type FoodState = (typeof FOOD_STATES)[number];

/**
 * Rol del ingrediente dentro del plato. Cada rol escala distinto según
 * la categoría y el apetito del comensal (no se usa un único multiplicador).
 */
export const ROLES = ['principal', 'acompanamiento', 'verdura', 'base', 'condimento'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  principal: 'Principal (carne, pollo, huevo, legumbre)',
  acompanamiento: 'Acompañamiento (papa, arroz, fideos, masa)',
  verdura: 'Verdura',
  base: 'Base o salsa',
  condimento: 'Condimento',
};

export const SHOP_CATEGORIES = [
  'verduleria',
  'carniceria',
  'lacteos_huevos',
  'almacen',
  'panaderia',
  'congelados',
  'condimentos',
  'otros',
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const SHOP_CATEGORY_LABELS: Record<ShopCategory, string> = {
  verduleria: 'Verdulería',
  carniceria: 'Carnicería y pollería',
  lacteos_huevos: 'Lácteos y huevos',
  almacen: 'Almacén',
  panaderia: 'Panadería',
  congelados: 'Congelados',
  condimentos: 'Condimentos y especias',
  otros: 'Otros',
};

export const RECIPE_CATEGORIES = [
  'carnes',
  'pollo',
  'legumbres',
  'pastas_y_arroces',
  'tartas_y_masas',
  'verduras',
  'sopas_y_guisos',
] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
  carnes: 'Carnes',
  pollo: 'Pollo',
  legumbres: 'Legumbres',
  pastas_y_arroces: 'Pastas y arroces',
  tartas_y_masas: 'Tartas y masas',
  verduras: 'Verduras',
  sopas_y_guisos: 'Sopas y guisos',
};

export const ALLERGENS = ['gluten', 'huevo', 'leche', 'soja', 'pescado', 'frutos_secos', 'sesamo', 'apio'] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten (TACC)',
  huevo: 'Huevo',
  leche: 'Leche',
  soja: 'Soja',
  pescado: 'Pescado',
  frutos_secos: 'Frutos secos',
  sesamo: 'Sésamo',
  apio: 'Apio',
};

export interface RecipeIngredient {
  name: string;
  /** Cantidad total para `refPortions` porciones. null si es "a gusto". */
  qty: number | null;
  unit: Unit | null;
  state?: FoodState;
  role: Role;
  category: ShopCategory;
  /** "A gusto": no se suma ni se calcula, solo se lista. */
  toTaste?: boolean;
  optional?: boolean;
  /** No va a la lista de compras (ej. agua de la canilla). */
  skipShopping?: boolean;
  note?: string;
}

export interface Conservation {
  /** Días orientativos en heladera (cocido, bien tapado, a 5 °C o menos). */
  fridgeDays: number | null;
  /** Meses orientativos en freezer (-18 °C). null = no se recomienda congelar. */
  freezerMonths: number | null;
  notes: string;
}

export interface Recipe {
  id: string;
  name: string;
  category: RecipeCategory;
  refPortions: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  timeMinutes: number;
  conservation: Conservation;
  /** Apta para cocinar por tandas y guardar. */
  batchFriendly: boolean;
  allergens: Allergen[];
  substitutions: string[];
  photo?: string;
  source: 'catalogo' | 'propia';
  /** Si es una copia de otra receta, id de la original. */
  copiedFrom?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Catalog {
  version: number;
  publishedAt: string;
  recipes: Recipe[];
}

export const DINER_CATEGORIES = ['nino', 'adolescente', 'adulto'] as const;
export type DinerCategory = (typeof DINER_CATEGORIES)[number];
export const DINER_CATEGORY_LABELS: Record<DinerCategory, string> = {
  nino: 'Niño o niña',
  adolescente: 'Adolescente',
  adulto: 'Adulto',
};

export const PROFILES = ['poco', 'normal', 'abundante'] as const;
export type Profile = (typeof PROFILES)[number];
export const PROFILE_LABELS: Record<Profile, string> = {
  poco: 'Come poco',
  normal: 'Normal',
  abundante: 'Come mucho',
};

/** Una fila de comensales: "2 adultos que comen normal". */
export interface Diner {
  id: string;
  category: DinerCategory;
  profile: Profile;
  count: number;
  /** Ajuste individual opcional (multiplica sobre lo anterior). */
  customFactor?: number;
  label?: string;
}

export interface PortionFactors {
  category: Record<DinerCategory, Record<Role, number>>;
  profile: Record<Profile, number>;
}
