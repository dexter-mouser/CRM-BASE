import { buscar } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { aPesos, aFecha } from '../../core/format.js';
import { leerEntero, activarCamposNumericos } from '../../core/numeros.js';
import { icono, ICONO_PAPELERA } from '../../core/iconos.js';
import { puede } from '../../core/autorizacion.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { nombreDeTienda } from '../../core/tienda.js';
import { bodegaActiva, buscarBodega, existenciasEn } from '../../services/inventario.service.js';
import * as servicioBodegas from '../../services/bodegas.service.js';
import { dibujarSelector, montarSelectorProductos } from '../../components/selector-productos/selector-productos.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { importarBodegas, importarTraslados } from '../../services/importacion.service.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;

const porRecibirEn = (bodegaId) => estado.traslados.filter((traslado) => traslado.estado === 'enviado' && traslado.destinoId === bodegaId).length;

export async function dibujar() {
  documento = await cargarHtml(new URL('./bodegas.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  const activas = servicioBodegas.bodegasActivas();
  return seccion(documento, 'principal', {
    opcionesBodega: repetir(documento, 'opcion', activas.map((bodega) => ({ valor: bodega.id, texto: `${bodega.nombre} · ${bodega.id}` }))),
    selector: await dibujarSelector(),
  });
}

export function montar(raiz, contexto) {
  const panelTraslado = buscar('#panel-traslado', raiz);
  let trasladoPorAnular = null;
  buscar('#nueva-bodega', raiz).hidden = !puede('bodegas', 'crear');
  buscar('#nuevo-traslado', raiz).hidden = !puede('bodegas', 'crear');

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

  // --- Bodegas ---------------------------------------------------------------------------------------------
  const formulario = montarFormulario(buscar('#formulario-bodega', raiz), {
    plantillas: plantillasFormulario,
    clave: 'bodega',
    titulo: 'Nueva bodega',
    tituloEditar: (bodega) => `Editar ${bodega.nombre}`,
    textoGuardar: 'Guardar bodega',
    alError: contexto.alerta,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', maximo: 60, obligatorio: true, ejemplo: 'Bodega principal' },
      {
        clave: 'tiendaId', etiqueta: 'Sucursal', tipo: 'seleccion', valor: '',
        opciones: () => [['', 'Ninguna (bodega central)'], ...estado.tiendas.map((tienda) => [tienda.id, tienda.nombre])],
      },
      { clave: 'direccion', etiqueta: 'Dirección', maximo: 300, ancho: 'completo' },
    ],
    alGuardar: (datos, bodega) => {
      const aplicado = bodega
        ? ejecutar(() => servicioBodegas.actualizarBodega(bodega.id, datos), 'Bodega actualizada correctamente')
        : ejecutar(() => servicioBodegas.agregarBodega(datos), 'Bodega creada correctamente');
      if (!aplicado) return false;
      contexto.redibujar();
      return true;
    },
  });
  const abrirFormulario = (bodega) => formulario.abrir(bodega);
  buscar('#nueva-bodega', raiz).onclick = () => abrirFormulario(null);
  const nombreBodega = (id) => buscarBodega(id)?.nombre ?? id;
  const editar = puede('bodegas', 'editar');
  montarCuadricula(buscar('#cuadricula-bodegas', raiz), {
    exportar: { modulo: 'bodegas', archivo: 'bodegas' },
    importar: { modulo: 'bodegas', formato: 'bodegas', registros: () => estado.bodegas, importar: importarBodegas, alImportar: contexto.redibujar },
    plantillas: plantillasCuadricula,
    titulo: 'Bodegas',
    vacio: 'Aún no hay bodegas. Crea una con "Nueva bodega".',
    columnas: [
      { clave: 'id', titulo: 'Código', ancho: '64px' },
      { clave: 'nombre', titulo: 'Nombre', ancho: 'minmax(0, 1.2fr)' },
      { clave: 'tienda', titulo: 'Sucursal', ancho: 'minmax(0, 1fr)' },
      { clave: 'unidades', titulo: 'Unidades', ancho: '90px', alinear: 'derecha' },
      { clave: 'valor', titulo: 'Valor al costo', ancho: '120px', alinear: 'derecha' },
      { clave: 'porRecibir', titulo: 'Por recibir', ancho: '96px', alinear: 'derecha' },
      { clave: 'estado', titulo: 'Estado', ancho: '84px' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '290px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: estado.bodegas.map((bodega) => {
      const resumen = servicioBodegas.resumenDeBodega(bodega.id);
      return {
        id: bodega.id,
        nombre: bodega.nombre,
        tienda: bodega.tiendaId ? nombreDeTienda(bodega.tiendaId) : 'Bodega central',
        unidades: String(resumen.unidades),
        valor: aPesos(resumen.valor),
        porRecibir: String(porRecibirEn(bodega.id)),
        estado: bodega.activa ? 'Activa' : 'Inactiva',
        acciones: repetir(documento, 'acciones-bodega', [{
          id: bodega.id,
          edicion: editar ? repetir(documento, 'botones-edicion-bodega', [{ id: bodega.id, textoEstado: bodega.activa ? 'Desactivar' : 'Activar', claseEstado: bodega.activa ? 'peligro' : '' }]) : '',
        }]),
      };
    }),
  });

  const fichaBodega = crearFicha(buscar('#ficha-bodega', raiz), plantillasFicha);
  const abrirFichaBodega = (id) => fichaBodega.abrir(id, () => {
    const bodega = buscarBodega(id);
    if (!bodega) return null;
    const resumen = servicioBodegas.resumenDeBodega(bodega.id);
    return {
      etiqueta: 'Ficha de la bodega',
      titulo: `${bodega.nombre} · ${bodega.id}`,
      subtitulo: [bodega.tiendaId ? nombreDeTienda(bodega.tiendaId) : 'Bodega central', bodega.activa ? 'Activa' : 'Inactiva'].join(' · '),
      indicadores: [
        { etiqueta: 'Unidades', valor: String(resumen.unidades) },
        { etiqueta: 'Valor al costo', valor: aPesos(resumen.valor) },
        { etiqueta: 'Productos con stock', valor: String(resumen.productos) },
        { etiqueta: 'Traslados por recibir', valor: String(porRecibirEn(bodega.id)) },
      ],
      datos: [{ etiqueta: 'Dirección', valor: bodega.direccion ?? '', ancho: true }],
      contenido: repetir(documento, 'contenido-ficha-bodega', [{}]),
      alEditar: editar ? () => abrirFormulario(buscarBodega(id)) : null,
      alMontar: (seccionFicha) => montarCuadricula(seccionFicha.querySelector('[data-cuadricula-ficha]'), {
        plantillas: plantillasCuadricula,
        titulo: `Productos de ${bodega.nombre}`,
        vacio: 'Esta bodega no tiene productos con stock.',
        columnas: [
          { clave: 'id', titulo: 'Código', ancho: '70px' },
          { clave: 'nombre', titulo: 'Producto', ancho: 'minmax(0, 2fr)' },
          { clave: 'cantidad', titulo: 'Cantidad', ancho: '96px', alinear: 'derecha' },
          { clave: 'valor', titulo: 'Valor al costo', ancho: '120px', alinear: 'derecha' },
        ],
        filas: estado.productos.filter((producto) => existenciasEn(producto, bodega.id) !== 0).map((producto) => ({
          id: producto.id,
          nombre: producto.nombre,
          cantidad: String(existenciasEn(producto, bodega.id)),
          valor: aPesos(Math.max(0, existenciasEn(producto, bodega.id)) * producto.costo),
        })),
      }),
    };
  });

  buscar('#cuadricula-bodegas', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    const bodega = buscarBodega(boton.dataset.ficha ?? boton.dataset.editar ?? boton.dataset.estado);
    if (!bodega) return;
    if (boton.dataset.ficha) return abrirFichaBodega(bodega.id);
    if (boton.dataset.editar) return abrirFormulario(bodega);
    const mensaje = `${bodega.nombre} ${bodega.activa ? 'desactivada' : 'activada'} correctamente`;
    if (ejecutar(() => servicioBodegas.cambiarEstadoBodega(bodega.id, !bodega.activa), mensaje)) contexto.redibujar();
  });

  // --- Matriz de stock: una columna por bodega activa -------------------------------------------------------
  const activas = servicioBodegas.bodegasActivas();
  montarCuadricula(buscar('#cuadricula-stock', raiz), {
    exportar: { modulo: 'bodegas', archivo: 'stock-por-bodega' },
    plantillas: plantillasCuadricula,
    titulo: 'Stock por bodega',
    vacio: 'Aún no hay productos.',
    columnas: [
      { clave: 'id', titulo: 'Código', ancho: '70px' },
      { clave: 'nombre', titulo: 'Producto', ancho: 'minmax(160px, 1.4fr)' },
      ...activas.map((bodega) => ({ clave: bodega.id, titulo: bodega.nombre, ancho: 'minmax(90px, 1fr)', alinear: 'derecha' })),
      { clave: 'total', titulo: 'Total', ancho: '84px', alinear: 'derecha' },
    ],
    filas: estado.productos.map((producto) => ({
      id: producto.id,
      nombre: producto.nombre,
      ...Object.fromEntries(activas.map((bodega) => [bodega.id, existenciasEn(producto, bodega.id)])),
      total: producto.existencias,
    })),
  });

  // --- Nuevo traslado --------------------------------------------------------------------------------------
  const lineas = [];
  const cuerpo = buscar('#lineas-traslado', raiz);
  const origen = buscar('#traslado-origen', raiz);
  const destino = buscar('#traslado-destino', raiz);
  const disponibleEnOrigen = (productoId) => existenciasEn(estado.productos.find((producto) => producto.id === productoId), origen.value);
  const pintarLineas = () => {
    cuerpo.innerHTML = repetir(documento, 'fila-linea-traslado', lineas.map((linea, posicion) => ({
      posicion, id: linea.productoId, nombre: linea.nombre, cantidad: linea.cantidad || '', disponible: disponibleEnOrigen(linea.productoId), icono: icono(ICONO_PAPELERA),
    })));
    activarCamposNumericos(cuerpo);
    buscar('#sin-lineas-traslado', raiz).hidden = lineas.length > 0;
  };
  montarSelectorProductos(raiz, {
    alElegir: (producto) => {
      const existente = lineas.find((linea) => linea.productoId === producto.id);
      if (existente) existente.cantidad += 1;
      else lineas.push({ productoId: producto.id, nombre: producto.nombre, cantidad: 1 });
      pintarLineas();
    },
  });
  cuerpo.addEventListener('input', (evento) => {
    const campoLinea = evento.target.closest('[data-campo]');
    if (campoLinea) lineas[Number(campoLinea.closest('tr').dataset.posicion)].cantidad = leerEntero(campoLinea.value);
  });
  cuerpo.addEventListener('click', (evento) => {
    const quitar = evento.target.closest('[data-quitar]');
    if (!quitar) return;
    lineas.splice(Number(quitar.closest('tr').dataset.posicion), 1);
    pintarLineas();
  });
  origen.onchange = pintarLineas;
  buscar('#nuevo-traslado', raiz).onclick = () => {
    if (activas.length < 2) return contexto.alerta('Se necesitan al menos dos bodegas activas para trasladar');
    // Por defecto sale de la bodega de la sucursal activa hacia la siguiente
    origen.value = bodegaActiva()?.id ?? activas[0].id;
    destino.value = activas.find((bodega) => bodega.id !== origen.value).id;
    panelTraslado.hidden = false;
    panelTraslado.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    pintarLineas();
    origen.focus();
  };
  buscar('#cancelar-traslado', raiz).onclick = () => { panelTraslado.hidden = true; };
  buscar('#enviar-traslado', raiz).onclick = () => {
    const traslado = ejecutar(() => servicioBodegas.enviarTraslado({
      origenId: origen.value,
      destinoId: destino.value,
      observaciones: buscar('#traslado-observaciones', raiz).value,
      lineas,
    }), 'Traslado enviado correctamente');
    if (traslado) contexto.redibujar();
  };

  // --- Historial de traslados ------------------------------------------------------------------------------
  const accionesPendientes = (traslado) => (traslado.estado === 'enviado' && puede('bodegas', 'editar')
    ? repetir(documento, 'acciones-traslado-pendiente', [{ id: traslado.id }]) : '');
  montarCuadricula(buscar('#cuadricula-traslados', raiz), {
    exportar: { modulo: 'bodegas', archivo: 'traslados' },
    importar: { modulo: 'bodegas', formato: 'traslados', registros: () => [], importar: importarTraslados, alImportar: contexto.redibujar },
    plantillas: plantillasCuadricula,
    titulo: 'Traslados',
    vacio: 'Aún no hay traslados.',
    columnas: [
      { clave: 'id', titulo: 'N°', ancho: '90px' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '120px' },
      { clave: 'origen', titulo: 'Sale de', ancho: 'minmax(0, 1fr)' },
      { clave: 'destino', titulo: 'Llega a', ancho: 'minmax(0, 1fr)' },
      { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 1.6fr)' },
      { clave: 'estado', titulo: 'Estado', ancho: '120px' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '270px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: estado.traslados.slice().reverse().map((traslado) => ({
      id: traslado.id,
      fecha: aFecha(traslado.fecha),
      origen: nombreBodega(traslado.origenId),
      destino: nombreBodega(traslado.destinoId),
      productos: traslado.items.map((item) => `${item.nombre} ×${item.cantidad}`).join(', '),
      estado: servicioBodegas.ESTADOS_TRASLADO[traslado.estado],
      acciones: repetir(documento, 'acciones-traslado', [{ id: traslado.id, pendiente: accionesPendientes(traslado) }]),
    })),
  });
  // Ficha del traslado: no se edita (mueve stock); se recibe o se anula
  const fichaTraslado = crearFicha(buscar('#ficha-traslado', raiz), plantillasFicha);
  const abrirFichaTraslado = (id) => fichaTraslado.abrir(id, () => {
    const traslado = estado.traslados.find((candidato) => candidato.id === id);
    if (!traslado) return null;
    return {
      etiqueta: 'Ficha del traslado',
      titulo: `Traslado ${traslado.id}`,
      subtitulo: `${nombreBodega(traslado.origenId)} → ${nombreBodega(traslado.destinoId)} · ${servicioBodegas.ESTADOS_TRASLADO[traslado.estado]}`,
      datos: [
        { etiqueta: 'Fecha de envío', valor: aFecha(traslado.fecha) },
        { etiqueta: 'Enviado por', valor: traslado.usuario ?? '' },
        { etiqueta: 'Recibido', valor: traslado.recibidoEn ? aFecha(traslado.recibidoEn) : '' },
        { etiqueta: 'Unidades', valor: String(traslado.items.reduce((suma, item) => suma + item.cantidad, 0)) },
        { etiqueta: 'Productos', valor: traslado.items.map((item) => `${item.nombre} ×${item.cantidad}`).join(', '), ancho: true },
        { etiqueta: 'Observaciones', valor: traslado.observaciones ?? '', ancho: true },
        { etiqueta: 'Motivo de anulación', valor: traslado.motivoAnulacion ?? traslado.motivo ?? '', ancho: true },
      ],
      acciones: accionesPendientes(traslado),
    };
  });

  const alTocarTraslado = (evento) => {
    const ficha = evento.target.closest('[data-ficha-traslado]');
    if (ficha) return abrirFichaTraslado(ficha.dataset.fichaTraslado);
    const recibir = evento.target.closest('[data-recibir]');
    if (recibir) {
      if (ejecutar(() => servicioBodegas.recibirTraslado(recibir.dataset.recibir), `Traslado ${recibir.dataset.recibir} recibido correctamente`)) contexto.redibujar();
      return;
    }
    const anular = evento.target.closest('[data-anular]');
    if (!anular) return;
    if (!puede('bodegas', 'eliminar')) return contexto.alerta('Tu rol no permite anular traslados');
    trasladoPorAnular = anular.dataset.anular;
    buscar('#texto-anular-traslado', raiz).textContent = `¿Anular el traslado ${trasladoPorAnular}? La mercancía vuelve al origen.`;
    buscar('#confirmar-anular-traslado', raiz).hidden = false;
    buscar('#confirmar-anular-traslado', raiz).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    buscar('#motivo-anular-traslado', raiz).focus();
  };
  buscar('#cuadricula-traslados', raiz).addEventListener('click', alTocarTraslado);
  buscar('#ficha-traslado', raiz).addEventListener('click', alTocarTraslado);
  buscar('#anular-traslado-no', raiz).onclick = () => { buscar('#confirmar-anular-traslado', raiz).hidden = true; };
  buscar('#anular-traslado-si', raiz).onclick = () => {
    if (ejecutar(() => servicioBodegas.anularTraslado(trasladoPorAnular, buscar('#motivo-anular-traslado', raiz).value), `Traslado ${trasladoPorAnular} anulado correctamente`)) contexto.redibujar();
  };

  if (location.hash === '#traslados') buscar('#traslados', raiz).scrollIntoView();
}
