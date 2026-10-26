import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DINER_CATEGORIES,
  DINER_CATEGORY_LABELS,
  PROFILES,
  PROFILE_LABELS,
  totalPeople,
  type Diner,
} from '@lcj/shared';
import { db } from '../db/db';
import { newId } from '../lib/id';
import { Icon } from './Icon';
import { Field, Modal, NumberInput, Stepper, useSafeWrite } from './kit';

export const defaultDiners = (): Diner[] => [{ id: newId(), category: 'adulto', profile: 'normal', count: 2 }];

export function dinersSummary(diners: Diner[]): string {
  const n = totalPeople(diners);
  return `${n} ${n === 1 ? 'persona' : 'personas'}`;
}

/** Editor de comensales: filas de "cantidad × categoría × apetito" y ajuste individual opcional. */
export function DinersEditor({ value, onChange }: { value: Diner[]; onChange: (d: Diner[]) => void }) {
  const groups = useLiveQuery(() => db.dinerGroups.toArray(), []) ?? [];
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const safe = useSafeWrite();

  const update = (id: string, patch: Partial<Diner>) => onChange(value.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <div>
      {groups.length ? (
        <div className="chips" aria-label="Comensales guardados">
          {groups.map((g) => (
            <button key={g.id} className="chip" type="button" onClick={() => onChange(g.diners.map((d) => ({ ...d, id: newId() })))}>
              <Icon name="people" className="inline-icon" /> {g.name}
            </button>
          ))}
        </div>
      ) : null}

      {value.map((d, idx) => (
        <div key={d.id} className="card soft" style={{ padding: 12 }}>
          <div className="row between nowrap">
            <strong>Grupo {idx + 1}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Quitar grupo ${idx + 1}`}
              onClick={() => onChange(value.filter((x) => x.id !== d.id))}
            >
              <Icon name="trash" />
            </button>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <Stepper value={d.count} min={0} max={30} label="personas" onChange={(count) => update(d.id, { count })} />
            <span>{d.count === 1 ? 'persona' : 'personas'}</span>
          </div>
          <div className="grid2">
            <Field label="Edad">
              <select value={d.category} onChange={(e) => update(d.id, { category: e.target.value as Diner['category'] })}>
                {DINER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {DINER_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Apetito">
              <select value={d.profile} onChange={(e) => update(d.id, { profile: e.target.value as Diner['profile'] })}>
                {PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {PROFILE_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <details>
            <summary className="small">Ajuste individual {d.customFactor ? `(× ${String(d.customFactor).replace('.', ',')})` : ''}</summary>
            <Field label="Multiplicador" hint="1 = sin cambio. Ej.: 1,2 come un 20 % más">
              <NumberInput
                value={d.customFactor ?? null}
                min={0.3}
                max={3}
                placeholder="1"
                onChange={(v) => update(d.id, { customFactor: v === null || v === 1 ? undefined : v })}
              />
            </Field>
          </details>
        </div>
      ))}

      <div className="actions">
        <button
          type="button"
          className="btn secondary"
          onClick={() => onChange([...value, { id: newId(), category: 'adulto', profile: 'normal', count: 1 }])}
        >
          <Icon name="plus" /> Agregar comensales
        </button>
        <button type="button" className="btn ghost" onClick={() => setSaving(true)} disabled={totalPeople(value) === 0}>
          Guardar como habituales
        </button>
      </div>

      {saving ? (
        <Modal title="Guardar comensales habituales" onClose={() => setSaving(false)}>
          <Field label="Nombre" hint="ej. Familia, Semana con abuelos">
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button
            className="btn block"
            disabled={!name.trim()}
            onClick={async () => {
              const ok = await safe(
                () => db.dinerGroups.put({ id: newId(), name: name.trim(), diners: value.map((d) => ({ ...d })) }),
                'Comensales guardados.',
              );
              if (ok) {
                setSaving(false);
                setName('');
              }
            }}
          >
            Guardar
          </button>
        </Modal>
      ) : null}
    </div>
  );
}
