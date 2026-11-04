import { buscar } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { aPesos, aFecha } from '../../core/format.js';
import { leerEntero, activarCamposNumericos } from '../../core/numeros.js';
import { icono, ICONO_PAPELERA } from '../../core/iconos.js';
import { puede } from '../../core/autorizacion.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import * as servicioProveedores from '../../services/proveedores.service.js';
import { dibujarSelector, montarSelectorProductos } from '../../components/selector-productos/selector-productos.js';
import { mostrarComprobanteDeOrden } from '../../components/recibo/comprobantes.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { montarSelectorRegistro } from '../../components/selector-registro/selector-registro.js';
import { COLUMNAS_PROVEEDOR, proveedoresParaElegir } from '../../components/selector-registro/registros.js';
import { parametro } from '../../services/catalogos.service.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;

export async function dibujar() {
  documento = await cargarHtml(new URL('./proveedores.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  return seccion(documento, 'principal', {
    selector: await dibujarSelector(),
  });
}

export function montar(raiz, contexto) {
  let porEliminar = null;
  let ordenPorAnular = null;
  buscar('#nuevo-proveedor', raiz).hidden = !puede('proveedores', 'crear');
  buscar('#nueva-orden', raiz).hidden = !puede('proveedores', 'crear');

  const ejecutar = (accion, mensaje) => {
    try {
      const resultado = accion();
      contexto.aviso(mensaje);
      return resultado ?? true;
    } catch (error) {
      contexto.alerta(error.message);
      return false;
    }
  };

  // --- Proveedores -----------------------------------------------------------------------------------------
  const puedeEditar = puede('proveedores', 'editar');
  const botonesEdicion = (id) => (puedeEditar || puede('proveedores', 'eliminar') ? repetir(documento, 'botones-edicion-proveedor', [{ id }]) : '');
  const filasProveedores = () => estado.proveedores.map((proveedor) => ({
    ...proveedor,
    plazo: `${proveedor.plazoDias} días`,
    saldo: aPesos(servicioProveedores.saldoConProveedor(proveedor.id)),
  }));
  const cuadriculaProveedores = montarCuadricula(buscar('#cuadricula-proveedores', raiz), {
    plantillas: plantillasCuadricula,
    titulo: 'Proveedores',
    vacio: 'Aún no hay proveedores. Crea uno con "Nuevo proveedor".',
    columnas: [
      { clave: 'id', titulo: 'Código', ancho: '84px' },
      { clave: 'nombre', titulo: 'Nombre', ancho: 'minmax(0, 1.3fr)' },
      { clave: 'nit', titulo: 'NIT', ancho: '130px' },
      { clave: 'contacto', titulo: 'Contacto', ancho: 'minmax(0, 1fr)' },
      { clave: 'telefono', titulo: 'Teléfono', ancho: '120px' },
      { clave: 'plazo', titulo: 'Plazo', ancho: '84px' },
      { clave: 'saldo', titulo: 'Por pagar', ancho: '112px', alinear: 'derecha' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '270px', filtrable: false, html: (fila) => repetir(documento, 'acciones-proveedor', [{ id: fila.id, edicion: botonesEdicion(fila.id) }]) },
    ],
    filas: filasProveedores(),
  });

  const formulario = montarFormulario(buscar('#formulario-proveedor', raiz), {
    plantillas: plantillasFormulario,
    clave: 'proveedor',
    titulo: 'Nuevo proveedor',
    tituloEditar: (proveedor) => `Editar a ${proveedor.nombre}`,
    textoGuardar: 'Guardar proveedor',
    alError: contexto.alerta,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre o razón social', obligatorio: true },
      { clave: 'nit', etiqueta: 'NIT', ejemplo: '900123456-7' },
      { clave: 'plazoDias', etiqueta: 'Plazo de pago (días)', tipo: 'entero', valor: () => parametro('plazoCredito'), obligatorio: true, ayuda: '0 = de contado' },
      { clave: 'contacto', etiqueta: 'Persona de contacto' },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
      { clave: 'correo', etiqueta: 'Correo', tipo: 'correo' },
    ],
    alGuardar: (datos, proveedor) => {
      const aplicado = ejecutar(
        () => (proveedor ? servicioProveedores.actualizarProveedor(proveedor.id, datos) : servicioProveedores.agregarProveedor(datos)),
        proveedor ? 'Proveedor actualizado correctamente' : 'Proveedor agregado correctamente',
      );
      if (!aplicado) return false;
      contexto.redibujar();
      return true;
    },
  });
  const abrirFormulario = (proveedor) => formulario.abrir(proveedor);
  buscar('#nuevo-proveedor', raiz).onclick = () => abrirFormulario(null);

  // Ficha del proveedor: datos, saldo, facturas de compra, pagos y órdenes
  const fichaProveedor = crearFicha(buscar('#ficha-proveedor', raiz), plantillasFicha);
  const subcuadricula = (contenedor, titulo, vacio, columnas, filas) => montarCuadricula(contenedor, { plantillas: plantillasCuadricula, titulo, vacio, columnas, filas });
  const abrirFichaProveedor = (id) => fichaProveedor.abrir(id, () => {
    const proveedor = servicioProveedores.buscarProveedor(id);
    if (!proveedor) return null;
    const facturas = estado.facturas.filter((factura) => factura.proveedorId === id);
    const pagos = estado.pagos.filter((pago) => pago.tipo === 'proveedor' && pago.terceroId === id);
    const ordenes = estado.ordenesCompra.filter((orden) => orden.proveedorId === id);
    return {
      etiqueta: 'Ficha del proveedor',
      titulo: `${proveedor.nombre} · ${proveedor.id}`,
      subtitulo: [proveedor.nit ? `NIT ${proveedor.nit}` : 'Sin NIT', `Plazo ${proveedor.plazoDias} días`].join(' · '),
      indicadores: [
        { etiqueta: 'Por pagar', valor: aPesos(servicioProveedores.saldoConProveedor(id)), clase: servicioProveedores.saldoConProveedor(id) > 0 ? 'texto-negativo' : '' },
        { etiqueta: 'Total comprado', valor: aPesos(facturas.reduce((suma, factura) => suma + factura.total, 0)) },
        { etiqueta: 'Total pagado', valor: aPesos(pagos.reduce((suma, pago) => suma + pago.valor, 0)) },
        { etiqueta: 'Órdenes abiertas', valor: String(ordenes.filter((orden) => orden.estado === 'abierta').length) },
      ],
      datos: [
        { etiqueta: 'Persona de contacto', valor: proveedor.contacto ?? '' },
        { etiqueta: 'Teléfono', valor: proveedor.telefono ?? '' },
        { etiqueta: 'Correo', valor: proveedor.correo ?? '' },
      ],
      contenido: repetir(documento, 'contenido-ficha-proveedor', [{}]),
      alEditar: puedeEditar ? () => abrirFormulario(servicioProveedores.buscarProveedor(id)) : null,
      alMontar: (seccionFicha) => {
        subcuadricula(seccionFicha.querySelector('[data-facturas]'), 'Facturas de compra', 'Sin facturas de compra.', [
          { clave: 'numero', titulo: 'N°', ancho: '110px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '110px' },
          { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 2fr)' }, { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
        ], facturas.slice().reverse().map((factura) => ({ numero: factura.numero, fecha: factura.fecha, productos: factura.items.map((item) => `${item.nombre} ×${item.cantidad}`).join(', '), total: aPesos(factura.total) })));
        subcuadricula(seccionFicha.querySelector('[data-pagos]'), 'Pagos', 'Sin pagos.', [
          { clave: 'id', titulo: 'N°', ancho: '90px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
          { clave: 'concepto', titulo: 'Concepto', ancho: 'minmax(0, 1.5fr)' }, { clave: 'metodo', titulo: 'Medio de pago', ancho: '110px' },
          { clave: 'valor', titulo: 'Valor', ancho: '112px', alinear: 'derecha' },
        ], pagos.slice().reverse().map((pago) => ({ id: pago.id, fecha: aFecha(pago.fecha), concepto: pago.concepto ?? '', metodo: pago.metodo, valor: aPesos(pago.valor) })));
        subcuadricula(seccionFicha.querySelector('[data-ordenes]'), 'Órdenes de compra', 'Sin órdenes de compra.', [
          { clave: 'id', titulo: 'N°', ancho: '90px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
          { clave: 'estado', titulo: 'Estado', ancho: 'minmax(0, 1fr)' }, { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
        ], ordenes.slice().reverse().map((orden) => ({ id: orden.id, fecha: aFecha(orden.fecha), estado: servicioProveedores.ESTADOS_ORDEN[orden.estado], total: aPesos(orden.total) })));
      },
    };
  });

  buscar('#cuadricula-proveedores', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    const proveedor = servicioProveedores.buscarProveedor(boton.dataset.ficha ?? boton.dataset.editar ?? boton.dataset.eliminar);
    if (!proveedor) return;
    if (boton.dataset.ficha) return abrirFichaProveedor(proveedor.id);
    if (boton.dataset.editar) return abrirFormulario(proveedor);
    porEliminar = proveedor.id;
    buscar('#texto-eliminar', raiz).textContent = `¿Eliminar a ${proveedor.nombre}?`;
    buscar('#confirmar-eliminar', raiz).hidden = false;
    buscar('#confirmar-eliminar', raiz).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  buscar('#eliminar-no', raiz).onclick = () => { buscar('#confirmar-eliminar', raiz).hidden = true; };
  buscar('#eliminar-si', raiz).onclick = () => {
    buscar('#confirmar-eliminar', raiz).hidden = true;
    if (ejecutar(() => servicioProveedores.eliminarProveedor(porEliminar), 'Proveedor eliminado correctamente')) {
      if (fichaProveedor.idAbierto() === porEliminar) fichaProveedor.cerrar();
      cuadriculaProveedores.actualizar(filasProveedores());
    }
  };

  // --- Órdenes de compra -----------------------------------------------------------------------------------
  const lineas = [];
  const cuerpo = buscar('#lineas-orden', raiz);
  const subtotal = (linea) => linea.cantidad * linea.costoUnitario;
  const pintarLineas = () => {
    cuerpo.innerHTML = repetir(documento, 'fila-linea-orden', lineas.map((linea, posicion) => ({
      posicion, id: linea.productoId, nombre: linea.nombre, cantidad: linea.cantidad || '', costoUnitario: linea.costoUnitario || '',
      subtotal: aPesos(subtotal(linea)), icono: icono(ICONO_PAPELERA),
    })));
    activarCamposNumericos(cuerpo);
    buscar('#sin-lineas-orden', raiz).hidden = lineas.length > 0;
    buscar('#total-orden', raiz).textContent = aPesos(lineas.reduce((suma, linea) => suma + subtotal(linea), 0));
  };
  montarSelectorProductos(raiz, {
    alElegir: (producto) => {
      const existente = lineas.find((linea) => linea.productoId === producto.id);
      if (existente) existente.cantidad += 1;
      else lineas.push({ productoId: producto.id, nombre: producto.nombre, cantidad: 1, costoUnitario: producto.costo });
      pintarLineas();
    },
  });
  cuerpo.addEventListener('input', (evento) => {
    const campoLinea = evento.target.closest('[data-campo]');
    if (!campoLinea) return;
    const fila = campoLinea.closest('tr');
    const linea = lineas[Number(fila.dataset.posicion)];
    linea[campoLinea.dataset.campo] = leerEntero(campoLinea.value);
    buscar('[data-subtotal]', fila).textContent = aPesos(subtotal(linea));
    buscar('#total-orden', raiz).textContent = aPesos(lineas.reduce((suma, otra) => suma + subtotal(otra), 0));
  });
  cuerpo.addEventListener('click', (evento) => {
    const quitar = evento.target.closest('[data-quitar]');
    if (!quitar) return;
    lineas.splice(Number(quitar.closest('tr').dataset.posicion), 1);
    pintarLineas();
  });
  const panelOrden = buscar('#panel-orden', raiz);
  const proveedorOrden = montarSelectorRegistro(buscar('#selector-proveedor-orden', raiz), {
    plantillas: plantillasFormulario,
    clave: 'proveedor-orden',
    etiqueta: 'proveedores',
    columnas: COLUMNAS_PROVEEDOR,
    registros: proveedoresParaElegir,
    vacio: 'Elige el proveedor de la orden',
    alSalir: () => buscar('#orden-observaciones', raiz).focus(),
  });
  buscar('#nueva-orden', raiz).onclick = () => {
    if (!estado.proveedores.length) return contexto.alerta('Crea primero un proveedor');
    panelOrden.hidden = false;
    panelOrden.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    proveedorOrden.enfocar();
  };
  buscar('#cancelar-orden', raiz).onclick = () => { panelOrden.hidden = true; };
  buscar('#registrar-orden', raiz).onclick = () => {
    const orden = ejecutar(() => servicioProveedores.registrarOrden({
      proveedorId: proveedorOrden.elegido()?.id ?? '',
      observaciones: buscar('#orden-observaciones', raiz).value,
      lineas,
    }), 'Orden de compra registrada correctamente');
    if (!orden) return;
    contexto.redibujar();
    mostrarComprobanteDeOrden(orden);
  };

  const accionesOrdenAbierta = (orden) => (orden.estado === 'abierta' && puede('inventario', 'crear') ? repetir(documento, 'acciones-orden-abierta', [{ id: orden.id }]) : '');
  montarCuadricula(buscar('#cuadricula-ordenes', raiz), {
    plantillas: plantillasCuadricula,
    titulo: 'Órdenes de compra',
    vacio: 'Aún no hay órdenes de compra.',
    columnas: [
      { clave: 'id', titulo: 'N°', ancho: '90px' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
      { clave: 'proveedor', titulo: 'Proveedor', ancho: 'minmax(0, 1fr)' },
      { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 1.6fr)' },
      { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
      { clave: 'estado', titulo: 'Estado', ancho: '150px' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '370px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: estado.ordenesCompra.slice().reverse().map((orden) => ({
      id: orden.id,
      fecha: aFecha(orden.fecha),
      proveedor: orden.proveedor,
      productos: orden.items.map((item) => `${item.nombre} ×${item.cantidad}`).join(', '),
      total: aPesos(orden.total),
      estado: servicioProveedores.ESTADOS_ORDEN[orden.estado] + (orden.facturaNumero ? ` · factura ${orden.facturaNumero}` : ''),
      acciones: repetir(documento, 'acciones-orden', [{
        id: orden.id,
        abierta: accionesOrdenAbierta(orden),
      }]),
    })),
  });

  // Ficha de la orden: no se edita; se recibe con su factura de compra o se anula
  const fichaOrden = crearFicha(buscar('#ficha-orden', raiz), plantillasFicha);
  const abrirFichaOrden = (id) => fichaOrden.abrir(id, () => {
    const orden = servicioProveedores.buscarOrden(id);
    if (!orden) return null;
    return {
      etiqueta: 'Ficha de la orden de compra',
      titulo: `Orden ${orden.id} · ${orden.proveedor}`,
      subtitulo: servicioProveedores.ESTADOS_ORDEN[orden.estado] + (orden.facturaNumero ? ` · factura ${orden.facturaNumero}` : ''),
      indicadores: [{ etiqueta: 'Total', valor: aPesos(orden.total) }, { etiqueta: 'Unidades', valor: String(orden.items.reduce((suma, item) => suma + item.cantidad, 0)) }],
      datos: [
        { etiqueta: 'Fecha', valor: aFecha(orden.fecha) },
        { etiqueta: 'Registrada por', valor: orden.usuario ?? '' },
        { etiqueta: 'Productos', valor: orden.items.map((item) => `${item.nombre} ×${item.cantidad} a ${aPesos(item.costoUnitario)}`).join(', '), ancho: true },
        { etiqueta: 'Observaciones', valor: orden.observaciones ?? '', ancho: true },
        { etiqueta: 'Motivo de anulación', valor: orden.motivoAnulacion ?? '', ancho: true },
      ],
      acciones: repetir(documento, 'acciones-ficha-orden', [{ id: orden.id, abierta: accionesOrdenAbierta(orden) }]),
    };
  });

  const alTocarOrden = (evento) => {
    const ficha = evento.target.closest('[data-ficha-orden]');
    if (ficha) return abrirFichaOrden(ficha.dataset.fichaOrden);
    const comprobante = evento.target.closest('[data-comprobante-orden]');
    if (comprobante) return mostrarComprobanteDeOrden(servicioProveedores.buscarOrden(comprobante.dataset.comprobanteOrden));
    const anular = evento.target.closest('[data-anular-orden]');
    if (!anular) return;
    ordenPorAnular = anular.dataset.anularOrden;
    buscar('#texto-anular-orden', raiz).textContent = `¿Anular la orden ${ordenPorAnular}?`;
    buscar('#confirmar-anular-orden', raiz).hidden = false;
    buscar('#confirmar-anular-orden', raiz).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    buscar('#motivo-anular-orden', raiz).focus();
  };
  buscar('#cuadricula-ordenes', raiz).addEventListener('click', alTocarOrden);
  buscar('#ficha-orden', raiz).addEventListener('click', alTocarOrden);
  buscar('#anular-orden-no', raiz).onclick = () => { buscar('#confirmar-anular-orden', raiz).hidden = true; };
  buscar('#anular-orden-si', raiz).onclick = () => {
    if (ejecutar(() => servicioProveedores.anularOrden(ordenPorAnular, buscar('#motivo-anular-orden', raiz).value), `Orden ${ordenPorAnular} anulada correctamente`)) contexto.redibujar();
  };

  pintarLineas();
}
