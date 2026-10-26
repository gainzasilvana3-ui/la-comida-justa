import { useMemo, useState } from 'react';
import { RECIPE_CATEGORIES, RECIPE_CATEGORY_LABELS, type RecipeCategory } from '@lcj/shared';
import { useAllRecipes } from '../catalog/catalog';
import { usePrefs } from '../db/prefs';
import { useAccess } from '../license/AccessProvider';
import { searchRecipes } from '../ui/RecipePicker';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/kit';
import { dishImage } from '../ui/dishImage';

type Filter = 'todas' | 'favoritas' | 'mias' | 'tandas' | RecipeCategory;

export function Recipes({ limited }: { limited: boolean }) {
  const { recipes, loading } = useAllRecipes();
  const { catalogMessage } = useAccess();
  const prefs = usePrefs();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(limited ? 'mias' : 'todas');
  const favs = useMemo(() => new Set(prefs?.favorites ?? []), [prefs?.favorites]);

  const visible = useMemo(() => {
    let list = limited ? recipes.filter((r) => r.source === 'propia') : recipes;
    if (filter === 'favoritas') list = list.filter((r) => favs.has(r.id));
    else if (filter === 'mias') list = list.filter((r) => r.source === 'propia');
    else if (filter === 'tandas') list = list.filter((r) => r.batchFriendly);
    else if (filter !== 'todas') list = list.filter((r) => r.category === filter);
    return searchRecipes(list, q);
  }, [recipes, filter, q, favs, limited]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'favoritas', label: 'Favoritas' },
    { id: 'mias', label: 'Mías' },
    { id: 'tandas', label: 'Para tandas' },
    ...RECIPE_CATEGORIES.map((c) => ({ id: c as Filter, label: RECIPE_CATEGORY_LABELS[c] })),
  ];

  return (
    <div>
      <div className="row nowrap" style={{ marginBottom: 12 }}>
        <input
          type="search"
          className="grow"
          placeholder="Buscar por nombre o ingrediente"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar recetas"
        />
        <a className="btn" href="#/receta/nueva" aria-label="Nueva receta">
          <Icon name="plus" /> Nueva
        </a>
      </div>
      {!limited ? (
        <div className="chips" role="group" aria-label="Filtrar recetas">
          {filters.map((f) => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {catalogMessage && !limited ? <div className="notice warn">{catalogMessage}</div> : null}

      {loading ? <p className="muted">Cargando recetas…</p> : null}
      {!loading && visible.length === 0 ? (
        <Empty icon="book" title={filter === 'mias' ? 'Todavía no creaste recetas' : 'No hay recetas que coincidan'}>
          <a className="btn secondary" href="#/receta/nueva">
            Crear una receta
          </a>
        </Empty>
      ) : null}

      {visible.map((r) => (
        <a key={r.id} className="recipe-card" href={`#/receta/${r.id}`}>
          <span className="thumb">
            <img src={dishImage(r)} alt="" loading="lazy" />
          </span>
          <span className="grow">
            <h3>{r.name}</h3>
            <span className="small muted">
              {RECIPE_CATEGORY_LABELS[r.category]} · {r.timeMinutes} min · {r.refPortions} porciones
            </span>
            <br />
            {r.source === 'propia' ? <span className="badge green">Mía</span> : null} {favs.has(r.id) ? <span className="badge terra">Favorita</span> : null}{' '}
            {r.batchFriendly ? <span className="badge">Para tandas</span> : null}
          </span>
        </a>
      ))}
    </div>
  );
}
