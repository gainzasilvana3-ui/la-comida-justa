import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_FACTORS, type PortionFactors } from '@lcj/shared';
import { db, type Preferences } from './db';

export async function getPrefs(): Promise<Preferences> {
  const rows = await db.prefs.toArray();
  const out: Preferences = {};
  for (const r of rows) (out as Record<string, unknown>)[r.key] = r.value;
  return out;
}

export async function setPref<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<void> {
  if (value === undefined) await db.prefs.delete(key);
  else await db.prefs.put({ key, value });
}

export function usePrefs(): Preferences | undefined {
  return useLiveQuery(getPrefs, []);
}

export function factorsFrom(prefs: Preferences | undefined): PortionFactors {
  return prefs?.factors ?? DEFAULT_FACTORS;
}

export async function toggleFavorite(recipeId: string): Promise<boolean> {
  const prefs = await getPrefs();
  const favs = new Set(prefs.favorites ?? []);
  const now = !favs.has(recipeId);
  if (now) favs.add(recipeId);
  else favs.delete(recipeId);
  await setPref('favorites', [...favs]);
  return now;
}
