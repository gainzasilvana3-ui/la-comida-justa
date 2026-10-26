import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { SLOT_LABELS, effectiveToBuy, useFirst } from '@lcj/shared';
import { db } from '../db/db';
import { setPref, usePrefs } from '../db/prefs';
import { useAllRecipes } from '../catalog/catalog';
import { useAccess } from '../license/AccessProvider';
import { formatDay, todayIso } from '../lib/id';
import { Icon, type IconName } from '../ui/Icon';
import { InstallHelp, isStandalone } from './Help';
import { TABLE_IMAGE, dishImage } from '../ui/dishImage';

const TILES: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: '#/menu', label: 'Planificar menú', hint: 'Almuerzos y cenas', icon: 'calendar' },
  { href: '#/porciones', label: 'Calcular porciones', hint: 'Según quién come', icon: 'scale' },
  { href: '#/compras', label: 'Lista de compras', hint: 'Solo lo que falta', icon: 'cart' },
  { href: '#/despensa', label: 'Lo que ya tengo', hint: 'Despensa y heladera', icon: 'box' },
  { href: '#/mes', label: 'El mes resuelto', hint: 'Para hijos que estudian fuera', icon: 'student' },
  { href: '#/recetas', label: 'Mis recetas', hint: 'Catálogo y propias', icon: 'book' },
];

export function Home() {
  const prefs = usePrefs();
  const { state } = useAccess();
  const { byId } = useAllRecipes();
  const today = todayIso();
  const [showInstall, setShowInstall] = useState(false);

  const plan = useLiveQuery(async () => (prefs?.activePlanId ? db.plans.get(prefs.activePlanId) : undefined), [prefs?.activePlanId]);
  const list = useLiveQuery(async () => (prefs?.activeListId ? db.shoppingLists.get(prefs.activeListId) : undefined), [prefs?.activeListId]);
  const pantry = useLiveQuery(() => db.pantry.toArray(), []) ?? [];

  const todayMeals = plan?.entries.filter((e) => e.date === today) ?? [];
  const firstToday = todayMeals.map((e) => byId.get(e.recipeId)).find(Boolean);
  const soon = useFirst(pantry).filter((p) => p.days !== null && p.days <= 3);
  const pending = list?.items.filter((i) => !i.checked && !i.toTaste && (effectiveToBuy(i) ?? 1) > 0).length ?? 0;
  const lastBackup = prefs?.lastBackupAt;
  const backupOld = !lastBackup || Date.now() - Date.parse(lastBackup) > 30 * 86400_000;
  const hasData = pantry.length > 0 || Boolean(plan) || Boolean(list);

  return (
    <div>
      {state.kind === 'active' && !isStandalone() && !prefs?.installDismissed ? (
        <div className="card soft">
          <div className="row between nowrap">
            <h2 className="grow">
              <Icon name="phone" /> Instalá la app en tu celular
            </h2>
            <button className="icon-btn" aria-label="No mostrar más" onClick={() => void setPref('installDismissed', true)}>
              <Icon name="close" />
            </button>
          </div>
          <p>Así la abrís con un toque desde la pantalla de inicio, como cualquier app, y funciona sin conexión.</p>
          {showInstall ? <InstallHelp /> : <button className="btn secondary" onClick={() => setShowInstall(true)}>Ver cómo</button>}
        </div>
      ) : null}

      <div className="card has-hero">
        <img className="card-hero" src={firstToday ? dishImage(firstToday) : TABLE_IMAGE} alt="" />
        <h2>
          <Icon name="pot" /> Hoy, {formatDay(today).split(',')[0]?.toLowerCase()}
        </h2>
        {todayMeals.length ? (
          <ul className="list">
            {todayMeals.map((e) => {
              const r = byId.get(e.recipeId);
              return (
                <li key={e.id}>
                  <span className="badge green">{SLOT_LABELS[e.slot]}</span>
                  <a className="grow" href={`#/receta/${e.recipeId}`}>
                    {r?.name ?? 'Receta no disponible'}
                  </a>
                  {e.leftoversOf ? <span className="badge">sobras</span> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">
            No hay comidas planificadas para hoy. <a href="#/menu">Planificá tu semana</a>.
          </p>
        )}
      </div>

      {soon.length ? (
        <div className="card">
          <h2>
            <Icon name="alert" /> Conviene usar primero
          </h2>
          <ul className="list">
            {soon.slice(0, 5).map((p) => (
              <li key={p.id}>
                <span className="grow">{p.name}</span>
                <span className={`badge ${p.days! < 0 ? 'terra' : 'warn'}`}>
                  {p.days! < 0 ? `fecha pasada hace ${-p.days!} d` : p.days === 0 ? 'fecha: hoy' : `fecha en ${p.days} d`}
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted">Son las fechas que cargaste vos. Revisá el estado del alimento y las indicaciones del envase.</p>
          <a href="#/despensa">Ver lo que tengo</a>
        </div>
      ) : null}

      {list ? (
        <a className="card row nowrap" href="#/compras" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Icon name="cart" />
          <span className="grow">
            <strong>{list.name}</strong>
            <br />
            <span className="muted">{pending ? `${pending} productos por comprar` : 'Todo comprado'}</span>
          </span>
          <Icon name="back" className="flip" />
        </a>
      ) : null}

      <div className="tiles">
        {TILES.map((t) => (
          <a key={t.href} className="tile" href={t.href}>
            <Icon name={t.icon} />
            {t.label}
            <small>{t.hint}</small>
          </a>
        ))}
      </div>

      {hasData && backupOld ? (
        <div className="notice warn">
          <p>
            Tus datos están guardados solo en este teléfono.{' '}
            {lastBackup ? 'Hace más de un mes que no hacés un respaldo.' : 'Todavía no hiciste ningún respaldo.'}{' '}
            <a href="#/ajustes">Exportar respaldo</a>
          </p>
        </div>
      ) : null}

      <p className="small muted center">
        Las cantidades son estimaciones orientativas. <a href="#/ayuda">Más información</a>
      </p>
    </div>
  );
}
