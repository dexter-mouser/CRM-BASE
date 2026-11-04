# Contexto del proyecto Genérico

Documento de traspaso para continuar el trabajo en un chat nuevo. Léelo completo antes de cambiar código.

## Qué es
CRM "Genérico" para tiendas pequeñas: ventas, inventario, clientes, caja, contabilidad, roles y auditoría. Plantilla base que se adapta a cada tienda.

- **Frontend:** JavaScript puro con módulos ES, una página HTML por vista, datos en `localStorage`. Solo `index.html` (ingreso) es pública.
- **Backend y base de datos:** no hay. Se diseñarán de nuevo cuando el frontend esté estable.
- **Ubicación en el PC del usuario:** `C:\VSCODE\crm-tiendas\crm-tiendas` (repositorio git; el commit lo hace el usuario).

## Reglas fijas del usuario
1. Nombres de código (variables, constantes, funciones, clases) en español.
2. Nombres de archivo estándar: `index.html`, `style.css`, `tono.css` (colores y tema). Código limpio, indentado y bien separado por carpetas.
3. Campos numéricos escritos a mano, sin flechas de ±1 (`data-numero="entero"`).
4. Todo cambio aplicado muestra un aviso "… correctamente" (`contexto.aviso`); las advertencias usan `contexto.alerta`.
5. El README describe solo utilidades y funcionamiento, nunca cambios entre versiones.
6. Respuestas breves y precisas, en español.
7. **Graphify obligatorio:** antes de cambiar código se consulta el grafo (`graphify-out/graph.json`) para saber qué funciones, módulos y archivos dependen de lo que se va a tocar, y el cambio cubre todos esos puntos. En la nube: copiar `graph.json` del PC y consultarlo (es JSON: nodos y relaciones). En Claude Code: `graphify query`, `graphify explain`, `graphify path`. Al entregar, el usuario ejecuta `graphify . --update` (o Claude Code lo ejecuta) para que el grafo quede al día.

## Estructura
```
index.html                    Ingreso (única página pública, en la raíz)
paginas/                      Páginas protegidas, una por vista: panel, nueva-venta, ventas, clientes, inventario,
                              caja, contabilidad, pagos, reportes, auditoria, roles, ajustes, seguimiento, embudo,
                              proveedores, tiendas, bodegas, empleados (rutas con ../)
src/
  main.js, main-acceso.js     Arranque (la sesión se exige en main.js)
  config/                     acceso.js, nav.js, permisos.js, routes.js
  core/                       store, plantillas, tema, sesión, validación, formato, router, tienda (tienda activa)
  components/                 cabecera-seccion, ficha-registro, cuadricula-datos, formulario, tabla-resumen, recibo (comprobantes), sidebar, logo, etc.
  modules/<vista>/            <vista>.html + <vista>.js
  services/                   reglas de negocio (ventas, caja, clientes, roles, ...)
  data/seed.js                datos de ejemplo
styles/                       style.css, tono.css (tokens), components.css (componentes comunes), cuadricula.css, ...
docs/                         contexto.md, seguridad.md, validacion.md, extensiones-vscode.md
```

