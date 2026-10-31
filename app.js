/* The Archive — shared layout and page renderers.
   Every page loads pathways.js (window.PATHWAYS, window.ARCHIVE_META) and then this file.
   <html data-page="archive|pathway|acting" data-pathway="<id>"> picks the renderer. */
(function () {
  'use strict';

  var PATHWAYS = window.PATHWAYS || [];
  var META = window.ARCHIVE_META || { repo: 'https://github.com/jakob-wlf/LotMCraft', rules: {} };
  var root = document.documentElement;
  var page = root.getAttribute('data-page');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var THEME_KEY = 'archive-theme';

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function roman(n) {
    if (n === 0) return '0';
    var map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], out = '';
    map.forEach(function (m) { while (n >= m[0]) { out += m[1]; n -= m[0]; } });
    return out;
  }
  function fmtNum(n) { return Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 }); }
  function fmtTime(s) {
    if (s == null) return '—';
    if (s === 0) return 'None';
    if (s < 60) return fmtNum(s) + ' s';
    var m = s / 60;
    return (m % 1 === 0 ? m : m.toFixed(1)) + ' min';
  }
  function fmtCost(c) {
    if (c == null) return '—';
    if (c === 0) return 'None';
    return fmtNum(c);
  }
  function byId(id) {
    for (var i = 0; i < PATHWAYS.length; i++) if (PATHWAYS[i].id === id) return PATHWAYS[i];
    return null;
  }
  function seqOf(p, n) {
    for (var i = 0; i < p.sequences.length; i++) if (p.sequences[i].number === n) return p.sequences[i];
    return null;
  }
  function isIncomplete(s) { return /^\[Archive incomplete\]/.test(s || ''); }
  function incompleteHtml(s) {
    return esc(s).replace(/^\[Archive incomplete\]/, '<span class="incomplete">[Archive incomplete]</span>');
  }

  // ------------------------------------------------------------ SVG ornaments
  var SVG = {
    corner: '<svg class="corner" viewBox="0 0 46 46" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M2 44V14Q2 2 14 2h30M8 40V18q0-10 10-10h22"/><path d="M14 14q10 1 12 12q-9-1-12-12z"/><path d="M2 26q9 0 13-9M26 2q0 9-9 13"/><circle cx="20" cy="20" r="1.6" fill="currentColor"/></svg>',
    divider: '<svg class="divider" viewBox="0 0 420 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M0 12h168M252 12h168"/><path d="M168 12q11-11 22 0q-11 11-22 0zM252 12q-11-11-22 0q11 11 22 0z"/><path d="M210 2l10 10l-10 10l-10-10z" fill="currentColor" fill-opacity=".25"/><circle cx="210" cy="12" r="2.5" fill="currentColor"/><circle cx="140" cy="12" r="1.5" fill="currentColor"/><circle cx="280" cy="12" r="1.5" fill="currentColor"/></svg>',
    seal: function (cls) {
      return '<svg class="' + (cls || 'seal') + '" viewBox="0 0 100 100" aria-hidden="true"><defs>' +
        '<filter id="wax' + (cls || '') + '"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>' +
        '<radialGradient id="waxg' + (cls || '') + '" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#c0353a"/><stop offset=".55" stop-color="#7a1b1f"/><stop offset="1" stop-color="#3d0a0d"/></radialGradient></defs>' +
        '<circle cx="50" cy="50" r="42" fill="url(#waxg' + (cls || '') + ')" filter="url(#wax' + (cls || '') + ')"/>' +
        '<circle cx="50" cy="50" r="30" fill="none" stroke="#3d0a0d" stroke-width="2" opacity=".7"/>' +
        '<circle cx="50" cy="50" r="27" fill="none" stroke="#e0757a" stroke-width=".6" opacity=".45"/>' +
        '<path d="M30 50q20-16 40 0q-20 16-40 0z" fill="none" stroke="#2a0507" stroke-width="2.4"/><circle cx="50" cy="50" r="6" fill="#2a0507"/>' +
        '<path d="M50 22v6M50 72v6M22 50h6M72 50h6" stroke="#2a0507" stroke-width="2"/></svg>';
    },
    eye: function () {
      var rays = '';
      for (var i = 0; i < 32; i++) {
        var a = i / 32 * Math.PI * 2, r1 = 80, r2 = i % 2 ? 90 : 98;
        rays += '<line x1="' + (100 + Math.cos(a) * r1).toFixed(1) + '" y1="' + (100 + Math.sin(a) * r1).toFixed(1) +
          '" x2="' + (100 + Math.cos(a) * r2).toFixed(1) + '" y2="' + (100 + Math.sin(a) * r2).toFixed(1) + '"/>';
      }
      return '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" aria-hidden="true">' +
        '<g class="rays" stroke-width="1.2" opacity=".75">' + rays + '</g>' +
        '<circle cx="100" cy="100" r="76" stroke-width="1.5"/>' +
        '<g class="ring2"><circle cx="100" cy="100" r="68" stroke-width="1" stroke-dasharray="2 7"/>' +
        '<path d="M100 32l4 7h-8zM100 168l4-7h-8zM32 100l7-4v8zM168 100l-7-4v8z" fill="currentColor"/></g>' +
        '<path d="M100 40L152 130H48Z" stroke-width="1" opacity=".55"/>' +
        '<path d="M100 160L48 70H152Z" stroke-width="1" opacity=".3"/>' +
        '<g class="lid"><path d="M50 100Q100 56 150 100Q100 144 50 100Z" fill="rgba(10,6,6,.55)" stroke-width="2"/>' +
        '<g class="iris"><circle cx="100" cy="100" r="18" stroke-width="1.5"/><circle cx="100" cy="100" r="12" stroke-width=".8" opacity=".6"/>' +
        '<circle cx="100" cy="100" r="7" fill="#c2272f" stroke="none"/><circle cx="97" cy="97" r="2" fill="#fff" stroke="none" opacity=".8"/></g></g></svg>';
    },
    ring: '<svg class="ring" viewBox="0 0 200 200" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="100" cy="100" r="96" stroke-width="1"/><circle cx="100" cy="100" r="90" stroke-width="2" stroke-dasharray="1 5"/><circle cx="100" cy="100" r="82" stroke-width=".8" opacity=".6"/><path d="M100 2v10M100 188v10M2 100h10M188 100h10M31 31l7 7M162 162l7 7M31 169l7-7M162 38l7-7" stroke-width="1.4"/></svg>',
    book: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M20 10C15 6 8 6 3 8v24c5-2 12-2 17 2c5-4 12-4 17-2V8c-5-2-12-2-17 2zM20 10v24"/><path d="M7 13c3-1 6-1 9 0M7 18c3-1 6-1 9 0M24 13c3-1 6-1 9 0M24 18c3-1 6-1 9 0"/></svg>',
    glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/></svg>'
  };

  function corners() {
    return ['tl', 'tr', 'bl', 'br'].map(function (c) { return SVG.corner.replace('class="corner"', 'class="corner ' + c + '"'); }).join('');
  }

  // ------------------------------------------------------------ theme
  function currentTheme() { return root.getAttribute('data-theme') === 'parchment' ? 'parchment' : 'midnight'; }
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* storage unavailable */ }
    $all('.lever').forEach(function (l) {
      l.setAttribute('aria-checked', String(t === 'parchment'));
      $('.lever-label', l).textContent = t === 'parchment' ? 'Parchment' : 'Midnight';
    });
  }

  // ------------------------------------------------------------ shared chrome
  function renderChrome() {
    var site = document.createElement('div');
    site.className = 'site';
    var main = $('main');
    var fog = '<div class="fog" aria-hidden="true"><span></span><span></span><span></span></div>';

    var menu = PATHWAYS.map(function (p) {
      var cur = (page === 'pathway' && root.getAttribute('data-pathway') === p.id) ? ' aria-current="page"' : '';
      return '<a href="' + p.id + '.html"' + cur + '><span class="dot" style="background:' + p.accentColor + ';color:' + p.accentColor + '"></span>' + esc(p.name) + '</a>';
    }).join('');

    var header =
      '<header class="topbar"><div class="wrap">' +
        '<a class="brand" href="index.html">' + SVG.seal('brandseal') + '<span>The Archive</span></a>' +
        '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>' +
        '<nav class="nav" id="site-nav" aria-label="Primary">' +
          '<a href="index.html"' + (page === 'archive' ? ' aria-current="page"' : '') + '>Archive</a>' +
          '<a href="acting.html"' + (page === 'acting' ? ' aria-current="page"' : '') + '>On Acting</a>' +
          '<div class="dropdown"><button class="navbtn" type="button" aria-expanded="false" aria-controls="pathway-menu">Pathways<span class="caret" aria-hidden="true">▾</span></button>' +
          '<div class="dropdown-menu" id="pathway-menu" hidden>' + menu + '</div></div>' +
          '<button class="lever" type="button" role="switch" aria-checked="false" aria-label="Parchment mode">' +
            '<span class="lever-track" aria-hidden="true"></span><span class="lever-label">Midnight</span></button>' +
        '</nav>' +
      '</div></header>';

    var footer =
      '<footer class="footer"><div class="wrap">' +
        SVG.seal('seal') +
        '<p class="property">Property of the Nighthawks — Do Not Remove From Chanis Gate</p>' +
        '<p class="source">Transcribed from <a href="' + esc(META.repo) + '">LotMCraft on GitHub</a>' +
          (META.branch ? ' (' + esc(META.branch) + (META.commit ? ' @ ' + esc(META.commit) : '') + ')' : '') +
          '. All abilities, Sequences and acting deeds are drawn from the mod\'s source.</p>' +
        '<nav aria-label="All pathways"><ul>' +
          PATHWAYS.map(function (p) { return '<li><a href="' + p.id + '.html">' + esc(p.name) + '</a></li>'; }).join('') +
        '</ul></nav>' +
      '</div></footer>';

    document.body.insertAdjacentHTML('afterbegin', fog);
    site.innerHTML = header;
    main.parentNode.insertBefore(site, main);
    site.appendChild(main);
    site.insertAdjacentHTML('beforeend', footer);

    // lever
    $all('.lever').forEach(function (l) {
      l.addEventListener('click', function () { setTheme(currentTheme() === 'parchment' ? 'midnight' : 'parchment'); });
    });
    setTheme(currentTheme());

    // dropdown
    var btn = $('.navbtn'), dd = $('#pathway-menu');
    function closeDd(focusBtn) { dd.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus(); }
    btn.addEventListener('click', function () {
      var open = dd.hidden;
      dd.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open) { var first = $('a', dd); if (first) first.focus(); }
    });
    document.addEventListener('click', function (e) { if (!dd.hidden && !e.target.closest('.dropdown')) closeDd(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dd.hidden) closeDd(true); });
    dd.addEventListener('keydown', function (e) {
      var links = $all('a', dd), i = links.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); links[(i + 1) % links.length].focus(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
    });

    // mobile menu
    var mt = $('.menu-toggle'), nav = $('#site-nav');
    mt.addEventListener('click', function () {
      var open = !nav.classList.contains('open');
      nav.classList.toggle('open', open); mt.setAttribute('aria-expanded', String(open));
    });

    // page-turn entrance where cross-document view transitions are unavailable
    if (!reduceMotion && !('onpagereveal' in window)) root.classList.add('js-enter');
  }

  // ------------------------------------------------------------ archive (index)
  function tally(p) {
    var ab = 0, deeds = 0;
    p.sequences.forEach(function (s) { ab += s.abilities.length; deeds += s.actingTasks.length; });
    return '<b>' + ab + '</b> abilities · ' + (deeds ? '<b>' + deeds + '</b> deeds' : 'deeds incomplete');
  }

  function renderArchive() {
    var main = $('main');
    var groups = [];
    PATHWAYS.forEach(function (p) { if (groups.indexOf(p.divineGroup) < 0) groups.push(p.divineGroup); });

    var cards = PATHWAYS.map(function (p, i) {
      var s9 = seqOf(p, 9), s0 = seqOf(p, 0);
      var haystack = [p.name, p.divineGroup].concat(p.sequences.map(function (s) {
        return s.name + ' ' + s.abilities.map(function (a) {
          var modes = a.details && a.details.modes ? a.details.modes.map(function (m) { return m.name; }).join(' ') : '';
          return a.name + ' ' + modes;
        }).join(' ');
      })).join(' ').toLowerCase();
      return '<a class="tarot" href="' + p.id + '.html" style="--a:' + p.accentColor + '" data-group="' + esc(p.divineGroup) + '" data-search="' + esc(haystack) + '">' +
        '<span class="numeral" aria-hidden="true">' + roman(i) + '</span>' +
        '<span class="emblem-frame">' + (p.emblem ? '<img src="' + p.emblem + '" alt="" loading="lazy" width="256" height="256">' : SVG.glyph) + '</span>' +
        '<h2>' + esc(p.name) + '</h2>' +
        '<span class="group">' + esc(p.divineGroup) + '</span>' +
        '<span class="tally">' + tally(p) + '</span>' +
        '<dl><div><dt>Seq 9</dt><dd>' + esc(s9 ? s9.name : '[Archive incomplete]') + '</dd></div>' +
        '<div><dt>Seq 0</dt><dd>' + esc(s0 ? s0.name : '[Archive incomplete]') + '</dd></div></dl>' +
        '<span class="swatch" aria-hidden="true"></span>' +
      '</a>';
    }).join('');

    main.innerHTML =
      '<section class="hero" aria-labelledby="hero-title">' +
        '<div class="moon" aria-hidden="true"></div><div class="fogband one" aria-hidden="true"></div><div class="fogband two" aria-hidden="true"></div>' +
        '<div class="sigil flicker">' + SVG.eye() + '</div>' +
        '<h1 id="hero-title" class="engraved flicker">The Pathways</h1>' +
        '<p class="tagline">Every potion is a door. Every door has a price.</p>' +
        '<p class="classified type">CLASSIFIED · Restricted to Nighthawks of the Evernight Church · ' + PATHWAYS.length + ' pathways on file</p>' +
      '</section>' +
      '<div class="wrap">' +
        SVG.divider +
        '<div class="controls" role="search">' +
          '<div class="field"><label for="q">Search the files</label>' +
            '<input id="q" class="search" type="search" placeholder="A pathway, Sequence or ability…" autocomplete="off"></div>' +
          '<div class="field" style="flex:2 1 420px"><span class="chips-label" id="grp-label">Divine Group</span>' +
            '<div class="chips" role="group" aria-labelledby="grp-label">' +
              '<button type="button" class="chip" aria-pressed="true" data-group="">All</button>' +
              groups.map(function (g) { return '<button type="button" class="chip" aria-pressed="false" data-group="' + esc(g) + '">' + esc(g) + '</button>'; }).join('') +
            '</div></div>' +
        '</div>' +
        '<p class="result-count type" aria-live="polite"></p>' +
        '<div class="deck">' + cards + '</div>' +
        '<p class="empty-deck" hidden>No file in the archive answers to that name.</p>' +
      '</div>';

    var q = $('#q'), group = '', count = $('.result-count'), empty = $('.empty-deck');
    function apply() {
      var term = q.value.trim().toLowerCase(), shown = 0;
      $all('.tarot').forEach(function (c) {
        var ok = (!group || c.getAttribute('data-group') === group) && (!term || c.getAttribute('data-search').indexOf(term) >= 0);
        c.hidden = !ok; if (ok) shown++;
      });
      count.textContent = shown + ' of ' + PATHWAYS.length + ' files shown';
      empty.hidden = shown > 0;
    }
    q.addEventListener('input', apply);
    $all('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        group = b.getAttribute('data-group');
        $all('.chip').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        apply();
      });
    });
    apply();
  }

  // ------------------------------------------------------------ gauges
  function gauge(label, value, display, max, note) {
    var frac = value == null ? 0 : Math.min(1, Math.log10(value + 1) / Math.log10(max + 1));
    var angle = -90 + frac * 180;
    var ticks = '';
    for (var i = 0; i <= 6; i++) {
      var a = Math.PI + i / 6 * Math.PI;
      ticks += '<line class="tick" x1="' + (26 + Math.cos(a) * 17).toFixed(1) + '" y1="' + (30 + Math.sin(a) * 17).toFixed(1) +
        '" x2="' + (26 + Math.cos(a) * 21).toFixed(1) + '" y2="' + (30 + Math.sin(a) * 21).toFixed(1) + '"/>';
    }
    return '<div class="gauge"><svg viewBox="0 0 52 40" aria-hidden="true">' +
      '<path class="face" d="M3 30A23 23 0 0 1 49 30Z"/>' +
      '<path class="arc" d="M7 30A19 19 0 0 1 45 30"/>' +
      '<path class="fill" d="M7 30A19 19 0 0 1 45 30" pathLength="100" stroke-dasharray="' + (frac * 100).toFixed(1) + ' 100"/>' +
      ticks +
      '<line class="needle" x1="26" y1="30" x2="26" y2="12" data-angle="' + angle.toFixed(1) + '" style="transform:rotate(-90deg)"/>' +
      '<circle class="hub" cx="26" cy="30" r="2.6"/></svg>' +
      '<span class="meta"><span class="label">' + label + '</span><span class="val rd">' + display + '</span>' +
      (note ? '<span class="g-note rd">' + note + '</span>' : '') + '</span></div>';
  }

  // ------------------------------------------------------------ pathway page
  function renderPathway() {
    var id = root.getAttribute('data-pathway');
    var p = byId(id);
    var main = $('main');
    if (!p) { main.innerHTML = '<div class="wrap"><p class="incomplete">[Archive incomplete] No file for “' + esc(id) + '”.</p></div>'; return; }

    // Each pathway has two pages: <id>.html (abilities) and <id>-acting.html (acting methods).
    var view = root.getAttribute('data-view') === 'acting' ? 'acting' : 'abilities';
    var suffix = view === 'acting' ? '-acting.html' : '.html';
    var idx = PATHWAYS.indexOf(p);
    var prev = PATHWAYS[(idx - 1 + PATHWAYS.length) % PATHWAYS.length];
    var next = PATHWAYS[(idx + 1) % PATHWAYS.length];
    root.style.setProperty('--accent', p.accentColor);
    root.style.setProperty('--accent-2', p.accentColor2 || p.accentColor);
    document.title = p.name + (view === 'acting' ? ' Acting Methods' : ' Abilities') + ' · The Archive';

    var totalAb = 0, totalTasks = 0;
    p.sequences.forEach(function (s) { totalAb += s.abilities.length; totalTasks += s.actingTasks.length; });
    var SEALED = [2, 1, 0];

    var toc = '<nav class="toc" aria-label="Sequences"><h2>Sequences</h2><ol>' +
      p.sequences.map(function (s) {
        return '<li><a href="#seq-' + s.number + '"><span class="n">' + s.number + '</span><span class="label">' + esc(s.name) + '</span>' +
          (SEALED.indexOf(s.number) >= 0 ? '<span class="lock" data-lock="' + s.number + '" aria-label="sealed">✠</span>' : '') + '</a></li>';
      }).join('') + '</ol>' +
      (view === 'abilities' ? '<button type="button" class="notes-toggle" aria-pressed="false">Open all field notes</button>' : '') +
      '</nav>';

    var nameById = {};
    PATHWAYS.forEach(function (o) { nameById[o.id] = o.name; });

    // Mechanics read from the ability's class: modes, damage, status effects, stat bonuses, restrictions.
    function fieldNotes(a) {
      var d = a.details;
      if (!d) return '';
      var rows = [], counts = [];
      if (d.modes) {
        counts.push(d.modes.length + (d.modes.length === 1 ? ' mode' : ' modes'));
        rows.push('<dt>Modes</dt><dd><ul>' + d.modes.map(function (m) {
          return '<li><span class="rd">' + esc(m.name) + '</span>' + (m.description ? '<span class="rd mode-desc">' + esc(m.description) + '</span>' : '') + '</li>';
        }).join('') + '</ul></dd>');
      }
      if (d.baseDamage != null) {
        counts.push('damage');
        rows.push('<dt>Base damage</dt><dd><span class="rd">' + fmtNum(d.baseDamage) + ' (' + fmtNum(d.baseDamage / 2) + ' hearts), scaled by your Sequence</span></dd>');
      }
      if (d.effects) {
        counts.push(d.effects.length + (d.effects.length === 1 ? ' effect' : ' effects'));
        rows.push('<dt>Effects</dt><dd><ul>' + d.effects.map(function (e) {
          var bits = [esc(e.name) + (e.level ? ' ' + roman(e.level) : '')];
          if (e.seconds) bits.push(fmtTime(e.seconds));
          if (e.target) bits.push('on ' + esc(e.target));
          return '<li><span class="rd">' + bits.join(' · ') + '</span></li>';
        }).join('') + '</ul></dd>');
      }
      if (d.enhancements) {
        counts.push('bonuses for every Sequence');
        rows.push('<dt class="wide">Bonuses by Sequence</dt><dd class="wide"><table class="enh"><tbody>' + d.enhancements.map(function (row) {
          return '<tr><th scope="row">' + (row.sequence === 'all' ? 'All' : 'Seq ' + row.sequence) + '</th><td><span class="rd">' +
            (row.items.length ? row.items.map(esc).join('<br>') : 'None') + '</span></td></tr>';
        }).join('') + '</tbody></table></dd>');
      }
      if (d.cannotBe) rows.push('<dt>Cannot be</dt><dd><span class="rd">' + esc(d.cannotBe.join(', ')) + '</span></dd>');
      if (!rows.length) return '';
      return '<details class="field-notes"><summary>Field notes' +
        (counts.length ? '<span class="count">' + esc(counts.join(' · ')) + '</span>' : '') + '</summary>' +
        '<dl>' + rows.join('') + '</dl>' +
        '<p class="from">Read from <a href="' + esc(META.repo) + '/blob/' + esc(META.branch || 'main') + '/' + esc(a.source) + '">' + esc(a.source.split('/').pop()) + '</a></p>' +
        '</details>';
    }

    function abilityCard(a) {
      var shared = '';
      if (a.sharedWith && a.sharedWith.length) {
        shared = a.sharedWith.length >= 4
          ? 'Common to ' + (a.sharedWith.length + 1) + ' pathways'
          : 'Also recorded under ' + a.sharedWith.map(function (x) { return nameById[x] || x; }).join(', ');
      }
      var body;
      if (a.type === 'Passive') {
        // Passives are never cast, but some keep their own internal cooldown (e.g. Reincarnation).
        var pcd = a.details && a.details.cooldowns;
        body = pcd
          ? '<div class="gauges">' + pcd.map(function (c) {
              return gauge(c.label ? c.label + ' cooldown' : 'Cooldown', c.seconds, fmtTime(c.seconds), 600, '');
            }).join('') + '</div><p class="ever">Passive. Triggers on its own and cannot be cast.</p>'
          : '<p class="ever">Passive. Not cast; works on its own.</p>';
      } else {
        var costNote = (a.costAtZero != null && a.costAtZero !== a.cost) ? fmtCost(a.costAtZero) + ' at Seq 0' : '';
        var cdNote = (a.cooldownAtZero != null && a.cooldownAtZero !== a.cooldown) ? fmtTime(a.cooldownAtZero) + ' at Seq 0' : '';
        body = '<div class="gauges">' +
          gauge('Spirituality', a.cost, fmtCost(a.cost), 20000, costNote) +
          gauge('Cooldown', a.cooldown, fmtTime(a.cooldown), 600, cdNote) +
          '</div>';
      }
      var tag = a.type === 'Passive' ? 'Passive' : (a.details && a.details.kind === 'Toggle' ? 'Toggle' : 'Active');
      // One row per ability: identity, cost and cooldown on the left; what it does on the right.
      return '<article class="ability">' +
        '<div class="ab-side">' +
          '<header><span class="icon">' + (a.icon ? '<img src="' + a.icon + '" alt="" width="32" height="32" loading="lazy">' : SVG.glyph) + '</span>' +
          '<div><h4>' + esc(a.name) + '</h4><span class="tag' + (a.type === 'Passive' ? ' passive' : '') + '">' + tag + '</span></div></header>' +
          body +
          (shared ? '<div class="shared">' + esc(shared) + '</div>' : '') +
        '</div>' +
        '<div class="ab-main">' +
          '<p>' + (isIncomplete(a.description) ? '<span class="incomplete">[Archive incomplete]</span>' : '<span class="rd">' + esc(a.description) + '</span>') + '</p>' +
          (a.descriptionSource === 'code'
            ? '<p class="desc-src" title="The mod has no description for this ability. This explanation was written by reading its source code.">Archivist’s reading of the code</p>'
            : '') +
          fieldNotes(a) +
        '</div>' +
      '</article>';
    }

    // The pathway's Physical Enhancements passive lists bonuses per Sequence; show the matching row in each section.
    var enhancementRows = null;
    p.sequences.forEach(function (s) {
      s.abilities.forEach(function (a) { if (!enhancementRows && a.details && a.details.enhancements) enhancementRows = a.details.enhancements; });
    });
    function bodyStrip(n) {
      if (!enhancementRows) return '';
      var row = null;
      enhancementRows.forEach(function (r) { if (r.sequence === n || (r.sequence === 'all' && !row)) row = r; });
      if (!row || !row.items.length) return '';
      return '<p class="body-strip"><span class="label">Body at this Sequence</span>' +
        row.items.map(function (i) { return '<span class="rd chip-stat">' + esc(i) + '</span>'; }).join('') + '</p>';
    }

    function section(s) {
      var sealed = SEALED.indexOf(s.number) >= 0;
      var abilities = s.abilities.length
        ? '<div class="abilities">' + s.abilities.map(abilityCard).join('') + '</div>'
        : '<p class="incomplete">[Archive incomplete] No abilities are recorded for this Sequence.</p>';

      var tasks = s.actingTasks.length
        ? '<ul>' + s.actingTasks.map(function (t) {
            return '<li><span class="rd">' + esc(t.name) + '</span><span class="dig rd">+' + t.digestion + '% digestion</span>' +
              '<span class="cd rd">counts again after ' + fmtTime(t.cooldown) + '</span></li>';
          }).join('') + '</ul>'
        : '';

      var method = isIncomplete(s.actingMethod)
        ? '<p>' + incompleteHtml(s.actingMethod).replace(/<\/span>(.*)$/, '</span> <span class="rd">$1</span>') + '</p>'
        : '<p><span class="rd">' + esc(s.actingMethod) + '</span></p>';

      var content = view === 'acting'
        ? '<div class="note note-wide"><span class="pin" aria-hidden="true"></span>' +
            '<h3>Notes on acting the ' + esc(s.name) + '</h3>' + method + tasks + '</div>'
        : bodyStrip(s.number) + '<h3 class="sub">Abilities</h3>' + abilities;

      return '<section class="seq fade-up' + (sealed ? ' sealed' : '') + (s.number <= 4 ? ' deep' : '') + '" id="seq-' + s.number + '" aria-labelledby="seq-' + s.number + '-title"' +
        ' style="--depth-m:' + ((9 - s.number) / 9).toFixed(3) + ';--depth-p:' + (s.number >= 5 ? ((9 - s.number) / 4 * 0.22) : (0.74 + (4 - s.number) / 4 * 0.26)).toFixed(3) + '">' +
        '<div class="plate"><span class="num" aria-hidden="true">' + s.number + '</span>' +
          '<div class="title-plate"><span class="kicker">Sequence ' + s.number + '</span>' +
          '<h2 id="seq-' + s.number + '-title" class="engraved">' + esc(s.name) + '</h2></div></div>' +
        (sealed
          ? '<div class="clearance"><p id="clr-' + s.number + '">Sequence ' + s.number + ' is sealed. The contents are redacted under Chanis Gate protocol.</p>' +
            '<button type="button" class="btn-brass" aria-expanded="false" aria-controls="seq-' + s.number + '-body" aria-describedby="clr-' + s.number + '">Request Clearance</button></div>'
          : '') +
        '<div class="seq-body" id="seq-' + s.number + '-body">' + content + '</div>' +
      '</section>';
    }

    var ladder = '';
    p.sequences.forEach(function (s) {
      if (s.number === 4) ladder += '<div class="threshold deep" style="--sec-bg:color-mix(in oklab, var(--seq-top) 30%, var(--seq-bottom))">Below this line · Demigods</div>';
      ladder += section(s);
    });

    main.innerHTML =
      '<div class="wrap">' +
        '<header class="p-header">' +
          '<div class="p-emblem">' + SVG.ring + (p.emblem ? '<img src="' + p.emblem + '" alt="' + esc(p.name) + ' pathway emblem" width="256" height="256">' : SVG.glyph) + '</div>' +
          '<h1 class="engraved flicker">The <span class="accent">' + esc(p.name) + '</span> Pathway</h1>' +
          '<p class="p-group">Divine Group · ' + esc(p.divineGroup) + '</p>' +
          '<div class="dossier">' + SVG.seal('seal') +
            '<div class="file-no"><span>FILE № ' + String(idx + 1).padStart(2, '0') + ' / ' + esc(p.id.toUpperCase()) + '</span><span>NIGHTHAWKS · SEALED</span></div>' +
            '<p>' + esc(p.lore) + '</p>' +
            '<span class="stamp">Restricted</span>' +
          '</div>' +
          '<div class="p-stats type"><span><b>' + totalAb + '</b>abilities</span><span><b>' + totalTasks + '</b>acting deeds</span><span><b>10</b>Sequences</span></div>' +
          '<nav class="view-tabs" aria-label="' + esc(p.name) + ' pathway sections">' +
            '<a href="' + p.id + '.html"' + (view === 'abilities' ? ' aria-current="page"' : '') + '>Abilities</a>' +
            '<a href="' + p.id + '-acting.html"' + (view === 'acting' ? ' aria-current="page"' : '') + '>Acting Methods</a>' +
          '</nav>' +
          (view === 'acting'
            ? '<p class="view-intro">How each Sequence of the ' + esc(p.name) + ' pathway is digested. The mod\'s general rules are on the <a href="acting.html">On Acting</a> page.</p>'
            : '') +
        '</header>' +
        SVG.divider +
        '<div class="p-layout">' + toc + '<div class="ladder">' + ladder + '</div></div>' +
        '<nav class="pager" aria-label="Pathway pages">' +
          '<a class="page-link prev" href="' + prev.id + suffix + '" rel="prev"><small>← Previous Pathway</small><span><i class="dot" style="background:' + prev.accentColor + '"></i>' + esc(prev.name) + '</span></a>' +
          '<a class="return" href="index.html">' + SVG.book + 'Return to the Archive</a>' +
          '<a class="page-link next" href="' + next.id + suffix + '" rel="next"><small>Next Pathway →</small><span>' + esc(next.name) + '<i class="dot" style="background:' + next.accentColor + '"></i></span></a>' +
        '</nav>' +
      '</div>';

    // redaction: hide sealed text from assistive tech until clearance
    $all('.seq').forEach(function (sec) {
      $all('.rd', sec).forEach(function (r, i) {
        r.style.setProperty('--i', Math.min(i, 40));
        if (sec.classList.contains('sealed')) r.setAttribute('aria-hidden', 'true');
      });
    });
    $all('.clearance .btn-brass').forEach(function (b) {
      b.addEventListener('click', function () {
        var sec = b.closest('.seq');
        if (!sec.classList.contains('sealed')) return;
        sec.classList.remove('sealed');
        sec.classList.add('cleared');
        if (!reduceMotion) sec.classList.add('revealing');
        $all('.rd', sec).forEach(function (r) { r.removeAttribute('aria-hidden'); });
        $('p', b.parentNode).textContent = 'Clearance granted. Sequence ' + sec.id.replace('seq-', '') + ' is unsealed for this reading.';
        b.textContent = 'Clearance granted';
        b.setAttribute('aria-expanded', 'true');
        b.disabled = true;
        var lock = $('[data-lock="' + sec.id.replace('seq-', '') + '"]');
        if (lock) lock.remove();
        animateGauges(sec);
      });
    });

    var notesBtn = $('.notes-toggle');
    if (notesBtn) notesBtn.addEventListener('click', function () {
      var open = notesBtn.getAttribute('aria-pressed') !== 'true';
      $all('.field-notes').forEach(function (d) { d.open = open; });
      notesBtn.setAttribute('aria-pressed', String(open));
      notesBtn.textContent = open ? 'Close all field notes' : 'Open all field notes';
    });

    // TOC highlight
    var links = $all('.toc a');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (l) {
            var on = l.getAttribute('href') === '#' + e.target.id;
            if (on) { l.setAttribute('aria-current', 'true'); if (l.scrollIntoView && window.innerWidth <= 900) l.scrollIntoView({ block: 'nearest', inline: 'center' }); }
            else l.removeAttribute('aria-current');
          });
        });
      }, { rootMargin: '-35% 0px -60% 0px' });
      $all('.seq').forEach(function (s) { io.observe(s); });
    }
  }

  function animateGauges(ctx) {
    $all('.needle', ctx).forEach(function (n) {
      if (ctx && ctx.classList && ctx.classList.contains('sealed')) return;
      n.style.transform = 'rotate(' + n.getAttribute('data-angle') + 'deg)';
    });
  }

  // ------------------------------------------------------------ acting page
  function renderActing() {
    var r = META.rules || {};
    var mul = r.sanityDecreaseMultiplier || [];
    var rate = r.digestionRateDefault || 15;
    var scale = r.taskScale || 0.007;
    var inc = (r.capRestoreIncrements || []).map(function (x) { return Math.round(x * 100) + '%'; });
    var cap = Math.round((r.capPerSequenceUp || 0.15) * 100);

    $all('[data-rule]').forEach(function (el) {
      var k = el.getAttribute('data-rule');
      el.textContent = {
        rate: rate, rateMul: (rate / 10), scale: scale, cap: cap + '%',
        inc: inc.join(', '), inc1: inc[0], inc2: inc[1], inc3: inc[2]
      }[k];
    });

    // sanity multiplier table
    var mt = $('#mul-table tbody');
    if (mt) {
      mt.innerHTML = mul.map(function (m, s) {
        return '<tr><td>Sequence ' + s + '</td><td><span class="sanity-bar" aria-hidden="true"><i style="width:' + (m * 100) + '%"></i></span>×' + m + '</td></tr>';
      }).reverse().join('');
    }

    // acting deeds per pathway
    var dt = $('#deeds-table tbody');
    if (dt) {
      dt.innerHTML = PATHWAYS.map(function (p) {
        var cells = '';
        for (var n = 9; n >= 1; n--) { var s = seqOf(p, n); cells += '<td>' + (s && s.actingTasks.length ? s.actingTasks.length : '<span title="Archive incomplete">—</span>') + '</td>'; }
        return '<tr><th scope="row"><a href="' + p.id + '-acting.html">' + esc(p.name) + '</a></th>' + cells + '</tr>';
      }).join('');
    }

    // advancement calculator: AdvancementUtil.calculateFailureChance (main branch)
    var calc = $('#calc');
    if (calc) {
      var d = $('#c-dig'), sn = $('#c-san'), jump = $('#c-jump'), out = $('#c-out'), dv = $('#c-dig-v'), sv = $('#c-san-v');
      var update = function () {
        var dig = d.value / 100, san = sn.value / 100, diff = Number(jump.value), chance;
        dv.textContent = d.value + '%'; sv.textContent = sn.value + '%';
        if (san < 0.2 || diff >= 2) chance = 1;
        else {
          var goodD = dig >= 0.95, goodS = san >= 0.8;
          var base = goodD && goodS ? 0 : goodD ? 0.65 : goodS ? 0.6 : 0.3;
          var dp = dig < 0.95 ? Math.min(0.5, (0.95 - dig) * 0.4) : 0;
          var sp = san < 0.8 ? (0.8 - san) * 0.5 : 0;
          chance = Math.min(1, Math.max(0, base + dp + sp));
        }
        var pct = Math.round(chance * 1000) / 10;
        out.innerHTML = 'Chance of losing control: <span class="' + (chance > 0 ? 'risk' : 'safe') + '">' + pct + '%</span>';
      };
      [d, sn, jump].forEach(function (i) { i.addEventListener('input', update); });
      update();
    }

    // the vial fills as the essay is read
    var essay = $('.essay'), liquid = $('#vial-liquid'), surface = $('#vial-surface'), pctEl = $('#vial-pct'), done = $('#vial-done');
    if (essay && liquid) {
      var TOP = 52, BOTTOM = 232, ticking = false;
      var fill = function () {
        ticking = false;
        var rect = essay.getBoundingClientRect();
        var total = rect.height - window.innerHeight * 0.6;
        var prog = Math.max(0, Math.min(1, (-rect.top + window.innerHeight * 0.3) / Math.max(1, total)));
        var y = BOTTOM - (BOTTOM - TOP) * prog;
        liquid.setAttribute('y', y.toFixed(1));
        liquid.setAttribute('height', (BOTTOM - y + 4).toFixed(1));
        surface.setAttribute('cy', y.toFixed(1));
        surface.style.opacity = prog > 0.01 ? '.5' : '0';
        var pct = Math.round(prog * 100);
        pctEl.textContent = pct + '%';
        done.hidden = pct < 100;
      };
      window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(fill); } }, { passive: true });
      window.addEventListener('resize', fill);
      fill();
    }
  }

  // ------------------------------------------------------------ boot
  renderChrome();
  if (page === 'archive') renderArchive();
  else if (page === 'pathway') renderPathway();
  else if (page === 'acting') renderActing();

  // content is rendered after load, so honour a #fragment ourselves
  if (location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(function () { target.scrollIntoView({ block: 'start' }); });
  }

  // scroll-in reveal + gauge needles
  var fades = $all('.fade-up');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var fio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); animateGauges(e.target); fio.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    fades.forEach(function (f) { fio.observe(f); });
  } else {
    fades.forEach(function (f) { f.classList.add('in'); animateGauges(f); });
  }
})();
