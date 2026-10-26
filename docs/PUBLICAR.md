# Cómo publicar La comida justa

Todo se publica en **Cloudflare**, con su plan gratuito (ver [COSTOS.md](COSTOS.md)). Son tres piezas:

| Pieza | Servicio de Cloudflare | Qué es |
|---|---|---|
| La app | Pages | Los archivos de `app/dist`. Es lo que abren los compradores. |
| El servidor de licencias | Workers + base de datos D1 | Valida códigos y renueva autorizaciones. También sirve el panel en `/admin/`. |
| La protección del panel | Zero Trust → Access | Solo deja entrar a los mails autorizados al panel. |

Además se usa **Turnstile** (gratis) para frenar robots en la pantalla de activación.

> En este documento los valores entre `<...>` los tenés que reemplazar por los tuyos. No hay ninguna dirección real cargada todavía.

Tiempo estimado: una tarde, la primera vez.

> **Atajo:** `scripts/publicar-cloudflare.mjs` hace los pasos 1 a 9 solo (usa direcciones gratuitas `*.pages.dev` y `*.workers.dev`). Necesita una API token de Cloudflare con permisos de Workers, D1, Pages, Turnstile y Access:
>
> ```bash
> CLOUDFLARE_API_TOKEN=... ADMIN_EMAIL=tu@mail.com SUPPORT_CONTACT=tu@mail.com npm run publicar
> ```
>
> Se puede volver a correr: reutiliza lo que ya existe y no cambia las claves. Las claves secretas quedan solo en Cloudflare. Los datos públicos (direcciones, clave pública) quedan en `.publicacion.json`: guardá ese archivo, porque se necesita para volver a publicar la app.

---

## 0. Lo que necesitás

- Una cuenta gratuita de Cloudflare.
- Node.js 20 o superior en la computadora (para correr los comandos).
- El código en tu computadora (o en un repositorio de GitHub, si vas a publicar la app desde ahí).
- Opcional, pero recomendado: un dominio propio cargado en Cloudflare (por ejemplo `tudominio.com`). Con dominio propio la app queda en algo como `app.tudominio.com` y el servidor en `licencias.tudominio.com`. Sin dominio, Cloudflare te da direcciones gratuitas `*.pages.dev` y `*.workers.dev`.

Desde la carpeta del proyecto:

```bash
npm install
npx wrangler login          # abre el navegador para autorizar a tu cuenta de Cloudflare
```

## 1. Generar las claves de producción

```bash
node server/scripts/generate-keys.mjs --print
```

Muestra tres valores **nuevos** (no uses los de desarrollo):

- `LICENSE_SIGNING_KEY`: clave **privada**. Firma las autorizaciones. Es secreta.
- `CODE_PEPPER`: secreto con el que se guardan los códigos en la base (la base nunca guarda los códigos en limpio).
- `VITE_LICENSE_PUBLIC_KEY`: clave **pública**. Va dentro de la app. No es secreta.

Guardá los tres en un gestor de contraseñas **antes de seguir**.

- Si perdés `CODE_PEPPER` o lo cambiás, **todos los códigos vendidos dejan de validar**. No lo cambies nunca.
- Si cambiás la clave privada, tenés que publicar la app con la pública nueva al mismo tiempo; los teléfonos se re-autorizan solos la próxima vez que tengan conexión.

Nunca pongas la clave privada ni el pepper en la app, en `wrangler.toml` ni en GitHub.

## 2. Crear la base de datos

```bash
cd server
npx wrangler d1 create lcj-licencias
```

El comando muestra un `database_id`. Copialo en `server/wrangler.toml`, en el bloque `[[d1_databases]]` de arriba (no en el de `env.dev`):

```toml
database_id = "<el-id-que-te-dio-cloudflare>"
```

Después creá las tablas:

```bash
npm run db:migrate:remote
```

## 3. Elegir la dirección del servidor

**Opción A: con dominio propio (recomendada).** En `server/wrangler.toml`, debajo de `workers_dev = false`, agregá:

```toml
routes = [{ pattern = "licencias.<tudominio.com>", custom_domain = true }]
```

**Opción B: sin dominio.** Cambiá `workers_dev = false` por `workers_dev = true`. El servidor va a quedar en `https://lcj-licencias.<tu-subdominio>.workers.dev` (Cloudflare te muestra la dirección exacta al publicar).

Anotá la dirección: es la `VITE_API_BASE` de la app.

## 4. Turnstile (anti-robots)

En el panel de Cloudflare: **Turnstile → Add widget**.

- Nombre: La comida justa.
- Hostname: el dominio donde va a estar la app (por ejemplo `app.tudominio.com` o `<proyecto>.pages.dev`). Si todavía no lo sabés, completalo después del paso 7 y volvé.
- Modo: Managed.

Te da dos claves:

- **Site key** (pública) → va a la app como `VITE_TURNSTILE_SITE_KEY`.
- **Secret key** (secreta) → va al servidor como `TURNSTILE_SECRET`.

En producción el servidor **rechaza activaciones sin Turnstile**: si falta el secreto, la activación responde "servicio no disponible" en lugar de funcionar sin protección.

## 5. Cargar los secretos y la configuración del servidor

Desde `server/`:

```bash
npx wrangler secret put LICENSE_SIGNING_KEY   # pegá la clave privada del paso 1
npx wrangler secret put CODE_PEPPER           # pegá el pepper del paso 1
npx wrangler secret put TURNSTILE_SECRET      # pegá la secret key del paso 4
```

