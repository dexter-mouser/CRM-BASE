# Validación de datos

Todas las reglas viven en un solo archivo, **`src/core/validacion.js`**: JavaScript puro, sin navegador ni almacenamiento. Los servicios del navegador lo usan y se puede ejecutar tal cual en Node (por ejemplo, en pruebas).

| Campo | Regla |
|---|---|
| Texto corto (nombre, proveedor, concepto…) | Sin caracteres de control, espacios recortados, máximo 120 caracteres |
| Texto largo (dirección, mensaje del recibo, descripción) | Máximo 300 caracteres |
| Motivo (devolución, anulación, reapertura) | Obligatorio, de 5 a 200 caracteres |
| Observaciones del documento | Opcional, hasta 300 caracteres |
| Monto recibido (efectivo) | Entero; si se escribe debe cubrir el total; la devuelta es la diferencia. Vacío = valor exacto |
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
| Categoría | Texto opcional, hasta 60 caracteres |
| Precio de venta | Entero ≥ 0, incluye el IVA |
| IVA | 0, 5 o 19 (`TARIFAS_IVA`) |
| Stock mínimo | Entero ≥ 0 |

El IVA incluido de un valor es `valor − valor / (1 + tarifa / 100)`, redondeado al peso.

## Clientes

| Campo | Regla |
|---|---|
| Tipo de documento | `CC`, `NIT`, `CE`, `PAS` o `TI`; obligatorio si hay número |
| Documento | Opcional, 3 a 20 caracteres (números, letras, punto y guion); no se repite con el mismo tipo |
| Tipo de persona | `natural` o `juridica` |
| Etiquetas | Separadas por coma, sin repetir, hasta 10 de 30 caracteres |
| Cupo de crédito | Entero ≥ 0; 0 significa que no se le vende a Crédito |
| Plazo | Entero de 1 a 365 días |
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

Formato `generico-copia-1` con `version`, `fecha`, `huella` (SHA-256 de `datos`) y `datos`. Antes de restaurar se comprueba: formato, versión, huella, que cada sección exista (las copias anteriores a las remisiones y cotizaciones se toman con `documentos` vacío) y que cada registro cumpla `ESQUEMA_DATOS`, que haya ajustes, métodos de pago, rol Propietario y al menos un propietario activo. Solo se copian las claves conocidas.
