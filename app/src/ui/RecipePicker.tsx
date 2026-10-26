import { useMemo, useState } from 'react';
import { RECIPE_CATEGORY_LABELS, normalizeName, type Recipe } from '@lcj/shared';
import { Modal } from './kit';
import { Icon } from './Icon';

export function searchRecipes(recipes: Recipe[], q: string): Recipe[] {
  const n = normalizeName(q);
  if (!n) return recipes;
  return recipes.filter(
    (r) => normalizeName(r.name).includes(n) || r.ingredients.some((i) => normalizeName(i.name).includes(n)),
  );
}

export function RecipePicker({
  recipes,
  onPick,
  onClose,
  title = 'Elegí una receta',
  batchOnly = false,
}: {
  recipes: Recipe[];
  onPick: (r: Recipe) => void;
  onClose: () => void;
  title?: string;
  batchOnly?: boolean;
}) {
  const [q, setQ] = useState('');
  const [onlyBatch, setOnlyBatch] = useState(batchOnly);
  const list = useMemo(() => searchRecipes(onlyBatch ? recipes.filter((r) => r.batchFriendly) : recipes, q), [recipes, q, onlyBatch]);
  return (
    <Modal title={title} onClose={onClose}>
      <input type="search" placeholder="Buscar por nombre o ingrediente" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar receta" />
      {batchOnly ? (
        <label className="check">
          <input type="checkbox" checked={onlyBatch} onChange={(e) => setOnlyBatch(e.target.checked)} />
          Solo aptas para cocinar por tandas
        </label>
      ) : null}
      <ul className="list" style={{ marginTop: 8 }}>
        {list.map((r) => (
          <li key={r.id}>
            <button className="btn ghost block" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => onPick(r)}>
              <Icon name={r.source === 'propia' ? 'star' : 'book'} />
              <span className="grow">
                {r.name}
                <br />
                <span className="small muted">
                  {RECIPE_CATEGORY_LABELS[r.category]} · {r.source === 'propia' ? 'Mía' : 'Catálogo'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 ? <p className="muted center">No hay recetas que coincidan.</p> : null}
    </Modal>
  );
}
