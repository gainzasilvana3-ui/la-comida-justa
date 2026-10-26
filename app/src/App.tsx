import { useEffect, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAccess, useOnline } from './license/AccessProvider';
import { useRoute, back } from './lib/router';
import { Icon, type IconName } from './ui/Icon';
import { Modal } from './ui/kit';
import { APP_VERSION } from './config';
import { Activation } from './screens/Activation';
import { Home } from './screens/Home';
import { Recipes } from './screens/Recipes';
import { RecipeDetail } from './screens/RecipeDetail';
import { RecipeEditor } from './screens/RecipeEditor';
import { Portions } from './screens/Portions';
import { Planner } from './screens/Planner';
import { Shopping } from './screens/Shopping';
import { Pantry } from './screens/Pantry';
import { Month } from './screens/Month';
import { Prices } from './screens/Prices';
import { Settings } from './screens/Settings';
import { Help } from './screens/Help';
import { Privacy } from './screens/Privacy';
import { LicenseBanner, LimitedNotice } from './screens/LicenseBanner';

const NAV: { path: string; label: string; icon: IconName }[] = [
  { path: '/inicio', label: 'Inicio', icon: 'home' },
  { path: '/menu', label: 'Planificar menú', icon: 'calendar' },
  { path: '/porciones', label: 'Calcular porciones', icon: 'scale' },
  { path: '/compras', label: 'Lista de compras', icon: 'cart' },
  { path: '/recetas', label: 'Mis recetas', icon: 'book' },
];

const MORE: { path: string; label: string; icon: IconName }[] = [
  { path: '/despensa', label: 'Lo que ya tengo', icon: 'box' },
  { path: '/mes', label: 'El mes resuelto', icon: 'student' },
  { path: '/precios', label: 'Precios y presupuesto', icon: 'tag' },
  { path: '/ajustes', label: 'Ajustes y respaldo', icon: 'settings' },
  { path: '/ayuda', label: 'Ayuda e instalación', icon: 'help' },
  { path: '/privacidad', label: 'Privacidad', icon: 'lock' },
];

const TITLES: Record<string, string> = {
  inicio: 'La comida justa',
  menu: 'Planificar menú',
  porciones: 'Calcular porciones',
  compras: 'Lista de compras',
  recetas: 'Mis recetas',
  receta: 'Receta',
  despensa: 'Lo que ya tengo',
  mes: 'El mes resuelto',
  precios: 'Precios y presupuesto',
  ajustes: 'Ajustes y respaldo',
  ayuda: 'Ayuda',
  privacidad: 'Privacidad',
};

/** Pantallas disponibles cuando la licencia venció o fue revocada: solo ver y exportar datos propios. */
const LIMITED_OK = new Set(['inicio', 'recetas', 'receta', 'compras', 'despensa', 'ajustes', 'ayuda', 'privacidad']);

function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    // Busca versiones nuevas cada vez que la persona vuelve a la app, no solo al abrirla de cero.
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void registration.update().catch(() => {});
      });
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="notice no-print" role="status">
      <div className="row between">
        <span>Hay una versión nueva de la app. Tus datos no se tocan.</span>
        <button className="btn small" onClick={() => void updateServiceWorker(true)}>
          Actualizar
        </button>
      </div>
    </div>
  );
}

function Screen({ segments, query, limited }: { segments: string[]; query: URLSearchParams; limited: boolean }) {
  const [first = 'inicio', second, third] = segments;
  if (limited && !LIMITED_OK.has(first)) return <LimitedNotice />;
  switch (first) {
    case 'inicio':
      return <Home />;
    case 'recetas':
      return <Recipes limited={limited} />;
    case 'receta':
      if (second === 'nueva') return <RecipeEditor />;
      if (second && third === 'editar') return <RecipeEditor id={second} />;
      if (second && third === 'copiar') return <RecipeEditor copyOf={second} />;
      return second ? <RecipeDetail id={second} limited={limited} /> : <Recipes limited={limited} />;
    case 'porciones':
      return <Portions recipeId={query.get('receta') ?? undefined} />;
    case 'menu':
      return <Planner />;
    case 'compras':
      return <Shopping limited={limited} />;
    case 'despensa':
      return <Pantry limited={limited} />;
    case 'mes':
      return <Month />;
    case 'precios':
      return <Prices />;
    case 'ajustes':
      return <Settings />;
    case 'ayuda':
      return <Help />;
    case 'privacidad':
      return <Privacy />;
    default:
      return <Home />;
  }
}

function Shell({ children, title, showBack }: { children: ReactNode; title: string; showBack: boolean }) {
  const online = useOnline();
  const [more, setMore] = useState(false);
  const route = useRoute();
  useEffect(() => setMore(false), [route.path]);
  return (
    <div className="app">
      <header className="topbar">
        {showBack ? (
          <button onClick={() => back()} aria-label="Volver">
            <Icon name="back" />
          </button>
        ) : null}
        {!showBack && title === 'La comida justa' ? <img className="brand-mark" src="/favicon.svg" alt="" /> : null}
        <h1>
          {title}
          {!showBack && title === 'La comida justa' ? <span className="brand">Llegar a fin de mes</span> : null}
        </h1>
        {!online ? (
          <span className="chip-offline" role="status">
            Sin conexión
          </span>
        ) : null}
        <button onClick={() => setMore(true)} aria-label="Más opciones">
          <Icon name="menu" />
        </button>
      </header>
      <main className="content" id="contenido">
        <UpdateBanner />
        <LicenseBanner />
        {children}
      </main>
      <nav className="bottomnav" aria-label="Secciones principales">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} aria-current={route.path.startsWith(n.path) || (n.path === '/recetas' && route.path.startsWith('/receta')) ? 'page' : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
      {more ? (
        <Modal title="Más opciones" onClose={() => setMore(false)}>
          <ul className="list">
            {MORE.map((m) => (
              <li key={m.path}>
                <a className="btn ghost block" style={{ justifyContent: 'flex-start' }} href={`#${m.path}`} onClick={() => setMore(false)}>
                  <Icon name={m.icon} /> {m.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="small muted center">Versión {APP_VERSION}</p>
        </Modal>
      ) : null}
    </div>
  );
}

export function App() {
  const { state } = useAccess();
  const route = useRoute();
  const first = route.segments[0] ?? 'inicio';

  if (state.kind === 'loading') {
    return (
      <div className="splash" role="status">
        <div className="splash-logo" aria-hidden="true" />
        <p>Cargando…</p>
      </div>
    );
  }

  if (state.kind === 'none') {
    // Antes de activar solo se ven la activación, la ayuda y la privacidad.
    if (first === 'privacidad' || first === 'ayuda') {
      return (
        <div className="activation">
          <button className="btn ghost" onClick={() => back('/inicio')}>
            <Icon name="back" /> Volver
          </button>
          {first === 'privacidad' ? <Privacy /> : <Help />}
        </div>
      );
    }
    return <Activation />;
  }

  const limited = state.kind === 'expired' || state.kind === 'blocked';
  const title = TITLES[first] ?? 'La comida justa';
  const showBack = !NAV.some((n) => n.path === route.path) || route.segments.length > 1;
  return (
    <Shell title={title} showBack={showBack}>
      <Screen segments={route.segments} query={route.query} limited={limited} />
    </Shell>
  );
}
