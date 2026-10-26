import Dexie, { type EntityTable } from 'dexie';
import type {
  Catalog,
  Diner,
  MonthPlan,
  PantryItem,
  Plan,
  PortionFactors,
  PriceEntry,
  Recipe,
  ShoppingItem,
} from '@lcj/shared';

export interface DinerGroup {
  id: string;
  name: string;
  diners: Diner[];
}

export interface ShoppingList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  planId?: string;
  monthPlanId?: string;
  budget?: number | null;
  archived?: boolean;
  items: ShoppingItem[];
}

/** Preferencias guardadas como pares clave/valor. */
export interface Preferences {
  factors?: PortionFactors;
  favorites?: string[];
  keepHistory?: boolean;
  defaultGroupId?: string;
  activePlanId?: string;
  activeListId?: string;
  activeMonthId?: string;
  sendErrors?: boolean;
  installDismissed?: boolean;
  lastBackupAt?: string;
}

export interface PrefRow {
  key: keyof Preferences;
  value: unknown;
}

/** Licencia del dispositivo. NUNCA se exporta en el respaldo. */
export interface LicenseRow {
  key: 'current';
  token: string;
  deviceId: string;
  recoveryCode?: string;
  /** Estado informado por el servidor que bloquea el uso. */
  blocked?: 'revoked' | 'device_removed' | null;
  blockedMessage?: string;
  lastRenewAt?: number;
  latestAppVersion?: string;
}

/** Par de claves del dispositivo. La privada no se puede exportar. */
export interface DeviceKeyRow {
  key: 'device';
  keys: CryptoKeyPair;
  publicJwk: JsonWebKey;
}

export interface CatalogRow {
  key: 'current';
  catalog: Catalog;
  fetchedAt: number;
}

export class ComidaJustaDB extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
  plans!: EntityTable<Plan, 'id'>;
  dinerGroups!: EntityTable<DinerGroup, 'id'>;
  pantry!: EntityTable<PantryItem, 'id'>;
  shoppingLists!: EntityTable<ShoppingList, 'id'>;
  prices!: EntityTable<PriceEntry, 'id'>;
  monthPlans!: EntityTable<MonthPlan, 'id'>;
  prefs!: EntityTable<PrefRow, 'key'>;
  license!: EntityTable<LicenseRow, 'key'>;
  deviceKey!: EntityTable<DeviceKeyRow, 'key'>;
  catalog!: EntityTable<CatalogRow, 'key'>;

  constructor(name = 'la-comida-justa') {
    super(name);
    // Al agregar tablas o índices en versiones futuras, sumar `this.version(2)...` sin borrar la 1:
    // así las actualizaciones de la app nunca borran datos guardados.
    this.version(1).stores({
      recipes: 'id, name, updatedAt',
      plans: 'id, startDate, updatedAt',
      dinerGroups: 'id',
      pantry: 'id, name, location, expiresAt',
      shoppingLists: 'id, updatedAt',
      prices: 'id, name',
      monthPlans: 'id, updatedAt',
      prefs: 'key',
      license: 'key',
      deviceKey: 'key',
      catalog: 'key',
    });
  }
}

export const db = new ComidaJustaDB();

/** Tablas con datos del usuario (las que van al respaldo). */
export const USER_TABLES = ['recipes', 'plans', 'dinerGroups', 'pantry', 'shoppingLists', 'prices', 'monthPlans', 'prefs'] as const;

export class StorageError extends Error {}

/** Traduce errores de IndexedDB a mensajes que se entienden. */
export function storageMessage(e: unknown): string {
  const name = (e as { name?: string; inner?: { name?: string } })?.name ?? '';
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? '';
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    return 'No hay espacio libre en el teléfono para guardar. Liberá espacio (fotos, apps) y probá de nuevo. Tus datos anteriores siguen guardados.';
  }
  if (name === 'InvalidStateError' || name === 'DatabaseClosedError' || name === 'OpenFailedError') {
    return 'El navegador no permite guardar datos (puede pasar en modo incógnito). Abrí la app en una ventana normal.';
  }
  return 'No se pudo guardar. Probá de nuevo. Si sigue pasando, exportá un respaldo desde Ajustes.';
}

/** Pide al navegador que no borre los datos por falta de espacio. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // no disponible
  }
  return false;
}
