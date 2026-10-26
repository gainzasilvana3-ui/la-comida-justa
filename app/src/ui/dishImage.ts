import type { Recipe, RecipeCategory } from '@lcj/shared';

// Las fotos van en src/assets/fotos/<id-de-receta>.webp (o .jpg) y se toman solas al compilar.
// Si una receta no tiene foto, se muestra la ilustración de su categoría.
const FOTOS = import.meta.glob<string>('../assets/fotos/*.{webp,jpg,jpeg}', { eager: true, import: 'default', query: '?url' });
const ILUSTRACIONES = import.meta.glob<string>('../assets/ilustraciones/*.svg', { eager: true, import: 'default', query: '?url' });

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
const byName = (files: Record<string, string>) => new Map(Object.entries(files).map(([path, url]) => [fileName(path), url]));

const fotos = byName(FOTOS);
const ilustraciones = byName(ILUSTRACIONES);

export const TABLE_IMAGE = ilustraciones.get('mesa') ?? '';

export function categoryImage(category: RecipeCategory): string {
  return ilustraciones.get(category) ?? TABLE_IMAGE;
}

/** Imagen para mostrar de una receta: la foto propia, la foto del catálogo o la ilustración de su categoría. */
export function dishImage(r: Pick<Recipe, 'id' | 'category' | 'photo'>): string {
  return r.photo || fotos.get(r.id) || categoryImage(r.category);
}
