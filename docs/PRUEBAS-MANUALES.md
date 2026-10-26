# Pruebas manuales antes de publicar

Las pruebas automáticas (`npm test`) cubren el motor de cálculo, el respaldo y el servidor de licencias. Esta lista cubre lo que conviene mirar con un celular real, en Android (Chrome) **y** en iPhone (Safari). Usá códigos de una tanda `pruebas` y revocalos al terminar.

## Acceso

- [ ] Un código inventado muestra "El código no es válido" y no activa.
- [ ] Un código real, escrito en minúsculas y con espacios, activa.
- [ ] Aparece el código de recuperación y no se puede seguir sin marcar "Ya lo guardé".
- [ ] El mismo código de compra en otro teléfono dice "Este código ya se activó".
- [ ] En otro teléfono, **Cambié de celular** + código de recuperación activa (segundo dispositivo).
- [ ] En un tercer teléfono, lo mismo activa y el panel muestra que se liberó el dispositivo más viejo; el viejo, al renovar (Ajustes → Renovar ahora), queda pausado sin perder datos.
- [ ] Revocar desde el panel → en el teléfono, Ajustes → Renovar ahora → la app se pausa, las recetas propias y listas siguen visibles, y el respaldo se puede descargar.
- [ ] Reactivar desde el panel → Renovar ahora → vuelve a funcionar.
- [ ] Modo avión: la app abre, muestra "Sin conexión" y todo funciona.

## Instalación

- [ ] Android: aparece la opción de instalar; el ícono queda en la pantalla de inicio y abre sin barra del navegador.
- [ ] iPhone: Compartir → Agregar a inicio; el ícono se ve bien.
- [ ] Publicar una versión nueva → al abrir aparece "Hay una versión nueva" → Actualizar → los datos siguen ahí.

## Funciones

- [ ] Porciones: 2 adultos → sumar un niño → las cantidades suben menos que con un adulto. Cambiar el apetito cambia las cantidades. Los condimentos no cambian con el apetito.
- [ ] Tocar una cantidad y editarla a mano; "Volver a las cantidades calculadas" la restaura.
- [ ] Menú: agregar comidas a varios días, marcar una cena como "sobras del almuerzo" y verificar que no duplica ingredientes. Duplicar semana.
- [ ] Lista de compras: ingredientes iguales se suman; arroz crudo y arroz cocido aparecen separados; gramos y unidades del mismo alimento no se mezclan; lo "a gusto" aparece aparte.
- [ ] Cargar 200 g de algo en "Lo que ya tengo" → la lista nueva descuenta 200 g; si tengo más de lo necesario, no aparece (nunca cantidades negativas).
- [ ] Marcar productos como comprados → "Pasar lo comprado a Lo que ya tengo".
- [ ] Compartir la lista por WhatsApp.
- [ ] Mis recetas: crear una receta con foto; copiar y editar una del catálogo; la del catálogo no cambia.
- [ ] El mes resuelto: crear un mes, agregar recetas, ver recipientes y heladera/freezer, registrar una tanda cocinada (bajan las que faltan), registrar un envío, armar la lista de lo que falta, compartir las instrucciones.
- [ ] Precios: cargar precios → aparece el costo estimado en Porciones y en la lista; con presupuesto, avisa si te pasás.

## Datos

- [ ] Ajustes → Descargar respaldo; abrir el archivo y verificar que **no** contiene `LCJ-`, `RCP-` ni el texto de la autorización.
- [ ] En otro teléfono activado: Importar → Combinar (suma) y Reemplazar (deja igual al respaldo).
- [ ] Importar un archivo cualquiera que no sea un respaldo → mensaje claro, no cambia nada.
- [ ] Borrar mis datos (escribiendo BORRAR) → quedan vacíos, la app sigue activada.

## Accesibilidad y uso

- [ ] Con letra grande del sistema, nada se corta ni se superpone.
- [ ] Con el lector de pantalla (TalkBack / VoiceOver) se entienden los botones de + y −, y los avisos.
- [ ] Todo se puede usar con una mano en un celular chico.

## Panel

- [ ] Sin estar autorizado en Access, `/admin/` no abre.
- [ ] Generar una tanda, descargar el CSV, buscar un código, ver el detalle, revocar, reactivar, liberar dispositivos, generar código nuevo.
- [ ] Subir y publicar el catálogo; las apps lo reciben al renovar.
