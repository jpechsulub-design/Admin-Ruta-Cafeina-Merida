/* Ruta Cafeína Mérida — seguimiento de prospectos (mini base de datos)
   Módulo común para las dos webs privadas. No sabe dónde se guardan los datos:
   recibe un "almacén" con esta forma
     { nombre, suscribir(alCambiar, alFallar), guardar(reg) -> Promise,
       borrar(id) -> Promise, descargar(nombre, texto, tipo) -> Promise,
       respaldo: true|false }          // respaldo: muestra Respaldo / Restaurar
   Uso:  RC_prospectos.montar(elementoRaiz, almacen)                         */
(function () {
  'use strict';

  var ESTATUS = ['Prospecto', 'Muestra', 'Espera Definición', 'Aprobado', 'Descartado'];
  var PRIORIDADES = ['A', 'B', 'C'];
  var ZONAS = ['Paseo de Montejo', 'García Lavín', 'Av. Yucatán', 'Francisco de Montejo', 'Las Américas', 'Norte', 'Centro', 'Por verificar'];
  var COLUMNAS = [
    { k: 'negocio', t: 'Nombre del negocio' },
    { k: 'contacto', t: 'Contacto' },
    { k: 'zona', t: 'Zona' },
    { k: 'colonia', t: 'Colonia' },
    { k: 'direccion', t: 'Dirección' },
    { k: 'telefono', t: 'Teléfono' },
    { k: 'giro', t: 'Perfil o giro' },
    { k: 'prioridad', t: 'Prioridad' },
    { k: 'estatus', t: 'Estatus' },
    { k: 'fechas', t: 'Fecha de cada estatus', sinOrden: true },
    { k: 'notas', t: 'Notas comerciales' }
  ];
  var collator = (window.Intl && Intl.Collator) ? new Intl.Collator('es', { numeric: true, sensitivity: 'base' }) : null;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function fmt(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }
  function norm(t) {
    t = String(t == null ? '' : t).toLowerCase();
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* sin normalize */ }
    return t;
  }
  function idNuevo() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function fechasVacias() { var f = {}; ESTATUS.forEach(function (s) { f[s] = ''; }); return f; }
  function limpiar(r) {
    var o = {
      id: r.id, orden: Number(r.orden) || 0,
      negocio: String(r.negocio || '').trim(), contacto: String(r.contacto || '').trim(),
      zona: String(r.zona || '').trim(), colonia: String(r.colonia || '').trim(),
      direccion: String(r.direccion || '').trim(), telefono: String(r.telefono || '').trim(),
      giro: String(r.giro || '').trim(),
      prioridad: PRIORIDADES.indexOf(r.prioridad) >= 0 ? r.prioridad : 'C',
      estatus: ESTATUS.indexOf(r.estatus) >= 0 ? r.estatus : 'Prospecto',
      fechas: fechasVacias(), notas: String(r.notas || '').trim(),
      modificado: r.modificado || ''
    };
    ESTATUS.forEach(function (s) { var v = r.fechas && r.fechas[s]; o.fechas[s] = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; });
    return o;
  }
  function textoBusqueda(r) {
    var partes = [r.negocio, r.contacto, r.zona, r.colonia, r.direccion, r.telefono, r.giro, r.prioridad, 'prioridad ' + r.prioridad, r.estatus, r.notas];
    ESTATUS.forEach(function (s) { if (r.fechas[s]) partes.push(s, fmt(r.fechas[s]), r.fechas[s]); });
    return norm(partes.join(' | '));
  }
  function csvCelda(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  function montar(raiz, almacen) {
    var regs = [], listo = false, sel = null, q = '', fPri = '', fEst = '', fZona = '';
    var orden = { k: 'orden', dir: 1 };
    var tokens = [], temporizador = null, avisoTimer = null;
    var modal = null, menuCtx = null, anterior = null;

    raiz.innerHTML = '';
    var panel = el('div', 'pros-panel');
    var barra = el('div', 'pros-barra');
    var cuerpo = el('div', 'pros-scroll');
    cuerpo.tabIndex = 0;
    cuerpo.setAttribute('role', 'region');
    cuerpo.setAttribute('aria-label', 'Tabla de prospectos');
    var pie = el('p', 'pros-pie');
    panel.appendChild(barra); panel.appendChild(cuerpo);
    raiz.appendChild(panel); raiz.appendChild(pie);

    /* ----- Barra (siempre visible) ----- */
    var menu = el('div', 'pros-menu'); menu.setAttribute('role', 'toolbar'); menu.setAttribute('aria-label', 'Acciones sobre prospectos');
    function boton(txt, cls, fn) { var b = el('button', 'pros-btn ' + (cls || ''), txt); b.type = 'button'; b.addEventListener('click', fn); return b; }
    var bAgregar = boton('+ Agregar', 'oro', function () { abrirForm(null); });
    var bEditar = boton('Editar', '', function () { if (sel) abrirForm(sel); });
    var bBorrar = boton('Borrar', 'peligro', function () { if (sel) abrirBorrar(sel); });
    menu.appendChild(bAgregar); menu.appendChild(bEditar); menu.appendChild(bBorrar);

    var buscarWrap = el('label', 'pros-buscar');
    buscarWrap.appendChild(el('span', 'pros-solo-lector', 'Buscar en todos los campos'));
    var inBuscar = el('input'); inBuscar.type = 'search'; inBuscar.placeholder = 'Buscar en cualquier campo…'; inBuscar.autocomplete = 'off';
    inBuscar.setAttribute('aria-label', 'Buscar en cualquier campo');
    buscarWrap.appendChild(inBuscar);

    function selectFiltro(etiqueta, opciones, fn) {
      var w = el('label', 'pros-filtro'); w.appendChild(el('span', null, etiqueta));
      var s = el('select'); var o0 = el('option', null, 'Todos'); o0.value = ''; s.appendChild(o0);
      opciones.forEach(function (o) { var x = el('option', null, o); x.value = o; s.appendChild(x); });
      s.addEventListener('change', function () { fn(s.value); pintarFilas(); });
      w.appendChild(s); return { w: w, s: s };
    }
    var fE = selectFiltro('Estatus', ESTATUS, function (v) { fEst = v; });
    var fP = selectFiltro('Prioridad', PRIORIDADES, function (v) { fPri = v; });
    var fZ = selectFiltro('Zona', ZONAS, function (v) { fZona = v; });

    var extras = el('div', 'pros-extras');
    var bCsv = boton('Exportar a Excel (CSV)', 'suave', exportarCsv);
    extras.appendChild(bCsv);
    var archivo = null;
    if (almacen.respaldo) {
      extras.appendChild(boton('Respaldo', 'suave', exportarJson));
      extras.appendChild(boton('Restaurar', 'suave', function () { archivo.click(); }));
      archivo = el('input'); archivo.type = 'file'; archivo.accept = '.json,application/json'; archivo.hidden = true;
      archivo.addEventListener('change', restaurar);
      extras.appendChild(archivo);
    }
    var fila1 = el('div', 'pros-fila'); fila1.appendChild(menu); fila1.appendChild(buscarWrap);
    var fila2 = el('div', 'pros-fila pros-fila2'); fila2.appendChild(fE.w); fila2.appendChild(fP.w); fila2.appendChild(fZ.w);
    var cuenta = el('p', 'pros-cuenta'); cuenta.setAttribute('aria-live', 'polite');
    fila2.appendChild(cuenta); fila2.appendChild(extras);
    var estado = el('p', 'pros-estado'); estado.setAttribute('role', 'status');
    barra.appendChild(fila1); barra.appendChild(fila2); barra.appendChild(estado);

    inBuscar.addEventListener('input', function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { q = inBuscar.value; tokens = norm(q).split(/\s+/).filter(Boolean); pintarFilas(); }, 120);
    });
    inBuscar.addEventListener('keydown', function (e) { if (e.key === 'Escape' && inBuscar.value) { inBuscar.value = ''; q = ''; tokens = []; pintarFilas(); } });

    function avisar(txt, malo) {
      estado.textContent = txt; estado.className = 'pros-estado' + (malo ? ' mal' : '');
      clearTimeout(avisoTimer);
      if (txt && !malo) avisoTimer = setTimeout(function () { estado.textContent = ''; }, 3500);
    }

    /* ----- Tabla ----- */
    var tabla = el('table', 'pros-tabla');
    var thead = el('thead'), trh = el('tr');
    COLUMNAS.forEach(function (c, i) {
      var th = el('th'); th.scope = 'col';
      if (i === 0) th.className = 'fija';
      if (c.sinOrden) { th.textContent = c.t; }
      else {
        var b = el('button', 'pros-th', c.t); b.type = 'button';
        b.addEventListener('click', function () {
          if (orden.k === c.k) orden.dir = -orden.dir; else { orden.k = c.k; orden.dir = 1; }
          pintarFilas();
        });
        th.appendChild(b);
      }
      th.dataset.k = c.k; trh.appendChild(th);
    });
    thead.appendChild(trh); tabla.appendChild(thead);
    var tbody = el('tbody'); tabla.appendChild(tbody);
    cuerpo.appendChild(tabla);
    var vacio = el('p', 'pros-vacio'); vacio.hidden = true; cuerpo.appendChild(vacio);

    function valorOrden(r, k) {
      if (k === 'estatus') return ESTATUS.indexOf(r.estatus);
      if (k === 'orden') return r.orden;
      return r[k] || '';
    }
    function comparar(a, b) {
      var x = valorOrden(a, orden.k), y = valorOrden(b, orden.k), c;
      if (typeof x === 'number' && typeof y === 'number') c = x - y;
      else c = collator ? collator.compare(String(x), String(y)) : String(x).localeCompare(String(y));
      if (c === 0) c = a.orden - b.orden;
      return c * orden.dir;
    }
    function visibles() {
      return regs.filter(function (r) {
        if (fEst && r.estatus !== fEst) return false;
        if (fPri && r.prioridad !== fPri) return false;
        if (fZona && r.zona !== fZona) return false;
        for (var i = 0; i < tokens.length; i++) if (r._b.indexOf(tokens[i]) < 0) return false;
        return true;
      }).sort(comparar);
    }
    function celda(txt, cls) { var td = el('td', cls || null); td.textContent = txt || ''; if (!txt) td.classList.add('nada'); return td; }

    function pintarFilas() {
      ths();
      var lista = visibles();
      tbody.innerHTML = '';
      lista.forEach(function (r) {
        var tr = el('tr'); tr.dataset.id = r.id; tr.tabIndex = 0;
        if (r.id === sel) { tr.className = 'sel'; tr.setAttribute('aria-selected', 'true'); }
        var td0 = celda(r.negocio, 'fija neg'); tr.appendChild(td0);
        tr.appendChild(celda(r.contacto));
        tr.appendChild(celda(r.zona));
        tr.appendChild(celda(r.colonia));
        tr.appendChild(celda(r.direccion, 'ancha'));
        tr.appendChild(celda(r.telefono, 'tel'));
        tr.appendChild(celda(r.giro, 'ancha'));
        var tp = el('td'); tp.appendChild(el('span', 'pri pri-' + r.prioridad, r.prioridad)); tr.appendChild(tp);
        var te = el('td'); te.appendChild(el('span', 'est est-' + ESTATUS.indexOf(r.estatus), r.estatus));
        if (r.fechas[r.estatus]) te.appendChild(el('small', 'est-fecha', fmt(r.fechas[r.estatus])));
        tr.appendChild(te);
        var tf = el('td', 'fechas');
        var hay = false;
        ESTATUS.forEach(function (s) {
          if (!r.fechas[s]) return; hay = true;
          var c = el('span', 'fch'); c.appendChild(el('b', null, s)); c.appendChild(document.createTextNode(' ' + fmt(r.fechas[s]))); tf.appendChild(c);
        });
        if (!hay) { tf.textContent = 'Sin fechas'; tf.classList.add('nada'); }
        tr.appendChild(tf);
        tr.appendChild(celda(r.notas, 'notas'));
        tbody.appendChild(tr);
      });
      var total = regs.length;
      cuenta.textContent = listo ? 'Mostrando ' + lista.length + ' de ' + total : '';
      vacio.hidden = !listo || lista.length > 0;
      vacio.textContent = total ? 'Ningún prospecto coincide con la búsqueda o los filtros.' : 'Todavía no hay prospectos. Usa «+ Agregar» para registrar el primero.';
      resumen();
      botones();
    }
    function ths() {
      Array.prototype.forEach.call(trh.children, function (th) {
        var b = th.querySelector('button');
        if (!b) return;
        var activo = th.dataset.k === orden.k;
        th.setAttribute('aria-sort', activo ? (orden.dir === 1 ? 'ascending' : 'descending') : 'none');
        th.classList.toggle('activo', activo);
        b.dataset.flecha = activo ? (orden.dir === 1 ? '▲' : '▼') : '';
      });
    }
    function resumen() {
      var n = {}; ESTATUS.forEach(function (s) { n[s] = 0; });
      regs.forEach(function (r) { n[r.estatus]++; });
      pie.textContent = ESTATUS.map(function (s) { return s + ': ' + n[s]; }).join('  ·  ');
    }
    function botones() {
      var hay = !!(sel && buscar(sel));
      bEditar.disabled = !hay; bBorrar.disabled = !hay;
      bEditar.title = hay ? '' : 'Primero selecciona un prospecto de la lista';
      bBorrar.title = bEditar.title;
    }
    function buscar(id) { for (var i = 0; i < regs.length; i++) if (regs[i].id === id) return regs[i]; return null; }
    function seleccionar(id) {
      sel = id;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var on = tr.dataset.id === id; tr.classList.toggle('sel', on);
        if (on) tr.setAttribute('aria-selected', 'true'); else tr.removeAttribute('aria-selected');
      });
      botones();
    }
    tbody.addEventListener('click', function (e) { var tr = e.target.closest('tr'); if (tr) seleccionar(tr.dataset.id); });
    tbody.addEventListener('dblclick', function (e) { var tr = e.target.closest('tr'); if (tr) { seleccionar(tr.dataset.id); abrirForm(tr.dataset.id); } });
    tbody.addEventListener('keydown', function (e) {
      var tr = e.target.closest && e.target.closest('tr'); if (!tr) return;
      if (e.key === 'Enter') { seleccionar(tr.dataset.id); abrirForm(tr.dataset.id); }
      else if (e.key === ' ') { e.preventDefault(); seleccionar(tr.dataset.id); }
      else if (e.key === 'ArrowDown' && tr.nextElementSibling) { e.preventDefault(); tr.nextElementSibling.focus(); seleccionar(tr.nextElementSibling.dataset.id); }
      else if (e.key === 'ArrowUp' && tr.previousElementSibling) { e.preventDefault(); tr.previousElementSibling.focus(); seleccionar(tr.previousElementSibling.dataset.id); }
    });

    /* ----- Menú con clic derecho sobre una fila ----- */
    function cerrarCtx() { if (menuCtx) { menuCtx.remove(); menuCtx = null; } }
    tbody.addEventListener('contextmenu', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return;
      e.preventDefault(); seleccionar(tr.dataset.id); cerrarCtx();
      menuCtx = el('div', 'pros-ctx'); menuCtx.setAttribute('role', 'menu');
      [['Editar', function () { abrirForm(sel); }], ['Borrar', function () { abrirBorrar(sel); }], ['Agregar nuevo', function () { abrirForm(null); }]].forEach(function (a) {
        var b = el('button', null, a[0]); b.type = 'button'; b.setAttribute('role', 'menuitem');
        b.addEventListener('click', function () { cerrarCtx(); a[1](); }); menuCtx.appendChild(b);
      });
      document.body.appendChild(menuCtx);
      var w = menuCtx.offsetWidth, h = menuCtx.offsetHeight;
      menuCtx.style.left = Math.max(8, Math.min(e.clientX, window.innerWidth - w - 8)) + 'px';
      menuCtx.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - h - 8)) + 'px';
      menuCtx.firstChild.focus();
    });
    document.addEventListener('click', function (e) { if (menuCtx && !menuCtx.contains(e.target)) cerrarCtx(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cerrarCtx(); } });
    window.addEventListener('scroll', cerrarCtx, true);

    /* ----- Ventanas (formulario y borrar) ----- */
    function cerrarModal() {
      if (modal) { modal.remove(); modal = null; document.body.classList.remove('pros-bloqueo'); if (anterior && anterior.focus) anterior.focus(); }
    }
    function nuevoModal(titulo, ancho) {
      cerrarModal(); anterior = document.activeElement;
      modal = el('div', 'pros-modal');
      var caja = el('div', 'pros-caja' + (ancho ? ' ' + ancho : '')); caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true');
      var h = el('h3', null, titulo); h.id = 'pros-titulo'; caja.setAttribute('aria-labelledby', 'pros-titulo');
      caja.appendChild(h); modal.appendChild(caja);
      modal.addEventListener('mousedown', function (e) { if (e.target === modal) cerrarModal(); });
      modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); cerrarModal(); return; }
        if (e.key !== 'Tab') return;
        var f = caja.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea');
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      });
      document.body.appendChild(modal); document.body.classList.add('pros-bloqueo');
      return caja;
    }
    function campo(caja, id, etiqueta, tipo, valor, extra) {
      var w = el('div', 'pros-campo' + (extra && extra.ancho ? ' ' + extra.ancho : ''));
      var l = el('label', null, etiqueta); l.htmlFor = 'pf-' + id; w.appendChild(l);
      var i;
      if (tipo === 'textarea') { i = el('textarea'); i.rows = 4; }
      else if (tipo === 'select') {
        i = el('select');
        extra.opciones.forEach(function (o) { var x = el('option', null, o); x.value = o; i.appendChild(x); });
      } else { i = el('input'); i.type = tipo; }
      i.id = 'pf-' + id; i.name = id;
      if (tipo !== 'select') i.value = valor || ''; else i.value = valor;
      if (extra && extra.lista) i.setAttribute('list', extra.lista);
      if (extra && extra.req) { i.required = true; l.textContent = etiqueta + ' *'; }
      if (tipo === 'tel') i.inputMode = 'tel';
      w.appendChild(i); caja.appendChild(w); return i;
    }

    function abrirForm(id) {
      cerrarCtx();
      var r = id ? buscar(id) : null;
      if (id && !r) return;
      var base = r ? r : limpiar({ prioridad: 'B', estatus: 'Prospecto' });
      var caja = nuevoModal(r ? 'Editar prospecto' : 'Agregar prospecto', 'ancha');
      var form = el('form', 'pros-form'); form.noValidate = true;
      caja.appendChild(form);
      var dl = el('datalist'); dl.id = 'pf-zonas'; ZONAS.forEach(function (z) { var o = el('option'); o.value = z; dl.appendChild(o); }); form.appendChild(dl);
      var f = {};
      f.negocio = campo(form, 'negocio', 'Nombre del negocio', 'text', base.negocio, { req: true, ancho: 'c2' });
      f.contacto = campo(form, 'contacto', 'Nombre del contacto', 'text', base.contacto);
      f.zona = campo(form, 'zona', 'Zona', 'text', base.zona, { lista: 'pf-zonas' });
      f.colonia = campo(form, 'colonia', 'Colonia', 'text', base.colonia);
      f.telefono = campo(form, 'telefono', 'Teléfono', 'tel', base.telefono);
      f.direccion = campo(form, 'direccion', 'Dirección', 'text', base.direccion, { ancho: 'c3' });
      f.giro = campo(form, 'giro', 'Perfil o giro', 'text', base.giro, { ancho: 'c3' });
      f.prioridad = campo(form, 'prioridad', 'Prioridad', 'select', base.prioridad, { opciones: PRIORIDADES });
      f.estatus = campo(form, 'estatus', 'Estatus actual', 'select', base.estatus, { opciones: ESTATUS });

      var gr = el('fieldset', 'pros-fechas'); gr.appendChild(el('legend', null, 'Fecha de cada estatus'));
      gr.appendChild(el('p', 'pros-ayuda', 'Anota el día en que el prospecto llegó a cada estatus. Al cambiar el estatus actual se propone la fecha de hoy si ese casillero está vacío.'));
      var cuad = el('div', 'pros-fechas-grid'); gr.appendChild(cuad);
      var fx = {};
      ESTATUS.forEach(function (s, i) {
        var w = el('div', 'pros-campo'); var l = el('label', null, s); l.htmlFor = 'pf-f' + i; w.appendChild(l);
        var d = el('input'); d.type = 'date'; d.id = 'pf-f' + i; d.value = base.fechas[s] || ''; w.appendChild(d); cuad.appendChild(w); fx[s] = d;
      });
      form.appendChild(gr);
      f.estatus.addEventListener('change', function () { var d = fx[f.estatus.value]; if (d && !d.value) d.value = hoy(); });
      f.notas = campo(form, 'notas', 'Notas comerciales', 'textarea', base.notas, { ancho: 'c3' });

      var msg = el('p', 'pros-error'); msg.setAttribute('role', 'alert'); msg.hidden = true; form.appendChild(msg);
      var acc = el('div', 'pros-acciones');
      var bc = boton('Cancelar', '', cerrarModal);
      var bg = el('button', 'pros-btn oro', r ? 'Guardar cambios' : 'Guardar prospecto'); bg.type = 'submit';
      acc.appendChild(bc); acc.appendChild(bg); form.appendChild(acc);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.negocio.value.trim()) { msg.textContent = 'Escribe el nombre del negocio.'; msg.hidden = false; f.negocio.focus(); return; }
        var nuevo = {
          id: r ? r.id : idNuevo(),
          orden: r ? r.orden : (regs.reduce(function (m, x) { return Math.max(m, x.orden); }, 0) + 1),
          negocio: f.negocio.value, contacto: f.contacto.value, zona: f.zona.value, colonia: f.colonia.value,
          direccion: f.direccion.value, telefono: f.telefono.value, giro: f.giro.value,
          prioridad: f.prioridad.value, estatus: f.estatus.value, notas: f.notas.value, fechas: fechasVacias()
        };
        ESTATUS.forEach(function (s) { nuevo.fechas[s] = fx[s].value; });
        if (!nuevo.fechas[nuevo.estatus]) nuevo.fechas[nuevo.estatus] = hoy();
        nuevo = limpiar(nuevo); nuevo.modificado = new Date().toISOString();
        bg.disabled = true; bg.textContent = 'Guardando…';
        Promise.resolve(almacen.guardar(nuevo)).then(function () {
          sel = nuevo.id; cerrarModal(); avisar('Guardado: ' + nuevo.negocio);
          var i = regs.findIndex(function (x) { return x.id === nuevo.id; });
          nuevo._b = textoBusqueda(nuevo); if (i >= 0) regs[i] = nuevo; else regs.push(nuevo);
          pintarFilas(); var tr = tbody.querySelector('tr.sel'); if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
        }, function () {
          bg.disabled = false; bg.textContent = r ? 'Guardar cambios' : 'Guardar prospecto';
          msg.textContent = 'No se pudo guardar. Revisa la conexión e inténtalo otra vez.'; msg.hidden = false;
        });
      });
      f.negocio.focus();
    }

    function abrirBorrar(id) {
      cerrarCtx();
      var r = buscar(id); if (!r) return;
      var caja = nuevoModal('Borrar prospecto', 'angosta');
      var p = el('p', 'pros-conf'); p.appendChild(document.createTextNode('Se va a borrar '));
      p.appendChild(el('b', null, r.negocio)); p.appendChild(document.createTextNode(' con todas sus fechas y notas. Esta acción no se puede deshacer.'));
      caja.appendChild(p);
      var msg = el('p', 'pros-error'); msg.setAttribute('role', 'alert'); msg.hidden = true; caja.appendChild(msg);
      var acc = el('div', 'pros-acciones');
      var bc = boton('Cancelar', '', cerrarModal);
      var bb = boton('Sí, borrar', 'peligro', function () {
        bb.disabled = true; bb.textContent = 'Borrando…';
        Promise.resolve(almacen.borrar(r.id)).then(function () {
          regs = regs.filter(function (x) { return x.id !== r.id; }); if (sel === r.id) sel = null;
          cerrarModal(); avisar('Borrado: ' + r.negocio); pintarFilas();
        }, function () { bb.disabled = false; bb.textContent = 'Sí, borrar'; msg.textContent = 'No se pudo borrar. Inténtalo otra vez.'; msg.hidden = false; });
      });
      acc.appendChild(bc); acc.appendChild(bb); caja.appendChild(acc);
      bc.focus();
    }

    /* ----- Exportar / respaldo ----- */
    function guardarArchivo(nombre, texto, tipo) {
      if (almacen.descargar) return almacen.descargar(nombre, texto, tipo);
      return Promise.reject(new Error('sin descarga'));
    }
    function exportarCsv() {
      var lista = visibles();
      var cab = ['Nombre del negocio', 'Nombre del contacto', 'Zona', 'Colonia', 'Dirección', 'Teléfono', 'Perfil o giro', 'Prioridad', 'Estatus'];
      ESTATUS.forEach(function (s) { cab.push('Fecha ' + s); });
      cab.push('Notas comerciales');
      var filas = [cab.map(csvCelda).join(',')];
      lista.forEach(function (r) {
        var c = [r.negocio, r.contacto, r.zona, r.colonia, r.direccion, r.telefono, r.giro, r.prioridad, r.estatus];
        ESTATUS.forEach(function (s) { c.push(fmt(r.fechas[s])); });
        c.push(r.notas); filas.push(c.map(csvCelda).join(','));
      });
      guardarArchivo('prospectos-' + hoy() + '.csv', '﻿' + filas.join('\r\n'), 'text/csv;charset=utf-8').then(
        function () { avisar('Archivo listo (' + lista.length + ' prospectos).'); },
        function (e) { if (!e || e.code !== 'declined') avisar('No se pudo generar el archivo en este navegador.', true); });
    }
    function exportarJson() {
      var datos = regs.map(function (r) { var o = JSON.parse(JSON.stringify(r)); delete o._b; return o; });
      guardarArchivo('respaldo-prospectos-' + hoy() + '.json', JSON.stringify({ tipo: 'rc-prospectos', version: 1, prospectos: datos }, null, 1), 'application/json').then(
        function () { avisar('Respaldo generado (' + datos.length + ' prospectos).'); },
        function () { avisar('No se pudo generar el respaldo.', true); });
    }
    function restaurar() {
      var a = archivo.files && archivo.files[0]; if (!a) return;
      var lector = new FileReader();
      lector.onload = function () {
        try {
          var j = JSON.parse(lector.result);
          var lista = j && j.tipo === 'rc-prospectos' ? j.prospectos : null;
          if (!Array.isArray(lista)) throw new Error('formato');
          var tareas = lista.map(function (x) { var n = limpiar(x); n.id = x.id || idNuevo(); return Promise.resolve(almacen.guardar(n)); });
          Promise.all(tareas).then(function () { avisar('Restaurados ' + lista.length + ' prospectos.'); }, function () { avisar('No se pudo restaurar todo.', true); });
        } catch (e) { avisar('Ese archivo no es un respaldo de prospectos válido.', true); }
        archivo.value = '';
      };
      lector.readAsText(a);
    }

    /* ----- Datos ----- */
    var lento = setTimeout(function () { if (!listo) { vacio.hidden = false; vacio.textContent = 'La información tarda en responder. Seguimos intentando…'; } }, 10000);
    vacio.hidden = false; vacio.textContent = 'Cargando prospectos…';
    almacen.suscribir(function (lista) {
      clearTimeout(lento); listo = true;
      regs = lista.map(function (x) { var r = limpiar(x); r._b = textoBusqueda(r); return r; });
      if (sel && !buscar(sel)) sel = null;
      pintarFilas();
    }, function () {
      clearTimeout(lento);
      vacio.hidden = false; vacio.textContent = 'No se pudo leer la base de prospectos. Recarga la página e inténtalo de nuevo.';
    });
    pintarFilas();
  }

  window.RC_prospectos = { montar: montar, ESTATUS: ESTATUS, limpiar: limpiar };
})();
