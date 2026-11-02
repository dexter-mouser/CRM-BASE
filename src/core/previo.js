// Script clásico que corre antes de dibujar la página: aplica el tema guardado y,
// en las páginas protegidas (<html data-protegida>), redirige al ingreso si no hay sesión vigente.
(function () {
  var raiz = document.documentElement;
  try {
    var tema = localStorage.getItem('generico.tema');
    if (tema !== 'claro' && tema !== 'oscuro') tema = matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
    raiz.dataset.tema = tema;
  } catch (error) { /* sin almacenamiento */ }

  if (!('protegida' in raiz.dataset)) return;

  function vigente(almacen) {
    try {
      var datos = JSON.parse(window[almacen].getItem('generico.sesion'));
      return !!datos && datos.expira > Date.now();
    } catch (error) { return false; }
  }

  if (!vigente('sessionStorage') && !vigente('localStorage')) {
    raiz.hidden = true;
    // Las páginas protegidas viven en paginas/; el ingreso está en la raíz
    location.replace('../index.html?siguiente=' + encodeURIComponent(location.pathname.split('/').pop() || 'panel.html'));
  }
})();
