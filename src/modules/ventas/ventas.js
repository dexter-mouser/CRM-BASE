import { estado } from '../../core/store.js';
import { aPesos, aFecha } from '../../core/format.js';
import { leerEntero, activarCamposNumericos } from '../../core/numeros.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { buscar } from '../../core/dom.js';
import { puede } from '../../core/autorizacion.js';
import * as servicioVentas from '../../services/ventas.service.js';
import { mostrarReciboDeVenta, mostrarComprobanteDeDevolucion } from '../../components/recibo/comprobantes.js';
import { enTiendaActiva } from '../../core/tienda.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { nombreDeTienda } from '../../core/tienda.js';
import { etiquetaDeLista } from '../../services/inventario.service.js';
import { cargarPlantillasSelector, montarSelectorRegistro } from '../../components/selector-registro/selector-registro.js';
import { COLUMNAS_FACTURA, facturasParaElegir } from '../../components/selector-registro/registros.js';
import { esEfectivo } from '../../services/catalogos.service.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasSelector;

function estadoDeFactura(venta) {
  if (servicioVentas.estaAnulada(venta)) return { texto: 'Anulada', clase: '' };
  if (servicioVentas.devolucionesDeVenta(venta.id).length) return { texto: 'Con devolución', clase: 'suave' };
  return { texto: 'Activa', clase: 'suave' };
}

function estadoDeDocumento(registro) {
  if (registro.anulado) return 'Anulado';
  return registro.convertidoEn ? `Pasado a ${registro.convertidoEn}` : 'Pendiente';
}

const insignia = (texto, clase) => repetir(documento, 'insignia', [{ texto, clase }]);
const etiquetaDe = (tipo) => servicioVentas.TIPOS_DOCUMENTO[tipo].etiqueta;

// Facturas de la sucursal activa a las que aún se les puede hacer una nota
const facturasConPendientes = () => estado.ventas.filter(enTiendaActiva).reverse()
  .filter((venta) => !servicioVentas.estaAnulada(venta) && servicioVentas.pendientesDeDevolver(venta).length > 0);

export async function dibujar() {
  documento = await cargarHtml(new URL('./ventas.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasSelector] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasSelector(),
  ]);
  return seccion(documento, 'principal');
}

