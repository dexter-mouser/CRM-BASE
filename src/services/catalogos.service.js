// Catálogos que el dueño edita en Ajustes sin tocar código (medios de pago, IVA, etapas del embudo, categorías…) y
// parámetros del negocio (prefijos, vigencias, plazos, moneda). Los registros guardan el código (id) de cada elemento.
// Reglas comunes:
//  - El primer elemento activo de cada catálogo es el que se ve precargado en los formularios.
//  - Un elemento en uso no se elimina: se desactiva y deja de ofrecerse, pero los registros viejos lo siguen mostrando.
//  - Los elementos fijos (las etapas Enviada, Ganada y Perdida, la actividad Tarea y las tres listas de precio) solo
//    cambian de nombre, porque la lógica depende de ellos.
import { estado, guardarEstado } from '../core/store.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirEntero, exigirTexto } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

// Tipo de cada medio de pago: efectivo entra a la caja, crédito queda como deuda del cliente, otro va al banco
export const TIPOS_METODO = [['efectivo', 'Efectivo'], ['credito', 'Crédito'], ['otro', 'Otro']];
export const ETAPA_INICIAL = 'enviada';
export const ETAPAS_CERRADAS = ['ganada', 'perdida'];
const LARGO_NOMBRE = 40;

const contar = (lista, condicion) => lista.filter(condicion).length;

