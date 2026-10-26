# Cómo actualizar la app sin borrar datos

Hay tres tipos de actualización. Ninguna borra los datos de los compradores, porque esos datos viven en sus teléfonos y la app nunca los toca al actualizarse.

## 1. Recetas nuevas o corregidas en el catálogo

No hace falta publicar la app de nuevo.

1. Editá `catalog/src/recetas.ts` (cada receta usa el mismo formato que las existentes).
2. Corré:
   ```bash
   npm run catalog:build      # arma catalog/catalogo.json
   npm test -w shared         # revisa que todas las recetas sean válidas (cantidades, unidades, ids únicos)
   ```
3. En el panel → **Recetas** → subí `catalog/catalogo.json` → se crea una versión nueva sin publicar → revisala → **Publicar**.

Las apps descargan la versión nueva la próxima vez que se renuevan con conexión (como mucho en un día si se abren con internet).

Reglas para no romper nada:

- **No cambies el `id` de una receta existente**: los menús guardados, los favoritos y El mes resuelto la buscan por id.
- Si querés sacar una receta, quitala del catálogo: los menús que la usaban van a mostrar "Receta no disponible" en lugar de fallar. Las copias que la persona haya hecho ("Copiar y editar") no se pierden.
- Si una versión publicada tiene un error, volvé a publicar la versión anterior desde la misma pestaña.

## 2. Una versión nueva de la app (pantallas, cálculos, correcciones)

1. Hacé los cambios y corré `npm test` y `npm run build -w app`.
2. Subí el número de versión en `app/src/config.ts` (`APP_VERSION`) y en `app/package.json`.
3. Publicá (si la app está conectada a GitHub, alcanza con subir los cambios; si no, `npx wrangler pages deploy app/dist --project-name la-comida-justa`).
4. En el panel → **Ajustes** → "Última versión de la app": poné el número nuevo. Así las apps viejas muestran el aviso de actualizar.

Cómo le llega al comprador: al abrir la app con conexión, el teléfono descarga la versión nueva en segundo plano y muestra **"Hay una versión nueva de la app. Tus datos no se tocan."** con un botón **Actualizar**. Si no lo toca, se actualiza sola la próxima vez que cierre y abra la app.

### Si cambiás la forma en que se guardan los datos

La base local (`app/src/db/db.ts`) está en la versión 1. Si alguna vez agregás tablas o campos con índice:

- **Nunca borres ni edites** el bloque `this.version(1)`. Agregá debajo `this.version(2).stores({...})` con los cambios y, si hace falta, un `.upgrade(...)` que complete datos viejos.
- Si cambiás el formato de las recetas, listas, etc., actualizá también los esquemas de `shared/src/schemas.ts` para que los **respaldos viejos se sigan pudiendo importar** (agregá campos como opcionales).
- Agregá una prueba en `app/test/backup.test.ts` con un respaldo del formato anterior.

## 3. Cambios en el servidor de licencias

1. `npm test -w server` (corre el servidor real en un entorno local con la configuración de producción).
2. Si cambiás tablas, creá una migración nueva en `server/migrations/` (`0002_...sql`); no edites la `0001`. Aplicala con `npm run db:migrate:remote -w server`.
3. Exportá un respaldo de la base antes (ver [PUBLICAR.md](PUBLICAR.md), punto 10).
4. `npm run deploy -w server`.

Cuidado con cambios que afecten a las apps ya instaladas: el servidor tiene que seguir aceptando lo que mandan las versiones anteriores de la app (`/v1/activate`, `/v1/recover`, `/v1/renew`, `/v1/catalog`), porque no todos actualizan el mismo día.
