/*
 * Het kant-en-klare websiteformulier (public/aanvraagformulier.html).
 *
 * Draait in een iframe op de website van een bedrijf. De Origin van ons verzoek
 * is dus BossBase; daarom sturen we mee in welke pagina('s) we staan
 * (location.ancestorOrigins, en anders de referrer). Die kan een pagina niet
 * vervalsen. De server laat de aanvraag alleen door als dat een domein is dat
 * het bedrijf heeft opgegeven.
 *
 * ?f=<token>          welk formulier
 * ?voorbeeld=1        weergave in Instellingen: niet versturen
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/public-website-inquiry';
  var MAX_FOTOS = 5;
  var OPTIONEEL = ['phone', 'address', 'postcode', 'city', 'gewenste_datum', 'fotos'];

  var params = new URLSearchParams(location.search);
  var token = params.get('f') || '';
  var voorbeeld = params.get('voorbeeld') === '1';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('formulier');
  var fotos = [];
  var submissionId = nieuweId();
  var bezig = false;

  function nieuweId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Hoogte doorgeven aan de pagina eromheen (formulier.js) ───────────────
  function meldHoogte(extra) {
    if (window.parent === window) return;
    var bericht = { bossbase: 'formulier', hoogte: document.documentElement.scrollHeight };
    if (extra) for (var k in extra) bericht[k] = extra[k];
    // Alleen een hoogte; niets wat geheim is. Daarom mag '*'.
    window.parent.postMessage(bericht, '*');
  }
  if (window.ResizeObserver) new ResizeObserver(function () { meldHoogte(); }).observe(document.body);
  window.addEventListener('load', function () { meldHoogte(); });

  // In welke pagina('s) staan we? ancestorOrigins kent niet elke browser
  // (Firefox niet); dan de referrer, die de browser zelf zet.
  function ingebedOp() {
    var uit = [];
    try {
      if (location.ancestorOrigins) for (var i = 0; i < location.ancestorOrigins.length; i++) uit.push(location.ancestorOrigins[i]);
    } catch (e) { /* niet beschikbaar */ }
    try { if (document.referrer) uit.push(new URL(document.referrer).origin); } catch (e) { /* geen referrer */ }
    return uit.filter(function (o, i) { return o && o !== 'null' && uit.indexOf(o) === i; }).slice(0, 10);
  }

  // ── Kleur van het bedrijf ────────────────────────────────────────────────
  function zetKleur(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return;
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    // Relatieve helderheid (WCAG): donkere knop → witte tekst.
    var lin = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    var l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    document.documentElement.style.setProperty('--kleur', hex);
    document.documentElement.style.setProperty('--op-kleur', l > 0.45 ? '#111827' : '#ffffff');
  }

  // ── Opbouwen ─────────────────────────────────────────────────────────────
  function toon(cfg) {
    $('laden').hidden = true;
    zetKleur(cfg.kleur);
    var velden = Array.isArray(cfg.velden) ? cfg.velden : [];
    OPTIONEEL.forEach(function (v) {
      var el = form.querySelector('[data-veld="' + v + '"]');
      if (el) el.hidden = velden.indexOf(v) === -1;
    });
    if (cfg.bedrijf) {
      $('akkoord-tekst').textContent = 'Ik ga akkoord dat ' + cfg.bedrijf + ' mijn gegevens gebruikt om contact met mij op te nemen over deze aanvraag.';
      $('klaar-tekst').textContent = cfg.bedrijf + ' heeft je aanvraag ontvangen en neemt zo snel mogelijk contact met je op.';
    }
    if (cfg.privacy_url && /^https?:\/\//.test(cfg.privacy_url)) {
      var a = document.createElement('a');
      a.href = cfg.privacy_url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'privacyverklaring';
      var tekst = $('akkoord-tekst');
      tekst.appendChild(document.createTextNode(' Lees de '));
      tekst.appendChild(a);
      tekst.appendChild(document.createTextNode('.'));
    }
    $('voorbeeld').hidden = !voorbeeld;
    form.hidden = false;
    meldHoogte();
  }

  function onbekend() {
    $('laden').hidden = true;
    $('onbekend').hidden = false;
    meldHoogte();
  }

  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    onbekend();
    return;
  }
  fetch(ENDPOINT + '?formulier=' + encodeURIComponent(token))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) { if (cfg && cfg.ok) toon(cfg); else onbekend(); })
    .catch(onbekend);

  // ── Foto's ───────────────────────────────────────────────────────────────
  // Verkleind in de browser (lange zijde 1600px, JPEG): een telefoonfoto van
  // 4 MB wordt zo een paar honderd kB.
  function verklein(bestand) {
    return new Promise(function (klaar) {
      if (!window.createImageBitmap) return klaar(bestand);
      createImageBitmap(bestand).then(function (beeld) {
        var schaal = Math.min(1, 1600 / Math.max(beeld.width, beeld.height));
        var c = document.createElement('canvas');
        c.width = Math.round(beeld.width * schaal);
        c.height = Math.round(beeld.height * schaal);
        c.getContext('2d').drawImage(beeld, 0, 0, c.width, c.height);
        c.toBlob(function (blob) { klaar(blob || bestand); }, 'image/jpeg', 0.82);
      }).catch(function () { klaar(bestand); });
    });
  }

  function toonFotos() {
    var lijst = $('fotos-lijst');
    lijst.textContent = '';
    fotos.forEach(function (f, i) {
      var fig = document.createElement('figure');
      var img = document.createElement('img');
      img.alt = '';
      img.src = URL.createObjectURL(f);
      var weg = document.createElement('button');
      weg.type = 'button';
      weg.textContent = '✕';
      weg.setAttribute('aria-label', 'Foto verwijderen');
      weg.addEventListener('click', function () { fotos.splice(i, 1); toonFotos(); });
      fig.appendChild(img);
      fig.appendChild(weg);
      lijst.appendChild(fig);
    });
    meldHoogte();
  }

  $('fotos').addEventListener('change', function (e) {
    var gekozen = Array.prototype.slice.call(e.target.files || []).filter(function (f) { return /^image\//.test(f.type); });
    e.target.value = '';
    Promise.all(gekozen.slice(0, MAX_FOTOS - fotos.length).map(verklein)).then(function (klaar) {
      fotos = fotos.concat(klaar).slice(0, MAX_FOTOS);
      toonFotos();
    });
  });

  // ── Fouten ───────────────────────────────────────────────────────────────
  function wisFouten() {
    Array.prototype.forEach.call(form.querySelectorAll('.veld .fout'), function (el) { el.remove(); });
    Array.prototype.forEach.call(form.querySelectorAll('.heeft-fout'), function (el) { el.classList.remove('heeft-fout'); });
    $('algemene-fout').hidden = true;
  }

  function veldFout(veld, tekst) {
    var plek = form.querySelector('[data-veld="' + veld + '"]');
    if (!plek || plek.hidden) return false;
    plek.classList.add('heeft-fout');
    var el = document.createElement('div');
    el.className = 'fout';
    el.textContent = tekst;
    plek.appendChild(el);
    return true;
  }

  function algemeneFout(tekst) {
    var el = $('algemene-fout');
    el.textContent = tekst;
    el.hidden = false;
    meldHoogte();
  }

  // ── Versturen ────────────────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (bezig) return;
    wisFouten();
    if (voorbeeld) {
      algemeneFout('Dit is een voorbeeld. Op je website kun je wel versturen.');
      return;
    }

    var waarde = function (id) { return ($(id).value || '').trim(); };
    var lokaal = {};
    if (!waarde('name')) lokaal.name = 'Vul je naam in';
    if (!waarde('email')) lokaal.email = 'Vul je e-mailadres in';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(waarde('email'))) lokaal.email = 'Dit e-mailadres klopt niet';
    if (!waarde('message')) lokaal.message = 'Vertel kort waar het om gaat';
    if (!$('privacy_akkoord').checked) lokaal.privacy_akkoord = 'Vink dit aan om te kunnen versturen';
    var sleutels = Object.keys(lokaal);
    if (sleutels.length) {
      sleutels.forEach(function (k) { veldFout(k, lokaal[k]); });
      var eerste = form.querySelector('.heeft-fout input, .heeft-fout textarea');
      if (eerste) eerste.focus();
      meldHoogte();
      return;
    }

    var gegevens = {
      form_token: token,
      name: waarde('name'),
      email: waarde('email'),
      phone: waarde('phone'),
      address: waarde('address'),
      postcode: waarde('postcode'),
      city: waarde('city'),
      gewenste_datum: waarde('gewenste_datum'),
      message: waarde('message'),
      privacy_akkoord: true,
      privacy_versie: 'kant-en-klaar-2026-10-05',
      submission_id: submissionId,
      ingebed_op: ingebedOp(),
      // De pagina waarop het formulier staat (zonder querystring; de server
      // knipt die er ook af).
      source_url: (function () { try { return document.referrer ? new URL(document.referrer).origin + new URL(document.referrer).pathname : ''; } catch (x) { return ''; } })(),
      bedrijfswebsite: waarde('bedrijfswebsite')
    };

    var init;
    if (fotos.length) {
      var fd = new FormData();
      fd.append('gegevens', JSON.stringify(gegevens));
      fotos.forEach(function (f, i) { fd.append('fotos', f, 'foto-' + (i + 1) + '.jpg'); });
      init = { method: 'POST', body: fd };
    } else {
      init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gegevens) };
    }

    bezig = true;
    var knop = $('verstuur');
    knop.disabled = true;
    knop.textContent = 'Versturen…';

    fetch(ENDPOINT, init)
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, b: b }; }); })
      .then(function (res) {
        if (res.status === 200 && res.b.ok) {
          form.hidden = true;
          $('klaar').hidden = false;
          meldHoogte({ verstuurd: true });
          return;
        }
        if (res.b.fout === 'validatie' && res.b.velden) {
          var getoond = false;
          for (var k in res.b.velden) getoond = veldFout(k, res.b.velden[k]) || getoond;
          if (!getoond) algemeneFout('Controleer de ingevulde gegevens.');
          meldHoogte();
        } else if (res.b.fout === 'te_veel_pogingen') {
          algemeneFout('Er zijn net veel aanvragen verstuurd. Probeer het over een paar minuten opnieuw.');
        } else if (res.b.fout === 'herkomst_niet_toegestaan') {
          algemeneFout('Dit formulier is nog niet ingesteld voor deze website. Neem op een andere manier contact op.');
        } else {
          algemeneFout('Versturen is niet gelukt. Probeer het nog eens.');
        }
      })
      .catch(function () { algemeneFout('Geen verbinding. Controleer je internet en probeer het opnieuw.'); })
      .then(function () {
        bezig = false;
        knop.disabled = false;
        knop.textContent = 'Aanvraag versturen';
      });
  });
})();
