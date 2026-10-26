# La comida justa

App web instalable (PWA) de la marca **Llegar a fin de mes**, complemento del ebook. Ayuda a familias a calcular porciones, planificar el menú, armar la lista de compras descontando lo que ya hay en casa, cocinar por tandas para hijos que estudian lejos ("El mes resuelto") y estimar costos con precios cargados a mano.

- Los datos del usuario (recetas propias, menús, listas, despensa, precios) viven **solo en su teléfono** (IndexedDB). No hay cuentas ni contraseñas.
- El acceso se habilita con un **código de compra** único que valida un servidor propio (Cloudflare Workers + D1). Ese servidor no recibe datos de recetas ni listas.
- Funciona sin conexión. Cada tanto (como mínimo una vez por mes) necesita internet para renovar la autorización; hay 14 días de gracia extra.

## Estructura

```
shared/    Motor de cálculo (porciones, sumas, despensa, menú, mes, presupuesto), esquemas y licencias. Con pruebas.
catalog/   Las 28 recetas del catálogo (fuente) y el script que arma catalogo.json.
app/       La PWA (React + Vite + Dexie).
server/    Servidor de licencias (Cloudflare Worker + D1) y panel de administración (server/admin-ui).
docs/      Manuales.
```

## Documentación

| Documento | Para qué |
|---|---|
| [docs/PUBLICAR.md](docs/PUBLICAR.md) | Publicar todo en Cloudflare paso a paso |
| [docs/LICENCIAS.md](docs/LICENCIAS.md) | Generar, entregar, buscar, revocar y recuperar códigos |
| [docs/ACTUALIZAR.md](docs/ACTUALIZAR.md) | Publicar versiones nuevas y recetas nuevas sin borrar datos |
| [docs/GUIA-COMPRADORES.md](docs/GUIA-COMPRADORES.md) | Texto para quienes compran (instalar, activar, cambiar de celular) |
| [docs/PRIVACIDAD.md](docs/PRIVACIDAD.md) | Borrador de política de privacidad (para revisión profesional) |
| [docs/COSTOS.md](docs/COSTOS.md) | Qué se paga y qué es gratis |
| [docs/PRUEBAS-MANUALES.md](docs/PRUEBAS-MANUALES.md) | Lista de pruebas antes de cada publicación |
| [docs/LIMITACIONES.md](docs/LIMITACIONES.md) | Lo que el sistema hace y lo que no |

## Desarrollo local

Requiere Node 20 o superior.

```bash
npm install
npm run keys:dev                 # crea server/.dev.vars y app/.env.local con claves de prueba (no se suben)
npm run db:migrate:local -w server
npm run dev:server               # API en http://localhost:8787 y panel en http://localhost:8787/admin/
npm run dev:app                  # app en http://localhost:5173
```

En desarrollo el panel entra sin Cloudflare Access (`ADMIN_DEV_BYPASS`, que el servidor ignora en producción). Para tener recetas y códigos de prueba, desde el panel: pestaña **Recetas** → subir `catalog/catalogo.json` → publicar; pestaña **Generar códigos**.

## Pruebas

```bash
npm test          # motor, app y servidor (el servidor corre en Miniflare con la configuración de producción)
npm run typecheck
npm run build -w app
```

`npm audit` puede mostrar avisos en dependencias de `wrangler` y `miniflare`: son herramientas de desarrollo y no se incluyen en la app ni en el servidor publicados.