export function montar(raiz, contexto) {
  const zona = buscar('#zona-devolucion', raiz);
  const puedeAnular = puede('ventas', 'eliminar');

  const accionesFactura = (venta) => (puedeAnular && servicioVentas.pendientesDeDevolver(venta).length > 0 && !servicioVentas.estaAnulada(venta)
    ? repetir(documento, 'acciones-venta', [{ id: venta.id }]) : '');
  const accionesDocumento = (registro) => {
    const pasarARemision = servicioVentas.DESTINOS_POSIBLES[registro.tipo].includes('remision')
      ? repetir(documento, 'accion-pasar-remision', [{ id: registro.id }]) : '';
    return servicioVentas.documentoPendiente(registro) && puede('nueva-venta', 'crear')
      ? repetir(documento, 'acciones-documento-pendiente', [{ id: registro.id, pasarARemision }]) : '';
  };
  if (!puede('nueva-venta', 'crear')) ['#nueva-factura', '#nueva-remision', '#nueva-cotizacion'].forEach((selector) => { buscar(selector, raiz).hidden = true; });
  if (!puedeAnular) buscar('#nueva-nota', raiz).hidden = true;

  const filasFacturas = () => estado.ventas.filter(enTiendaActiva).reverse().map((venta) => {
    const situacion = estadoDeFactura(venta);
    const acciones = accionesFactura(venta);
    return {
      id: venta.id,
      fecha: aFecha(venta.fecha),
      cliente: venta.cliente,
      productos: servicioVentas.resumirItems(venta),
      metodo: venta.metodo,
      total: aPesos(venta.total),
      estado: situacion.texto,
      insignia: insignia(situacion.texto, situacion.clase),
      acciones: repetir(documento, 'acciones-factura', [{ id: venta.id, acciones }]),
    };
  });

  const filasDocumentos = () => estado.documentos.filter(enTiendaActiva).reverse().map((registro) => {
    const acciones = accionesDocumento(registro);
    return {
      id: registro.id,
      tipo: etiquetaDe(registro.tipo),
      fecha: aFecha(registro.fecha),
      cliente: registro.cliente,
      productos: servicioVentas.resumirItems(registro),
      total: aPesos(registro.total),
      estado: estadoDeDocumento(registro),
      acciones: repetir(documento, 'acciones-documento', [{ id: registro.id, acciones }]),
    };
  });

  const filasNotas = () => estado.devoluciones.filter(enTiendaActiva).reverse().map((nota) => ({
    id: nota.id,
    fecha: aFecha(nota.fecha),
    ventaId: nota.ventaId,
    tipo: servicioVentas.ETIQUETA_NOTA[nota.tipo],
    productos: servicioVentas.resumirItems(nota),
    motivo: nota.motivo,
    usuario: nota.usuario,
    total: aPesos(nota.total),
    acciones: repetir(documento, 'acciones-nota', [{ id: nota.id, ventaId: nota.ventaId }]),
  }));

  montarCuadricula(buscar('#cuadricula-facturas', raiz), {
    exportar: { modulo: 'ventas', archivo: 'facturas' },
    plantillas: plantillasCuadricula,
    titulo: 'Facturas de venta',
    vacio: 'Aún no hay facturas de venta.',
    columnas: [
      { clave: 'id', titulo: 'N°', ancho: '84px' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
      { clave: 'cliente', titulo: 'Cliente', ancho: 'minmax(0, 1fr)' },
      { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 1.6fr)' },
      { clave: 'metodo', titulo: 'Pago', ancho: '104px' },
      { clave: 'total', titulo: 'Total', ancho: '104px', alinear: 'derecha' },
      { clave: 'estado', titulo: 'Estado', ancho: '124px', html: (fila) => fila.insignia },
      { clave: 'acciones', titulo: 'Acciones', ancho: '330px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: filasFacturas(),
  });

  montarCuadricula(buscar('#cuadricula-documentos', raiz), {
    exportar: { modulo: 'ventas', archivo: 'remisiones-y-cotizaciones' },
    plantillas: plantillasCuadricula,
    titulo: 'Remisiones y cotizaciones',
    vacio: 'Aún no hay remisiones ni cotizaciones. Créalas en Registrar venta eligiendo el documento.',
    columnas: [
      { clave: 'id', titulo: 'N°', ancho: '96px' },
      { clave: 'tipo', titulo: 'Documento', ancho: '104px' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
      { clave: 'cliente', titulo: 'Cliente', ancho: 'minmax(0, 1fr)' },
      { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 1.6fr)' },
      { clave: 'total', titulo: 'Total', ancho: '104px', alinear: 'derecha' },
      { clave: 'estado', titulo: 'Estado', ancho: '140px' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '360px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: filasDocumentos(),
  });

  montarCuadricula(buscar('#cuadricula-notas', raiz), {
    exportar: { modulo: 'ventas', archivo: 'notas' },
    plantillas: plantillasCuadricula,
    titulo: 'Notas de devolución y de anulación',
    vacio: 'Aún no hay notas de devolución ni de anulación.',
    columnas: [
      { clave: 'id', titulo: 'N° de nota', ancho: '96px' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
      { clave: 'ventaId', titulo: 'Factura', ancho: '84px' },
      { clave: 'tipo', titulo: 'Tipo', ancho: '140px' },
      { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 1.4fr)' },
      { clave: 'motivo', titulo: 'Motivo', ancho: 'minmax(0, 1fr)' },
      { clave: 'usuario', titulo: 'Registró', ancho: '110px' },
      { clave: 'total', titulo: 'Total', ancho: '104px', alinear: 'derecha' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '280px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: filasNotas(),
  });

  // --- Fichas: facturas, remisiones y cotizaciones, y notas (no se editan: son documentos contables) ---------
  const cuadriculaItems = (contenedor, registro) => montarCuadricula(contenedor, {
    plantillas: plantillasCuadricula,
    titulo: 'Productos',
    columnas: [
      { clave: 'productoId', titulo: 'Código', ancho: '70px' },
      { clave: 'nombre', titulo: 'Producto', ancho: 'minmax(0, 2fr)' },
      { clave: 'cantidad', titulo: 'Cantidad', ancho: '90px', alinear: 'derecha' },
      { clave: 'valor', titulo: 'Precio unitario', ancho: '120px', alinear: 'derecha' },
      { clave: 'descuentoTexto', titulo: 'Descuento', ancho: '110px', alinear: 'derecha' },
      { clave: 'subtotal', titulo: 'Total línea', ancho: '120px', alinear: 'derecha' },
    ],
    // El total de la línea ya tiene su descuento y su parte del descuento de la venta (las notas no tienen descuento)
    filas: registro.items.map((item) => ({
      ...item, cantidad: String(item.cantidad), valor: aPesos(item.valorUnitario), descuentoTexto: item.descuento ? aPesos(item.descuento) : '', subtotal: aPesos(item.total),
    })),
  });
  const datosComunes = (registro) => [
    { etiqueta: 'Cliente', valor: registro.cliente },
    { etiqueta: 'Fecha', valor: aFecha(registro.fecha) },
    { etiqueta: 'Sucursal', valor: registro.tiendaId ? nombreDeTienda(registro.tiendaId) : '' },
    { etiqueta: 'Registró', valor: registro.usuario ?? '' },
    { etiqueta: 'Lista de precio', valor: registro.listaPrecio ? etiquetaDeLista(registro.listaPrecio) : '' },
    { etiqueta: 'Descuento de la venta', valor: registro.descuentoVenta ? aPesos(registro.descuentoVenta) : '' },
  ];

  const fichaFactura = crearFicha(buscar('#ficha-factura', raiz), plantillasFicha);
  const abrirFichaFactura = (id) => fichaFactura.abrir(id, () => {
    const venta = estado.ventas.find((candidata) => candidata.id === id);
    if (!venta) return null;
    const notas = servicioVentas.devolucionesDeVenta(venta.id);
    return {
      etiqueta: 'Ficha de la factura',
      titulo: `Factura ${venta.id} · ${venta.cliente}`,
      subtitulo: `${venta.metodo} · ${estadoDeFactura(venta).texto}`,
      indicadores: [
        { etiqueta: 'Total', valor: aPesos(venta.total) },
        { etiqueta: 'Devuelto', valor: aPesos(servicioVentas.totalDevuelto(venta.id)) },
        { etiqueta: 'Neto', valor: aPesos(venta.total - servicioVentas.totalDevuelto(venta.id)) },
      ],
      datos: [
        ...datosComunes(venta),
        { etiqueta: 'Medio de pago', valor: venta.metodo },
        { etiqueta: 'Monto recibido', valor: esEfectivo(venta.metodoId) && venta.recibido ? aPesos(venta.recibido) : '' },
        { etiqueta: 'Cambio', valor: esEfectivo(venta.metodoId) && venta.recibido ? aPesos(venta.devuelta) : '' },
        { etiqueta: 'Plazo', valor: venta.plazoDias ? `${venta.plazoDias} días` : '' },
        { etiqueta: 'Documento de origen', valor: venta.documentoOrigen ?? '' },
        { etiqueta: 'Mensaje personalizado', valor: venta.observaciones ?? '', ancho: true },
      ],
      contenido: repetir(documento, 'contenido-ficha-venta', [{ extra: notas.length ? repetir(documento, 'extra-notas-factura', [{}]) : '' }]),
      acciones: repetir(documento, 'acciones-ficha-factura', [{ id: venta.id, acciones: accionesFactura(venta) }]),
      alMontar: (seccionFicha) => {
        cuadriculaItems(seccionFicha.querySelector('[data-items]'), venta);
        const contenedorNotas = seccionFicha.querySelector('[data-notas]');
        if (contenedorNotas) {
          montarCuadricula(contenedorNotas, {
            plantillas: plantillasCuadricula,
            titulo: 'Notas de la factura',
            columnas: [
              { clave: 'id', titulo: 'N°', ancho: '90px' }, { clave: 'tipo', titulo: 'Tipo', ancho: '150px' },
              { clave: 'motivo', titulo: 'Motivo', ancho: 'minmax(0, 1.5fr)' }, { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
            ],
            filas: notas.map((nota) => ({ id: nota.id, tipo: servicioVentas.ETIQUETA_NOTA[nota.tipo], motivo: nota.motivo, total: aPesos(nota.total) })),
          });
        }
      },
    };
  });

  const fichaDocumento = crearFicha(buscar('#ficha-documento', raiz), plantillasFicha);
  const abrirFichaDocumento = (id) => fichaDocumento.abrir(id, () => {
    const registro = servicioVentas.buscarDocumento(id);
    if (!registro) return null;
    return {
      etiqueta: `Ficha de la ${etiquetaDe(registro.tipo).toLowerCase()}`,
      titulo: `${etiquetaDe(registro.tipo)} ${registro.id} · ${registro.cliente}`,
      subtitulo: estadoDeDocumento(registro),
      indicadores: [{ etiqueta: 'Total', valor: aPesos(registro.total) }],
      datos: [
        ...datosComunes(registro),
        { etiqueta: 'Vigente hasta', valor: registro.vigenciaHasta ? aFecha(registro.vigenciaHasta) : '' },
        { etiqueta: 'Pasado a', valor: registro.convertidoEn ?? '' },
        { etiqueta: 'Motivo de anulación', valor: registro.motivoAnulacion ?? '' },
        { etiqueta: 'Mensaje personalizado', valor: registro.observaciones ?? '', ancho: true },
      ],
      contenido: repetir(documento, 'contenido-ficha-venta', [{ extra: '' }]),
      acciones: repetir(documento, 'acciones-ficha-documento', [{ id: registro.id, acciones: accionesDocumento(registro) }]),
      alMontar: (seccionFicha) => cuadriculaItems(seccionFicha.querySelector('[data-items]'), registro),
    };
  });

  const fichaNota = crearFicha(buscar('#ficha-nota', raiz), plantillasFicha);
  const abrirFichaNota = (id) => fichaNota.abrir(id, () => {
    const nota = estado.devoluciones.find((candidata) => candidata.id === id);
    if (!nota) return null;
    return {
      etiqueta: `Ficha de la ${servicioVentas.ETIQUETA_NOTA[nota.tipo].toLowerCase()}`,
      titulo: `${nota.id} · factura ${nota.ventaId}`,
      subtitulo: servicioVentas.ETIQUETA_NOTA[nota.tipo],
      indicadores: [{ etiqueta: 'Total', valor: aPesos(nota.total) }],
      datos: [...datosComunes(nota), { etiqueta: 'Motivo', valor: nota.motivo, ancho: true }],
      contenido: repetir(documento, 'contenido-ficha-venta', [{ extra: '' }]),
      acciones: repetir(documento, 'acciones-ficha-nota', [{ id: nota.id, ventaId: nota.ventaId }]),
      alMontar: (seccionFicha) => cuadriculaItems(seccionFicha.querySelector('[data-items]'), nota),
    };
  });

  // --- Nueva nota: se elige la factura y el tipo; luego se abre el panel de cantidades y motivo -----------
  const panelNota = buscar('#panel-nueva-nota', raiz);
  panelNota.hidden = true;
  const facturaNota = montarSelectorRegistro(buscar('#selector-nota-factura', raiz), {
    plantillas: plantillasSelector,
    clave: 'nota-factura',
    etiqueta: 'facturas con productos por devolver',
    columnas: COLUMNAS_FACTURA,
    registros: () => facturasParaElegir(facturasConPendientes()),
    vacio: 'Elige la factura',
    alSalir: () => buscar('#nota-tipo', raiz).focus(),
  });
  buscar('#nueva-nota', raiz).onclick = () => {
    panelNota.hidden = false;
    panelNota.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    facturaNota.enfocar();
  };
  buscar('#cancelar-nota', raiz).onclick = () => { panelNota.hidden = true; };
  buscar('#continuar-nota', raiz).onclick = () => {
    const ventaId = facturaNota.elegido()?.id;
    if (!ventaId) return contexto.alerta(facturasConPendientes().length ? 'Elige la factura' : 'No hay facturas con productos por devolver');
    panelNota.hidden = true;
    panelDeFactura(ventaId, buscar('#nota-tipo', raiz).value === 'anulacion');
  };

  // Panel con motivo para devolver, anular una factura o anular una remisión o cotización
  function abrirPanel({ titulo, descripcion, columnaCantidad, filas, esAnulacion, plantillaFilas, alConfirmar, textoBoton }) {
    zona.innerHTML = seccion(documento, 'panel-devolucion', {
      titulo,
      descripcion,
      columnaCantidad,
      filas: repetir(documento, plantillaFilas, filas),
      claseBoton: esAnulacion ? 'peligro' : 'primario',
      textoBoton,
    });
    activarCamposNumericos(zona);
    zona.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    (buscar('[data-cantidad-producto]', zona) ?? buscar('#motivo-devolucion', zona)).focus();

    buscar('#cancelar-devolucion', zona).onclick = () => { zona.innerHTML = ''; };
    buscar('#confirmar-devolucion', zona).onclick = () => {
      try {
        alConfirmar(buscar('#motivo-devolucion', zona).value);
      } catch (error) {
        contexto.alerta(error.message);
      }
    };
  }

  function panelDeFactura(ventaId, esAnulacion) {
    const venta = estado.ventas.find((candidata) => candidata.id === ventaId);
    const pendientes = servicioVentas.pendientesDeDevolver(venta).map((item) => ({ ...item, valorUnitario: aPesos(item.valorUnitario) }));
    abrirPanel({
      titulo: esAnulacion ? `Anular la factura ${venta.id}` : `Devolver productos de la factura ${venta.id}`,
      descripcion: esAnulacion
        ? 'Se devuelve todo lo que queda de la factura: vuelve al stock, se reintegra el dinero y se genera una nota de anulación (NA). Solo se anulan facturas de días con la contabilidad abierta.'
        : 'Escribe cuántas unidades devuelve el cliente de cada producto. Se genera una nota de devolución (ND) anclada a la factura.',
      columnaCantidad: esAnulacion ? 'Se devuelve' : 'Cantidad a devolver',
      filas: pendientes,
      esAnulacion,
      plantillaFilas: esAnulacion ? 'fila-anular-item' : 'fila-devolver-item',
      textoBoton: esAnulacion ? 'Anular factura' : 'Registrar devolución',
      alConfirmar: (motivo) => {
        let nota;
        if (esAnulacion) nota = servicioVentas.anularVenta(ventaId, motivo);
        else {
          const cantidades = {};
          zona.querySelectorAll('[data-cantidad-producto]').forEach((campo) => {
            cantidades[campo.dataset.cantidadProducto] = leerEntero(campo.value);
          });
          nota = servicioVentas.devolverProductos(ventaId, cantidades, motivo);
        }
        contexto.aviso(esAnulacion ? `Factura ${ventaId} anulada correctamente: nota ${nota.id}` : `Devolución registrada correctamente: nota ${nota.id}`);
        contexto.redibujar();
        mostrarComprobanteDeDevolucion(nota);
      },
    });
  }

  function panelDeDocumento(id) {
    const registro = servicioVentas.buscarDocumento(id);
    abrirPanel({
      titulo: `Anular ${etiquetaDe(registro.tipo).toLowerCase()} ${id}`,
      descripcion: registro.tipo === 'remision' ? 'Lo entregado vuelve al stock.' : 'La cotización deja de poder pasarse a remisión o a factura.',
      columnaCantidad: 'Cantidad',
      filas: registro.items.map((item) => ({ ...item, valorUnitario: aPesos(item.valorUnitario), disponibles: item.cantidad })),
      esAnulacion: true,
      plantillaFilas: 'fila-anular-item',
      textoBoton: 'Anular documento',
      alConfirmar: (motivo) => {
        servicioVentas.anularDocumento(id, motivo);
        contexto.aviso(`${etiquetaDe(registro.tipo)} ${id} anulada correctamente`);
        contexto.redibujar();
      },
    });
  }

  buscar('.vista', raiz).addEventListener('click', (evento) => {
    const ficha = evento.target.closest('[data-ficha-factura], [data-ficha-documento], [data-ficha-nota]');
    if (ficha?.dataset.fichaFactura) return abrirFichaFactura(ficha.dataset.fichaFactura);
    if (ficha?.dataset.fichaDocumento) return abrirFichaDocumento(ficha.dataset.fichaDocumento);
    if (ficha?.dataset.fichaNota) return abrirFichaNota(ficha.dataset.fichaNota);
    const recibo = evento.target.closest('[data-recibo]');
    if (recibo) return mostrarReciboDeVenta(estado.ventas.find((venta) => venta.id === recibo.dataset.recibo));
    const devolver = evento.target.closest('[data-devolver]');
    if (devolver) return panelDeFactura(devolver.dataset.devolver, false);
    const anular = evento.target.closest('[data-anular]');
    if (anular) return panelDeFactura(anular.dataset.anular, true);
    const anularDocumento = evento.target.closest('[data-anular-documento]');
    if (anularDocumento) return panelDeDocumento(anularDocumento.dataset.anularDocumento);
    const verDocumento = evento.target.closest('[data-documento]');
    if (verDocumento) return mostrarReciboDeVenta(servicioVentas.buscarDocumento(verDocumento.dataset.documento));
    const comprobante = evento.target.closest('[data-comprobante]');
    if (comprobante) mostrarComprobanteDeDevolucion(estado.devoluciones.find((nota) => nota.id === comprobante.dataset.comprobante));
  });
}
