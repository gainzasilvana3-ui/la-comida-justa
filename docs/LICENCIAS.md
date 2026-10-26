# Manual de licencias

Cómo funciona el acceso a la app y qué hacer en cada situación con un comprador. Todo se maneja desde el panel: `https://<dirección-del-servidor>/admin/`.

## Cómo funciona, en simple

1. Cada compra recibe un **código de compra** único, del tipo `LCJ-7K2M-QX4P-9TBW-H3ND`. Es aleatorio (no se puede adivinar ni deducir de otro) y **sirve una sola vez**.
2. Al activar, la app crea en el teléfono una **llave propia del dispositivo** que no se puede copiar, y el servidor le da al comprador un **código de recuperación** (`RCP-…`, de 5 bloques). Ese segundo código es el que se usa para cambiar de celular o sumar otro dispositivo.
3. El teléfono recibe una autorización firmada que dura 30 días. Desde el día 7 se renueva sola cada vez que hay conexión (la app lo intenta al abrir, al volver internet y cada 6 horas). Si el teléfono pasa más de 30 días sin conexión, tiene 14 días más de gracia con aviso.
4. Si la autorización vence o la licencia se revoca, la app **no borra nada**: el comprador sigue viendo sus recetas propias, listas y despensa, y puede exportarlas. Solo se pausan las funciones de cálculo y planificación.

Por defecto cada licencia admite **2 dispositivos activos** a la vez y **3 cambios de dispositivo por año**. Los dos números se cambian en la pestaña **Ajustes** del panel (valen para lo que pase de ahí en adelante), y el límite de dispositivos se puede cambiar para una licencia puntual.

**Importante:** el servidor guarda los códigos de forma irreversible (un hash). Ni vos ni nadie puede volver a ver un código después de generarlo. Por eso el CSV de cada tanda hay que guardarlo bien.

## Generar códigos

Pestaña **Generar códigos**:

- **Cantidad**: de 1 a 500 por tanda.
- **Tanda**: un nombre para agruparlos (ej. `lanzamiento-noviembre`).
- **Referencia** (opcional): algo que te ayude a ubicar la venta, como el número de pedido. Evitá poner datos personales si no hacen falta.

Al generar, el panel muestra los códigos **una sola vez**, con botones para copiarlos y descargar un CSV. Guardá el CSV en un lugar privado.

## Entregar el código al comprador

Hoy la entrega es **manual**: copiás un código sin usar y se lo mandás al comprador junto con el link de la app y la [guía para compradores](GUIA-COMPRADORES.md). Algunas formas:

- Pegarlo en el mail de entrega del ebook, uno distinto por venta.
- Si tu plataforma de ventas permite entregar un texto o archivo distinto por compra, cargar ahí los códigos.

El servidor no está conectado a ninguna plataforma de pagos. Automatizar la entrega (que cada venta genere su código sola) se puede agregar más adelante con un aviso automático (webhook) de la plataforma de ventas; no está hecho.

Llevá una planilla con *código → venta* si querés poder buscar después quién tiene cada código. Con el código, el panel encuentra la licencia.

## Buscar una licencia

Pestaña **Licencias**:

- **Buscar por código del comprador**: pegá el código `LCJ-…` o `RCP-…` que te pasa la persona (acepta minúsculas, espacios y confusiones típicas como O por 0).
- **Filtrar**: por tanda, referencia o estado (sin activar, activa, revocada).

En el detalle ves: estado, fecha de activación, dispositivos (cuándo se activó y cuándo se conectó por última vez cada uno; se muestra solo el comienzo del identificador) y el historial de cambios de dispositivo.

## Situaciones frecuentes

### "Cambié de celular"

No tenés que hacer nada. La persona abre la app en el celular nuevo, toca **Cambié de celular** y escribe su código de recuperación. Si ya tenía 2 dispositivos activos, se libera el que se usó hace más tiempo (cuenta como un cambio del año). Sus datos **no viajan solos**: para llevarlos tiene que exportar un respaldo en el celular viejo (Ajustes → Descargar respaldo) e importarlo en el nuevo.

### "Me dice que llegué al límite de cambios del año"

Revisá el historial en el detalle de la licencia. Si el pedido es razonable, tocá **Liberar dispositivos**: quita todos los dispositivos activos y la persona vuelve a entrar con su código de recuperación sin gastar un cambio.

### "Perdí el código de recuperación" (pero sigo usando la app)

Lo puede ver en la app: **Ajustes → Acceso → Ver código de recuperación**.

### "Perdí el celular y no tengo el código de recuperación"

Ubicá la licencia con el código de compra original (o con tu planilla de ventas). Tocá **Generar código nuevo**: genera un código de compra nuevo, invalida el anterior y el de recuperación, y quita los dispositivos. Mandale el código nuevo; al activarlo recibe un código de recuperación nuevo.

### "Quiero usarla en el celular y en la tablet"

Con el límite de 2 dispositivos, alcanza con entrar en el segundo con **Cambié de celular** y el código de recuperación. No cuenta como cambio mientras no se supere el límite. Si necesita más, subí el límite de esa licencia en el detalle.

### "El código ya se activó" y la persona dice que no lo usó

Mirá en el detalle cuándo se activó. Si sospechás que el código se filtró o se revendió, tocá **Generar código nuevo** en esa licencia: el código filtrado y su código de recuperación dejan de servir, se quitan los dispositivos que lo usaban, y le mandás el código nuevo a la persona.

### Reembolso, contracargo o código compartido públicamente

Tocá **Revocar** y escribí el motivo. En cada teléfono que la use, la app se pausa la próxima vez que se conecte (como mucho en un día si se abre con conexión). Los datos de esas personas no se borran. **Reactivar** la deshace.

## Límites contra intentos abusivos

El servidor frena automáticamente:

- Más de 10 intentos de activación por hora desde una misma conexión, o 5 por hora con un mismo código.
- Una ola anormal de códigos inválidos (más de 1000 fallas por hora en total).
- Renovaciones repetidas en exceso de un mismo dispositivo o conexión.

La persona ve "Hay demasiados intentos en este momento. Probá más tarde." Se destraba sola en menos de una hora.

## Pestañas de control

- **Resumen**: totales de licencias, activadas, sin usar, revocadas, dispositivos y errores de la semana.
- **Errores**: avisos técnicos que mandan las apps (sin recetas, listas, mails ni códigos: el servidor los borra del texto antes de guardarlo). Se borran solos a los 30 días.
- **Registro**: quién hizo qué en el panel y cuándo (generar, revocar, liberar, ajustes, recetas).
- **Ajustes**: dispositivos por licencia, cambios por año y "última versión de la app" (si la subís, las apps más viejas muestran un aviso para actualizarse).
