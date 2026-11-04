import { buscar } from '../../core/dom.js';
import { ajustesDeRecibo } from '../../services/ajustes.service.js';
import { aPesos, aFecha } from '../../core/format.js';
import { leerEntero, activarCamposNumericos } from '../../core/numeros.js';
import { icono, ICONO_PAPELERA } from '../../core/iconos.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { sesionActual } from '../../core/sesion.js';
import { buscarProductoPorCodigo, buscarProductoPorId, LISTAS_PRECIO, etiquetaDeLista } from '../../services/inventario.service.js';
import { tiendaActiva, tiendaActivaId } from '../../core/tienda.js';
import { armarVenta, registrarVenta, ultimoValorDeVenta, listaDeTienda, buscarDocumento, documentoPendiente, impuestosDe, consecutivoPrevisto, numeroDe, calcularLineas, leerDescuento, TIPOS_DOCUMENTO, DESTINOS_POSIBLES } from '../../services/ventas.service.js';
import { activos, esEfectivo } from '../../services/catalogos.service.js';
import { deudaDeCliente, consumidorFinal } from '../../services/clientes.service.js';
import { puede } from '../../core/autorizacion.js';
import { cargarPlantillasBuscador, montarBuscadorCuadricula } from '../../components/buscador-cuadricula/buscador-cuadricula.js';
import { cargarPlantillasSelector, montarSelectorRegistro } from '../../components/selector-registro/selector-registro.js';
import { COLUMNAS_CLIENTE, clientesParaElegir } from '../../components/selector-registro/registros.js';
import { mostrarReciboDeVenta as mostrarRecibo } from '../../components/recibo/comprobantes.js';
import { mensajeDeError } from '../../core/errores.js';

let documento;
let plantillasBuscador;
let plantillasSelector;
let escuchaTeclado = null;

const TEXTO_REGISTRAR = { factura: 'Emitir factura', remision: 'Emitir remisión', cotizacion: 'Guardar cotización' };

// Un lector de códigos teclea muy rápido (menos de 50 ms entre teclas) y termina con Enter
const MILISEGUNDOS_ENTRE_TECLAS_DE_LECTOR = 50;
const LARGO_MINIMO_CODIGO = 3;

export async function dibujar() {
  documento = await cargarHtml(new URL('./nueva-venta.html', import.meta.url));
  [plantillasBuscador, plantillasSelector] = await Promise.all([cargarPlantillasBuscador(), cargarPlantillasSelector()]);
  // Medios de pago activos en el orden de Ajustes: el primero queda elegido
  const metodos = activos('metodosPago').map((metodo) => ({ id: metodo.id, nombre: metodo.nombre }));
  return seccion(documento, 'principal', {
    opcionesMetodo: repetir(documento, 'opcion-metodo', metodos),
    opcionesLista: repetir(documento, 'opcion-lista', LISTAS_PRECIO),
    consecutivo: consecutivoPrevisto('factura'),
    fecha: aFecha(new Date().toISOString()),
    sucursal: tiendaActiva()?.nombre ?? '—',
    vendedor: sesionActual()?.nombre ?? '—',
    // Lo habitual se ve escrito: el mensaje del recibo de Ajustes, editable en cada documento
    mensaje: ajustesDeRecibo().pie ?? '',
  });
}