## Contrato de los módulos
- `dibujar(contexto)` devuelve el HTML; `montar(raiz, contexto)` enlaza los eventos.
- `contexto` ofrece `aviso`, `alerta`, `redibujar`, `id`, `etiqueta` y `seccion` (la parte pedida con `?seccion=`).
- Menú: `MENU` (lista plana para permisos, roles y acceso) y `GRUPOS` (6 grupos con sus secciones `{etiqueta, modulo, seccion?, descripcion}`) en `config/nav.js`. Los grupos del menú lateral son botones: tocar uno despliega sus secciones sin navegar (uno abierto a la vez); recogido, se expande temporalmente; en celular las secciones salen en un panel sobre la barra inferior. Una página dividida marca sus partes con `data-seccion`; el router oculta las demás y dibuja las pestañas del grupo. `ACCESOS_PRINCIPALES` alimenta el panel.
- Encabezado: buscador de pantallas (`Ctrl+K`), selector de tienda activa, botón "Vender". En celular (≤800 px) el menú lateral es una barra inferior con los grupos.
- Plantillas: `{{x}}` escapa, `{{{x}}}` inserta HTML, `<!--{{{x}}}-->` dentro de tablas. Funciones: `cargarHtml`, `seccion`, `repetir`, `rellenar`.
- Cuadrícula reutilizable (`components/cuadricula-datos`): columnas `{clave, titulo, ancho, alinear, filtrable, html}`; búsqueda debajo de cada columna; las acciones por fila usan delegación de eventos. Opción `exportar: { modulo, archivo }`: botón "Exportar CSV" si el rol tiene ese permiso (exporta las filas filtradas con las columnas que tienen búsqueda). Las columnas flexibles (fr) no bajan de 120 px por fracción y las de acciones (sin búsqueda, en px) no se encogen.
- Formulario declarativo (`components/formulario`): `montarFormulario(contenedor, { plantillas, clave, titulo, tituloEditar, columnas, campos, incrustado, valores, alGuardar, alError })`; campos `{clave, etiqueta, tipo, opciones, valor, obligatorio, ancho, ayuda, ejemplo, alCambiar}` (tipos texto, entero, entero-negativo, decimal, correo, telefono, fecha, clave, area, seleccion, lista, etiquetas, casilla, casillas). Devuelve `abrir(registro)`, `cerrar()`, `leer()`, `escribir()`, `opciones()`, `habilitar()`, `mostrar()`, `etiquetar()`, `registro()`. Regla: lo habitual se ve escrito al abrir; al guardar no se inventan valores; lo obligatorio lleva asterisco.
- Tabla de resumen (`components/tabla-resumen`): `montarTablaResumen(contenedor, { plantillas, columnas, filas, vacio })` para reportes y panel.
- Selector de registro (`components/selector-registro`): `montarSelectorRegistro(contenedor, { plantillas, clave, etiqueta, columnas, registros, elegido, vacio, alElegir, alSalir })` → `elegido()`, `elegir(id, avisar)`, `habilitar()`, `enfocar()`. Bajo los títulos, una sola fila de casillas de búsqueda (una por columna) cuyo texto de ayuda son los datos del elegido; sin elegido dicen "Buscar" y la columna flexible muestra `vacio` (resultados en línea, no flotantes; en celular cada fila es una tarjeta). Columnas y datos de clientes, proveedores, productos y facturas en `selector-registro/registros.js` (`COLUMNAS_*`, `*ParaElegir(filtro)`). En el formulario: campo `tipo: 'registro'` (`columnas`, `registros`, `plural`, `vacio`); `cargarPlantillasFormulario` ya incluye las plantillas del selector. Regla: ningún `<select>` con listas que crecen (clientes, proveedores, productos, facturas) ni texto libre que se rellena solo.
- CSV de datos maestros: `services/csv.service.js` define `FORMATOS` (productos, clientes, proveedores, empleados, catálogos: columnas, alias y cómo se escribe cada valor), `descargarFormato`, `leerFormato`, `leerSiNo`, `leerLista`, `descargarCsv`. Cada servicio tiene `importarX(filas)` (convierte nombres a códigos, valida todo con `validarFilas` de `core/importacion.js` y aplica todo o nada). `components/importar-csv` (`conectarImportacion`) enlaza los botones `[data-plantilla-csv]` y `[data-importar-csv]` de la cabecera. Permisos `importar` (datos maestros y Ajustes) y `exportar` (módulos con cuadrículas) en `config/permisos.js`.
- Catálogos y parámetros (`services/catalogos.service.js`): `estado.ajustes.catalogos` (`metodosPago` con `tipo` efectivo/credito/otro, `tarifasIva`, `listasPrecio`, `etapasEmbudo`, `motivosPerdida` con `pideDetalle`, `tiposActividad`, `etiquetasCliente`, `tiposDocumento`, `tiposPersona`, `categorias`, `unidades`; cada elemento `{id, nombre, activo}`) y `estado.ajustes.parametros` (`vigenciaCotizacion`, `plazoCredito`, `diasInactividad`, `cortesCartera`, `moneda`, `formato`, `prefijos`). Lectura: `activos`, `nombreDe`, `opcionesDe(clave, actuales)` (incluye los valores desactivados del registro que se edita), `primeroActivo` (el que se ve precargado), `exigirElemento`, `parametro`, `prefijoDe`, `esEfectivo`, `esCredito`, `rangosCartera`. Los registros guardan el código (id); un elemento en uso se desactiva en lugar de eliminarse. `CATALOGOS` define sección de Ajustes, columnas extra, fijos y `usos(id)`. Las opciones de un campo del formulario pueden ser una función `(registro abierto) => [...]`.
- Marca: `estado.ajustes.marca = { nombreComercial, logo (data URL, vacío = el de Genérico), acento }`; `components/logo` la dibuja y `refrescarMarca()` (header) la actualiza. Moneda y formato regional: `aPesos`, `conMoneda('Valor')` y `formatoFecha()` en `core/format.js`.
- Diseño único: `styles/tono.css` (colores y tokens `--espacio-*`, `--radio-*`, `--letra-*`, `--sombra-*`) y `styles/components.css` (todos los componentes comunes). `data-tema` siempre vale `claro` u `oscuro` (tema.js y previo.js resuelven el automático), así el tema oscuro es un solo bloque. Sin estilos en línea en las plantillas.
- Permisos: `puede(modulo, accion)` y `exigirPermiso`, con el rol de `rolActual()` (core/autorizacion.js). El rol Propietario es protegido. "Ver como este rol" (botón en Roles, solo el Propietario): `verComoRol(id)` guarda el rol en `sessionStorage` (`generico.ver-como`, se borra al cerrar sesión) y desde ahí menú, botones, permisos, tareas y alertas usan ese rol; el encabezado muestra una franja con "Volver a mi rol" (`volverAMiRol()`). `esPropietario()` mira el rol propio.
- Cabecera destacada (`components/cabecera-seccion`): la dibuja el router encima de cada módulo con grupo, título (`etiqueta` de la sección) y `descripcion`. Los módulos no ponen `h1`. Botones con `data-accion-cabecera` pasan a la cabecera (solo los de la parte visible). `contexto.cabecera = { titulo, complemento, descripcion }` en `dibujar()` lo cambia (Panel, Caja).
- Patrón de sección (el de Clientes, en todos los módulos): botón de nuevo proceso en la cabecera → formulario del componente `formulario` (clase `panel-proceso`) con Guardar/Cancelar → cuadrícula con **Ficha · Editar · Eliminar** por fila → ficha con botón Editar. Ficha reutilizable: `crearFicha(contenedor, plantillas)` (`components/ficha-registro`), `abrir(id, armar)`, `refrescar()`, `cerrar()`, `idAbierto()`.
- Excepciones del patrón: tiendas, bodegas y empleados usan Desactivar/Retirar en lugar de Eliminar; documentos contables (facturas, remisiones, cotizaciones, notas, compras, pagos, traslados, órdenes, cierres, auditoría) tienen Ficha + acciones propias, sin Editar ni Eliminar. En páginas divididas el router oculta los botones de otras partes: los módulos solo los ocultan por permiso (nunca `hidden = false`).

