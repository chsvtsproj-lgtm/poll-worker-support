(function () {
  var $ = function (id) { return document.getElementById(id); };
  var login = $('login'), panel = $('panel');
  var API = window.API_URL || '';
  var token = '';
  try { token = sessionStorage.getItem('pw_admin') || ''; } catch (e) {}

  function call(action, extra) {
    var body = { action: action, token: token };
    for (var k in (extra || {})) body[k] = extra[k];
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function clearMsgs() { $('msg').textContent = ''; $('err').textContent = ''; $('genOut').hidden = true; }
  function setToken(t) { token = t || ''; try { if (t) sessionStorage.setItem('pw_admin', t); else sessionStorage.removeItem('pw_admin'); } catch (e) {} }

  function refresh() {
    if (!token) { login.hidden = false; panel.hidden = true; return; }
    call('status').then(function (j) {
      if (j.authenticated) {
        login.hidden = true; panel.hidden = false;
        $('state').textContent = j.pinSet
          ? 'A PIN is set. It was last changed ' + new Date(j.pinUpdated).toLocaleString() + '. For security the current PIN cannot be shown; set a new one if it is lost.'
          : 'No PIN is set yet, so poll workers cannot start a chat. Set one below.';
        $('pause').textContent = j.pinPaused ? 'PIN sign-in is currently paused because of repeated wrong attempts. Clear the lockout to resume.' : '';
      } else { setToken(''); login.hidden = false; panel.hidden = true; }
    }).catch(function () { $('loginMsg').textContent = 'Could not reach the server.'; });
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('loginMsg').textContent = ''; $('loginBtn').disabled = true;
    token = '';
    call('login', { password: $('pw').value }).then(function (j) {
      $('pw').value = '';
      if (j.ok) { setToken(j.token); clearMsgs(); refresh(); }
      else if (j.error === 'invalid_password') $('loginMsg').textContent = 'That password is not correct.';
      else if (j.error === 'locked') $('loginMsg').textContent = 'Too many attempts. Wait 15 minutes, then try again.';
      else $('loginMsg').textContent = 'Admin sign-in is not available right now.';
    }).catch(function () { $('loginMsg').textContent = 'Could not reach the server.'; })
      .then(function () { $('loginBtn').disabled = false; });
  });

  $('setForm').addEventListener('submit', function (e) {
    e.preventDefault(); clearMsgs();
    call('setPin', { pin: $('pin').value }).then(function (j) {
      if (j.ok) { $('pin').value = ''; $('msg').textContent = 'PIN saved. It works immediately.'; refresh(); }
      else if (j.error === 'unauthorized') refresh();
      else $('err').textContent = j.message || 'Could not save the PIN.';
    });
  });

  $('gen').addEventListener('click', function () {
    clearMsgs();
    call('generatePin').then(function (j) {
      if (j.pin) { $('genPin').textContent = j.pin; $('genOut').hidden = false; refresh(); }
      else if (j.error === 'unauthorized') refresh();
      else $('err').textContent = 'Could not generate a PIN.';
    });
  });

  $('reset').addEventListener('click', function () {
    clearMsgs();
    call('resetLockout').then(function (j) {
      if (j.ok) { $('msg').textContent = 'Lockout cleared.'; refresh(); } else refresh();
    });
  });

  $('out').addEventListener('click', function () {
    call('logout').then(function () { setToken(''); clearMsgs(); refresh(); });
  });

  refresh();
})();
