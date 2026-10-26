import { useEffect, useMemo, useState } from 'react';
import {
  ALLERGENS,
  ALLERGEN_LABELS,
  RECIPE_CATEGORIES,
  RECIPE_CATEGORY_LABELS,
  ROLES,
  ROLE_LABELS,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_LABELS,
  UNITS,
  UNIT_LABELS,
  recipeSchema,
  type Recipe,
  type RecipeIngredient,
} from '@lcj/shared';
import { db } from '../db/db';
import { useAllRecipes } from '../catalog/catalog';
import { back, go } from '../lib/router';
import { newId } from '../lib/id';
import { Icon } from '../ui/Icon';
import { Field, NumberInput, useConfirm, useSafeWrite, useToast } from '../ui/kit';

const emptyIngredient = (): RecipeIngredient => ({ name: '', qty: null, unit: 'g', role: 'principal', category: 'almacen' });

function blankRecipe(): Recipe {
  return {
    id: `mi-${newId().slice(0, 18)}`,
    name: '',
    category: 'carnes',
    refPortions: 4,
    ingredients: [emptyIngredient()],
    steps: [],
    timeMinutes: 30,
    conservation: { fridgeDays: 3, freezerMonths: null, notes: '' },
    batchFriendly: false,
    allergens: [],
    substitutions: [],
    source: 'propia',
  };
}

/** Achica una foto a 800 px y la guarda como WebP liviano dentro de la receta. */
async function resizePhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.75;
  let data = canvas.toDataURL('image/webp', quality);
  if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', quality);
  while (data.length > 300_000 && quality > 0.3) {
    quality -= 0.15;
    data = canvas.toDataURL(data.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', quality);
  }
  if (data.length > 390_000) throw new Error('La foto es demasiado pesada.');
  return data;
}

