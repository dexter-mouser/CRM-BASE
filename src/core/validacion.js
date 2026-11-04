// Reglas de validación compartidas. Es JavaScript puro, sin navegador ni almacenamiento: el mismo archivo
// se puede ejecutar en Node y sus reglas están descritas en docs/validacion.md.
// Todas las funciones lanzan un Error con un mensaje en español listo para mostrar.

export const LIMITES = {
  texto: 120,
  textoLargo: 300,
  motivo: 200,
  minimoMotivo: 5,
  valorMaximo: 1_000_000_000,
  archivoMaximoBytes: 10 * 1024 * 1024,
};

export const PATRONES = {
  correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  telefono: /^[\d\s()+-]{7,20}$/,
  codigoProducto: /^\d{1,12}$/,
  fecha: /^\d{4}-\d{2}-\d{2}$/,
};

// Quita caracteres de control y espacios sobrantes
export const limpiarTexto = (valor) => String(valor ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function exigirTexto(valor, etiqueta, { obligatorio = true, maximo = LIMITES.texto, minimo = 0 } = {}) {
  const texto = limpiarTexto(valor);
  if (obligatorio && !texto) throw new Error(`Escribe ${etiqueta}`);
  if (texto && texto.length < minimo) throw new Error(`${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} debe tener al menos ${minimo} caracteres`);
  if (texto.length > maximo) throw new Error(`${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} no puede superar ${maximo} caracteres`);
  return texto;
}

export function exigirEntero(valor, etiqueta, { minimo = 0, maximo = LIMITES.valorMaximo } = {}) {
  if (!Number.isInteger(valor)) throw new Error(`Escribe ${etiqueta} con un número entero`);
  if (valor < minimo) throw new Error(`${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} no puede ser menor que ${minimo}`);
  if (valor > maximo) throw new Error(`${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} es demasiado grande`);
  return valor;
}

export function exigirCorreo(valor, { obligatorio = true } = {}) {
  const correo = limpiarTexto(valor).toLowerCase();
  if (!correo && !obligatorio) return '';
  if (!PATRONES.correo.test(correo) || correo.length > LIMITES.texto) throw new Error('Escribe un correo válido, por ejemplo nombre@tienda.com');
  return correo;
}

// Las personas de la tienda siempre usan correo del dominio de la tienda
export const DOMINIO_CORREO = 'generico.com';

export function exigirCorreoDeTienda(valor) {
  const escrito = limpiarTexto(valor).toLowerCase();
  const correo = escrito && !escrito.includes('@') ? `${escrito}@${DOMINIO_CORREO}` : escrito;
  exigirCorreo(correo);
  if (!correo.endsWith(`@${DOMINIO_CORREO}`)) throw new Error(`El correo debe terminar en @${DOMINIO_CORREO}`);
  return correo;
}

export function exigirTelefono(valor) {
  const telefono = limpiarTexto(valor);
  if (telefono && !PATRONES.telefono.test(telefono)) throw new Error('El teléfono solo puede tener números, espacios, paréntesis, + y -');
  return telefono;
}

export function exigirFecha(valor, etiqueta = 'la fecha') {
  if (!PATRONES.fecha.test(String(valor)) || Number.isNaN(new Date(`${valor}T00:00:00`).getTime())) throw new Error(`Elige ${etiqueta}`);
  return valor;
}

export const exigirMotivo = (valor) => exigirTexto(valor, 'el motivo', { maximo: LIMITES.motivo, minimo: LIMITES.minimoMotivo });

// Datos de un producto del inventario. El ID es solo números y opcional: se genera uno si está vacío.
// Los ceros a la izquierda se quitan para que "007" y "7" sean el mismo producto.
// Tiene tres precios de venta (listas 1, 2 y 3). Un producto genérico no maneja stock: su nombre y su valor se escriben
// en cada venta. La categoría, la unidad y la tarifa de IVA son códigos de los catálogos de Ajustes: el servicio de
// inventario revisa que existan.
export function validarProducto({
  id = '', referencia = '', nombre, categoriaId = '', unidadId = '', costo, precioSurtido = 0, precioMayor = 0, precioDetal = 0,
  iva, stockMinimo = 0, existencias, generico = false,
}) {
  if (!categoriaId) throw new Error('Elige la categoría');
  if (!unidadId) throw new Error('Elige la unidad de medida');
  exigirEntero(iva, 'la tarifa de IVA', { maximo: 100 });
  const esGenerico = generico === true;
  // Los tres precios son obligatorios (mayores que 0); el genérico no tiene precio fijo: se escribe en cada venta
  const precioMinimo = esGenerico ? 0 : 1;
  const enCero = [precioSurtido, precioMayor, precioDetal].findIndex((precio) => precio === 0);
  if (!esGenerico && enCero >= 0) throw new Error(`Escribe el precio ${enCero + 1}: debe ser mayor que 0`);
  const idLimpio = limpiarTexto(id);
  if (idLimpio && !PATRONES.codigoProducto.test(idLimpio)) throw new Error(`El ID "${idLimpio}" solo puede tener números`);
  return {
    id: idLimpio ? String(Number(idLimpio)) : '',
    referencia: exigirTexto(referencia, 'la referencia', { obligatorio: false, maximo: 40 }),
    nombre: exigirTexto(nombre, 'el nombre del producto'),
    categoriaId,
    unidadId,
    costo: exigirEntero(costo, 'el costo'),
    precioSurtido: exigirEntero(precioSurtido, 'el precio 1', { minimo: precioMinimo }),
    precioMayor: exigirEntero(precioMayor, 'el precio 2', { minimo: precioMinimo }),
    precioDetal: exigirEntero(precioDetal, 'el precio 3', { minimo: precioMinimo }),
    iva,
    stockMinimo: esGenerico ? 0 : exigirEntero(stockMinimo, 'el stock mínimo'),
    existencias: esGenerico ? 0 : exigirEntero(existencias, 'el stock', { minimo: -LIMITES.valorMaximo }),
    generico: esGenerico,
  };
}

// --- Clientes ----------------------------------------------------------------------------------------------
// Listas de precio que puede tener un cliente o una tienda (los detalles están en inventario.service.js)
export const LISTAS_PRECIO_VALIDAS = ['surtido', 'mayor', 'detal'];

// Tipo de documento, tipo de persona y etiquetas son códigos de los catálogos de Ajustes: el servicio de clientes
// revisa que existan. Aquí solo se valida su forma.
export function validarCliente(datos) {
  const tipoDocumento = limpiarTexto(datos.tipoDocumento);
  const documento = limpiarTexto(datos.documento);
  if (documento && !/^[0-9A-Za-z.-]{3,20}$/.test(documento)) throw new Error('El documento solo puede tener números, letras, punto y guion');
  if (documento && !tipoDocumento) throw new Error('Elige el tipo de documento');
  if (tipoDocumento && !documento) throw new Error('Escribe el número de documento o elige «Sin documento»');
  const etiquetas = Array.isArray(datos.etiquetas) ? [...new Set(datos.etiquetas.map(limpiarTexto).filter(Boolean))] : [];
  if (!limpiarTexto(datos.tipoPersona)) throw new Error('Elige el tipo de persona');
  return {
    nombre: exigirTexto(datos.nombre, 'el nombre del cliente'),
    tipoDocumento,
    documento,
    tipoPersona: limpiarTexto(datos.tipoPersona),
    telefono: exigirTelefono(datos.telefono),
    correo: exigirCorreo(datos.correo, { obligatorio: false }),
    direccion: exigirTexto(datos.direccion, 'la dirección', { obligatorio: false, maximo: LIMITES.textoLargo }),
    etiquetas,
    autorizaDatos: Boolean(datos.autorizaDatos),
    limiteCredito: exigirEntero(datos.limiteCredito, 'el cupo de crédito'),
    plazoDias: exigirEntero(datos.plazoDias, 'el plazo', { minimo: 1, maximo: 365 }),
    // Lista de precio con la que se le vende; vacío = la de la tienda donde compra
    listaPrecio: LISTAS_PRECIO_VALIDAS.includes(datos.listaPrecio) ? datos.listaPrecio : '',
  };
}

// Proveedor: nombre obligatorio, NIT y contacto opcionales
export function validarProveedor(datos) {
  return {
    nombre: exigirTexto(datos.nombre, 'el nombre del proveedor'),
    nit: exigirTexto(datos.nit, 'el NIT', { obligatorio: false, maximo: 30 }),
    telefono: exigirTelefono(datos.telefono),
    correo: exigirCorreo(datos.correo, { obligatorio: false }),
    contacto: exigirTexto(datos.contacto, 'el contacto', { obligatorio: false }),
    plazoDias: exigirEntero(datos.plazoDias, 'el plazo de pago', { minimo: 0, maximo: 365 }),
  };
}

// Líneas de venta o factura: cantidad entera ≥ 1 y valor entero > 0
export function validarLineas(lineas, campoValor, etiquetaValor) {
  if (!lineas.length) throw new Error('Agrega al menos un producto');
  for (const linea of lineas) {
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) throw new Error(`La cantidad de ${linea.nombre} debe ser al menos 1`);
    if (!Number.isInteger(linea[campoValor]) || linea[campoValor] < 1) throw new Error(`Escribe ${etiquetaValor} de ${linea.nombre}`);
    if (linea.cantidad > LIMITES.valorMaximo || linea[campoValor] > LIMITES.valorMaximo) throw new Error(`Los valores de ${linea.nombre} son demasiado grandes`);
  }
}

