# Validación de datos

Todas las reglas viven en un solo archivo, **`src/core/validacion.js`**: JavaScript puro, sin navegador ni almacenamiento. Los servicios del navegador lo usan y se puede ejecutar tal cual en Node (por ejemplo, en pruebas).

| Campo | Regla |
|---|---|
| Texto corto (nombre, proveedor, concepto…) | Sin caracteres de control, espacios recortados, máximo 120 caracteres |
| Texto largo (dirección, mensaje del recibo, descripción) | Máximo 300 caracteres |
| Motivo (devolución, anulación, reapertura) | Obligatorio, de 5 a 200 caracteres |
| Observaciones del documento | Opcional, hasta 300 caracteres |
| Monto recibido (efectivo) | Entero; si se escribe debe cubrir el total; la devuelta es la diferencia. Vacío = valor exacto |
| Descuento de línea y de la venta | En pesos ("5000", "$ 5.000") o en porcentaje ("10%"); entero ≥ 0 que no supera el valor de la línea o de la venta. El total descontado no supera el descuento máximo de Ajustes (0 a 100 %), salvo para el Propietario. El IVA se calcula sobre el valor descontado |
| Devolución con descuento | Reembolsa la parte del total de la línea de esas unidades; al devolver las últimas, exactamente lo que queda de la línea |
| Tipo de documento | `factura`, `remision` o `cotizacion`; solo la factura admite método de pago y monto recibido |
| Valores en pesos y cantidades | Enteros; máximo 1 000 000 000; el costo, el valor y la cantidad son mayores que 0 donde se pide un valor |
| Stock | Entero (admite negativos) |
| Correo | `^[^\s@]+@[^\s@]+\.[^\s@]+$`, máximo 120 caracteres |
| Teléfono | `^[\d\s()+-]{7,20}$` |
| ID de producto | Solo números: `^\d{1,12}$`, sin ceros a la izquierda (si se deja vacío, se genera el siguiente: el mayor más uno) |
| Fecha | `AAAA-MM-DD` válida |
| Archivos (CSV y copia) | Máximo 10 MB; CSV de hasta 5000 filas |

## Importación de inventario (CSV)

Se valida **toda** la tabla antes de cambiar nada. Si una fila falla, no se importa ninguna y el mensaje indica la fila (`Fila 3: …`). No se aceptan IDs repetidos dentro del archivo ni valores no enteros en costo o stock.

## Productos (campos del CRM)

| Campo | Regla |
|---|---|
| Categoría y unidad | Código obligatorio de un elemento activo de su catálogo en Ajustes (al editar se acepta el que ya tenía) |
| Precios de venta (1, 2 y 3) | Enteros mayores que 0, incluyen el IVA; obligatorios salvo en el producto genérico |
| IVA | Una tarifa activa del catálogo de Ajustes (19, 5 o 0 en la semilla) |
| Stock mínimo | Entero ≥ 0 |

El IVA incluido de un valor es `valor − valor / (1 + tarifa / 100)`, redondeado al peso.

## Clientes

| Campo | Regla |
|---|---|
| Tipo de documento | Sigla activa del catálogo (CC, NIT, CE, PAS, TI en la semilla); obligatorio si hay número y el número es obligatorio si hay tipo |
| Documento | Opcional, 3 a 20 caracteres (números, letras, punto y guion); no se repite con el mismo tipo |
| Tipo de persona | Obligatorio; elemento activo del catálogo |
| Etiquetas | Casillas con las etiquetas activas del catálogo, sin repetir |
| Cupo de crédito | Entero ≥ 0; 0 significa que no se le vende a Crédito |
| Plazo | Entero de 1 a 365 días, obligatorio (viene escrito el plazo de Ajustes) |
| Autorización de datos | Sí o no (Ley 1581 de 2012) |

Una venta a Crédito exige cliente registrado con cupo y no puede superar `cupo − deuda`. Vence en `fecha + plazo`.

## Seguimiento, embudo y proveedores

- Actividad: cliente y tipo (`llamada`, `whatsapp`, `visita`, `correo`, `nota`, `tarea`) obligatorios; descripción hasta 300 caracteres. Una tarea exige fecha (no anterior a hoy) y responsable activo.
- Oportunidad perdida: motivo de la lista (`MOTIVOS_PERDIDA`) y detalle hasta 200 caracteres, obligatorio si el motivo es "Otro". Solo se mueven o pierden cotizaciones abiertas (enviada o en negociación).
- Proveedor: nombre obligatorio y único; NIT opcional y único; plazo de 0 a 365 días.
- Orden de compra: proveedor existente y líneas con cantidad y costo enteros ≥ 1. Solo una orden abierta se recibe o se anula (con motivo de al menos 5 caracteres).

