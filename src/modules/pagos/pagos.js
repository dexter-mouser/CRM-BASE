import { buscar } from '../../core/dom.js';
import { puede } from '../../core/autorizacion.js';
import { aPesos, aFecha, conMoneda } from '../../core/format.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { buscarCliente, deudaDeCliente } from '../../services/clientes.service.js';
import { saldoConProveedor } from '../../services/proveedores.service.js';
import * as servicioPagos from '../../services/pagos.service.js';
import { mostrarComprobanteDePago } from '../../components/recibo/comprobantes.js';
import { enTiendaActiva, nombreDeTienda } from '../../core/tienda.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { COLUMNAS_CLIENTE, COLUMNAS_PROVEEDOR, clientesParaElegir, proveedoresParaElegir } from '../../components/selector-registro/registros.js';
import { importarPagos } from '../../services/importacion.service.js';
import { mensajeDeError } from '../../core/errores.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;

// Cada parte de la página muestra sus pagos: abonos de clientes o pagos a proveedores
const TIPO_POR_SECCION = { abonos: 'abono', proveedores: 'proveedor' };

export async function dibujar(contexto) {
  documento = await cargarHtml(new URL('./pagos.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  return seccion(documento, 'principal', {
    tituloHistorial: contexto.seccion === 'proveedores' ? 'Pagos a proveedores' : 'Abonos de clientes',
  });
}

