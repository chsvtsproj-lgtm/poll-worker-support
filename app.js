(function () {
  var form = document.getElementById('form'), pin = document.getElementById('pin'),
      go = document.getElementById('go'), msg = document.getElementById('msg'),
      gate = document.getElementById('gate'), live = document.getElementById('live'),
      reopen = document.getElementById('reopen'),
      loc = document.getElementById('loc'), nameEl = document.getElementById('name'), phoneEl = document.getElementById('phone'), where = document.getElementById('where');
  // RELAY_URL (Cloudflare Worker) replaces API_URL entirely when set.
  var API = window.RELAY_URL || window.API_URL || '';
  var configured = /^https:\/\/script\.google\.com\//.test(API) ||
      /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/?$/.test(API);
  var MAX_SESSION_MS = 6 * 60 * 60 * 1000; // hard limit, enforced here even with no network
  var CHECK_MS = 2 * 60 * 1000;            // how often to ask the server if the session is still open
  var ENDED_MSG = 'Your session has ended. Please sign in again.';

  function savedId() { try { return localStorage.getItem('pw_uid') || ''; } catch (e) { return ''; } }

  // Session state lives in sessionStorage (this tab only): pw_sid (absent with an older
  // back end) and pw_deadline (local clock, ms).
  var sid = '', deadline = 0, lastCheck = 0, checking = false, tick = null, scriptAdded = false;
  function ss(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) {} }
  function sg(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }

  function post(body) {
    // text/plain avoids a browser preflight request, which Apps Script cannot answer
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  // Works out the local deadline from the server's remaining seconds (avoids clock skew),
  // never later than 6 hours from the first sign-in on this page.
  function setDeadline(j, cap) {
    var left = (typeof j.sessionExpiresIn === 'number' && j.sessionExpiresIn > 0) ? j.sessionExpiresIn * 1000 : MAX_SESSION_MS;
    deadline = Math.min(Date.now() + Math.min(left, MAX_SESSION_MS), cap || Infinity);
    ss('pw_deadline', String(deadline));
  }

  function endSession() {
    if (tick) { clearInterval(tick); tick = null; }
    sid = ''; deadline = 0;
    ss('pw_sid', ''); ss('pw_deadline', '');
    try { localStorage.removeItem('pw_uid'); } catch (e) {} // next sign-in on this device starts a fresh chat identity
    if (window.Intercom) { try { window.Intercom('shutdown'); } catch (e) {} }
    window.intercomSettings = undefined;
    where.textContent = '';
    pin.value = '';
    live.hidden = true; gate.hidden = false;
    msg.textContent = ENDED_MSG;
  }

  function check(resume) {
    if (!sid || checking) return Promise.resolve(null);
    checking = true; lastCheck = Date.now();
    var asked = sid;
    return post({ action: 'session', sessionId: asked, resume: !!resume })
      .then(function (j) {
        if (asked !== sid) return null; // a newer sign-in replaced this session meanwhile
        // Only an explicit answer ends the session; errors and unknown actions are ignored.
        if (j && j.ended) { endSession(); return null; }
        if (j && j.active) { setDeadline(j, Number(sg('pw_deadline')) || 0); return j; }
        return null;
      }, function () { return null; })
      .then(function (j) { checking = false; return j; });
  }

  function onTick() {
    if (!deadline) return;
    if (Date.now() >= deadline) { endSession(); return; }
    if (sid && Date.now() - lastCheck >= CHECK_MS) check(false);
  }

  function watch() {
    if (tick) clearInterval(tick);
    lastCheck = Date.now();
    tick = setInterval(onTick, 15000);
  }
  // Timers sleep in background tabs; re-check as soon as the page is visible again.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) onTick(); });

  function start(cfg) {
    try { if (cfg.userId) localStorage.setItem('pw_uid', cfg.userId); } catch (e) {}
    var settings = { api_base: cfg.apiBase, app_id: cfg.appId };
    if (cfg.jwt) settings.intercom_user_jwt = cfg.jwt;
    else { settings.user_type = 'poll_worker'; settings.polling_location = cfg.location; settings.name = cfg.name; settings.phone = cfg.phone; }
    where.textContent = (cfg.name ? cfg.name + ', ' : '') + 'Polling location: ' + cfg.location;
    window.intercomSettings = settings;

    if (!scriptAdded) { // after a session ends the loaded widget is reused for the next sign-in
      scriptAdded = true;
      // Queue calls until the Intercom widget script has loaded.
      var q = function () { q.c(arguments); };
      q.q = []; q.c = function (a) { q.q.push(a); };
      window.Intercom = q;

      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://widget.intercom.io/widget/' + encodeURIComponent(cfg.appId);
      s.onerror = function () {
        scriptAdded = false;
        gate.hidden = false; live.hidden = true;
        msg.textContent = 'The chat could not load. Check your connection and try again.';
      };
      document.head.appendChild(s);
    }
    window.Intercom('boot', settings);
    window.Intercom('show');
    gate.hidden = true; live.hidden = false;
  }

  reopen.addEventListener('click', function () { if (window.Intercom) window.Intercom('show'); });

  // Reload with a session still open: ask the server and reopen the chat if it is.
  (function resume() {
    var d = Number(sg('pw_deadline')) || 0;
    sid = sg('pw_sid');
    if (!d || Date.now() >= d || !configured) {
      if (d || sid) { ss('pw_sid', ''); ss('pw_deadline', ''); sid = ''; if (d) msg.textContent = ENDED_MSG; }
      return;
    }
    if (!sid) { ss('pw_deadline', ''); return; } // older back end: nothing to resume from
    deadline = d;
    check(true).then(function (j) {
      if (j && j.appId && sid) { start(j); watch(); }
    });
  })();

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
        if (j.appId) {
          pin.value = '';
          sid = (typeof j.sessionId === 'string') ? j.sessionId : '';
          ss('pw_sid', sid);
          setDeadline(j);
          start(j);
          watch();
        }
        else if (j.error === 'invalid_pin') msg.textContent = 'That PIN is not correct.';
        else if (j.error === 'outside_us') msg.textContent = 'Sign-in is only available from the United States. If you use a VPN, turn it off and try again.';
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