// --- Esquema de la copia de seguridad -------------------------------------------------------------------
// Tipos: texto, textoOpcional, entero, enteroNoNegativo, fecha, booleano, objeto, lista:<esquema>
const ESQUEMA_ITEM_VENTA = { productoId: 'texto', nombre: 'texto', cantidad: 'enteroNoNegativo', valorUnitario: 'enteroNoNegativo', total: 'enteroNoNegativo' };

export const ESQUEMA_DATOS = {
  productos: { id: 'texto', referencia: 'textoOpcional', nombre: 'texto', categoriaId: 'texto', unidadId: 'texto', costo: 'enteroNoNegativo', existencias: 'entero' },
  ventas: { id: 'texto', fecha: 'fecha', cliente: 'texto', metodoId: 'texto', metodo: 'texto', descuentoVenta: 'enteroNoNegativo', total: 'enteroNoNegativo', items: ['lista', ESQUEMA_ITEM_VENTA] },
  facturas: { numero: 'texto', proveedor: 'texto', fecha: 'texto', total: 'enteroNoNegativo', items: ['lista', { productoId: 'texto', nombre: 'texto', cantidad: 'enteroNoNegativo', costoUnitario: 'enteroNoNegativo' }] },
  clientes: { id: 'texto', nombre: 'texto', telefono: 'textoOpcional', correo: 'textoOpcional', direccion: 'textoOpcional' },
  pagos: { id: 'texto', fecha: 'fecha', tipo: 'texto', tercero: 'texto', metodoId: 'texto', metodo: 'texto', valor: 'enteroNoNegativo' },
  documentos: { id: 'texto', tipo: 'texto', fecha: 'fecha', cliente: 'texto', descuentoVenta: 'enteroNoNegativo', total: 'enteroNoNegativo', items: ['lista', ESQUEMA_ITEM_VENTA] },
  devoluciones: { id: 'texto', ventaId: 'texto', fecha: 'fecha', tipo: 'texto', motivo: 'texto', metodoId: 'texto', metodo: 'texto', total: 'enteroNoNegativo', items: ['lista', ESQUEMA_ITEM_VENTA] },
  cajas: { id: 'texto', apertura: 'fecha', base: 'enteroNoNegativo' },
  movimientosCaja: { id: 'texto', cajaId: 'texto', fecha: 'fecha', tipo: 'texto', concepto: 'texto', valor: 'enteroNoNegativo' },
  contabilidad: { dia: 'texto', cerradoEn: 'fecha' },
  auditoria: { id: 'texto', fecha: 'fecha', usuario: 'texto', modulo: 'texto', accion: 'texto', detalle: 'textoOpcional' },
  actividades: { id: 'texto', clienteId: 'texto', tipo: 'texto', descripcion: 'texto', fecha: 'fecha', completada: 'booleano' },
  proveedores: { id: 'texto', nombre: 'texto' },
  ordenesCompra: { id: 'texto', proveedorId: 'texto', fecha: 'fecha', estado: 'texto', items: ['lista', { productoId: 'texto', nombre: 'texto', cantidad: 'enteroNoNegativo', costoUnitario: 'enteroNoNegativo' }] },
  ajustesInventario: { id: 'texto', fecha: 'fecha', productoId: 'texto', cantidad: 'entero', motivo: 'texto' },
  tiendas: { id: 'texto', nombre: 'texto', activa: 'booleano' },
  bodegas: { id: 'texto', nombre: 'texto', activa: 'booleano' },
  traslados: { id: 'texto', fecha: 'fecha', origenId: 'texto', destinoId: 'texto', estado: 'texto', items: ['lista', { productoId: 'texto', nombre: 'texto', cantidad: 'enteroNoNegativo' }] },
  empleados: { id: 'texto', nombre: 'texto', documento: 'texto', cargo: 'texto', tiendaId: 'texto', activo: 'booleano' },
  roles: { id: 'texto', nombre: 'texto', protegido: 'booleano', permisos: 'objeto' },
  usuarios: { id: 'texto', nombre: 'texto', correo: 'texto', rolId: 'texto', activo: 'booleano' },
};