export function RecipeEditor({ id, copyOf }: { id?: string; copyOf?: string }) {
  const { byId, loading } = useAllRecipes();
  const safe = useSafeWrite();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [stepsText, setStepsText] = useState('');
  const [subsText, setSubsText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (draft || loading) return;
    let base: Recipe;
    if (id) {
      const r = byId.get(id);
      if (!r || r.source !== 'propia') return;
      base = structuredClone(r);
    } else if (copyOf) {
      const r = byId.get(copyOf);
      if (!r) return;
      base = { ...structuredClone(r), id: `mi-${newId().slice(0, 18)}`, name: `${r.name} (mi versión)`, source: 'propia', copiedFrom: r.id };
    } else {
      base = blankRecipe();
    }
    setDraft(base);
    setStepsText(base.steps.join('\n'));
    setSubsText(base.substitutions.join('\n'));
  }, [id, copyOf, byId, loading, draft]);

  const set = (patch: Partial<Recipe>) => {
    setDirty(true);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const setIng = (idx: number, patch: Partial<RecipeIngredient>) => {
    setDirty(true);
    setDraft((d) => (d ? { ...d, ingredients: d.ingredients.map((x, i) => (i === idx ? { ...x, ...patch } : x)) } : d));
  };

  const err = useMemo(() => (key: string) => errors[key] ?? null, [errors]);

  if (loading) return <p className="muted">Cargando…</p>;
  if (!draft) return <p>No se encontró la receta para editar.</p>;

  const save = async () => {
    const now = new Date().toISOString();
    const candidate: Recipe = {
      ...draft,
      name: draft.name.trim(),
      steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean),
      substitutions: subsText.split('\n').map((s) => s.trim()).filter(Boolean),
      ingredients: draft.ingredients
        .filter((i) => i.name.trim() !== '' || i.qty !== null)
        .map((i) => (i.toTaste ? { ...i, qty: null, unit: null } : { ...i, name: i.name.trim() })),
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
    };
    const r = recipeSchema.safeParse(candidate);
    if (!r.success) {
      const map: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const k = issue.path.join('.');
        if (!map[k]) map[k] = issue.message;
      }
      setErrors(map);
      toast('Revisá los datos marcados en rojo.', true);
      return;
    }
    setErrors({});
    if (await safe(() => db.recipes.put(r.data as Recipe), 'Receta guardada.')) {
      setDirty(false);
      go(`/receta/${r.data.id}`);
    }
  };

  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Descartar cambios', text: 'Hay cambios sin guardar. ¿Querés salir igual?', ok: 'Salir sin guardar', danger: true }))) return;
    back('/recetas');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="card">
        <h2>{id ? 'Editar receta' : copyOf ? 'Duplicar receta' : 'Nueva receta'}</h2>
        <Field label="Nombre" error={err('name')}>
          <input value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} aria-invalid={Boolean(err('name')) || undefined} />
        </Field>
        <div className="grid2">
          <Field label="Categoría">
            <select value={draft.category} onChange={(e) => set({ category: e.target.value as Recipe['category'] })}>
              {RECIPE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {RECIPE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Porciones que rinde" error={err('refPortions')}>
            <NumberInput value={draft.refPortions} min={1} max={100} allowEmpty={false} onChange={(v) => set({ refPortions: v === null ? 0 : Math.round(v) })} />
          </Field>
          <Field label="Tiempo (minutos)" error={err('timeMinutes')}>
            <NumberInput value={draft.timeMinutes} min={0} max={1440} onChange={(v) => set({ timeMinutes: v === null ? 0 : Math.round(v) })} />
          </Field>
        </div>
        <Field label="Foto (opcional)">
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                set({ photo: await resizePhoto(f) });
              } catch (ex) {
                toast((ex as Error).message, true);
              }
            }}
          />
        </Field>
        {draft.photo ? (
          <div className="row">
            <img src={draft.photo} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12 }} />
            <button type="button" className="btn small secondary" onClick={() => set({ photo: undefined })}>
              Quitar foto
            </button>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Ingredientes</h2>
        <p className="small muted">
          Cantidades para las {draft.refPortions || '…'} porciones. Marcá si el peso es en crudo o cocido. El rol sirve para ajustar bien las porciones
          de chicos y grandes.
        </p>
        {err('ingredients') ? <p className="error">{err('ingredients')}</p> : null}
        {draft.ingredients.map((ing, idx) => (
          <div key={idx} className="card soft" style={{ padding: 12 }}>
            <div className="row between nowrap">
              <strong>Ingrediente {idx + 1}</strong>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Quitar ingrediente ${idx + 1}`}
                onClick={() => set({ ingredients: draft.ingredients.filter((_, i) => i !== idx) })}
              >
                <Icon name="trash" />
              </button>
            </div>
            <Field label="Nombre" error={err(`ingredients.${idx}.name`)}>
              <input value={ing.name} maxLength={80} placeholder="ej. Arroz" onChange={(e) => setIng(idx, { name: e.target.value })} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={Boolean(ing.toTaste)} onChange={(e) => setIng(idx, { toTaste: e.target.checked, role: e.target.checked ? 'condimento' : ing.role })} />A
              gusto (sin cantidad)
            </label>
            {!ing.toTaste ? (
              <div className="grid3">
                <Field label="Cantidad" error={err(`ingredients.${idx}.qty`)}>
                  <NumberInput value={ing.qty} min={0.001} max={100000} onChange={(v) => setIng(idx, { qty: v })} />
                </Field>
                <Field label="Unidad" error={err(`ingredients.${idx}.unit`)}>
                  <select value={ing.unit ?? 'g'} onChange={(e) => setIng(idx, { unit: e.target.value as RecipeIngredient['unit'] })}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado">
                  <select value={ing.state ?? ''} onChange={(e) => setIng(idx, { state: (e.target.value || undefined) as RecipeIngredient['state'] })}>
                    <option value="">—</option>
                    <option value="crudo">Crudo</option>
                    <option value="cocido">Cocido</option>
                  </select>
                </Field>
              </div>
            ) : null}
            <div className="grid2">
              <Field label="Rol en el plato">
                <select value={ing.role} onChange={(e) => setIng(idx, { role: e.target.value as RecipeIngredient['role'] })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sección de compra">
                <select value={ing.category} onChange={(e) => setIng(idx, { category: e.target.value as RecipeIngredient['category'] })}>
                  {SHOP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {SHOP_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={Boolean(ing.optional)} onChange={(e) => setIng(idx, { optional: e.target.checked })} />
              Opcional
            </label>
          </div>
        ))}
        <button type="button" className="btn secondary block" onClick={() => set({ ingredients: [...draft.ingredients, emptyIngredient()] })}>
          <Icon name="plus" /> Agregar ingrediente
        </button>
      </div>

      <div className="card">
        <h2>Preparación</h2>
        <Field label="Pasos" hint="uno por renglón" error={err('steps')}>
          <textarea value={stepsText} onChange={(e) => { setStepsText(e.target.value); setDirty(true); }} rows={6} />
        </Field>
        <Field label="Posibles reemplazos" hint="uno por renglón">
          <textarea value={subsText} onChange={(e) => { setSubsText(e.target.value); setDirty(true); }} rows={3} />
        </Field>
      </div>

      <div className="card">
        <h2>Conservación</h2>
        <div className="grid2">
          <Field label="Días en heladera" hint="0 a 7" error={err('conservation.fridgeDays')}>
            <NumberInput value={draft.conservation.fridgeDays} min={0} max={7} onChange={(v) => set({ conservation: { ...draft.conservation, fridgeDays: v === null ? null : Math.round(v) } })} />
          </Field>
          <Field label="Meses en freezer" hint="vacío = no congelar" error={err('conservation.freezerMonths')}>
            <NumberInput value={draft.conservation.freezerMonths} min={0} max={12} onChange={(v) => set({ conservation: { ...draft.conservation, freezerMonths: v === null ? null : Math.round(v) } })} />
          </Field>
        </div>
        <Field label="Notas de conservación">
          <input value={draft.conservation.notes} maxLength={400} onChange={(e) => set({ conservation: { ...draft.conservation, notes: e.target.value } })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={draft.batchFriendly} onChange={(e) => set({ batchFriendly: e.target.checked })} />
          Apta para cocinar por tandas y guardar
        </label>
      </div>

      <div className="card">
        <h2>Alérgenos</h2>
        <div className="grid2">
          {ALLERGENS.map((a) => (
            <label key={a} className="check">
              <input
                type="checkbox"
                checked={draft.allergens.includes(a)}
                onChange={(e) => set({ allergens: e.target.checked ? [...draft.allergens, a] : draft.allergens.filter((x) => x !== a) })}
              />
              {ALLERGEN_LABELS[a]}
            </label>
          ))}
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn secondary" onClick={() => void cancel()}>
          Cancelar
        </button>
        <button type="submit" className="btn">
          <Icon name="check" /> Guardar receta
        </button>
      </div>
    </form>
  );
}