## Tiendas, bodegas, traslados y empleados

- Tienda: nombre obligatorio (hasta 60) y único; teléfono válido si se escribe; bodega activa (al editar es obligatoria). Siempre queda una tienda activa y no se desactiva una con caja abierta.
- Bodega: nombre obligatorio y único; tienda opcional. No se desactiva con stock, con traslados por recibir ni si es la bodega de una tienda activa.
- Traslado: origen y destino activos y distintos, al menos una línea, cantidades enteras ≥ 1 y no mayores que el stock del origen. Solo un traslado en tránsito se recibe o se anula (con motivo).
- Empleado: nombre, documento (3 a 20 caracteres, único por tipo), cargo, tienda y fecha de ingreso obligatorios; meta entera ≥ 0; comisión de 0 a 50 %; un usuario no se asigna a dos empleados; con usuario, al menos una tienda de acceso. No se retira al único propietario activo.
- Tienda activa: vender, cobrar en efectivo, mover caja o editar stock exige una tienda elegida (no "Todas las tiendas") a la que el usuario tenga acceso.

## Copia de seguridad (JSON)

Formato `generico-copia-1` con `version`, `fecha`, `huella` (SHA-256 de `datos`) y `datos`. Antes de restaurar se comprueba: formato, versión, huella, que cada sección exista y que cada registro cumpla `ESQUEMA_DATOS`, que haya ajustes (negocio, marca, ventas, recibo, parámetros y catálogos, cada elemento con código y nombre), rol Propietario y al menos un propietario activo. Solo se copian las claves conocidas.

## Catálogos y parámetros (Ajustes)

| Dato | Regla |
|---|---|
| Nombre de un elemento | Obligatorio, hasta 40 caracteres, sin repetirse en su catálogo (sin tildes ni mayúsculas) |
| Código | Sale del nombre; en tarifas de IVA es la tarifa (entero de 0 a 100) y en tipos de documento la sigla (1 a 5 letras) |
| Elemento en uso | No se elimina: se desactiva. El tipo de un medio de pago con registros no cambia |
| Elementos fijos | Etapas Enviada, Ganada y Perdida, actividad Tarea y las tres listas de precio: solo cambian de nombre |
| Mínimo | Cada catálogo (menos etiquetas) conserva un elemento activo; medios de pago, uno activo que no sea crédito |
| Prefijos | 1 a 4 letras sin tildes, distintos entre sí; solo aplican a los documentos nuevos |
| Vigencia de cotización | Entero de 1 a 365 días |
| Plazo de pago por defecto | Entero de 0 a 365 días |
| Días sin comprar (inactivo) | Entero de 1 a 3650 |
| Cortes de cartera | De 1 a 6 enteros en días, de menor a mayor y sin repetir |
| Moneda y formato | Código de 3 letras (COP, USD) y un formato regional válido (es-CO) |
| Marca | Nombre comercial hasta 40 caracteres, color `#rrggbb` y logo PNG, JPG, WEBP o SVG de hasta 200 KB (vacío = el de Genérico) |
| Ancho de la tirilla | 80 o 58 mm |

## Importación CSV

| Regla | Detalle |
|---|---|
| Todo o nada | Se validan todas las filas antes de cambiar nada; si alguna falla no se importa ninguna y el aviso lista las primeras filas con problema |
| Tamaño | Hasta 10 MB y 5000 filas |
| Código | Con el código de un registro existente lo actualiza; un código que no existe es un error (para crear se deja vacío). En productos, un ID nuevo crea el producto con ese ID |
| Columnas ausentes | El registro existente conserva su valor; para un registro nuevo valen las mismas reglas de obligatorios del formulario |
| Repetidos en el archivo | Nombre, documento o NIT repetidos dentro del mismo archivo son un error |
| Catálogos | Nombres de catálogo (tipo de persona, etiquetas, categoría, unidad) deben existir y estar activos; la sucursal del empleado se escribe con su nombre |
| Permisos | Importar exige el permiso "Importar CSV" del módulo; la plantilla también. Exportar exige "Exportar CSV" |
