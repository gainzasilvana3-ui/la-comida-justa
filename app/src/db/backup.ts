import { BACKUP_FORMAT, BACKUP_VERSION, backupSchema, firstError, type Backup } from '@lcj/shared';
import { APP_VERSION } from '../config';
import { db, USER_TABLES, type Preferences } from './db';
import { getPrefs } from './prefs';

/** Preferencias que sí viajan en el respaldo (las demás son de este dispositivo). */
const PORTABLE_PREFS: (keyof Preferences)[] = ['factors', 'favorites', 'keepHistory', 'defaultGroupId'];

/**
 * Arma la copia de seguridad. Nunca incluye la licencia, la clave del
 * dispositivo, el código de recuperación ni el catálogo (se vuelve a descargar).
 */
export async function createBackup(): Promise<Backup> {
  const prefs = await getPrefs();
  const portable: Record<string, unknown> = {};
  for (const k of PORTABLE_PREFS) if (prefs[k] !== undefined) portable[k] = prefs[k];
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: {
      recipes: (await db.recipes.toArray()).map((r) => ({ ...r, source: 'propia' as const })),
      plans: await db.plans.toArray(),
      dinerGroups: await db.dinerGroups.toArray(),
      pantry: await db.pantry.toArray(),
      shoppingLists: await db.shoppingLists.toArray(),
      prices: await db.prices.toArray(),
      monthPlans: await db.monthPlans.toArray(),
      preferences: portable,
    },
  };
  // Validamos lo que exportamos: un respaldo que no se puede importar no sirve.
  const check = backupSchema.safeParse(backup);
  if (!check.success) throw new Error(`El respaldo tiene datos inválidos: ${firstError(check.error)}`);
  return check.data;
}

export function backupFileName(d = new Date()): string {
  return `la-comida-justa-respaldo-${d.toISOString().slice(0, 10)}.json`;
}

export interface BackupSummary {
  exportedAt: string;
  recipes: number;
  plans: number;
  pantry: number;
  shoppingLists: number;
  prices: number;
  monthPlans: number;
  dinerGroups: number;
}

export type ParseResult = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string };

const MAX_FILE = 20 * 1024 * 1024;

/** Lee y valida un archivo de respaldo. No toca la base de datos. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_FILE) return { ok: false, error: 'El archivo es demasiado grande para ser un respaldo de la app.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un respaldo válido (no se pudo leer).' };
  }
  if ((raw as { format?: unknown })?.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'Este archivo no es un respaldo de La comida justa.' };
  }
  const r = backupSchema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    return { ok: false, error: `El respaldo tiene datos inválidos (${issue?.path.join(' › ') ?? ''}): ${issue?.message ?? ''}` };
  }
  const d = r.data.data;
  return {
    ok: true,
    backup: r.data,
    summary: {
      exportedAt: r.data.exportedAt,
      recipes: d.recipes.length,
      plans: d.plans.length,
      pantry: d.pantry.length,
      shoppingLists: d.shoppingLists.length,
      prices: d.prices.length,
      monthPlans: d.monthPlans.length,
      dinerGroups: d.dinerGroups.length,
    },
  };
}

/**
 * Restaura un respaldo validado.
 * - replace: borra los datos actuales del usuario y pone los del respaldo.
 * - merge: agrega lo que no existe y actualiza lo que tiene el mismo id.
 * Todo en una transacción: si algo falla, no se cambia nada.
 */
export async function restoreBackup(backup: Backup, mode: 'replace' | 'merge'): Promise<void> {
  const d = backup.data;
  await db.transaction('rw', USER_TABLES.map((t) => db.table(t)), async () => {
    if (mode === 'replace') {
      for (const t of USER_TABLES) {
        if (t === 'prefs') {
          for (const k of PORTABLE_PREFS) await db.prefs.delete(k);
        } else {
          await db.table(t).clear();
        }
      }
    }
    await db.recipes.bulkPut(d.recipes);
    await db.plans.bulkPut(d.plans);
    await db.dinerGroups.bulkPut(d.dinerGroups);
    await db.pantry.bulkPut(d.pantry);
    await db.shoppingLists.bulkPut(d.shoppingLists);
    await db.prices.bulkPut(d.prices);
    await db.monthPlans.bulkPut(d.monthPlans);
    const prefs = d.preferences as Record<string, unknown>;
    for (const k of PORTABLE_PREFS) {
      if (prefs[k] === undefined) continue;
      if (mode === 'merge' && k === 'favorites') {
        const current = ((await db.prefs.get('favorites'))?.value as string[] | undefined) ?? [];
        await db.prefs.put({ key: k, value: [...new Set([...current, ...(prefs[k] as string[])])] });
      } else {
        await db.prefs.put({ key: k, value: prefs[k] });
      }
    }
  });
}