## Documentos de venta
- **Factura de venta** (F1): descuenta stock y mueve caja o deuda. En efectivo exige caja abierta.
- **Remisión** (R1): descuenta stock sin cobrar; se puede pasar a factura. Lo remitido que no quede en la factura vuelve al stock.
- **Cotización** (C1): vigencia de Ajustes (15 días en la semilla); no toca stock ni dinero; se puede pasar a remisión o a factura.
- Facturas, remisiones y cotizaciones comparten un solo consecutivo (una letra y un número). Al pasar un documento a otro se conserva el número: C5 → R5 → F5.
- Las notas de devolución (ND1) y de anulación (NA1) tienen cada una su propio consecutivo.
- Los IDs de productos son solo números. Ventas, notas y pagos guardan `metodoId` (código del catálogo, para la lógica: `esEfectivo`, `esCredito` por su `tipo`) y `metodo` (el nombre con que se registró, como `cliente` y `clienteId`). La deuda se relaciona con el cliente por su ID. Los prefijos (F, R, C, ND, NA, OC, TR) salen de `prefijoDe()` y solo aplican a los documentos nuevos.
- Pasar a factura: botón "Facturar" en Ventas → `nueva-venta.html?documento=ID`. `registrarVenta` recibe `documentoOrigen`, descuenta solo lo no entregado y marca `facturadaEn`. Una factura nunca vuelve a remisión ni cotización.
- Notas ND-#### (devolución) y NA-#### (anulación), ancladas a la factura por `ventaId`, con consecutivo propio.
- Pago en efectivo: `recibido` y `devuelta` guardados en la factura; en efectivo el recibido debe ser ≥ total.
- Descuentos: cada línea guarda `valorUnitario`, `descuento` (pesos) y `total` (neto con su descuento y su parte del descuento de la venta); el documento guarda `descuentoVenta` y `total`. `leerDescuento(texto, base)` acepta pesos o porcentaje; `calcularLineas(lineas, descuentoVenta)` reparte en proporción (la última línea absorbe el redondeo). `impuestosDe` y la utilidad usan `item.total`. Límite `parametro("descuentoMaximo")` salvo `rolActual().protegido`. Las notas guardan el `total` reembolsado por línea (`valorDeDevolucion`).
- Cliente de la venta: siempre uno registrado, por `clienteId`. Por defecto el **Consumidor final** (`C-000`, `generico: true`, `consumidorFinal()` en clientes.service): no tiene crédito, no se elimina y no aparece en Seguimiento. `armarVenta` recibe `clienteId` (ya no el nombre) y lanza "Elige el cliente de la venta" si falta. Ya no existe "Cliente sin nombre".