// Definición de cada catálogo: en qué sección de Ajustes va, columnas extra y cuántos registros usan cada elemento
export const CATALOGOS = {
  metodosPago: {
    titulo: 'Medios de pago', singular: 'medio de pago', seccion: 'ventas',
    extras: [{ clave: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', opciones: TIPOS_METODO, fijoConUso: true }],
    usos: (id) => contar([...estado.ventas, ...estado.devoluciones, ...estado.pagos], (registro) => registro.metodoId === id),
  },
  tarifasIva: {
    titulo: 'Tarifas de IVA', singular: 'tarifa de IVA', seccion: 'ventas',
    codigo: { etiqueta: 'Tarifa (%)', tipo: 'entero' },
    usos: (id) => contar(estado.productos, (producto) => String(producto.iva) === id),
  },
  listasPrecio: {
    titulo: 'Listas de precio', singular: 'lista de precio', seccion: 'ventas', sinAgregar: true,
    fijos: ['surtido', 'mayor', 'detal'],
    usos: (id) => contar([...estado.clientes, ...estado.tiendas], (registro) => registro.listaPrecio === id),
  },
  etapasEmbudo: {
    titulo: 'Etapas del embudo', singular: 'etapa', seccion: 'crm', ordenFijo: true,
    fijos: [ETAPA_INICIAL, ...ETAPAS_CERRADAS],
    usos: (id) => contar(estado.documentos, (documento) => documento.etapa === id),
  },
  motivosPerdida: {
    titulo: 'Motivos de pérdida', singular: 'motivo', seccion: 'crm',
    extras: [{ clave: 'pideDetalle', etiqueta: 'Pide detalle', tipo: 'casilla' }],
    usos: (id) => contar(estado.documentos, (documento) => documento.motivoPerdida === id),
  },
  tiposActividad: {
    titulo: 'Tipos de actividad', singular: 'tipo de actividad', seccion: 'crm', fijos: ['tarea'],
    usos: (id) => contar(estado.actividades, (actividad) => actividad.tipo === id),
  },
  etiquetasCliente: {
    titulo: 'Etiquetas de clientes', singular: 'etiqueta', seccion: 'crm', sinMinimo: true,
    usos: (id) => contar(estado.clientes, (cliente) => cliente.etiquetas.includes(id)),
  },
  tiposDocumento: {
    titulo: 'Tipos de documento', singular: 'tipo de documento', seccion: 'crm',
    codigo: { etiqueta: 'Sigla', tipo: 'sigla' },
    usos: (id) => contar([...estado.clientes, ...estado.empleados], (registro) => registro.tipoDocumento === id),
  },
  tiposPersona: {
    titulo: 'Tipos de persona', singular: 'tipo de persona', seccion: 'crm',
    usos: (id) => contar(estado.clientes, (cliente) => cliente.tipoPersona === id),
  },
  categorias: {
    titulo: 'Categorías', singular: 'categoría', seccion: 'inventario',
    usos: (id) => contar(estado.productos, (producto) => producto.categoriaId === id),
  },
  unidades: {
    titulo: 'Unidades de medida', singular: 'unidad', seccion: 'inventario',
    usos: (id) => contar(estado.productos, (producto) => producto.unidadId === id),
  },
};

// --- Lectura -----------------------------------------------------------------------------------------------
export const elementos = (clave) => estado.ajustes.catalogos[clave];
export const activos = (clave) => elementos(clave).filter((elemento) => elemento.activo);
export const buscarElemento = (clave, id) => elementos(clave).find((elemento) => elemento.id === id);
export const nombreDe = (clave, id) => buscarElemento(clave, id)?.nombre ?? '';
export const estaActivo = (clave, id) => Boolean(buscarElemento(clave, id)?.activo);
export const esFijo = (clave, id) => Boolean(CATALOGOS[clave].fijos?.includes(id));
export const primeroActivo = (clave) => activos(clave)[0]?.id ?? '';

// Opciones de un campo de selección o de casillas: los activos y, al editar, los valores actuales (un código o una
// lista) aunque estén desactivados
export function opcionesDe(clave, actuales = []) {
  const lista = activos(clave);
  const inactivos = [actuales].flat().filter((id) => id && !lista.some((elemento) => elemento.id === id)).map((id) => buscarElemento(clave, id)).filter(Boolean);
  return [...lista, ...inactivos].map((elemento) => [elemento.id, elemento.nombre]);
}

// Exige que el código sea un elemento activo del catálogo (o el que ya tenía el registro, aunque esté desactivado)
export function exigirElemento(clave, id, mensaje, actual = '') {
  if (!id || !(estaActivo(clave, id) || (id === actual && buscarElemento(clave, id)))) throw new Error(mensaje);
  return id;
}

// Código de un elemento activo a partir de su nombre escrito (importación CSV); vacío si no se escribió nada
export function idPorNombre(clave, nombre, etiqueta) {
  const buscado = normalizar(nombre);
  if (!buscado) return '';
  const elemento = activos(clave).find((candidato) => normalizar(candidato.nombre) === buscado);
  if (!elemento) throw new Error(`${etiqueta} «${String(nombre).trim()}» no está activa en ${CATALOGOS[clave].titulo.toLowerCase()} de Ajustes`);
  return elemento.id;
}

// Medios de pago: la lógica decide por el tipo, nunca por el nombre
export const tipoDeMetodo = (id) => buscarElemento('metodosPago', id)?.tipo ?? '';
export const esEfectivo = (id) => tipoDeMetodo(id) === 'efectivo';
export const esCredito = (id) => tipoDeMetodo(id) === 'credito';

// Etapas abiertas del embudo, en su orden: todas menos Ganada y Perdida
export const etapasAbiertas = () => elementos('etapasEmbudo').filter((etapa) => !ETAPAS_CERRADAS.includes(etapa.id));

// --- Parámetros --------------------------------------------------------------------------------------------
export const parametro = (clave) => estado.ajustes.parametros[clave];
export const prefijoDe = (documento) => estado.ajustes.parametros.prefijos[documento];

export const DOCUMENTOS_CON_PREFIJO = {
  factura: 'Factura de venta', remision: 'Remisión', cotizacion: 'Cotización', devolucion: 'Nota de devolución',
  anulacion: 'Nota de anulación', orden: 'Orden de compra', traslado: 'Traslado',
};

// Rangos de la cartera por edades a partir de los cortes en días: [30, 60, 90] -> por vencer, 1-30, 31-60, 61-90, más de 90
export function rangosCartera() {
  const cortes = parametro('cortesCartera');
  return [
    { id: 'corriente', etiqueta: 'Por vencer', hasta: 0 },
    ...cortes.map((corte, posicion) => ({ id: `d${corte}`, etiqueta: `${(cortes[posicion - 1] ?? 0) + 1} a ${corte} días`, hasta: corte })),
    { id: 'mas', etiqueta: `Más de ${cortes.at(-1)} días`, hasta: Infinity },
  ];
}

export const rangoPorDias = (diasVencida) => rangosCartera().find((rango) => diasVencida <= rango.hasta).id;

// --- Edición de catálogos ------------------------------------------------------------------------------------
const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const exigirEdicion = () => exigirPermiso('ajustes', 'editar', 'cambiar los catálogos');

function exigirCatalogo(clave) {
  if (!CATALOGOS[clave]) throw new Error('El catálogo no existe');
  return CATALOGOS[clave];
}

function exigirExistente(clave, id) {
  const elemento = buscarElemento(clave, id);
  if (!elemento) throw new Error('El elemento ya no existe');
  return elemento;
}

function exigirNombreLibre(clave, nombre, idActual = '') {
  const limpio = exigirTexto(nombre, 'el nombre', { maximo: LARGO_NOMBRE });
  const repetido = elementos(clave).find((elemento) => elemento.id !== idActual && normalizar(elemento.nombre) === normalizar(limpio));
  if (repetido) throw new Error(`Ya existe «${repetido.nombre}» en ${CATALOGOS[clave].titulo.toLowerCase()}`);
  return limpio;
}

// Código que escribe la persona (tarifa de IVA o sigla de documento) o uno sacado del nombre
function codigoNuevo(clave, nombre, codigo) {
  const definicion = CATALOGOS[clave].codigo;
  let id;
  if (definicion?.tipo === 'entero') {
    const numero = /^\d+$/.test(String(codigo ?? '').trim()) ? Number(codigo) : NaN;
    id = String(exigirEntero(numero, `la ${definicion.etiqueta.toLowerCase()}`, { minimo: 0, maximo: 100 }));
  }
  else if (definicion?.tipo === 'sigla') {
    id = String(codigo ?? '').trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(id)) throw new Error('La sigla debe tener de 1 a 5 letras sin tildes');
  } else {
    const base = normalizar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'elemento';
    id = base;
    for (let numero = 2; buscarElemento(clave, id); numero += 1) id = `${base}-${numero}`;
  }
  if (buscarElemento(clave, id)) throw new Error(`Ya existe el código ${id}`);
  return id;
}

// Valores de las columnas extra (tipo de medio de pago, si el motivo pide detalle)
function extrasLimpios(clave, datos, elemento = null) {
  const limpios = {};
  for (const extra of CATALOGOS[clave].extras ?? []) {
    if (datos[extra.clave] === undefined) continue;
    if (extra.tipo === 'casilla') {
      limpios[extra.clave] = Boolean(datos[extra.clave]);
      continue;
    }
    if (!extra.opciones.some(([valor]) => valor === datos[extra.clave])) throw new Error(`Elige ${extra.etiqueta.toLowerCase()}`);
    const cambia = elemento && elemento[extra.clave] !== datos[extra.clave];
    if (cambia && extra.fijoConUso && CATALOGOS[clave].usos(elemento.id)) {
      throw new Error(`${elemento.nombre} ya tiene registros: su ${extra.etiqueta.toLowerCase()} no se puede cambiar`);
    }
    limpios[extra.clave] = datos[extra.clave];
  }
  return limpios;
}

// Reglas que debe cumplir cada catálogo después de un cambio
function exigirReglas(clave) {
  if (!CATALOGOS[clave].sinMinimo && !activos(clave).length) throw new Error(`Debe quedar al menos un elemento activo en ${CATALOGOS[clave].titulo.toLowerCase()}`);
  if (clave === 'metodosPago' && !activos(clave).some((metodo) => metodo.tipo !== 'credito')) {
    throw new Error('Debe quedar activo al menos un medio de pago que no sea a crédito');
  }
}

// Aplica un cambio sobre el catálogo: si rompe una regla, queda como estaba
function cambiarCatalogo(clave, cambio, accion, detalle) {
  exigirEdicion();
  exigirCatalogo(clave);
  const anterior = structuredClone(elementos(clave));
  try {
    cambio();
    exigirReglas(clave);
  } catch (error) {
    estado.ajustes.catalogos[clave] = anterior;
    throw error;
  }
  registrarAuditoria('ajustes', `${CATALOGOS[clave].titulo}: ${accion}`, detalle);
  guardarEstado();
}

export function agregarElemento(clave, datos) {
  const catalogo = exigirCatalogo(clave);
  if (catalogo.sinAgregar) throw new Error(`En ${catalogo.titulo.toLowerCase()} solo se cambian los nombres`);
  const nombre = exigirNombreLibre(clave, datos.nombre);
  const id = codigoNuevo(clave, nombre, datos.codigo);
  const vacios = Object.fromEntries((catalogo.extras ?? []).map((extra) => [extra.clave, extra.tipo === 'casilla' ? false : '']));
  const nuevo = { id, nombre, activo: true, ...vacios, ...extrasLimpios(clave, datos) };
  const faltante = (catalogo.extras ?? []).find((extra) => extra.tipo === 'seleccion' && !nuevo[extra.clave]);
  if (faltante) throw new Error(`Elige ${faltante.etiqueta.toLowerCase()}`);
  // Las etapas nuevas van antes de Ganada y Perdida
  const posicion = catalogo.ordenFijo ? elementos(clave).findIndex((elemento) => ETAPAS_CERRADAS.includes(elemento.id)) : elementos(clave).length;
  cambiarCatalogo(clave, () => elementos(clave).splice(posicion, 0, nuevo), 'agregado', nombre);
  return nuevo;
}

export function actualizarElemento(clave, id, datos) {
  const elemento = exigirExistente(clave, id);
  const nombre = datos.nombre === undefined ? elemento.nombre : exigirNombreLibre(clave, datos.nombre, id);
  const extras = extrasLimpios(clave, datos, elemento);
  cambiarCatalogo(clave, () => {
    const actual = buscarElemento(clave, id);
    Object.assign(actual, { nombre }, extras);
  }, 'editado', nombre);
}

// direccion: -1 sube, 1 baja. Las etapas fijas del embudo no se mueven ni se pasan
export function moverElemento(clave, id, direccion) {
  const desde = elementos(clave).findIndex((elemento) => elemento.id === id);
  const hasta = desde + direccion;
  if (desde < 0 || hasta < 0 || hasta >= elementos(clave).length) return;
  if (CATALOGOS[clave].ordenFijo && (esFijo(clave, id) || esFijo(clave, elementos(clave)[hasta].id))) {
    throw new Error('Enviada va primero y Ganada y Perdida van al final: mueve solo las etapas intermedias');
  }
  cambiarCatalogo(clave, () => {
    const lista = elementos(clave);
    [lista[desde], lista[hasta]] = [lista[hasta], lista[desde]];
  }, 'orden cambiado', buscarElemento(clave, id).nombre);
}

export function cambiarActivo(clave, id, activo) {
  const elemento = exigirExistente(clave, id);
  if (esFijo(clave, id)) throw new Error(`${elemento.nombre} es fijo: solo se le puede cambiar el nombre`);
  cambiarCatalogo(clave, () => { buscarElemento(clave, id).activo = Boolean(activo); }, activo ? 'activado' : 'desactivado', elemento.nombre);
}

export function eliminarElemento(clave, id) {
  const elemento = exigirExistente(clave, id);
  if (esFijo(clave, id)) throw new Error(`${elemento.nombre} es fijo: no se elimina`);
  const usos = CATALOGOS[clave].usos(id);
  if (usos) throw new Error(`${elemento.nombre} está en ${usos} registro(s): desactívalo en lugar de eliminarlo`);
  cambiarCatalogo(clave, () => { estado.ajustes.catalogos[clave] = elementos(clave).filter((otro) => otro.id !== id); }, 'eliminado', elemento.nombre);
}

// --- Edición de parámetros -----------------------------------------------------------------------------------
function exigirPrefijo(valor, etiqueta) {
  const limpio = String(valor ?? '').trim().toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(limpio)) throw new Error(`El prefijo de ${etiqueta.toLowerCase()} debe tener de 1 a 4 letras sin tildes`);
  return limpio;
}