export function montar(raiz, contexto) {
  const tipo = TIPO_POR_SECCION[contexto.seccion] ?? 'abono';
  montarCuadricula(buscar('#cuadricula-pagos', raiz), {
    exportar: { modulo: 'pagos', archivo: 'pagos' },
    importar: { modulo: 'pagos', formato: 'pagos', registros: () => [], importar: importarPagos, alImportar: contexto.redibujar },
    plantillas: plantillasCuadricula,
    titulo: 'Historial de pagos',
    vacio: 'Aún no hay pagos registrados.',
    columnas: [
      { clave: 'id', titulo: 'N°', ancho: '84px' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
      { clave: 'tercero', titulo: tipo === 'abono' ? 'Cliente' : 'Proveedor', ancho: 'minmax(0, 1fr)' },
      { clave: 'concepto', titulo: 'Concepto', ancho: 'minmax(0, 1fr)' },
      { clave: 'metodo', titulo: 'Medio de pago', ancho: '110px' },
      { clave: 'valor', titulo: 'Valor', ancho: '104px', alinear: 'derecha' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '200px', filtrable: false, html: (fila) => repetir(documento, 'accion-pago', [{ id: fila.id }]) },
    ],
    filas: servicioPagos.listarPagos().filter((pago) => enTiendaActiva(pago) && pago.tipo === tipo).reverse().map((pago) => ({
      id: pago.id,
      fecha: aFecha(pago.fecha),
      tercero: pago.tercero,
      concepto: pago.concepto,
      metodo: pago.metodo,
      valor: aPesos(pago.valor),
    })),
  });

  // Ficha del pago (no se edita: mueve caja y deuda)
  const ficha = crearFicha(buscar('#ficha-pago', raiz), plantillasFicha);
  const abrirFicha = (id) => ficha.abrir(id, () => {
    const pago = servicioPagos.buscarPago(id);
    if (!pago) return null;
    const esAbono = pago.tipo === 'abono';
    return {
      etiqueta: esAbono ? 'Ficha del abono' : 'Ficha del pago a proveedor',
      titulo: `${pago.id} · ${pago.tercero}`,
      subtitulo: `${esAbono ? 'Abono de cliente' : 'Pago a proveedor'} · ${pago.metodo}`,
      indicadores: [{ etiqueta: 'Valor', valor: aPesos(pago.valor) }],
      datos: [
        { etiqueta: esAbono ? 'Cliente' : 'Proveedor', valor: `${pago.tercero} · ${pago.terceroId}` },
        { etiqueta: 'Fecha', valor: aFecha(pago.fecha) },
        { etiqueta: 'Medio de pago', valor: pago.metodo },
        { etiqueta: 'Sucursal', valor: pago.tiendaId ? nombreDeTienda(pago.tiendaId) : '' },
        { etiqueta: 'Registró', valor: pago.usuario ?? '' },
        { etiqueta: 'Concepto', valor: pago.concepto ?? '', ancho: true },
      ],
      acciones: repetir(documento, 'comprobante-pago', [{ id: pago.id }]),
    };
  });

  buscar('.vista', raiz).addEventListener('click', (evento) => {
    const fichaBoton = evento.target.closest('[data-ficha]');
    if (fichaBoton) return abrirFicha(fichaBoton.dataset.ficha);
    const boton = evento.target.closest('[data-comprobante]');
    if (boton) mostrarComprobanteDePago(servicioPagos.buscarPago(boton.dataset.comprobante));
  });

  // Tras registrar un pago se abre su comprobante para imprimirlo
  const ejecutar = (accion, mensaje) => {
    try {
      const pago = accion();
      contexto.aviso(mensaje);
      contexto.redibujar();
      mostrarComprobanteDePago(pago);
      return true;
    } catch (error) {
      contexto.alerta(mensajeDeError(error));
      return false;
    }
  };

  // Paneles de proceso: se abren con el botón de la cabecera. Al elegir a quién, el valor se precarga con todo
  // lo pendiente y se cambia si el pago es parcial.
  const opcionesMetodo = () => servicioPagos.metodosDePago();
  const deudores = () => clientesParaElegir((cliente) => deudaDeCliente(cliente) > 0);
  const acreedores = () => proveedoresParaElegir((proveedor) => saldoConProveedor(proveedor.id) > 0);
  const precargarValor = (pendiente) => (id, panel) => {
    const valor = id ? pendiente(id) : 0;
    if (valor) panel.escribir({ valor });
  };

  const panelAbono = montarFormulario(buscar('#panel-abono', raiz), {
    plantillas: plantillasFormulario,
    clave: 'abono',
    titulo: 'Abono de un cliente',
    textoGuardar: 'Registrar abono',
    alError: contexto.alerta,
    campos: [
      {
        clave: 'clienteId', etiqueta: 'Cliente con deuda', tipo: 'registro', obligatorio: true, valor: '', plural: 'clientes con deuda', vacio: 'Elige el cliente que abona',
        columnas: COLUMNAS_CLIENTE, registros: deudores, alCambiar: precargarValor((id) => deudaDeCliente(buscarCliente(id))),
      },
      { clave: 'valor', etiqueta: conMoneda('Valor'), tipo: 'entero', obligatorio: true },
      { clave: 'metodoId', etiqueta: 'Medio de pago', tipo: 'seleccion', opciones: opcionesMetodo, valor: () => opcionesMetodo()[0]?.[0] ?? '', obligatorio: true },
    ],
    alGuardar: (datos) => ejecutar(() => servicioPagos.registrarAbono(datos), 'Abono registrado correctamente'),
  });

  const panelPago = montarFormulario(buscar('#panel-pago', raiz), {
    plantillas: plantillasFormulario,
    clave: 'pago',
    titulo: 'Pago a un proveedor',
    textoGuardar: 'Registrar pago',
    alError: contexto.alerta,
    campos: [
      {
        clave: 'proveedorId', etiqueta: 'Proveedor con saldo pendiente', tipo: 'registro', obligatorio: true, valor: '', plural: 'proveedores con saldo', vacio: 'Elige el proveedor al que se le paga',
        columnas: COLUMNAS_PROVEEDOR, registros: acreedores, alCambiar: precargarValor(saldoConProveedor),
      },
      { clave: 'concepto', etiqueta: 'Concepto', valor: 'Pago de facturas', obligatorio: true },
      { clave: 'valor', etiqueta: conMoneda('Valor'), tipo: 'entero', obligatorio: true },
      { clave: 'metodoId', etiqueta: 'Medio de pago', tipo: 'seleccion', opciones: opcionesMetodo, valor: () => opcionesMetodo()[0]?.[0] ?? '', obligatorio: true },
    ],
    alGuardar: (datos) => ejecutar(() => servicioPagos.registrarPagoProveedor(datos), 'Pago al proveedor registrado correctamente'),
  });

  if (!puede('pagos', 'crear')) ['#nuevo-abono', '#nuevo-pago'].forEach((selector) => { buscar(selector, raiz).hidden = true; });
  buscar('#nuevo-abono', raiz).onclick = () => panelAbono.abrir();
  buscar('#nuevo-pago', raiz).onclick = () => panelPago.abrir();
}