const TIPOS = {
  texto: (valor) => typeof valor === 'string' && valor.length > 0 && valor.length <= LIMITES.textoLargo * 4,
  textoOpcional: (valor) => valor === undefined || (typeof valor === 'string' && valor.length <= LIMITES.textoLargo * 4),
  entero: (valor) => Number.isInteger(valor) && Math.abs(valor) <= LIMITES.valorMaximo,
  enteroNoNegativo: (valor) => Number.isInteger(valor) && valor >= 0 && valor <= LIMITES.valorMaximo,
  fecha: (valor) => typeof valor === 'string' && !Number.isNaN(new Date(valor).getTime()),
  booleano: (valor) => typeof valor === 'boolean',
  objeto: (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor),
};

function validarRegistro(registro, esquema, ruta) {
  if (!TIPOS.objeto(registro)) throw new Error(`${ruta}: no es un registro válido`);
  for (const [campo, tipo] of Object.entries(esquema)) {
    if (Array.isArray(tipo)) {
      if (!Array.isArray(registro[campo])) throw new Error(`${ruta}: falta la lista "${campo}"`);
      registro[campo].forEach((hijo, posicion) => validarRegistro(hijo, tipo[1], `${ruta}.${campo}[${posicion + 1}]`));
    } else if (!TIPOS[tipo](registro[campo])) {
      throw new Error(`${ruta}: el campo "${campo}" no es válido`);
    }
  }
}