## Tiendas, bodegas y empleados
- Datos iniciales (semilla versión 12, sin migraciones mientras no haya producción: `store.js` reemplaza por la semilla lo guardado con otra versión): app recién instalada, sin ejemplos. Trae el usuario U-001 Administrador, T-01 Tienda principal con B-01 Bodega principal (lista `detal`), el cliente C-000 Consumidor final, el producto genérico 99, los roles Propietario, Cajero y Bodeguero y los catálogos (categorías General y Servicios). Ajustes → "Restablecer datos iniciales" (`restablecerDatosIniciales`) vuelve a este estado los datos del negocio, sin tocar tiendas, bodegas, empleados, personas, marca ni recibo.
- Tienda activa en preferencias (`generico.tienda-activa`), `core/tienda.js`: `tiendaActivaId`, `elegirTienda`, `exigirTiendaActiva`, `enTiendaActiva`, `bodegaDeTienda`. `usuario.tiendas` limita el alcance (vacío = todas). "todas" solo consulta: no vende, no mueve caja ni stock.
- Stock por bodega: `producto.stock = {'B-01': n}`; `producto.existencias` es el total. `existenciasVisibles` da el de la bodega activa. Un traslado enviado no cuenta en ninguna bodega hasta recibirlo.
- Caja por tienda (`caja.tiendaId`); ventas, documentos, notas y pagos llevan `tiendaId` (y `bodegaId` los que mueven stock); facturas de compra llevan `bodegaId`.
- Kardex por bodega (`kardexDeProducto(id, bodegaId)`), incluye traslados.

## Acceso de prueba
- Correo: `demo@generico.com` (Propietario, todas las sucursales), el único que muestra el ingreso. Se puede escribir solo la parte anterior a la arroba.
- Usuario `admin` / clave `admin123`.
- Las cuentas están en `CUENTAS_PRUEBA` (`src/config/acceso.js`) y el ingreso las muestra con botón "Copiar".
- Todos los correos de personas terminan en `@generico.com` (`exigirCorreoDeTienda`).

