import { catalogSchema, type Catalog, type Recipe } from '@lcj/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { apiRequest, currentToken, ApiError } from '../license/client';

/**
 * El catálogo NO viene dentro de la app: se descarga del servidor solo con
 * una autorización válida y queda guardado en el teléfono para usarlo sin conexión.
 */
export async function syncCatalog(force = false): Promise<{ updated: boolean; error?: string }> {
  const token = await currentToken();
  if (!token) return { updated: false };
  const local = await db.catalog.get('current');
  const have = force ? 0 : local?.catalog.version ?? 0;
  try {
    const data = await apiRequest<Catalog | { upToDate: true; version: number }>(`/v1/catalog?have=${have}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if ('upToDate' in data) return { updated: false };
    const parsed = catalogSchema.safeParse(data);
    if (!parsed.success) return { updated: false, error: 'El catálogo recibido no es válido.' };
    await db.catalog.put({ key: 'current', catalog: parsed.data, fetchedAt: Date.now() });
    return { updated: true };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'no_catalog') return { updated: false, error: 'Las recetas del catálogo todavía no están publicadas.' };
      return { updated: false, error: e.message };
    }
    return { updated: false, error: 'No se pudo descargar el catálogo.' };
  }
}

/** Todas las recetas disponibles: catálogo + propias. */
export function useAllRecipes(): { recipes: Recipe[]; byId: Map<string, Recipe>; catalogVersion: number; loading: boolean } {
  const data = useLiveQuery(async () => {
    const [cat, mine] = await Promise.all([db.catalog.get('current'), db.recipes.toArray()]);
    return { cat: cat?.catalog, mine };
  }, []);
  const catalogRecipes = data?.cat?.recipes ?? [];
  const mine = data?.mine ?? [];
  const recipes = [...mine.sort((a, b) => a.name.localeCompare(b.name, 'es')), ...catalogRecipes];
  return {
    recipes,
    byId: new Map(recipes.map((r) => [r.id, r])),
    catalogVersion: data?.cat?.version ?? 0,
    loading: data === undefined,
  };
}
