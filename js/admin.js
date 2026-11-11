/* Ruta Cafeína Mérida — sitio privado
   1) Puerta: pide la contraseña, descifra el contenido (AES-256-GCM, clave derivada
      con PBKDF2-SHA256) y lo muestra. Sin la contraseña solo existe texto cifrado.
   2) Sección Competencia: lista, fichas y diapositivas con los datos descifrados. */
(function () {
  'use strict';

  var CANDADO = '<svg class="candado" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2zM9 7a3 3 0 0 1 6 0v2H9V7zm4 9.7V19h-2v-2.3a2 2 0 1 1 2 0z"/></svg>';
  var est = { comps: [], cfg: null, listo: false, cfgListo: false, error: false, lento: false, vista: 'lista', slug: null, dia: 0 };
  var sec, raiz, puenteMover = null, primeraRuta = true;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function ul(items, cls) {
    var u = el('ul', cls || 'comp-lista');
    (items || []).forEach(function (t) { u.appendChild(el('li', null, t)); });
    return u;
  }
  function enlace(href, txt, cls) {
    var a = el('a', cls, txt); a.href = href; return a;
  }
  function buscar(slug) {
    for (var i = 0; i < est.comps.length; i++) if (est.comps[i].slug === slug) return est.comps[i];
    return null;
  }
  function aviso(txt) { return el('div', 'comp-aviso', txt); }

  /* ---------- Rutas ---------- */
  function leerRuta() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h === 'competencia') return { vista: 'lista' };
    if (h === 'competencia-diapositivas') return { vista: 'slides' };
    if (h.indexOf('competencia-') === 0) return { vista: 'ficha', slug: h.slice(12) };
    return null;
  }
  function alCambiarRuta() {
    var r = leerRuta();
    if (!r) return;
    est.vista = r.vista; est.slug = r.slug || null;
    render();
    sec.scrollIntoView({ behavior: primeraRuta ? 'auto' : 'smooth', block: 'start' });
    primeraRuta = false;
  }

  /* ---------- Piezas comunes ---------- */
  function pestanas(vista) {
    var n = el('nav', 'comp-tabs'); n.setAttribute('aria-label', 'Vistas de competencia');
    var a = enlace('#competencia', 'Competidores');
    var b = enlace('#competencia-diapositivas', 'Diapositivas');
    (vista === 'slides' ? b : a).setAttribute('aria-current', 'page');
    n.appendChild(a); n.appendChild(b);
    return n;
  }

  /* ---------- Lista ---------- */
  function vistaLista() {
    var w = el('div', 'comp-lista-vista');
    var r = el('p', 'comp-resumen');
    var b1 = el('span'); b1.appendChild(el('b', null, String(est.comps.length))); b1.appendChild(document.createTextNode(' competidores'));
    r.appendChild(b1);
    r.appendChild(el('span', null, 'Nuestros precios: $380/kg a cafeterías · $420/kg a empresas · $260 la bolsa de 500 g'));
    if (est.cfg && est.cfg.actualizacion) r.appendChild(el('span', null, 'Actualizada el ' + est.cfg.actualizacion));
    w.appendChild(r);

    var orden = (est.cfg && est.cfg.gruposOrden) ? est.cfg.gruposOrden.slice() : [];
    est.comps.forEach(function (c) { if (orden.indexOf(c.grupo) < 0) orden.push(c.grupo); });
    orden.forEach(function (g) {
      var del = est.comps.filter(function (c) { return c.grupo === g; });
      if (!del.length) return;
      var gr = el('div', 'comp-grupo');
      gr.appendChild(el('h3', null, g));
      var l = el('ul', 'comp-filas');
      del.forEach(function (c) {
        var li = el('li');
        var a = enlace('#competencia-' + c.slug, null, 'comp-fila');
        a.setAttribute('aria-label', 'Ver la ficha de ' + c.nombre);
        var nom = el('span', 'nombre', c.nombre);
        nom.appendChild(el('span', 'tipo', c.tipo));
        a.appendChild(nom);
        a.appendChild(el('span', 'precio', c.precio));
        a.appendChild(el('span', 'ir', 'Ver ficha →'));
        li.appendChild(a); l.appendChild(li);
      });
      gr.appendChild(l); w.appendChild(gr);
    });
    if (est.cfg && est.cfg.notaPrecios) w.appendChild(el('p', 'comp-pie-lista', est.cfg.notaPrecios));
    return w;
  }

  /* ---------- Ficha ---------- */
  function vistaFicha(c) {
    var w = el('article', 'comp-ficha');
    var top = el('div', 'comp-acciones');
    top.appendChild(enlace('#competencia', '← Volver a la lista de competidores', 'boton boton-linea'));
    w.appendChild(top);

    var cab = el('header', 'comp-cab');
    cab.appendChild(el('p', 'etiqueta', c.grupo));
    cab.appendChild(el('h3', null, c.nombre));
    cab.appendChild(el('p', null, c.tipo));
    w.appendChild(cab);

    var d = el('dl', 'comp-datos');
    [['Qué ofrece', c.cafe], ['Precio de referencia', c.precio], ['Fuente', c.fuente]].forEach(function (p) {
      if (!p[1]) return;
      var x = el('div'); x.appendChild(el('dt', null, p[0])); x.appendChild(el('dd', null, p[1])); d.appendChild(x);
    });
    w.appendChild(d);

    var dos = el('div', 'comp-dos');
    var f = el('div'); f.appendChild(el('h4', null, 'Lo que hace bien')); f.appendChild(ul(c.fortalezas));
    var de = el('div'); de.appendChild(el('h4', null, 'Dónde deja un hueco')); de.appendChild(ul(c.debilidades));
    dos.appendChild(f); dos.appendChild(de); w.appendChild(dos);

    var resp = el('section', 'comp-bloque comp-respuesta');
    resp.appendChild(el('h4', null, 'Lo que responde Ruta Cafeína'));
    resp.appendChild(ul(c.ventajas));
    w.appendChild(resp);

    if (c.speechContrasta || c.speechPropone) {
      var voz = el('section', 'comp-bloque');
      voz.appendChild(el('h4', null, 'Cómo decirlo'));
      var v = el('div', 'comp-voz');
      [['Reconocer y contrastar', c.speechContrasta], ['Proponer', c.speechPropone]].forEach(function (p) {
        if (!p[1]) return;
        var x = el('div'); x.appendChild(el('small', null, p[0])); x.appendChild(el('blockquote', null, p[1])); v.appendChild(x);
      });
      voz.appendChild(v);
      voz.appendChild(el('p', 'comp-fuente', 'Textos pensados para decirse en voz alta. Adáptalos a tu manera de hablar; lo que importa es la estructura y el número que respalda cada frase.'));
      w.appendChild(voz);
    }

    [['Lo que dicen los clientes', c.resenas], ['En la lista de prospectos', c.prospectos]].forEach(function (p) {
      if (!p[1]) return;
      var s = el('section', 'comp-bloque'); s.appendChild(el('h4', null, p[0])); s.appendChild(el('p', null, p[1]));
      s.lastChild.style.color = 'var(--texto-suave)'; s.lastChild.style.maxWidth = '70ch';
      w.appendChild(s);
    });
    if (c.nota) w.appendChild(el('p', 'comp-nota', c.nota));

    var abajo = el('div', 'comp-acciones abajo');
    abajo.appendChild(enlace('#competencia', '← Volver a la lista de competidores', 'boton boton-linea boton-chico'));
    var ver = enlace('#competencia-diapositivas', 'Ver su diapositiva', 'boton boton-linea boton-chico');
    ver.addEventListener('click', function () { est.dia = est.comps.indexOf(c) + 1; });
    abajo.appendChild(ver);
    var i = est.comps.indexOf(c), vec = el('div', 'comp-vecinos');
    if (i > 0) vec.appendChild(enlace('#competencia-' + est.comps[i - 1].slug, '‹ ' + est.comps[i - 1].nombre, 'boton boton-linea boton-chico'));
    if (i < est.comps.length - 1) vec.appendChild(enlace('#competencia-' + est.comps[i + 1].slug, est.comps[i + 1].nombre + ' ›', 'boton boton-linea boton-chico'));
    abajo.appendChild(vec);
    w.appendChild(abajo);
    return w;
  }

  /* ---------- Diapositivas ---------- */
  function listaDias() {
    var d = [{ t: 'portada' }];
    est.comps.forEach(function (c) { d.push({ t: 'comp', c: c }); });
    if (est.cfg && est.cfg.pendientes && est.cfg.pendientes.length) d.push({ t: 'pend' });
    if (est.cfg && est.cfg.resumenGrupos && est.cfg.resumenGrupos.length) d.push({ t: 'res' });
    return d;
  }
  function pie() { return el('p', 'dia-pie', 'Ruta Cafeína Mérida · Tel. 999 259 8155'); }

  function pintarDia(escena, dias) {
    var d = dias[est.dia];
    escena.textContent = '';
    var cab = el('div', 'dia-cab'), cuerpo, cfg = est.cfg || {};
    if (d.t === 'portada') {
      cab.appendChild(el('p', 'etiqueta', 'Fortalezas frente a debilidades'));
      cab.appendChild(el('h3', null, (cfg.portada && cfg.portada.titulo) || 'Ruta Cafeína frente a la competencia'));
      if (cfg.portada && cfg.portada.bajada) cab.appendChild(el('p', 'sub', cfg.portada.bajada));
      cuerpo = el('div');
      var nums = el('div', 'dia-numeros');
      (cfg.numeros || []).forEach(function (n) {
        var x = el('div'); x.appendChild(el('strong', null, n.valor)); x.appendChild(el('span', null, n.etiqueta)); nums.appendChild(x);
      });
      cuerpo.appendChild(nums);
      var raz = el('div', 'dia-razones');
      (cfg.razones || []).forEach(function (r) {
        var x = el('div'); x.appendChild(el('h4', null, r.titulo)); x.appendChild(el('p', null, r.texto)); raz.appendChild(x);
      });
      cuerpo.appendChild(raz);
      escena.appendChild(cab); escena.appendChild(cuerpo); escena.appendChild(pie());
    } else if (d.t === 'comp') {
      var c = d.c;
      cab.appendChild(el('p', 'etiqueta', 'Frente a · ' + c.grupo));
      cab.appendChild(el('h3', null, c.nombre));
      cab.appendChild(el('p', 'sub', c.tipo + ' · ' + c.precio));
      cuerpo = el('div', 'dia-cuerpo');
      var izq = el('div', 'dia-col'); izq.appendChild(el('h4', null, 'Dónde deja un hueco')); izq.appendChild(ul(c.debilidades));
      var der = el('div', 'dia-col nuestra'); der.appendChild(el('h4', null, 'Lo que ofrece Ruta Cafeína')); der.appendChild(ul(c.ventajas));
      cuerpo.appendChild(izq); cuerpo.appendChild(der);
      var rec = el('div', 'dia-reconoce');
      var t = el('span'); t.appendChild(document.createTextNode('Primero, reconocer: ')); t.appendChild(el('em', null, c.hechoBien)); rec.appendChild(t);
      rec.appendChild(enlace('#competencia-' + c.slug, 'Ver ficha completa →'));
      escena.appendChild(cab); escena.appendChild(cuerpo); escena.appendChild(rec);
    } else if (d.t === 'res') {
      cab.appendChild(el('p', 'etiqueta', 'Resumen final'));
      cab.appendChild(el('h3', null, 'Qué hacer frente a cada tipo de competidor'));
      cuerpo = el('div', 'dia-cuerpo');
      (cfg.resumenGrupos || []).forEach(function (g) {
        var col = el('div', 'dia-col nuestra');
        col.appendChild(el('h4', null, g.grupo));
        if (g.quienes) { var q = el('p', null, g.quienes); q.style.cssText = 'font-size:var(--t-sm);color:var(--texto-suave);margin:-6px 0 8px'; col.appendChild(q); }
        col.appendChild(el('p', null, g.texto));
        cuerpo.appendChild(col);
      });
      var idea = el('div', 'dia-reconoce');
      var ti = el('span'); ti.appendChild(document.createTextNode('En una sola idea: ')); ti.appendChild(el('em', null, cfg.ideaUnica || '')); idea.appendChild(ti);
      escena.appendChild(cab); escena.appendChild(cuerpo); escena.appendChild(idea);
    } else {
      cab.appendChild(el('p', 'etiqueta', 'Antes de salir a vender'));
      cab.appendChild(el('h3', null, 'Lo que falta para reforzar el discurso'));
      cab.appendChild(el('p', 'sub', 'Cinco pendientes que cambian lo que se puede prometer en la visita.'));
      cuerpo = el('div', 'dia-cuerpo');
      var l1 = el('div', 'dia-col nuestra'), l2 = el('div', 'dia-col nuestra');
      var p = cfg.pendientes || [], mid = Math.ceil(p.length / 2);
      [[l1, p.slice(0, mid)], [l2, p.slice(mid)]].forEach(function (par) {
        var u = el('ul', 'comp-lista');
        par[1].forEach(function (x) {
          var li = el('li'); var b = el('strong', null, x.titulo + '. '); b.style.fontWeight = '600'; li.appendChild(b); li.appendChild(document.createTextNode(x.texto)); u.appendChild(li);
        });
        par[0].appendChild(u); cuerpo.appendChild(par[0]);
      });
      escena.appendChild(cab); escena.appendChild(cuerpo); escena.appendChild(pie());
    }
  }

  function vistaSlides() {
    var dias = listaDias();
    if (est.dia >= dias.length || est.dia < 0) est.dia = 0;
    var w = el('div', 'dias');
    var escena = el('div', 'dia');
    escena.setAttribute('aria-live', 'polite');
    var mando = el('div', 'dias-mando');
    var ant = el('button', 'boton boton-linea boton-chico', '‹ Anterior'); ant.type = 'button';
    var cuenta = el('span', 'cuenta');
    var sig = el('button', 'boton boton-linea boton-chico', 'Siguiente ›'); sig.type = 'button';
    var puntos = el('div', 'dias-puntos'); puntos.setAttribute('role', 'group'); puntos.setAttribute('aria-label', 'Ir a una diapositiva');
    var btns = dias.map(function (d, i) {
      var b = el('button'); b.type = 'button';
      b.setAttribute('aria-label', 'Diapositiva ' + (i + 1) + (d.t === 'comp' ? ': ' + d.c.nombre : ''));
      b.addEventListener('click', function () { ir(i); });
      puntos.appendChild(b); return b;
    });
    function ir(i) {
      if (i < 0 || i >= dias.length) return;
      est.dia = i;
      pintarDia(escena, dias);
      cuenta.textContent = (i + 1) + ' / ' + dias.length;
      ant.disabled = i === 0; sig.disabled = i === dias.length - 1;
      btns.forEach(function (b, k) { if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    }
    ant.addEventListener('click', function () { ir(est.dia - 1); });
    sig.addEventListener('click', function () { ir(est.dia + 1); });
    var x0 = null, y0 = null;
    escena.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    escena.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(est.dia + (dx < 0 ? 1 : -1));
      x0 = null;
    }, { passive: true });
    puenteMover = function (paso) { ir(est.dia + paso); };
    mando.appendChild(ant); mando.appendChild(cuenta); mando.appendChild(sig); mando.appendChild(puntos);
    w.appendChild(escena); w.appendChild(mando);
    ir(est.dia);
    return w;
  }

  /* ---------- Pintado general ---------- */
  function render() {
    if (!raiz) return;
    puenteMover = null;
    raiz.textContent = '';
    var vista = est.vista;
    if (vista === 'ficha' && est.listo && !buscar(est.slug)) vista = 'lista';
    raiz.appendChild(pestanas(vista));
    if (est.error) { raiz.appendChild(aviso('No se pudo leer la información. Recarga la página con la sesión del administrador; si sigue igual, vuelve a intentarlo en unos minutos.')); return; }
    if (!est.listo || (vista === 'slides' && !est.cfgListo)) {
      raiz.appendChild(aviso(est.lento ? 'La información tarda en responder. Seguimos intentando.' : 'Cargando información de la competencia…'));
      return;
    }
    if (!est.comps.length) { raiz.appendChild(aviso('Todavía no hay competidores cargados en la base del sitio.')); return; }
    if (vista === 'ficha') raiz.appendChild(vistaFicha(buscar(est.slug)));
    else if (vista === 'slides') raiz.appendChild(vistaSlides());
    else raiz.appendChild(vistaLista());
  }

    /* ---------- Arranque de la sección ---------- */
  window.RC_competencia = function (datos) {
    sec = document.getElementById('competencia');
    raiz = sec && sec.querySelector('.comp-raiz');
    if (!raiz) return;
    est.comps = (datos.competidores || []).slice().sort(function (a, b) { return a.orden - b.orden; });
    est.cfg = datos.cfg || null; est.cfgListo = true; est.listo = true;
    render();
    window.addEventListener('hashchange', alCambiarRuta);
    document.addEventListener('keydown', function (e) {
      if (!puenteMover || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') puenteMover(1);
      else if (e.key === 'ArrowLeft') puenteMover(-1);
    });
    if (leerRuta()) alCambiarRuta();
  };

  /* ---------- Prospectos: se guardan en este navegador (localStorage) ---------- */
  var CLAVE_LOCAL = 'rc_prospectos_v1';
  function montarProspectos(semilla) {
    var raiz = document.querySelector('#prospectos .pros-raiz');
    if (!raiz || !window.RC_prospectos) return;
    var mapa = {}, subs = [], persiste = true;
    function leer() {
      try {
        var t = localStorage.getItem(CLAVE_LOCAL);
        if (t) { var j = JSON.parse(t); if (j && Array.isArray(j.regs)) return j.regs; }
      } catch (e) { persiste = false; }
      return null;
    }
    var previos = leer();
    (previos || semilla).forEach(function (r) { mapa[r.id] = r; });
    function grabar() {
      if (!persiste) return;
      try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ v: 1, regs: Object.keys(mapa).map(function (k) { return mapa[k]; }) })); }
      catch (e) { persiste = false; aviso(); }
    }
    function aviso() {
      var a = document.querySelector('#prospectos .pros-aviso');
      if (a) a.textContent = 'Este navegador no permite guardar datos: los cambios se perderán al cerrar la página. Usa «Respaldo» antes de salir.';
    }
    function lista() { return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) { return a.orden - b.orden; }); }
    function avisar() { subs.forEach(function (f) { f(lista()); }); }
    if (!previos) grabar();
    if (!persiste) aviso();
    window.RC_prospectos.montar(raiz, {
      respaldo: true,
      suscribir: function (ok) { subs.push(ok); setTimeout(function () { ok(lista()); }, 0); },
      guardar: function (r) { mapa[r.id] = JSON.parse(JSON.stringify(r)); grabar(); avisar(); return Promise.resolve(); },
      borrar: function (id) { delete mapa[id]; grabar(); avisar(); return Promise.resolve(); },
      descargar: function (nombre, texto, tipo) {
        var b = new Blob([texto], { type: tipo || 'text/plain' }), u = URL.createObjectURL(b), a = document.createElement('a');
        a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 4000); return Promise.resolve();
      }
    });
    if (location.hash === '#prospectos') setTimeout(function () { var s = document.getElementById('prospectos'); if (s) s.scrollIntoView(); }, 200);
  }

  /* ---------- Puerta con contraseña ---------- */
  function b64(t) { var b = atob(t), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }

  async function abrir(clave) {
    var c = JSON.parse(document.getElementById('carga').textContent);
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveKey']);
    var llave = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(c.s), iterations: c.n, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(c.i) }, llave, b64(c.c));
    return JSON.parse(new TextDecoder().decode(plano));
  }

  function iniciarPuerta() {
    var form = document.getElementById('puerta-form');
    var campo = document.getElementById('clave');
    var msg = document.getElementById('puerta-msg');
    var boton = document.getElementById('puerta-boton');
    if (!form) return;
    if (!window.crypto || !crypto.subtle) {
      msg.textContent = 'Este navegador no permite descifrar el contenido. Abre el sitio desde una dirección https.';
      boton.disabled = true; return;
    }
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg.textContent = ''; boton.disabled = true; boton.textContent = 'Abriendo…';
      try {
        var p = await abrir(campo.value);
        campo.value = '';
        var app = document.getElementById('app');
        app.innerHTML = p.app;
        app.hidden = false;
        document.getElementById('puerta').hidden = true;
        document.body.classList.add('abierto');
        var s = document.createElement('script');
        s.src = 'js/main.js';
        s.onload = function () { window.RC_competencia(p.datos); montarProspectos(p.datos.prospectos || []); };
        document.body.appendChild(s);
        var salir = document.getElementById('salir');
        if (salir) salir.addEventListener('click', function () { location.hash = ''; location.reload(); });
      } catch (err) {
        msg.textContent = 'Contraseña incorrecta. Revísala e inténtalo de nuevo.';
        boton.disabled = false; boton.textContent = 'Entrar';
        campo.select();
      }
    });
  }
  iniciarPuerta();
})();
