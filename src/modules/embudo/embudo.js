import { buscar } from '../../core/dom.js';
import { aPesos, aFecha } from '../../core/format.js';
import { puede } from '../../core/autorizacion.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { resumirItems, buscarDocumento } from '../../services/ventas.service.js';
import * as servicioEmbudo from '../../services/embudo.service.js';
import { mostrarReciboDeVenta } from '../../components/recibo/comprobantes.js';
import { elementos, opcionesDe, ETAPAS_CERRADAS } from '../../services/catalogos.service.js';
import { refrescarAlertas } from '../../components/header/header.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { mensajeDeError } from '../../core/errores.js';

let documento;
let plantillasFicha;
let plantillasFormulario;

export async function dibujar() {
  documento = await cargarHtml(new URL('./embudo.html', import.meta.url));
  [plantillasFicha, plantillasFormulario] = await Promise.all([cargarPlantillasFicha(), cargarPlantillasFormulario()]);
  return seccion(documento, 'principal');
}

export function montar(raiz, contexto) {
  const puedeEditar = puede('embudo', 'editar');
  const puedeConvertir = puede('nueva-venta', 'crear');
  buscar('#nueva-cotizacion', raiz).hidden = !puedeConvertir;

  // Botones de una oportunidad según su etapa (en la tarjeta y en la ficha)
  const accionesDe = (cotizacion) => {
    const etapa = servicioEmbudo.etapaDe(cotizacion);
    const abierta = !ETAPAS_CERRADAS.includes(etapa);
    const siguiente = servicioEmbudo.siguienteEtapa(cotizacion);
    let acciones = '';
    if (abierta && puedeEditar) {
      acciones = repetir(documento, 'acciones-abierta', [{
        id: cotizacion.id,
        avanzar: siguiente ? repetir(documento, 'boton-avanzar', [{ id: cotizacion.id, etapa: siguiente.id, nombre: siguiente.nombre }]) : '',
      }]);
      // Sin permiso para registrar ventas no se ofrece facturar ni remisionar
      if (!puedeConvertir) acciones = acciones.replace(/<a class="boton[^"]*" href="nueva-venta[^>]*>[^<]*<\/a>/g, '');
    }
    return acciones;
  };

  const motivoDe = (cotizacion) => {
    const etapa = servicioEmbudo.etapaDe(cotizacion);
    let motivo = '';
    if (etapa === 'perdida') motivo = servicioEmbudo.motivoDePerdida(cotizacion);
    if (etapa === 'ganada') motivo = `Pasada a ${cotizacion.convertidoEn}`;
    return motivo;
  };

  const tarjeta = (cotizacion) => {
    const vencida = servicioEmbudo.estaVencida(cotizacion);
    const motivo = motivoDe(cotizacion);
    const acciones = repetir(documento, 'boton-ficha', [{ id: cotizacion.id }]) + accionesDe(cotizacion);
    return repetir(documento, 'tarjeta-oportunidad', [{
      id: cotizacion.id,
      total: aPesos(cotizacion.total),
      cliente: cotizacion.cliente,
      enlaceCliente: cotizacion.clienteId ? `clientes.html?ficha=${cotizacion.clienteId}` : 'clientes.html',
      productos: resumirItems(cotizacion),
      usuario: cotizacion.usuario,
      vigencia: vencida ? `Vencida el ${aFecha(cotizacion.vigenciaHasta.slice(0, 10))}` : `Válida hasta ${aFecha(cotizacion.vigenciaHasta.slice(0, 10))}`,
      clase: vencida ? 'vencida' : '',
      motivo: motivo ? repetir(documento, 'motivo-tarjeta', [{ texto: motivo }]) : '',
      acciones,
    }]);
  };

  const pintar = () => {
    const lista = servicioEmbudo.cotizaciones().slice().reverse();
    const resumen = servicioEmbudo.resumenDelEmbudo(lista);

    buscar('#resumen-embudo', raiz).innerHTML = repetir(documento, 'indicador', [
      { etiqueta: 'Valor en juego (abiertas)', valor: aPesos(resumen.enJuego) },
      { etiqueta: 'Ganadas', valor: `${resumen.porEtapa.ganada.cantidad} · ${aPesos(resumen.porEtapa.ganada.valor)}` },
      { etiqueta: 'Perdidas', valor: `${resumen.porEtapa.perdida.cantidad} · ${aPesos(resumen.porEtapa.perdida.valor)}` },
      { etiqueta: 'Conversión', valor: `${resumen.conversion} %` },
    ]);
    // Columnas: las etapas activas y las desactivadas que aún tienen cotizaciones
    const etapas = elementos('etapasEmbudo').filter((etapa) => etapa.activo || resumen.porEtapa[etapa.id].cantidad);
    buscar('#tablero', raiz).innerHTML = etapas.map((etapa) => {
      const deEtapa = lista.filter((cotizacion) => servicioEmbudo.etapaDe(cotizacion) === etapa.id);
      return repetir(documento, 'columna-embudo', [{
        etapa: etapa.id,
        titulo: etapa.nombre,
        cantidad: deEtapa.length,
        valor: aPesos(resumen.porEtapa[etapa.id].valor),
        tarjetas: deEtapa.map(tarjeta).join(''),
        vacio: deEtapa.length ? '' : repetir(documento, 'columna-vacia', [{}]),
      }]);
    }).join('');

    const alertas = servicioEmbudo.alertasDeCotizaciones();
    buscar('#alertas-embudo', raiz).hidden = !alertas.length;
    buscar('#titulo-alertas', raiz).textContent = `${alertas.length} cotización(es) vencida(s) sin motivo: ${alertas.map((cotizacion) => cotizacion.id).join(', ')}`;
  };

  const ejecutar = (accion, mensaje) => {
    try {
      accion();
      contexto.aviso(mensaje);
      pintar();
      ficha.refrescar();
      refrescarAlertas();
      return true;
    } catch (error) {
      contexto.alerta(mensajeDeError(error));
      return false;
    }
  };

  // El motivo no se supone: la persona lo elige; el detalle es obligatorio si el motivo lo pide en Ajustes
  const panelPerdida = montarFormulario(buscar('#panel-perdida', raiz), {
    plantillas: plantillasFormulario,
    clave: 'perdida',
    textoGuardar: 'Registrar como perdida',
    columnas: 2,
    alError: contexto.alerta,
    campos: [
      { clave: 'motivo', etiqueta: 'Motivo', tipo: 'seleccion', obligatorio: true, valor: '', opciones: () => [['', 'Elige el motivo'], ...opcionesDe('motivosPerdida')] },
      { clave: 'detalle', etiqueta: 'Detalle', maximo: 200, ayuda: 'Obligatorio si el motivo lo pide (por ejemplo, «Otro»)' },
    ],
    alGuardar: ({ motivo, detalle }, cotizacion) => ejecutar(
      () => servicioEmbudo.marcarPerdida(cotizacion.id, motivo, detalle),
      `Cotización ${cotizacion.id} registrada como perdida correctamente`,
    ),
  });
  const abrirPerdida = (id) => panelPerdida.abrir({ id }, `¿Por qué se perdió la cotización ${id}?`);

  // Ficha de la oportunidad: datos de la cotización y sus acciones del embudo
  const ficha = crearFicha(buscar('#ficha-oportunidad', raiz), plantillasFicha);
  const abrirFicha = (id) => ficha.abrir(id, () => {
    const cotizacion = buscarDocumento(id);
    if (!cotizacion) return null;
    const enlace = cotizacion.clienteId ? `clientes.html?ficha=${cotizacion.clienteId}` : 'clientes.html';
    return {
      etiqueta: 'Ficha de la oportunidad',
      titulo: `Cotización ${cotizacion.id} · ${cotizacion.cliente}`,
      subtitulo: servicioEmbudo.etiquetaDeEtapa(servicioEmbudo.etapaDe(cotizacion)) + (servicioEmbudo.estaVencida(cotizacion) ? ' · vencida' : ''),
      indicadores: [{ etiqueta: 'Valor', valor: aPesos(cotizacion.total) }],
      datos: [
        { etiqueta: 'Cliente', valor: repetir(documento, 'enlace-cliente', [{ enlace, nombre: cotizacion.cliente }]), html: true },
        { etiqueta: 'Vendedor', valor: cotizacion.usuario ?? '' },
        { etiqueta: 'Fecha', valor: aFecha(cotizacion.fecha) },
        { etiqueta: 'Válida hasta', valor: aFecha(cotizacion.vigenciaHasta.slice(0, 10)) },
        { etiqueta: 'Productos', valor: resumirItems(cotizacion), ancho: true },
        { etiqueta: 'Resultado', valor: motivoDe(cotizacion), ancho: true },
        { etiqueta: 'Mensaje personalizado', valor: cotizacion.observaciones ?? '', ancho: true },
      ],
      acciones: repetir(documento, 'acciones-ficha', [{ id: cotizacion.id, acciones: accionesDe(cotizacion) }]),
    };
  });

  const avanzar = (id, etapa) => ejecutar(
    () => servicioEmbudo.cambiarEtapa(id, etapa),
    `Cotización ${id} pasada a ${servicioEmbudo.etiquetaDeEtapa(etapa)} correctamente`,
  );

  const alTocar = (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    if (boton.dataset.ficha) abrirFicha(boton.dataset.ficha);
    else if (boton.dataset.ver) mostrarReciboDeVenta(buscarDocumento(boton.dataset.ver));
    else if (boton.dataset.avanzar) avanzar(boton.dataset.avanzar, boton.dataset.etapa);
    else if (boton.dataset.perder) abrirPerdida(boton.dataset.perder);
  };
  buscar('#tablero', raiz).addEventListener('click', alTocar);
  buscar('#ficha-oportunidad', raiz).addEventListener('click', alTocar);

  pintar();
  // Llega desde la alerta del encabezado con ?perdida=C17 para registrar el motivo directamente
  const pedida = new URLSearchParams(location.search).get('perdida');
  if (pedida && puedeEditar) abrirPerdida(pedida);
}