export function montar(raiz, contexto) {
  const lineas = [];
  const contenedorLineas = buscar('#lineas-venta', raiz);
  const campoRecibido = buscar('#monto-recibido', raiz);
  const selectorTipo = buscar('#tipo-documento', raiz);
  let ventaRegistrada = null;
  let tipo = 'factura';
  let documentoOrigen = '';
  // Lista de precio de la venta: la del cliente si tiene una; si no, la de la sucursal activa
  let lista = listaDeTienda(tiendaActivaId());
  const campoDescuento = buscar('#descuento-venta', raiz);

  // Descuentos: se escriben en pesos ("5000") o en porcentaje ("10%"). Un texto que no se entiende queda marcado
  // en rojo, cuenta como 0 en los totales y no deja registrar hasta corregirlo
  const descuentoDe = (texto, base) => {
    try {
      return { valor: leerDescuento(texto, base), error: '' };
    } catch (error) {
      return { valor: 0, error: mensajeDeError(error) };
    }
  };
  const recalcularDescuento = (linea) => {
    const { valor, error } = descuentoDe(linea.descuentoTexto, linea.cantidad * linea.valorUnitario);
    linea.descuento = valor;
    linea.errorDescuento = error;
  };
  const subtotal = (linea) => linea.cantidad * linea.valorUnitario - linea.descuento;
  const descuentoVenta = () => descuentoDe(campoDescuento.value, lineas.reduce((acumulado, linea) => acumulado + subtotal(linea), 0));
  const lineasCalculadas = () => calcularLineas(lineas, descuentoVenta().valor);
  const totalActual = () => lineasCalculadas().reduce((acumulado, linea) => acumulado + linea.total, 0);
  const cobraEnEfectivo = () => tipo === 'factura' && esEfectivo(buscar('#metodo', raiz).value);
  const datosDeVenta = () => {
    const errorDescuento = lineas.find((linea) => linea.errorDescuento)?.errorDescuento || descuentoVenta().error;
    if (errorDescuento) throw new Error(errorDescuento);
    return {
      tipo,
      clienteId: selectorCliente.elegido()?.id ?? '',
      metodoId: buscar('#metodo', raiz).value,
      observaciones: buscar('#observaciones', raiz).value,
      // Vacío = valor exacto
      recibido: cobraEnEfectivo() ? leerEntero(campoRecibido.value) : 0,
      documentoOrigen,
      listaPrecio: lista,
      lineas,
      descuentoVenta: descuentoVenta().valor,
    };
  };

  // Pago: solo la factura cobra; en efectivo se escribe el monto recibido y se muestra el cambio (o lo que falta)
  const pintarPago = () => {
    const cobra = tipo === 'factura';
    buscar('#campos-pago', raiz).hidden = !cobra;
    buscar('#sin-pago', raiz).hidden = cobra;
    buscar('#campo-recibido', raiz).hidden = !cobraEnEfectivo();
    const recibido = leerEntero(campoRecibido.value);
    const diferencia = cobraEnEfectivo() && recibido ? recibido - totalActual() : 0;
    const filaCambio = buscar('#fila-cambio', raiz);
    filaCambio.hidden = !cobraEnEfectivo();
    filaCambio.classList.toggle('falta', diferencia < 0);
    buscar('#etiqueta-cambio', raiz).textContent = diferencia < 0 ? 'Faltan' : 'Cambio';
    buscar('#cambio-venta', raiz).textContent = aPesos(Math.abs(diferencia));
  };

  // Cambia la lista de precio de la venta. Solo aplica a los productos que se agreguen desde ahora: los que ya están
  // en la venta conservan su valor (si hace falta, se cambia a mano en la línea)
  const elegirLista = (nueva, avisar = true) => {
    const cambio = nueva !== lista;
    lista = nueva;
    buscar('#lista-precio', raiz).value = nueva;
    if (cambio && avisar) {
      contexto.aviso(lineas.length
        ? `Lista de precios ${etiquetaDeLista(nueva)} aplicada correctamente a los productos que agregues; los que ya están conservan su valor`
        : `Lista de precios ${etiquetaDeLista(nueva)} aplicada correctamente`);
    }
  };

  // Nota debajo del cliente: deuda pendiente y el acceso para registrar uno nuevo
  const pintarCliente = () => {
    const cliente = selectorCliente.elegido();
    const enlace = puede('clientes', 'crear') ? '<a class="boton" href="clientes.html?nuevo=1">+ Nuevo cliente</a>' : '';
    const texto = cliente && !cliente.generico && deudaDeCliente(cliente) > 0 ? `Saldo pendiente: ${aPesos(deudaDeCliente(cliente))}` : '';
    buscar('#ficha-cliente', raiz).innerHTML = repetir(documento, 'nota-cliente', [{ texto, enlace }]);
  };

  // Un cliente con lista propia (mayorista, almacén interno) cambia la lista de la venta al elegirlo
  const alElegirCliente = (cliente) => {
    if (!documentoOrigen) elegirLista(cliente.listaPrecio || listaDeTienda(tiendaActivaId()));
    pintarCliente();
  };
  const selectorCliente = montarSelectorRegistro(buscar('#selector-cliente', raiz), {
    plantillas: plantillasSelector,
    clave: 'cliente',
    etiqueta: 'clientes',
    columnas: COLUMNAS_CLIENTE,
    registros: clientesParaElegir,
    elegido: () => consumidorFinal()?.id,
    vacio: 'Elige el cliente',
    alElegir: alElegirCliente,
    // Enter sin buscar nada pasa a la búsqueda de productos
    alSalir: () => buscar('[data-filtro="id"]', raiz).focus(),
  });

  const pintarTotal = () => {
    const calculadas = lineasCalculadas();
    const total = calculadas.reduce((acumulado, linea) => acumulado + linea.total, 0);
    const unidades = lineas.reduce((acumulado, linea) => acumulado + linea.cantidad, 0);
    const impuestos = impuestosDe({ items: calculadas }).filter((grupo) => grupo.tarifa);
    const iva = impuestos.reduce((acumulado, grupo) => acumulado + grupo.iva, 0);
    const { valor: descuentoGeneral, error } = descuentoVenta();
    const descuentos = lineas.reduce((acumulado, linea) => acumulado + linea.descuento, 0) + descuentoGeneral;
    campoDescuento.setAttribute('aria-invalid', String(Boolean(error)));
    campoDescuento.title = error;
    buscar('#fila-descuentos', raiz).hidden = !descuentos;
    buscar('#descuentos-venta', raiz).textContent = `- ${aPesos(descuentos)}`;
    buscar('#resumen-lineas', raiz).textContent = `${lineas.length} ${lineas.length === 1 ? 'línea' : 'líneas'} · ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}`;
    buscar('#subtotal-venta', raiz).textContent = aPesos(total - iva);
    buscar('#iva-venta', raiz).innerHTML = repetir(documento, 'linea-impuesto', impuestos.map((grupo) => ({ tarifa: grupo.tarifa, valor: aPesos(grupo.iva) })));
    buscar('#total-venta', raiz).textContent = aPesos(total);
    pintarPago();
  };

  const pintarBotonRegistrar = () => {
    buscar('#texto-registrar', raiz).textContent = `${TEXTO_REGISTRAR[tipo]} ${consecutivoPrevisto(tipo, documentoOrigen)}`;
  };

  // Cambia entre factura, remisión y cotización: solo la factura cobra, así que solo ella pide medio de pago y monto
  const elegirTipo = (nuevo) => {
    tipo = nuevo;
    selectorTipo.value = nuevo;
    buscar('#consecutivo', raiz).textContent = consecutivoPrevisto(nuevo, documentoOrigen);
    pintarBotonRegistrar();
    pintarPago();
  };

  const pintarLineas = () => {
    contenedorLineas.innerHTML = repetir(documento, 'fila-linea', lineas.map((linea, posicion) => ({
      posicion,
      id: linea.productoId,
      referencia: linea.referencia,
      nombre: linea.nombre || 'Producto genérico',
      celdaNombre: repetir(documento, linea.generico ? 'nombre-generico' : 'nombre-fijo', [{ nombre: linea.nombre }]),
      cantidad: linea.cantidad || '',
      valorUnitario: linea.valorUnitario || '',
      descuento: linea.descuentoTexto,
      descuentoInvalido: String(Boolean(linea.errorDescuento)),
      error: linea.errorDescuento,
      iva: linea.iva ?? 0,
      subtotal: aPesos(subtotal(linea)),
      icono: icono(ICONO_PAPELERA),
    })));
    activarCamposNumericos(contenedorLineas);
    buscar('#sin-lineas', raiz).hidden = lineas.length > 0;
    pintarTotal();
  };

  // Al elegir un producto (o escanear su código) se agrega la línea y el cursor pasa a su cantidad para escribirla
  // El producto genérico entra sin nombre ni valor: el cursor va a su nombre para escribir qué se vende
  function agregarProducto(producto) {
    let posicion = lineas.findIndex((linea) => linea.productoId === producto.id);
    if (posicion >= 0 && !producto.generico) lineas[posicion].cantidad += 1;
    else if (posicion < 0) {
      lineas.push({
        productoId: producto.id,
        referencia: producto.referencia,
        nombre: producto.generico ? '' : producto.nombre,
        generico: Boolean(producto.generico),
        iva: producto.iva,
        cantidad: 1,
        valorUnitario: ultimoValorDeVenta(producto.id, lista),
        descuentoTexto: '',
        descuento: 0,
        errorDescuento: '',
      });
      posicion = lineas.length - 1;
    }
    pintarLineas();
    const campo = buscar(`[data-posicion="${posicion}"] [data-campo="${producto.generico ? 'nombre' : 'cantidad'}"]`, contenedorLineas);
    campo.focus();
    campo.select();
  }

  montarBuscadorCuadricula(raiz, { plantillas: plantillasBuscador, alElegir: agregarProducto });

  // Al escribir cantidad, valor o descuento solo se actualizan los totales, para no perder el foco del campo.
  // Un descuento en porcentaje se recalcula cuando cambian la cantidad o el valor
  contenedorLineas.addEventListener('input', (evento) => {
    const campo = evento.target.closest('[data-campo]');
    if (!campo) return;
    const fila = campo.closest('.fila-linea');
    const linea = lineas[Number(fila.dataset.posicion)];
    if (campo.dataset.campo === 'nombre') {
      linea.nombre = campo.value;
      return;
    }
    if (campo.dataset.campo === 'descuento') linea.descuentoTexto = campo.value;
    else linea[campo.dataset.campo] = leerEntero(campo.value);
    recalcularDescuento(linea);
    const campoDescuentoLinea = buscar('[data-campo="descuento"]', fila);
    campoDescuentoLinea.setAttribute('aria-invalid', String(Boolean(linea.errorDescuento)));
    campoDescuentoLinea.title = linea.errorDescuento;
    buscar('[data-subtotal]', fila).textContent = aPesos(subtotal(linea));
    pintarTotal();
  });

  // Enter pasa del nombre (genérico) a la cantidad, de la cantidad al precio, del precio al descuento y del descuento
  // a la búsqueda de código
  contenedorLineas.addEventListener('keydown', (evento) => {
    const campo = evento.target.closest('[data-campo]');
    if (evento.key !== 'Enter' || !campo) return;
    evento.preventDefault();
    const siguientes = { nombre: '[data-campo="cantidad"]', cantidad: '[data-campo="valorUnitario"]', valorUnitario: '[data-campo="descuento"]' };
    const siguiente = siguientes[campo.dataset.campo]
      ? buscar(siguientes[campo.dataset.campo], campo.closest('.fila-linea'))
      : buscar('[data-filtro="id"]', raiz);
    siguiente.focus();
    siguiente.select?.();
  });

  contenedorLineas.addEventListener('click', (evento) => {
    const quitar = evento.target.closest('[data-quitar]');
    if (!quitar) return;
    lineas.splice(Number(quitar.closest('.fila-linea').dataset.posicion), 1);
    pintarLineas();
  });

  buscar('#vaciar-venta', raiz).onclick = () => {
    lineas.length = 0;
    campoRecibido.value = '';
    campoDescuento.value = '';
    pintarLineas();
  };
  campoDescuento.addEventListener('input', pintarTotal);

  buscar('#vista-previa-recibo', raiz).onclick = () => {
    try {
      mostrarRecibo(armarVenta(datosDeVenta()));
    } catch (error) {
      contexto.alerta(mensajeDeError(error));
    }
  };

  buscar('#registrar-venta', raiz).onclick = () => {
    try {
      ventaRegistrada = registrarVenta(datosDeVenta());
      const etiqueta = TIPOS_DOCUMENTO[ventaRegistrada.tipo].etiqueta;
      buscar('#registro-venta', raiz).hidden = true;
      buscar('#venta-registrada', raiz).hidden = false;
      buscar('#titulo-registrada', raiz).textContent = `${etiqueta} ${ventaRegistrada.id} registrada correctamente`;
      const cambio = ventaRegistrada.devuelta ? ` · Cambio ${aPesos(ventaRegistrada.devuelta)}` : '';
      buscar('#resumen-registrada', raiz).textContent = `${ventaRegistrada.cliente} · ${aPesos(ventaRegistrada.total)}${cambio}`;
      contexto.aviso(`${etiqueta} ${ventaRegistrada.id} registrada correctamente: ${aPesos(ventaRegistrada.total)}`);
      history.replaceState(null, '', location.pathname);
      buscar('#ver-recibo', raiz).focus();
    } catch (error) {
      contexto.alerta(mensajeDeError(error));
    }
  };

  buscar('#ver-recibo', raiz).onclick = () => mostrarRecibo(ventaRegistrada);
  buscar('#otra-venta', raiz).onclick = () => contexto.redibujar();

  selectorTipo.onchange = () => elegirTipo(selectorTipo.value);
  buscar('#metodo', raiz).onchange = pintarPago;
  campoRecibido.addEventListener('input', pintarPago);
  activarCamposNumericos(buscar('#campos-pago', raiz));
  buscar('#lista-precio', raiz).onchange = (evento) => elegirLista(evento.target.value);

  // Pasar un documento a otro: llega desde Ventas con ?documento=C5&tipo=remision (o tipo=factura).
  // La cotización se pasa a remisión o a factura; la remisión, solo a factura. El nuevo documento conserva el número.
  const parametros = new URLSearchParams(location.search);
  const origen = buscarDocumento(parametros.get('documento') ?? '');
  let tipoInicial = TIPOS_DOCUMENTO[parametros.get('tipo')] && !parametros.get('documento') ? parametros.get('tipo') : 'factura';
  if (origen && documentoPendiente(origen)) {
    const destinos = DESTINOS_POSIBLES[origen.tipo];
    tipoInicial = destinos.includes(parametros.get('tipo')) ? parametros.get('tipo') : destinos[0];
    documentoOrigen = origen.id;
    origen.items.forEach((item) => {
      const producto = buscarProductoPorId(item.productoId);
      const linea = { ...item, generico: Boolean(producto?.generico), descuentoTexto: item.descuento ? String(item.descuento) : '' };
      recalcularDescuento(linea);
      lineas.push(linea);
    });
    campoDescuento.value = origen.descuentoVenta ? String(origen.descuentoVenta) : '';
    lista = origen.listaPrecio;
    // El documento conserva su cliente; los guardados sin cliente quedan con el consumidor final
    selectorCliente.elegir(origen.clienteId || consumidorFinal()?.id, false);
    if (origen.observaciones) buscar('#observaciones', raiz).value = origen.observaciones;
    buscar('#aviso-origen', raiz).hidden = false;
    buscar('#texto-origen', raiz).textContent = `Pasando ${TIPOS_DOCUMENTO[origen.tipo].etiqueta.toLowerCase()} ${origen.id} · ${origen.cliente}. Conserva el número ${numeroDe(origen.id)}.`;
    buscar('#detalle-origen', raiz).textContent = origen.tipo === 'remision'
      ? 'Las cantidades ya entregadas no se descuentan otra vez del stock; lo remitido que quites de la factura vuelve al stock.'
      : 'La cotización no movió el stock: la remisión o la factura lo descuentan al registrarse.';
    [...selectorTipo.options].forEach((opcion) => { opcion.disabled = !destinos.includes(opcion.value); });
  }

  montarAtajos(raiz, contexto, agregarProducto);

  elegirTipo(tipoInicial);
  elegirLista(lista, false);
  pintarLineas();
  pintarCliente();
  // El cliente es lo primero (ya viene el consumidor final); si viene de otro documento se pasa a los productos
  if (origen && documentoPendiente(origen)) buscar('[data-filtro="id"]', raiz).focus();
  else selectorCliente.enfocar();
}

