# Política de privacidad (borrador)

> **Borrador para revisión.** Este texto describe con precisión lo que hace el sistema tal como está programado, pero no es asesoramiento legal. Antes de publicarlo, conviene que lo revise un profesional, en particular por la Ley 25.326 de Protección de Datos Personales de Argentina y por las normas de los países donde vendas. Completá los datos entre `<...>`.
>
> El mismo texto está dentro de la app (pantalla **Privacidad**, archivo `app/src/screens/Privacy.tsx`). Si cambiás uno, cambiá el otro.

**Responsable:** <nombre o razón social>, marca Llegar a fin de mes. Contacto: <mail de soporte>.
**Última actualización:** octubre de 2026.

## Qué guarda la app en tu teléfono

Tus recetas propias (incluidas las fotos que agregues), menús, comensales, despensa, listas de compras, precios que cargues y preferencias se guardan **solamente en tu dispositivo**, en el almacenamiento del navegador. No se envían a ningún servidor ni se sincronizan entre dispositivos. Si borrás los datos del navegador o perdés el teléfono sin haber exportado un respaldo, esos datos se pierden: no tenemos copia.

## Qué se envía a nuestro servidor

- **Para verificar tu compra:** el código de compra o de recuperación, una clave pública generada por tu dispositivo (no permite identificarte) y la versión de la app.
- **Para renovar el acceso:** el identificador anónimo de tu dispositivo (derivado de esa clave pública), una firma digital y la hora.
- **Para descargar las recetas del catálogo:** la autorización de acceso.
- **Errores técnicos (opcional):** el texto técnico del error, la pantalla donde ocurrió y la versión de la app. El servidor quita de ese texto cualquier mail o código antes de guardarlo. Se borran a los 30 días. Se puede desactivar en Ajustes.

El servidor guarda, por cada licencia: el código en forma irreversible, el estado, las fechas de creación y activación, y opcionalmente una referencia de venta que carga el vendedor. Por cada dispositivo: su clave pública, la fecha de activación y la de última conexión.

No guarda tu nombre, mail, teléfono, ubicación, contactos ni datos bancarios. Las direcciones IP se usan solo para limitar intentos abusivos; se guardan transformadas de forma irreversible y se borran a los 2 días.

## Servicios de terceros

La app y el servidor funcionan en Cloudflare (Estados Unidos y su red global). Al activar se usa Cloudflare Turnstile para evitar ataques automatizados. Cloudflare procesa datos técnicos de conexión (como la dirección IP) según su propia política de privacidad: https://www.cloudflare.com/privacypolicy/

La compra del ebook se realiza en <plataforma de venta>, que tiene su propia política de privacidad. La app no recibe datos de esa plataforma.

## Lo que no hacemos

- No usamos publicidad, cookies de seguimiento ni herramientas de análisis de comportamiento.
- No pedimos acceso a tu ubicación, contactos, cámara ni micrófono. (Si agregás una foto a una receta, la elegís vos desde el teléfono y queda solo en tu dispositivo.)
- No vendemos ni compartimos datos.

## Tus derechos

Podés exportar todos tus datos en cualquier momento (Ajustes → Descargar respaldo) y borrarlos (Ajustes → Borrar mis datos, o borrando los datos del navegador). Para pedir el acceso, la rectificación o la supresión de los registros técnicos de tu licencia, escribinos a <mail de soporte>.

<Agregar, si corresponde tras la revisión legal: la mención a la Agencia de Acceso a la Información Pública como órgano de control de la Ley 25.326 y su texto obligatorio.>