## Estado actual
Hecho y probado en el navegador (escritorio y móvil, sin errores de consola):
- Tipos de documento, notas ND/NA, comprobante ampliado, pago en efectivo con devuelta.
- Atajos de teclado dentro de los botones, vista previa por rol en Roles, enlace a Auditoría.
- Cuadrícula en todos los módulos con datos (Panel y Reportes conservan tablas de resumen).
- Cuentas de prueba en el ingreso y dominio `@generico.com`.
- Funciones de CRM (ficha, seguimiento, embudo, cartera, IVA/kardex, proveedores, indicadores).
- Menú por grupos con pestañas, buscador de pantallas, barra inferior en celular y panel con accesos principales.
- Varias tiendas, bodegas con traslados y empleados con metas y comisiones.
- Menú lateral desplegable sin navegar, cabecera destacada en todas las pantallas y patrón de Clientes (nuevo proceso, Ficha · Editar · Eliminar) en los 6 grupos. Servicios nuevos: `actualizarActividad`, `eliminarProducto` (solo sin historia ni stock). Productos ya no se editan en línea.
- Datos de accesorios para celular, tres precios por producto con listas por tienda y cliente, producto genérico, Registrar venta y Compras en un solo bloque con pasos, y color de marca y por grupo.
- Estandarización fase 1: tokens de diseño en `tono.css` (un solo bloque oscuro), componentes comunes unificados en `components.css` (se fusionó `secciones.css`; `.cabecera-flex`, `.rejilla-campos`, `.panel-proceso`, `.lista-casillas`, indicadores), todos los formularios con `components/formulario` (valores precargados, obligatorios marcados) y tablas de Reportes y Panel con `components/tabla-resumen`.
- Selector de registros en toda la app (venta, compras, órdenes, abonos, pagos, seguimiento, notas, kardex), Consumidor final por defecto y la lista de precio ya no reprecia las líneas agregadas.
- Rediseño aplicado en todas las pantallas: bordes redondeados y divisiones suaves (`--borde-suave`, `--fondo-campo` en `tono.css`), cuadrículas sin líneas verticales y con columnas `minmax` (60 % a 100 % del ancho; `anchoFlexible` en `cuadricula-datos.js`), selector de registro en modo tarjeta cuando su contenedor mide menos de 900 px (consulta de contenedor), documentos (venta y compra) en un solo bloque imprimible sin pasos numerados, con los títulos de las columnas de productos como casillas de búsqueda. Registrar venta: Cliente | Información general, Productos, Método de pago | Resumen, Mensaje personalizado (se guarda en `observaciones` y va al pie del comprobante); lista de precios y botones fuera del documento; monto recibido con texto de ayuda fijo "$ Valor" (vacío = exacto) en lugar de billetes. Nombres estándar de CRM en la interfaz (Sucursal, Código, Medio de pago, Monto recibido, Cambio, Precio unitario, Total línea, Mensaje personalizado, Bodeguero, Usuarios); los nombres internos del código no cambian.
- Estandarización fase 2: catálogos y parámetros que el dueño edita en Ajustes sin código (secciones Marca y moneda, Ventas y documentos, CRM e Inventario), con `catalogos.service.js` y `components/editor-catalogo`. Valores por defecto silenciosos quitados de los servicios (tienda y bodega por defecto, plazo 30, concepto "Pago de facturas", motivo "Otro"); los precargados de los formularios salen de los catálogos y parámetros. Marca (nombre comercial, logo y color) aplicada por `aplicarMarca()` en `tema.js` y por `previo.js` antes de pintar. Semilla versión 10, sin migraciones.
- Los tres precios del producto son obligatorios (mayores que 0; el genérico no tiene precio fijo), "Ver como este rol" en Roles, tirilla de 58 u 80 mm según `ajustes.recibo.anchoTirilla` (Ajustes → Recibo) y semilla sin datos de ejemplo (solo el correo del administrador en el ingreso).
- Descuentos por línea y por venta (pesos o %, con máximo en Ajustes), importar y exportar CSV en toda la app con permisos por rol, y pulido visual (estados de botones y campos, acciones compactas y columnas flexibles con ancho mínimo en las cuadrículas). Semilla versión 12.

## Pendiente
- Backend y base de datos: se diseñarán desde cero cuando termine el rediseño del frontend (sesión en el servidor, permisos repetidos en cada endpoint, multitienda por `tienda_id`, auditoría de solo añadir).
- Pruebas automáticas y temas por cliente: aún no hay carpetas; se crean cuando se implementen.
- Antes de producción: quitar el bloque "Acceso de prueba" del ingreso (hoy solo muestra el correo del administrador).
- Estandarización fase 3 (POS): lector de códigos de barras con campo propio, cajón de dinero y modo táctil (detalle en `src/pos/PENDIENTE.md` cuando se cree).
- Registrar venta y Compras en celular: la cuadrícula de productos tiene `min-width: 640px` y se desplaza en horizontal dentro de su bloque; falta una vista de líneas propia para pantallas angostas.

## Cómo probar
1. Abrir `index.html` con Live Server desde la carpeta del proyecto (o `npm start`).
2. Probar en escritorio (1280 px) y móvil (390 px), sin errores en consola ni desbordes.
3. Si no se ven los cambios: Ctrl+F5 y revisar que el servidor sirva la carpeta correcta.

