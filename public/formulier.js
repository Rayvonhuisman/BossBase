/*
 * BossBase websiteformulier — het script dat een bedrijf in zijn eigen website
 * plakt (Instellingen › Websiteformulier). Twee manieren:
 *
 *   1. Kant-en-klaar formulier
 *        <div data-bossbase-formulier="wf_..."></div>
 *        <script src="https://www.bossbase.nl/formulier.js" async></script>
 *      Zet op de plek van de div een iframe met het formulier
 *      (/aanvraagformulier), in de kleur van het bedrijf, dat zelf meegroeit.
 *
 *   2. Koppelen aan een bestaand formulier
 *        <script src="https://www.bossbase.nl/formulier.js" data-bossbase-koppelen="wf_..." async></script>
 *      Leest bij het versturen de velden van het eigen formulier volgens de
 *      koppeling uit Instellingen en stuurt een kopie naar BossBase. Het eigen
 *      formulier werkt gewoon door zoals het werkte.
 *
 * Er staat geen geheime sleutel in: "wf_..." zegt alleen wélk formulier. Wat
 * het veilig maakt, gebeurt op de server (edge function public-website-inquiry):
 * alleen de domeinen die het bedrijf heeft opgegeven, een verborgen veld tegen
 * bots en een limiet per IP-adres.
 *
 * Bewust zonder build-stap en zonder afhankelijkheden: dit draait op websites
 * die wij niet kennen, naast scripts die wij niet kennen.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/public-website-inquiry';
  var HONEYPOT = 'bedrijfswebsite';
  var MAX_FOTOS = 5;

  var script = document.currentScript || document.querySelector('script[src*="formulier.js"]');
  var basis;
  try { basis = new URL(script.src).origin; } catch (e) { basis = 'https://www.bossbase.nl'; }
  // Lokaal (vite) bestaan de nette adressen zonder .html niet.
  var lokaal = /^(localhost|127\.0\.0\.1)$/.test(new URL(basis).hostname);
  var PAGINA = basis + (lokaal ? '/aanvraagformulier.html' : '/aanvraagformulier');

  // ── 1. Kant-en-klaar ─────────────────────────────────────────────────────
  function plaatsFormulieren() {
    var plekken = document.querySelectorAll('[data-bossbase-formulier]');
    for (var i = 0; i < plekken.length; i++) {
      var plek = plekken[i];
      if (plek.getAttribute('data-bossbase-geplaatst')) continue;
      var token = plek.getAttribute('data-bossbase-formulier');
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(token || '')) continue;
      plek.setAttribute('data-bossbase-geplaatst', '1');

      var frame = document.createElement('iframe');
      frame.src = PAGINA + '?f=' + encodeURIComponent(token);
      frame.title = 'Aanvraagformulier';
      frame.loading = 'lazy';
      frame.setAttribute('scrolling', 'no');
      frame.style.cssText = 'display:block;width:100%;max-width:640px;height:720px;border:0;margin:0 auto;background:transparent;overflow:hidden';
      plek.appendChild(frame);
    }
  }

  // Het formulier meldt zijn hoogte, zodat er geen schuifbalk in je pagina komt.
  window.addEventListener('message', function (e) {
    if (e.origin !== basis || !e.data || e.data.bossbase !== 'formulier') return;
    var frames = document.querySelectorAll('[data-bossbase-formulier] iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow !== e.source) continue;
      if (typeof e.data.hoogte === 'number' && e.data.hoogte > 100 && e.data.hoogte < 5000) {
        frames[i].style.height = Math.ceil(e.data.hoogte) + 'px';
      }
      if (e.data.verstuurd) {
        var r = frames[i].getBoundingClientRect();
        if (r.top < 0) frames[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  // ── 2. Koppelen aan een bestaand formulier ───────────────────────────────
  var koppelToken = script && script.getAttribute('data-bossbase-koppelen');
  var koppeling = null;      // [{ veld, doel }]
  var inzendingen = {};      // per formulier één submission_id: dubbel versturen telt één keer

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function velden(form, naam) {
    var uit = [];
    var els = form.elements;
    for (var i = 0; i < els.length; i++) if (els[i].name === naam) uit.push(els[i]);
    return uit;
  }

  function hoortBijOns(form) {
    if (!koppeling || !form || form.tagName !== 'FORM') return false;
    for (var i = 0; i < koppeling.length; i++) {
      if (koppeling[i].doel === 'email' && velden(form, koppeling[i].veld).length) return true;
    }
    return false;
  }

  // Een verborgen veld in het eigen formulier. Een mens ziet het niet en vult
  // het dus niet in; een bot die alles invult wel.
  function zetHoneypot(form) {
    if (form.querySelector('input[name="bossbase_hp"]')) return;
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'bossbase_hp';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;opacity:0!important';
    form.appendChild(hp);
  }

  function leesFormulier(form) {
    var data = {};
    var fotos = [];
    for (var i = 0; i < koppeling.length; i++) {
      var k = koppeling[i];
      var els = velden(form, k.veld);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (k.doel === 'fotos') {
          if (el.type === 'file' && el.files) for (var f = 0; f < el.files.length; f++) fotos.push(el.files[f]);
          continue;
        }
        if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
        if (el.type === 'file' || el.type === 'password') continue;
        var waarde = el.tagName === 'SELECT' && el.multiple
          ? Array.prototype.filter.call(el.options, function (o) { return o.selected; }).map(function (o) { return o.value; }).join(', ')
          : String(el.value || '').trim();
        if (!waarde) continue;
        // Twee velden op één BossBase-veld (voornaam + achternaam, of twee
        // vragen samen in de omschrijving) worden samengevoegd.
        data[k.doel] = data[k.doel] ? data[k.doel] + (k.doel === 'message' ? '\n' : ' ') + waarde : waarde;
      }
    }
    var hp = form.querySelector('input[name="bossbase_hp"]');
    return { data: data, fotos: fotos.slice(0, MAX_FOTOS), honeypot: hp ? hp.value : '' };
  }

  function verkleinFoto(bestand) {
    return new Promise(function (klaar) {
      if (!bestand || !/^image\//.test(bestand.type) || !window.createImageBitmap) return klaar(bestand);
      createImageBitmap(bestand).then(function (beeld) {
        var max = 1600;
        var schaal = Math.min(1, max / Math.max(beeld.width, beeld.height));
        var c = document.createElement('canvas');
        c.width = Math.round(beeld.width * schaal);
        c.height = Math.round(beeld.height * schaal);
        c.getContext('2d').drawImage(beeld, 0, 0, c.width, c.height);
        c.toBlob(function (blob) { klaar(blob || bestand); }, 'image/jpeg', 0.82);
      }).catch(function () { klaar(bestand); });
    });
  }

  function verstuur(form) {
    var gelezen = leesFormulier(form);
    var d = gelezen.data;
    if (!d.email) return Promise.resolve();
    var id = inzendingen[form.__bossbaseId] || (inzendingen[form.__bossbaseId] = uuid());
    var gegevens = {
      form_token: koppelToken,
      name: d.name || d.email,
      email: d.email,
      phone: d.phone || '',
      address: d.address || '',
      postcode: d.postcode || '',
      city: d.city || '',
      gewenste_datum: d.gewenste_datum || '',
      message: d.message || ('Aanvraag via het formulier op ' + location.hostname),
      source_url: location.href,
      // De toestemming regelt het formulier van het bedrijf zelf.
      privacy_akkoord: true,
      privacy_versie: 'eigen-formulier',
      submission_id: id
    };
    gegevens[HONEYPOT] = gelezen.honeypot;

    var verzoek;
    if (gelezen.fotos.length) {
      verzoek = Promise.all(gelezen.fotos.map(verkleinFoto)).then(function (fotos) {
        var fd = new FormData();
        fd.append('gegevens', JSON.stringify(gegevens));
        fotos.forEach(function (f, i) { fd.append('fotos', f, 'foto-' + (i + 1) + '.jpg'); });
        return fetch(ENDPOINT, { method: 'POST', body: fd });
      });
    } else {
      verzoek = fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gegevens)
      });
    }
    return verzoek.then(function (r) {
      if (!r.ok && window.console) console.warn('[BossBase] aanvraag niet doorgestuurd (' + r.status + ')');
    }).catch(function () {
      if (window.console) console.warn('[BossBase] aanvraag niet doorgestuurd (netwerk)');
    });
  }

  // Op window en niet op het formulier: zo lopen we ná de scripts van het
  // formulier zelf (Contact Form 7, WPForms, Elementor) en zien we of die het
  // versturen al overnemen (defaultPrevented). Dan sturen we alleen een kopie.
  // Anders zou de browser meteen naar een andere pagina gaan en ons verzoek
  // afbreken: dan houden we dat even tegen, versturen, en laten het formulier
  // daarna precies zo versturen als het zou doen.
  function opVersturen(e) {
    var form = e.target;
    if (!hoortBijOns(form) || form.__bossbaseBezig) return;
    if (!form.__bossbaseId) form.__bossbaseId = uuid();
    if (e.defaultPrevented) {
      verstuur(form);
      return;
    }
    e.preventDefault();
    form.__bossbaseBezig = true;
    var knop = e.submitter;
    var klaar = false;
    var door = function () {
      if (klaar) return;
      klaar = true;
      // De knop waarmee verstuurd werd, telt soms mee (name="actie").
      if (knop && knop.name) {
        var h = document.createElement('input');
        h.type = 'hidden';
        h.name = knop.name;
        h.value = knop.value;
        form.appendChild(h);
      }
      HTMLFormElement.prototype.submit.call(form);
    };
    verstuur(form).then(door, door);
    // Nooit langer dan vier seconden ophouden.
    setTimeout(door, 4000);
  }

  function startKoppelen() {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(koppelToken || '')) return;
    fetch(ENDPOINT + '?formulier=' + encodeURIComponent(koppelToken))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || !cfg.ok || !cfg.koppeling || !cfg.koppeling.length) return;
        koppeling = cfg.koppeling;
        var forms = document.forms;
        for (var i = 0; i < forms.length; i++) if (hoortBijOns(forms[i])) zetHoneypot(forms[i]);
        window.addEventListener('submit', opVersturen);
        // Formulieren die later verschijnen (pop-ups, pagina-bouwers).
        if (window.MutationObserver) {
          var gepland = false;
          new MutationObserver(function () {
            if (gepland) return;
            gepland = true;
            setTimeout(function () {
              gepland = false;
              for (var i = 0; i < document.forms.length; i++) if (hoortBijOns(document.forms[i])) zetHoneypot(document.forms[i]);
            }, 300);
          }).observe(document.documentElement, { childList: true, subtree: true });
        }
      })
      .catch(function () { /* geen verbinding: het eigen formulier werkt gewoon */ });
  }

  function start() {
    plaatsFormulieren();
    if (koppelToken) startKoppelen();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
