(function () {
  var form = document.getElementById('form'), pin = document.getElementById('pin'),
      go = document.getElementById('go'), msg = document.getElementById('msg'),
      gate = document.getElementById('gate'), live = document.getElementById('live'),
      reopen = document.getElementById('reopen'),
      loc = document.getElementById('loc'), nameEl = document.getElementById('name'), phoneEl = document.getElementById('phone'), where = document.getElementById('where');
  var API = window.API_URL || '';
  var configured = /^https:\/\/script\.google\.com\//.test(API);

  function savedId() { try { return localStorage.getItem('pw_uid') || ''; } catch (e) { return ''; } }

  function post(body) {
    // text/plain avoids a browser preflight request, which Apps Script cannot answer
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  function start(cfg) {
    try { if (cfg.userId) localStorage.setItem('pw_uid', cfg.userId); } catch (e) {}
    var settings = { api_base: cfg.apiBase, app_id: cfg.appId };
    if (cfg.jwt) settings.intercom_user_jwt = cfg.jwt;
    else { settings.user_type = 'poll_worker'; settings.polling_location = cfg.location; settings.name = cfg.name; settings.phone = cfg.phone; }
    where.textContent = (cfg.name ? cfg.name + ', ' : '') + 'Polling location: ' + cfg.location;
    window.intercomSettings = settings;

    // Queue calls until the Intercom widget script has loaded.
    var q = function () { q.c(arguments); };
    q.q = []; q.c = function (a) { q.q.push(a); };
    window.Intercom = q;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://widget.intercom.io/widget/' + encodeURIComponent(cfg.appId);
    s.onerror = function () {
      gate.hidden = false; live.hidden = true;
      msg.textContent = 'The chat could not load. Check your connection and try again.';
    };
    document.head.appendChild(s);
    window.Intercom('boot', settings);
    window.Intercom('show');
    gate.hidden = true; live.hidden = false;
  }

  reopen.addEventListener('click', function () { if (window.Intercom) window.Intercom('show'); });

  function loadLocations() {
    if (!configured) {
      loc.innerHTML = '<option value="">Not set up yet</option>';
      msg.textContent = 'Support chat is not set up yet. Contact your election office.';
      return;
    }
    // Served from this site so it loads even where Google script addresses are filtered.
    fetch('locations.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) {
      loc.innerHTML = '';
      var first = document.createElement('option');
      first.value = ''; first.textContent = 'Select your polling location';
      loc.appendChild(first);
      j.locations.forEach(function (n) {
        var o = document.createElement('option'); o.value = n; o.textContent = n; loc.appendChild(o);
      });
      loc.disabled = false;
    }).catch(function () {
      loc.innerHTML = '<option value="">Could not load locations</option>';
      msg.textContent = 'Could not load the location list. Reload the page to try again.';
    });
  }
  loadLocations();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    if (!configured) return;
    var nm = nameEl.value.replace(/\s+/g, ' ').trim();
    if (!nm) { msg.textContent = 'Enter your name.'; return; }
    var ph = phoneEl.value.trim();
    var phd = ph.replace(/[^0-9]/g, '');
    if (phd.length < 10 || phd.length > 15) { msg.textContent = 'Enter a phone number with area code.'; return; }
    go.disabled = true;
    post({ action: 'verify', pin: pin.value, userId: savedId(), location: loc.value, name: nm, phone: ph })
      .then(function (j) {
        if (j.appId) { pin.value = ''; start(j); }
        else if (j.error === 'invalid_pin') msg.textContent = 'That PIN is not correct.';
        else if (j.error === 'invalid_phone') msg.textContent = 'Enter a phone number with area code.';
        else if (j.error === 'invalid_name') msg.textContent = 'Enter your name (80 characters or fewer).';
        else if (j.error === 'invalid_location') msg.textContent = 'Choose your polling location from the list.';
        else if (j.error === 'locked') msg.textContent = 'Sign-in is paused after too many wrong attempts. Wait 10 minutes, then try again.';
        else msg.textContent = 'Support chat is not available right now. Contact your election office.';
      })
      .catch(function () { msg.textContent = 'Could not reach the server. Check your connection and try again.'; })
      .then(function () { go.disabled = false; });
  });
})();