## Funciones de CRM
- **Clientes:** tipo de documento, tipo de persona y etiquetas (códigos de los catálogos), autorización de datos (Ley 1581), cupo de crédito y plazo. Sin cumpleaños. Ficha con seguimiento, compras, cartera, cotizaciones y remisiones, abonos y devoluciones.
- **Seguimiento:** actividades (tipos del catálogo: llamada, WhatsApp, visita, correo, nota) y tareas (tipo fijo `tarea`) con fecha y responsable.
- **Embudo:** cotización = oportunidad con `etapa` del catálogo (enviada, ganada y perdida fijas; las intermedias las define el dueño; "Pasar a …" lleva a la siguiente activa). Perdida exige un motivo del catálogo (`pideDetalle` obliga a escribir el detalle; una cotización anulada queda perdida sin motivo); la cotización vencida sin cerrar genera una alerta para su vendedor (campana del encabezado; el Propietario ve todas).
- **Cartera:** vencimiento por factura a crédito, cupo por cliente y cartera por edades con los cortes de Ajustes (`rangosCartera()`; abonos aplicados a la factura más antigua).
- **Inventario:** tres precios con IVA incluido (`precioSurtido`, `precioMayor`, `precioDetal`; `LISTAS_PRECIO`, `precioDeLista` en `inventario.service.js`), tarifa de IVA (número; debe estar activa en el catálogo), `categoriaId` y `unidadId` (catálogos), stock mínimo y kardex calculado desde los documentos y los ajustes manuales.
- **Listas de precio:** `tienda.listaPrecio` y `cliente.listaPrecio` (vacío = la de la tienda). En pantalla se nombran solo con su número 1, 2 o 3 (`numero` en `LISTAS_PRECIO`; `etiquetaDeLista` lo devuelve). La venta guarda `listaPrecio`; Registrar venta la toma del cliente o de la tienda. Cambiarla **no reprecia** las líneas ya agregadas: solo aplica a los productos que se agreguen después.
- **Producto genérico** (`generico: true`, ID 99 en la semilla): no maneja stock (`manejaStock`, `moverExistencias` lo ignora), su nombre y valor se escriben en cada línea de venta (`nombreDeLinea` en ventas.service; los demás productos toman el nombre del inventario). Una sola línea por producto en cada documento (las devoluciones se cuentan por `productoId`). No se compra.
- **Registrar venta y Compras:** un solo bloque `documento-registro` con pasos numerados (`styles/documento.css`). Compras usa `buscador-cuadricula` montado sobre el panel (`montarFactura(raiz, contexto, documento, plantillasBuscador)`).
- **Color:** `--acento`/`--marca` índigo y `--grupo-*` por grupo en `tono.css`; `[data-grupo]` (menú, cabecera y `.vista`, que pone el router) define `--color-grupo`.
- **Proveedores:** entidad propia (PV-001) con órdenes de compra (OC-0001) que se reciben con la factura de compra.
- **Reportes:** clientes nuevos y recurrentes, inactivos (más días sin comprar que `parametro("diasInactividad")` de Ajustes), conversión de cotizaciones y ventas por vendedor.

## Mapa del código (Graphify)
- `graphify-out/` (ignorado en Git) tiene el grafo del proyecto: `GRAPH_REPORT.md` (resumen), `graph.json` (grafo consultable) y `graph.html` (mapa interactivo).
- Forma de trabajar: antes de cambiar código se consulta el grafo (qué funciones y módulos toca el cambio); al entregar los archivos, el usuario ejecuta `graphify . --update` para que el grafo incluya los avances.
- Se regenera en el PC con `graphify . --update` (solo archivos cambiados). En la nube se consulta copiando `graph.json` y usando el código fuente de Graphify: `graphify query "<pregunta>"`, `graphify path "A" "B"`, `graphify explain "X"`.
- Núcleo del frontend según el grafo: `guardarEstado`, `exigirPermiso`, `registrarAuditoria`, `buscar`, `repetir`, `aPesos`, `cargarHtml`, `seccion`, `puede`. Cambiar su firma afecta a casi todos los módulos. Sin ciclos de importación.

## Entorno de trabajo
- Copia en la nube: `/home/claude/crm`, servida con `python3 -m http.server 8123` para pruebas con Playwright.
- Los archivos cambiados se copian al PC con `SendUserFile` y `device_commit_files` (máximo 50 por llamada). No se pueden borrar archivos del PC desde la nube: se borran a mano.
- No se puede ejecutar git en el PC.
