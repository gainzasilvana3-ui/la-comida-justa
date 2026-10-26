# Costos

Resumen: **con el volumen de un emprendimiento que arranca, todo entra en planes gratuitos.** El único gasto recomendable (no obligatorio) es un dominio propio.

> Los límites gratuitos de Cloudflare cambian con el tiempo. Los números de abajo son los publicados al escribir esto (octubre de 2026); confirmalos en https://www.cloudflare.com/plans/developer-platform/ y en la página de precios de cada producto antes de decidir.

| Servicio | Para qué | Plan | Costo | Qué pasaría si se supera |
|---|---|---|---|---|
| Cloudflare Pages | Publicar la app | Free | $0 | Los archivos estáticos no tienen límite de visitas en el plan gratuito; el límite es de compilaciones por mes (alcanza de sobra). |
| Cloudflare Workers | Servidor de licencias | Free (≈100.000 pedidos por día) | $0 | Al superar el límite diario, el servidor deja de responder hasta el día siguiente. La app sigue funcionando offline y reintenta después. |
| Cloudflare D1 | Base de licencias | Free (≈5 GB, millones de lecturas por día) | $0 | Muy lejos de lo que usa este sistema. |
| Cloudflare Access | Proteger el panel | Zero Trust Free (hasta 50 usuarios) | $0 | Sos 1 o 2 personas. Puede pedir una tarjeta para registrarse, sin cobrar. |
| Cloudflare Turnstile | Anti-robots en la activación | Free | $0 | — |
| Dominio propio | Direcciones lindas (app.tudominio.com) | Opcional | Un pago anual; varía según la terminación (.com, .com.ar, etc.) y el registrador | Sin dominio funcionan las direcciones gratuitas *.pages.dev y *.workers.dev. |
| GitHub | Guardar el código y publicar automáticamente | Free | $0 | — |

## Cuánto usa la app

Cada teléfono activo hace, como mucho, unos pocos pedidos por día al servidor (renovar al abrir la app y descargar el catálogo cuando hay recetas nuevas). Con **1.000 compradores activos** el uso estaría en el orden de algunos miles de pedidos por día: menos del 10 % del límite gratuito de Workers.

## Si algún día hiciera falta pagar

El primer escalón sería el plan pago de Workers (incluye Workers y D1 con límites mucho mayores), con un costo mensual fijo bajo en dólares; revisá el valor actual en la página de Cloudflare. Antes de contratar cualquier servicio pago, conviene revisar el uso real en el panel de Cloudflare (Workers & Pages → el Worker → Metrics).

## Lo que este proyecto **no** usa (y no genera costos)

- No usa servicios de IA ni APIs pagas.
- No usa servicios de mail transaccional: la entrega de códigos es manual (ver [LICENCIAS.md](LICENCIAS.md)).
- No usa análisis de visitas ni publicidad.