// "30, 60, 90" -> [30, 60, 90]: de 1 a 6 cortes en días, de menor a mayor y sin repetir
function exigirCortes(texto) {
  const partes = String(texto ?? '').split(/[,;\s]+/).filter(Boolean);
  const cortes = partes.map((parte) => exigirEntero(/^\d+$/.test(parte) ? Number(parte) : NaN, 'cada corte de cartera', { minimo: 1, maximo: 3650 }));
  if (!cortes.length || cortes.length > 6) throw new Error('Escribe de 1 a 6 cortes de cartera, por ejemplo 30, 60, 90');
  if (cortes.some((corte, posicion) => posicion && corte <= cortes[posicion - 1])) throw new Error('Los cortes de cartera van de menor a mayor y sin repetirse');
  return cortes;
}

function exigirMoneda(moneda, formato) {
  const codigo = String(moneda ?? '').trim().toUpperCase();
  const idioma = String(formato ?? '').trim();
  if (!/^[A-Z]{3}$/.test(codigo)) throw new Error('La moneda es un código de 3 letras, por ejemplo COP o USD');
  try {
    new Intl.NumberFormat(idioma, { style: 'currency', currency: codigo }).format(1);
  } catch {
    throw new Error('El formato regional no es válido; por ejemplo es-CO o es-MX');
  }
  return { moneda: codigo, formato: idioma };
}