En `server/wrangler.toml`, bloque `[vars]`, completá:

| Variable | Valor |
|---|---|
| `APP_ORIGIN` | La dirección exacta de la app, sin barra final. Ej.: `https://app.tudominio.com`. Solo esa dirección puede hablar con el servidor. |
| `ADMIN_EMAILS` | Tu mail (y el de quien te ayude), separados por coma. |
| `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` | Se completan en el paso 6. |

## 6. Proteger el panel con Cloudflare Access

El panel (`/admin/`) **no tiene usuario y contraseña propios**: lo protege Cloudflare Access, que te manda un código al mail para entrar. El servidor además verifica la firma de Access y que tu mail esté en `ADMIN_EMAILS`, así que aunque alguien llegara a la dirección sin pasar por Access, no entra.

1. Panel de Cloudflare → **Zero Trust** (la primera vez te pide elegir un nombre de equipo y el plan Free; puede pedir una tarjeta aunque el plan sea gratis).
2. **Access → Applications → Add an application → Self-hosted**.
3. Dominio: la dirección del servidor del paso 3, con la ruta `admin`. Ej.: `licencias.tudominio.com/admin`. **Solo `/admin`**: si protegés todo el dominio, la app no va a poder activar ni renovar.
4. Política: Allow → Emails → tu mail. Método de inicio de sesión: One-time PIN (código por mail).
5. Al guardar, en la aplicación vas a ver el **Application Audience (AUD) Tag**. Copialo en `ACCESS_AUD`.
6. En **Settings → Custom pages** (o en la portada de Zero Trust) figura tu dominio de equipo, del tipo `<equipo>.cloudflareaccess.com`. Copialo en `ACCESS_TEAM_DOMAIN`.

Si usaste la opción B (workers.dev): Cloudflare permite activar Access para la dirección `workers.dev` desde la configuración del Worker (**Settings → Domains & Routes**). Si tu cuenta no muestra esa opción, usá un dominio propio.

## 7. Publicar el servidor

```bash
cd server
npm run deploy
```

Comprobá que esté bien configurado abriendo `https://<dirección-del-servidor>/v1/health`. Tiene que decir `"ready":true`. Si dice `false`, falta algún secreto o `APP_ORIGIN`.

## 8. Publicar la app

La app necesita estas variables **al momento de compilar**:

| Variable | Valor |
|---|---|
| `VITE_API_BASE` | Dirección del servidor (paso 3), sin barra final |
| `VITE_LICENSE_PUBLIC_KEY` | Clave pública del paso 1 |
| `VITE_TURNSTILE_SITE_KEY` | Site key del paso 4 |
| `VITE_SUPPORT_CONTACT` | Tu mail o WhatsApp de soporte (se muestra en la app) |

**Opción A: desde GitHub (se actualiza sola en cada cambio).** Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → elegí el repositorio.

- Build command: `npm run build -w app`
- Build output directory: `app/dist`
- Environment variables: las cuatro de arriba.

**Opción B: desde tu computadora.**

```bash
# en app/.env.production.local (no se sube a GitHub) poné las cuatro variables, después:
npm run build -w app
npx wrangler pages deploy app/dist --project-name la-comida-justa
```

La app incluye un archivo `_headers` con la política de seguridad del navegador (CSP); se arma solo a partir de `VITE_API_BASE`.

Si la dirección final de la app es distinta de la que pusiste en `APP_ORIGIN`, corregila en `wrangler.toml` y volvé a correr `npm run deploy` en `server/`.

Si querés usar un dominio propio para la app: en el proyecto de Pages → **Custom domains**.

## 9. Cargar las recetas y probar

1. Entrá a `https://<dirección-del-servidor>/admin/` (te va a pedir el código por mail).
2. Pestaña **Recetas** → subí `catalog/catalogo.json` → **Publicar**. Sin este paso la app activa pero no muestra recetas del catálogo.
3. Pestaña **Generar códigos** → generá 1 o 2 códigos de prueba (tanda: `pruebas`).
4. Abrí la app en tu celular, activá con un código de prueba y recorré la [lista de pruebas manuales](PRUEBAS-MANUALES.md).
5. Revocá los códigos de prueba desde la pestaña **Licencias** cuando termines.

## 10. Respaldo de la base de licencias

La base de licencias es lo único que vive en el servidor. Exportala cada tanto (por ejemplo, una vez por mes y antes de cada cambio grande):

```bash
cd server
npx wrangler d1 export lcj-licencias --remote --output respaldo-licencias-<fecha>.sql
```

Guardá ese archivo en un lugar privado: contiene los hashes de los códigos, no los códigos en sí, pero igual es información de tus clientes. D1 también guarda un historial que permite volver atrás en el tiempo ("Time Travel"); revisá en la documentación de Cloudflare cuántos días incluye tu plan.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| La app dice "No hay conexión con el servidor" con internet andando | `VITE_API_BASE` mal escrita, o `APP_ORIGIN` no coincide exactamente con la dirección de la app (ojo con `www` y la barra final). |
| "El servicio de activación no está disponible" | Falta un secreto (mirá `/v1/health`). |
| "Completá la verificación antes de activar" sin que aparezca el recuadro | Falta `VITE_TURNSTILE_SITE_KEY` en la app, o el hostname del widget de Turnstile no es el de la app. |
| El panel dice "Solicitud rechazada" o no entra | Tu mail no está en `ADMIN_EMAILS`, o `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` están mal copiados. |
| La app activa pero no muestra recetas | No publicaste el catálogo (paso 9). |
