import { useLiveQuery } from 'dexie-react-hooks';
import {
  ALLERGEN_LABELS,
  RECIPE_CATEGORY_LABELS,
  computeRecipe,
  formatMoney,
  formatQty,
  recipeCost,
} from '@lcj/shared';
import { db } from '../db/db';
import { factorsFrom, toggleFavorite, usePrefs } from '../db/prefs';
import { useAllRecipes } from '../catalog/catalog';
import { go } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Empty, useConfirm, useSafeWrite } from '../ui/kit';
import { AddToPlanButton } from './Portions';

export function RecipeDetail({ id, limited }: { id: string; limited: boolean }) {
  const { byId, loading } = useAllRecipes();
  const prefs = usePrefs();
  const prices = useLiveQuery(() => db.prices.toArray(), []) ?? [];
  const confirm = useConfirm();
  const safe = useSafeWrite();
  const r = byId.get(id);

  if (loading) return <p className="muted">Cargando…</p>;
  if (!r || (limited && r.source !== 'propia')) {
    return (
      <Empty icon="book" title="Receta no disponible">
        <a href="#/recetas">Volver a las recetas</a>
      </Empty>
    );
  }
  const fav = (prefs?.favorites ?? []).includes(r.id);
  const ref = computeRecipe(r, [{ id: 'ref', category: 'adulto', profile: 'normal', count: r.refPortions }], factorsFrom(prefs));
  const cost = recipeCost(ref.lines, prices);

  return (
    <div>
      <div className="card">
        {r.photo ? <img src={r.photo} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12 }} /> : null}
        <div className="row between nowrap">
          <h1 className="grow">{r.name}</h1>
          <button
            className="icon-btn"
            aria-pressed={fav}
            aria-label={fav ? 'Quitar de favoritas' : 'Marcar como favorita'}
            onClick={() => void safe(() => toggleFavorite(r.id))}
            style={fav ? { color: 'var(--terracota)' } : undefined}
          >
            <Icon name="heart" />
          </button>
        </div>
        <p className="muted">
          {RECIPE_CATEGORY_LABELS[r.category]} · <Icon name="clock" className="inline-icon" /> {r.timeMinutes} min · {r.refPortions} porciones de
          referencia {r.source === 'propia' ? '· Mía' : ''}
        </p>
        {r.allergens.length ? (
          <p>
            <strong>Alérgenos:</strong> {r.allergens.map((a) => ALLERGEN_LABELS[a]).join(', ')}.{' '}
            <span className="small muted">Revisá las etiquetas de los productos.</span>
          </p>
        ) : (
          <p className="small muted">Sin alérgenos principales en sus ingredientes. Revisá igual las etiquetas.</p>
        )}
        {!limited ? (
          <div className="actions">
            <a className="btn" href={`#/porciones?receta=${encodeURIComponent(r.id)}`}>
              <Icon name="scale" /> Calcular porciones
            </a>
            <AddToPlanButton recipeId={r.id} />
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Ingredientes ({r.refPortions} porciones)</h2>
        <table className="ingredients-table">
          <tbody>
            {r.ingredients.map((i, idx) => (
              <tr key={idx}>
                <td>
                  {i.name}
                  {i.state ? <span className="badge" style={{ marginLeft: 6 }}>{i.state}</span> : null}
                  {i.optional ? <span className="badge" style={{ marginLeft: 6 }}>opcional</span> : null}
                  {i.note ? <div className="small muted">{i.note}</div> : null}
                </td>
                <td className="num">{i.toTaste || i.qty === null || i.unit === null ? 'a gusto' : formatQty(i.qty, i.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cost.priced > 0 ? (
          <p className="small" style={{ marginTop: 10 }}>
            Costo estimado con tus precios: <strong>{formatMoney(cost.total)}</strong> ({formatMoney(cost.total / r.refPortions)} por porción)
            {cost.unpriced.length ? ` · sin precio: ${cost.unpriced.join(', ')}` : ''}.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Preparación</h2>
        {r.steps.length ? (
          <ol>
            {r.steps.map((s, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                {s}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Sin pasos cargados.</p>
        )}
      </div>

      <div className="card">
        <h2>
          <Icon name="fridge" /> Conservación
        </h2>
        <ul>
          <li>
            Heladera:{' '}
            {r.conservation.fridgeDays ? `hasta ${r.conservation.fridgeDays} ${r.conservation.fridgeDays === 1 ? 'día' : 'días'}, tapado y a 5 °C o menos` : 'consumir en el momento'}
            .
          </li>
          <li>Freezer: {r.conservation.freezerMonths ? `hasta ${r.conservation.freezerMonths} meses a -18 °C` : 'no se recomienda congelar'}.</li>
        </ul>
        {r.conservation.notes ? <p>{r.conservation.notes}</p> : null}
        <p className="small muted">Plazos orientativos. Seguí las recomendaciones oficiales de seguridad alimentaria.</p>
      </div>

      {r.substitutions.length ? (
        <div className="card">
          <h2>Podés reemplazar</h2>
          <ul>
            {r.substitutions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="actions">
        <a className="btn secondary" href={`#/receta/${r.id}/copiar`}>
          <Icon name="copy" /> Duplicar para modificar
        </a>
        {r.source === 'propia' ? (
          <>
            <a className="btn secondary" href={`#/receta/${r.id}/editar`}>
              <Icon name="edit" /> Editar
            </a>
            <button
              className="btn danger secondary"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Eliminar receta',
                  text: `¿Seguro que querés eliminar "${r.name}"? Si está en algún menú, esa comida va a quedar sin receta.`,
                  ok: 'Eliminar',
                  danger: true,
                });
                if (ok && (await safe(() => db.recipes.delete(r.id), 'Receta eliminada.'))) go('/recetas');
              }}
            >
              <Icon name="trash" /> Eliminar
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