// Valida toda la estructura de datos de la aplicación (copia de seguridad) y devuelve el conteo por sección
export function validarDatos(datos) {
  if (!TIPOS.objeto(datos)) throw new Error('El archivo no contiene datos de la aplicación');
  const conteo = {};
  for (const [seccion, esquema] of Object.entries(ESQUEMA_DATOS)) {
    const lista = datos[seccion];
    if (!Array.isArray(lista)) throw new Error(`Falta la sección "${seccion}"`);
    lista.forEach((registro, posicion) => validarRegistro(registro, esquema, `${seccion}[${posicion + 1}]`));
    conteo[seccion] = lista.length;
  }
  const secciones = ['tienda', 'marca', 'ventas', 'recibo', 'parametros', 'catalogos'];
  if (!TIPOS.objeto(datos.ajustes) || secciones.some((seccion) => !TIPOS.objeto(datos.ajustes[seccion]))) {
    throw new Error('Faltan los ajustes de la tienda');
  }
  const catalogos = Object.values(datos.ajustes.catalogos);
  if (!catalogos.length || catalogos.some((lista) => !Array.isArray(lista) || lista.some((elemento) => !TIPOS.texto(elemento?.id) || !TIPOS.texto(elemento?.nombre)))) {
    throw new Error('Los catálogos de los ajustes no son válidos');
  }
  if (!Array.isArray(datos.orden)) throw new Error('Falta el orden del panel');
  if (!datos.roles.some((rol) => rol.protegido)) throw new Error('Debe existir el rol Propietario');
  if (!datos.usuarios.some((usuario) => usuario.activo && datos.roles.some((rol) => rol.id === usuario.rolId && rol.protegido))) {
    throw new Error('Debe quedar al menos un propietario activo');
  }
  return conteo;
}