// Valida y guarda solo los parámetros recibidos (cada sección de Ajustes envía los suyos)
export function guardarParametros(datos) {
  exigirEdicion();
  const nuevos = structuredClone(estado.ajustes.parametros);
  if (datos.vigenciaCotizacion !== undefined) nuevos.vigenciaCotizacion = exigirEntero(datos.vigenciaCotizacion, 'la vigencia de la cotización', { minimo: 1, maximo: 365 });
  if (datos.plazoCredito !== undefined) nuevos.plazoCredito = exigirEntero(datos.plazoCredito, 'el plazo de pago', { minimo: 0, maximo: 365 });
  if (datos.diasInactividad !== undefined) nuevos.diasInactividad = exigirEntero(datos.diasInactividad, 'los días sin comprar', { minimo: 1, maximo: 3650 });
  if (datos.cortesCartera !== undefined) nuevos.cortesCartera = exigirCortes(datos.cortesCartera);
  if (datos.moneda !== undefined || datos.formato !== undefined) Object.assign(nuevos, exigirMoneda(datos.moneda ?? nuevos.moneda, datos.formato ?? nuevos.formato));
  for (const [documento, etiqueta] of Object.entries(DOCUMENTOS_CON_PREFIJO)) {
    const valor = datos[`prefijo-${documento}`];
    if (valor !== undefined) nuevos.prefijos[documento] = exigirPrefijo(valor, etiqueta);
  }
  const prefijos = Object.values(nuevos.prefijos);
  if (new Set(prefijos).size !== prefijos.length) throw new Error('Cada documento necesita un prefijo distinto');
  estado.ajustes.parametros = nuevos;
  registrarAuditoria('ajustes', 'Parámetros', Object.keys(datos).join(', '));
  guardarEstado();
}
