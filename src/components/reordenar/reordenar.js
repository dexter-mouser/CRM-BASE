// Reordenamiento de elementos con movimiento visible: la tarjeta levantada sigue al puntero,
// un hueco punteado marca el destino y las demás tarjetas se deslizan a su nueva posición.
// Funciona con ratón, tacto (desde el agarre) y teclado (flechas sobre el agarre).
import { buscarTodos } from '../../core/dom.js';

const UMBRAL_PX = 5;
const DURACION_MS = 220;
const SUAVIZADO = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
const TECLAS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Posición real en el diseño (sin transformaciones en curso), relativa al contenedor
const cajaEnContenedor = (elemento, contenedor) => ({
  izquierda: elemento.offsetLeft - contenedor.offsetLeft,
  arriba: elemento.offsetTop - contenedor.offsetTop,
  ancho: elemento.offsetWidth,
  alto: elemento.offsetHeight,
});

export function habilitarReordenamiento(contenedor, { selector, alCambiar }) {
  let arrastre = null;
  let aterrizajePendiente = null;

  const hijos = () => [...contenedor.children].filter((hijo) => hijo !== arrastre?.tarjeta);
  const leerOrden = () => buscarTodos(selector, contenedor).map((tarjeta) => Number(tarjeta.dataset.indice));

  // Orden que tendrán las tarjetas al soltar: la tarjeta levantada ocupa el lugar del hueco
  const leerOrdenDeDestino = ({ tarjeta, hueco }) => [...contenedor.children]
    .filter((hijo) => hijo !== tarjeta)
    .map((hijo) => Number((hijo === hueco ? tarjeta : hijo).dataset.indice));

  // Técnica FLIP: mide, mueve en el DOM y anima cada elemento desde su posición anterior
  function moverConAnimacion(mover) {
    const antes = new Map(hijos().map((hijo) => [hijo, hijo.getBoundingClientRect()]));
    mover();
    if (sinMovimiento()) return;
    hijos().forEach((hijo) => {
      const previa = antes.get(hijo), actual = hijo.getBoundingClientRect();
      const dx = previa.left - actual.left, dy = previa.top - actual.top;
      if (dx || dy) {
        hijo.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: DURACION_MS, easing: SUAVIZADO },
        );
      }
    });
  }

  function comenzar() {
    const { tarjeta } = arrastre;
    const caja = tarjeta.getBoundingClientRect();
    const hueco = document.createElement('div');
    hueco.className = 'hueco';
    hueco.style.height = caja.height + 'px';
    tarjeta.after(hueco);

    Object.assign(tarjeta.style, {
      position: 'fixed',
      left: caja.left + 'px',
      top: caja.top + 'px',
      width: caja.width + 'px',
      height: caja.height + 'px',
      margin: '0',
      pointerEvents: 'none',
    });
    tarjeta.classList.add('arrastrando');
    document.body.classList.add('arrastre-activo');
    Object.assign(arrastre, { activo: true, hueco, caja, ordenInicial: leerOrden() });
  }

  // El hueco pasa a ocupar el lugar de la tarjeta sobre la que está el puntero
  function moverHueco(x, y) {
    const marco = contenedor.getBoundingClientRect();
    const puntoX = x - marco.left, puntoY = y - marco.top;
    const objetivo = hijos().find((hijo) => {
      if (hijo === arrastre.hueco) return false;
      const caja = cajaEnContenedor(hijo, contenedor);
      return puntoX >= caja.izquierda && puntoX <= caja.izquierda + caja.ancho
        && puntoY >= caja.arriba && puntoY <= caja.arriba + caja.alto;
    });
    if (!objetivo) return;
    const lista = hijos();
    const quedaDespues = lista.indexOf(arrastre.hueco) < lista.indexOf(objetivo);
    moverConAnimacion(() => (quedaDespues ? objetivo.after(arrastre.hueco) : objetivo.before(arrastre.hueco)));
  }

  function alMover(evento) {
    if (!arrastre || evento.pointerId !== arrastre.idPuntero) return;
    // Si el botón se soltó fuera de la ventana, el siguiente movimiento cierra el arrastre
    if (evento.pointerType === 'mouse' && evento.buttons === 0) return alSoltar(evento);
    const dx = evento.clientX - arrastre.inicioX, dy = evento.clientY - arrastre.inicioY;
    if (!arrastre.activo) {
      if (Math.hypot(dx, dy) < UMBRAL_PX) return;
      comenzar();
    }
    arrastre.tarjeta.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
    moverHueco(evento.clientX, evento.clientY);
  }

  function alSoltar(evento) {
    if (!arrastre || evento.pointerId !== arrastre.idPuntero) return;
    window.removeEventListener('pointermove', alMover);
    window.removeEventListener('pointerup', alSoltar);
    window.removeEventListener('pointercancel', alSoltar);
    window.removeEventListener('blur', alPerderFoco);
    const actual = arrastre;
    arrastre = null;
    if (!actual.activo) return;

    // El orden se guarda en el instante de soltar, sin esperar a que termine la animación
    const ordenFinal = leerOrdenDeDestino(actual);
    if (ordenFinal.join() !== actual.ordenInicial.join()) alCambiar(ordenFinal);
    aterrizar(actual);
  }

  const alPerderFoco = () => arrastre && alSoltar({ pointerId: arrastre.idPuntero });

  // La tarjeta se desliza hasta el hueco y recién entonces ocupa su lugar
  function aterrizar({ tarjeta, hueco, caja }) {
    const marco = contenedor.getBoundingClientRect();
    const destino = cajaEnContenedor(hueco, contenedor);
    const dx = marco.left + destino.izquierda - caja.left;
    const dy = marco.top + destino.arriba - caja.top;
    let animacion = null;

    const terminar = () => {
      if (aterrizajePendiente !== terminar) return;
      aterrizajePendiente = null;
      animacion?.cancel();
      hueco.replaceWith(tarjeta);
      tarjeta.removeAttribute('style');
      tarjeta.classList.remove('arrastrando');
      document.body.classList.remove('arrastre-activo');
    };
    aterrizajePendiente = terminar;

    if (sinMovimiento()) return terminar();
    animacion = tarjeta.animate(
      [
        { transform: tarjeta.style.transform, width: caja.width + 'px' },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, width: destino.ancho + 'px' },
      ],
      { duration: DURACION_MS, easing: SUAVIZADO, fill: 'forwards' },
    );
    animacion.onfinish = terminar;
  }

  contenedor.addEventListener('pointerdown', (evento) => {
    const tarjeta = evento.target.closest(selector);
    const desdeAgarre = evento.target.closest('.agarre');
    // Con ratón se arrastra desde toda la tarjeta; con tacto, solo desde el agarre (para no bloquear el desplazamiento)
    if (!tarjeta || evento.button !== 0 || (evento.pointerType !== 'mouse' && !desdeAgarre)) return;

    // Si quedó algo a medias (un arrastre sin cerrar o una tarjeta aterrizando), se cierra antes de empezar otro
    if (arrastre) alSoltar({ pointerId: arrastre.idPuntero });
    aterrizajePendiente?.();

    arrastre = { tarjeta, inicioX: evento.clientX, inicioY: evento.clientY, idPuntero: evento.pointerId, activo: false };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alSoltar);
    window.addEventListener('blur', alPerderFoco);
  });

  contenedor.addEventListener('keydown', (evento) => {
    const agarre = evento.target.closest('.agarre');
    if (!agarre || !(evento.key in TECLAS)) return;
    evento.preventDefault();
    const tarjeta = agarre.closest(selector);
    const lista = buscarTodos(selector, contenedor);
    const sentido = TECLAS[evento.key];
    const vecina = lista[lista.indexOf(tarjeta) + sentido];
    if (!vecina) return;
    moverConAnimacion(() => (sentido > 0 ? vecina.after(tarjeta) : vecina.before(tarjeta)));
    agarre.focus();
    alCambiar(leerOrden());
  });
}
