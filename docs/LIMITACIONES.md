# Lo que el sistema hace y lo que no

## Protección del acceso

**Qué hace:**

- Cada código de compra es aleatorio (80 bits), único y de un solo uso. El servidor lo guarda transformado de forma irreversible.
- La activación queda atada a una llave del dispositivo que el navegador crea como no exportable: copiar los archivos de la app a otro teléfono no copia el acceso.
- El acceso se renueva con el servidor al menos una vez por mes; una licencia revocada deja de funcionar en todos sus dispositivos cuando se conectan.
- Límite de dispositivos por licencia, de cambios por año y de intentos por hora; verificación anti-robots en la activación.
- Las recetas del catálogo no están dentro de la app publicada: se descargan con una autorización válida.
- El código de la app no contiene ningún secreto, clave privada ni credencial administrativa. El panel no tiene contraseña propia: lo protege Cloudflare Access y el servidor verifica esa identidad.

**Qué no hace (y ningún sistema web puede garantizar):**

- **No impide toda copia.** Quien tenga acceso legítimo puede, por ejemplo, sacar capturas de las recetas, copiarlas a mano o compartir su teléfono. El sistema hace que compartir el acceso sea incómodo y detectable, y te permite revocarlo, pero no lo hace imposible.
- Una persona con conocimientos técnicos podría modificar la app en su propio dispositivo para saltear las pantallas de pausa. No obtendría recetas nuevas del catálogo ni podría activar otros dispositivos, porque eso depende del servidor.
- Un teléfono sin conexión no se entera de una revocación hasta que se conecta (como máximo 30 días más 14 de gracia).
- Si alguien compra y comparte su código **antes** de activarlo, la primera persona que lo active se queda con él. Por eso conviene entregar cada código solo al comprador.

## Datos del usuario

- Los datos viven solo en el teléfono. **No hay sincronización** entre dispositivos ni copia en la nube: si el teléfono se pierde sin respaldo, los datos se pierden. La app recuerda hacer respaldos y muestra la fecha del último.
- Algunos navegadores (sobre todo Safari en iPhone) pueden borrar datos de sitios que no se abren por varias semanas si la app **no** está instalada en la pantalla de inicio. Instalarla reduce mucho ese riesgo; la app también le pide al navegador que conserve los datos.
- En modo incógnito la app no puede guardar datos de forma permanente.

## Cálculos

- Las porciones son **estimaciones orientativas** basadas en factores que el usuario puede ajustar. No son recomendaciones nutricionales ni médicas.
- Los precios son los que carga el usuario: la app no consulta precios reales de ningún comercio.
- Las sugerencias de conservación (heladera como máximo 3 días, freezer según la receta) son prudentes y generales; la app remite a las indicaciones oficiales (ANMAT, Ministerio de Salud de la Nación) y no garantiza la seguridad de los alimentos.
- Las conversiones no mezclan medidas incompatibles: si un alimento aparece en gramos y en unidades, se muestran por separado en lugar de inventar una equivalencia.

## Operación

- La entrega de códigos a cada comprador es manual (no hay integración con plataformas de pago).
- `npm audit` informa avisos en dependencias de las herramientas de desarrollo (`wrangler`, `miniflare`). No forman parte de lo que se publica. Conviene actualizar esas herramientas cada tanto con `npm update`.
- Probado en Chromium (escritorio y tamaño celular) con pruebas automáticas de punta a punta. Falta probar en iPhone y Android reales con la [lista de pruebas manuales](PRUEBAS-MANUALES.md).
