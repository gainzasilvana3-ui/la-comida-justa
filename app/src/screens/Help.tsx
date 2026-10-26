import { useEffect, useState } from 'react';
import { config } from '../config';
import { Icon } from '../ui/Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
});

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt(): { canPrompt: boolean; prompt: () => Promise<boolean> } {
  const [canPrompt, setCan] = useState(Boolean(deferredPrompt));
  useEffect(() => {
    const on = () => setCan(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  return {
    canPrompt,
    prompt: async () => {
      if (!deferredPrompt) return false;
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      setCan(false);
      return choice.outcome === 'accepted';
    },
  };
}

export function InstallHelp() {
  const { canPrompt, prompt } = useInstallPrompt();
  if (isStandalone()) return <p className="notice">La app ya está instalada en este dispositivo.</p>;
  return (
    <div className="stack">
      {canPrompt ? (
        <button className="btn block" onClick={() => void prompt()}>
          <Icon name="download" /> Instalar la app
        </button>
      ) : null}
      <div>
        <h3>En Android (Chrome)</h3>
        <ol>
          <li>Abrí el enlace de la app en Chrome.</li>
          <li>Tocá el menú de los tres puntos, arriba a la derecha.</li>
          <li>Elegí <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.</li>
          <li>Confirmá. Vas a ver el ícono de La comida justa junto a tus otras apps.</li>
        </ol>
      </div>
      <div>
        <h3>En iPhone (Safari)</h3>
        <ol>
          <li>Abrí el enlace en <strong>Safari</strong> (no funciona igual desde otras apps).</li>
          <li>Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba).</li>
          <li>Bajá y elegí <strong>Agregar a inicio</strong>.</li>
          <li>Tocá <strong>Agregar</strong>. Abrí la app siempre desde ese ícono.</li>
        </ol>
        <p className="small muted">
          En iPhone, la app instalada guarda sus datos aparte de Safari. Si la activaste en Safari, vas a tener que activarla de nuevo en el
          ícono con tu código de recuperación.
        </p>
      </div>
      <div>
        <h3>En la computadora</h3>
        <p>En Chrome o Edge, buscá el ícono de instalar a la derecha de la barra de direcciones.</p>
      </div>
    </div>
  );
}

export function Help() {
  return (
    <div>
      <div className="card">
        <h2>
          <Icon name="phone" /> Instalar la app
        </h2>
        <InstallHelp />
      </div>

      <div className="card">
        <h2>
          <Icon name="key" /> Cambiar de celular o borrar datos
        </h2>
        <ul>
          <li>
            <strong>Tus recetas propias, menús, listas y despensa están solo en este teléfono.</strong> No se pasan solos a otro dispositivo.
          </li>
          <li>Antes de cambiar de celular, andá a Ajustes y tocá <strong>Exportar respaldo</strong>. Guardá el archivo (mandátelo por mail o a tu nube).</li>
          <li>En el celular nuevo, abrí la app y elegí <strong>Cambié de celular</strong>. Ingresá tu código de recuperación.</li>
          <li>Después, en Ajustes, tocá <strong>Importar respaldo</strong> y elegí el archivo.</li>
          <li>Si borrás los datos del navegador o desinstalás la app sin respaldo, esos datos se pierden.</li>
          <li>Podés cambiar de dispositivo por tu cuenta hasta 3 veces por año. Si necesitás más, escribinos.</li>
        </ul>
      </div>

      <div className="card">
        <h2>
          <Icon name="wifiOff" /> Sin conexión
        </h2>
        <p>
          Después de activar, todo funciona sin internet: recetas, cálculos, menú, lista de compras y despensa. Cada tanto, cuando haya
          conexión, la app renueva su autorización sola.
        </p>
        <p>
          Si pasás más de 30 días sin conectarte, vas a ver un aviso. Tenés 14 días más para conectarte. Si no, se pausan el catálogo y los
          cálculos hasta que te conectes, pero <strong>tus datos nunca se borran</strong> y siempre podés verlos y exportarlos.
        </p>
      </div>

      <div className="card">
        <h2>
          <Icon name="info" /> Sobre las cantidades
        </h2>
        <p>
          Las cantidades son estimaciones orientativas. Dependen de la receta, del tamaño de los ingredientes y del apetito de cada persona.
          Podés ajustar los factores en Ajustes y cambiar cualquier cantidad a mano.
        </p>
        <p>Los pesos de carnes, arroz, fideos y legumbres del catálogo son en crudo.</p>
        <p>
          Las recomendaciones de conservación son generales. Seguí siempre las indicaciones oficiales de seguridad alimentaria (ANMAT y
          Ministerio de Salud). La app no puede saber si un alimento está en buen estado por una fecha.
        </p>
        <p>
          Los alérgenos se indican según los ingredientes de la receta. Revisá siempre las etiquetas: los productos envasados pueden tener
          otros alérgenos o trazas.
        </p>
      </div>

      {config.supportContact ? (
        <div className="card soft">
          <h2>¿Necesitás ayuda?</h2>
          <p>Escribinos: {config.supportContact}</p>
        </div>
      ) : null}
    </div>
  );
}