// Atajos de teclado y lector de códigos de barras de Registrar venta.
//  F2 o /  buscar producto      F4 o Ctrl+Enter  emitir el documento (con el documento hecho, empezar otro)
//  F8      vista previa         F9               cancelar (vaciar la venta)   Esc  cerrar resultados
// El lector se detecta por la velocidad de tecleo (teclas casi simultáneas y Enter). Funciona con el cursor en la página,
// en la cantidad o el precio de una línea y en las casillas de búsqueda (ahí gana la coincidencia exacta de código o referencia).
function montarAtajos(raiz, contexto, agregarProducto) {
  if (escuchaTeclado) removeEventListener('keydown', escuchaTeclado, true);
  let codigo = '';
  let ultimaTecla = 0;

  const pulsar = (selector) => {
    const boton = document.querySelector(selector);
    if (boton && !boton.closest('[hidden]')) boton.click();
  };
  // Campos donde se escribe texto de verdad (cliente, medio de pago, mensaje, nombre del genérico): el lector no actúa ahí
  const enCampoDeLaVenta = (destino) => destino.matches?.('input:not([data-filtro]):not([data-campo]), input[data-campo="nombre"], select, textarea');
  let valorAntesDelCodigo = '';

  escuchaTeclado = (evento) => {
    if (!raiz.isConnected || evento.altKey || document.querySelector('dialog[open]')) return;

    const cobrar = () => pulsar(buscar('#registro-venta', raiz).hidden ? '#otra-venta' : '#registrar-venta');
    const atajos = { F2: () => buscar('[data-filtro="referencia"]', raiz).focus(), F4: cobrar, F8: () => pulsar('#vista-previa-recibo'), F9: () => pulsar('#vaciar-venta') };
    if (atajos[evento.key]) {
      evento.preventDefault();
      return atajos[evento.key]();
    }
    if (evento.key === 'Enter' && evento.ctrlKey) {
      evento.preventDefault();
      return cobrar();
    }
    const enBusqueda = evento.target.matches?.('[data-filtro]');
    if (evento.key === '/' && !enCampoDeLaVenta(evento.target) && !enBusqueda && !evento.target.matches?.('[data-campo]')) {
      evento.preventDefault();
      return buscar('[data-filtro="referencia"]', raiz).focus();
    }

    // Lector de códigos: teclas rápidas seguidas de Enter. En las casillas de búsqueda ya lo resuelve el buscador
    if (enCampoDeLaVenta(evento.target) || enBusqueda) return;
    const ahora = performance.now();
    if (ahora - ultimaTecla > MILISEGUNDOS_ENTRE_TECLAS_DE_LECTOR) {
      codigo = '';
      valorAntesDelCodigo = evento.target.value ?? '';
    }
    ultimaTecla = ahora;
    if (evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey) {
      codigo += evento.key;
    } else if (evento.key === 'Enter' && codigo.length >= LARGO_MINIMO_CODIGO) {
      evento.preventDefault();
      evento.stopPropagation();
      const lectura = codigo;
      codigo = '';
      // Si el lector tecleó dentro de la cantidad o el precio, se devuelve lo que había antes del código
      if (evento.target.matches?.('[data-campo]')) {
        evento.target.value = valorAntesDelCodigo;
        evento.target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const producto = buscarProductoPorCodigo(lectura);
      if (producto) agregarProducto(producto);
      else contexto.alerta(`No existe un producto con el código ${lectura}`);
    }
  };
  addEventListener('keydown', escuchaTeclado, true);
}
