/* Ruta Cafeína Mérida — comportamiento del sitio
   1. Arma el menú con cada <section data-menu="Nombre">.
      Para agregar una sección nueva basta con darle id y data-menu.
   2. Abre y cierra el menú en teléfono.
   3. Botón para copiar el teléfono.
   4. Año actual en el pie. */
(function () {
  var lista = document.getElementById('menu-lista');
  var secciones = document.querySelectorAll('section[data-menu]');
  if (lista) {
    lista.innerHTML = '';
    secciones.forEach(function (s) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.getAttribute('data-menu');
      li.appendChild(a);
      lista.appendChild(li);
    });
  }

  var boton = document.getElementById('boton-menu');
  var menu = document.getElementById('menu');
  if (boton && menu) {
    boton.addEventListener('click', function () {
      var abierto = menu.classList.toggle('abierto');
      boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      boton.textContent = abierto ? 'CERRAR' : 'MENÚ';
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && menu.classList.contains('abierto')) {
        menu.classList.remove('abierto');
        boton.setAttribute('aria-expanded', 'false');
        boton.textContent = 'MENÚ';
      }
    });
  }

  var copiar = document.getElementById('copiar-telefono');
  if (copiar) {
    copiar.addEventListener('click', function () {
      var tel = '999 259 8155';
      var listo = function () { copiar.textContent = 'Número copiado'; setTimeout(function () { copiar.textContent = 'Copiar número'; }, 2200); };
      try {
        navigator.clipboard.writeText(tel).then(listo, function () { seleccionar(); });
      } catch (e) { seleccionar(); }
      function seleccionar() {
        var t = document.querySelector('.telefono');
        var r = document.createRange(); r.selectNodeContents(t);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
    });
  }

  var anio = document.getElementById('anio');
  if (anio) anio.textContent = new Date().getFullYear();
})();
