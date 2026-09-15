(function () {
  'use strict';

  window.createAttendanceConnectorAdmin = function (options) {
    var dialog = document.getElementById('connectorDialog');
    var form = document.getElementById('connectorForm');
    var hash = document.getElementById('connectorTokenSha256');
    var hashField = document.getElementById('connectorHashField');
    var errorBox = document.getElementById('connectorFormError');
    var submit = document.getElementById('connectorDialogSubmit');
    var allowed = false, principalKey = '', editing = null, trigger = null;
    var pending = null, generation = 0, busy = false;

    function clear() {
      generation += 1;
      editing = null;
      pending = null;
      busy = false;
      hash.value = '';
      form.reset();
      errorBox.hidden = true;
      submit.disabled = false;
      if (dialog.open) dialog.close();
    }

    function updateAccess(capabilities, principal) {
      var nextAllowed = capabilities instanceof Set && capabilities.has('attendance.connector.manage');
      var nextKey = principal ? JSON.stringify([principal.user && principal.user.id, principal.sessionVersion, principal.access && principal.access.tenant && principal.access.tenant.id]) : '';
      if (nextAllowed && (!principal || principal.authenticated !== true || !principal.user || !principal.user.id)) nextAllowed = false;
      if (!nextAllowed || (principalKey && principalKey !== nextKey)) clear();
      allowed = nextAllowed;
      principalKey = nextKey;
    }

    function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
    function editable(item) {
      return item && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id || '')
        && Number.isSafeInteger(Number(item.version)) && Number(item.version) > 0
        && ['active', 'suspended'].includes(String(item.status).toLowerCase());
    }

    function open(item, action, button) {
      if (!allowed || !editable(item)) return;
      clear();
      trigger = button;
      editing = { id: item.id, version: Number(item.version), name: String(item.externalKey || 'conector'), action: action };
      var rotation = action === 'rotate';
      hashField.hidden = !rotation;
      hash.disabled = !rotation;
      hash.required = rotation;
      var verb = rotation ? 'Cambiar credencial' : action === 'active' ? 'Activar conector' : 'Suspender conector';
      document.getElementById('connectorDialogTitle').textContent = verb + ' · ' + editing.name;
      document.getElementById('connectorDialogDescription').textContent = rotation
        ? 'El token anterior dejará de funcionar. El colector debe tener el nuevo token correspondiente al hash.'
        : action === 'active'
          ? 'Habilita la recepción autenticada con la credencial configurada. La activación no confirma conexión física ni recepción de nuevas marcaciones.'
          : 'Impide nuevas recepciones de este conector. Las marcaciones conservadas permanecen disponibles.';
      submit.textContent = rotation ? 'Guardar nueva credencial' : verb;
      dialog.showModal();
      (rotation ? hash : submit).focus();
    }

    function cell(item) {
      var result = document.createElement('td');
      if (!allowed) return result;
      var wrap = document.createElement('div');
      wrap.className = 'device-commissioning';
      var status = String(item.status || '').toLowerCase();
      var actions = [[status === 'active' ? 'Suspender' : 'Activar', status === 'active' ? 'suspended' : 'active'], ['Cambiar credencial', 'rotate']];
      actions.forEach(function (action) {
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'button'; button.textContent = action[0];
        button.setAttribute('aria-label', action[0] + ' · ' + String(item.externalKey || 'conector'));
        button.disabled = !editable(item);
        if (button.disabled) button.title = status === 'retired' ? 'El conector está retirado' : 'Falta una versión válida del conector';
        button.addEventListener('click', function () { open(item, action[1], button); });
        wrap.appendChild(button);
      });
      result.appendChild(wrap);
      return result;
    }

    async function send(command, payload, key) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetch('/api/internal-attendance', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Idempotency-Key': key },
          body: JSON.stringify({ command: command, payload: payload })
        });
        var result = {};
        try { result = await response.json(); } catch (_) { /* An unreadable receipt stays retryable with the same key. */ }
        if (!response.ok || result.ok !== true) {
          var error = new Error(response.ok ? 'No recibimos una confirmación válida. Reintentá para consultar la misma operación.' : 'La operación fue rechazada.');
          error.status = response.status;
          throw error;
        }
        return result;
      } finally { clearTimeout(timer); }
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !editing) return;
      if (!allowed) { clear(); return; }
      errorBox.hidden = true;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var operation = editing, ticket = generation;
      var payload = { id: operation.id, expectedVersion: operation.version };
      var command = operation.action === 'rotate' ? 'connector.rotate_token' : 'connector.update';
      if (operation.action === 'rotate') {
        var digest = hash.value.trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(digest)) { showError('Ingresá un SHA-256 de 64 caracteres hexadecimales.'); return; }
        payload.tokenSha256 = digest;
      } else payload.status = operation.action;
      busy = true; submit.disabled = true;
      try {
        await options.validateAccess();
        if (ticket !== generation || !allowed || editing !== operation) return;
        var serialized = JSON.stringify({ command: command, payload: payload });
        if (!pending || pending.serialized !== serialized) pending = { serialized: serialized, key: options.uuid() };
        await send(command, payload, pending.key);
        if (ticket !== generation) return;
        clear();
        options.notify('Conector actualizado', operation.action === 'rotate'
          ? 'Se cambió la credencial de ' + operation.name + '. El estado de activación no cambió.'
          : operation.action === 'active' ? operation.name + ' quedó activo. Revisá la recepción del colector para confirmar el envío de marcaciones.'
            : operation.name + ' quedó suspendido. Las marcaciones conservadas siguen disponibles.', false);
        await options.reload();
      } catch (error) {
        if (ticket !== generation) return;
        if (error.status === 401 || error.status === 403) {
          allowed = false;
          clear();
          options.notify('Permiso no vigente', 'No se pudo confirmar el permiso para administrar conectores. Actualizá los datos o iniciá sesión nuevamente.', true);
          if (error.status === 401) options.expire();
          else await options.reload().catch(function () {});
        } else if (error.status === 409) {
          clear();
          options.notify('El conector cambió', 'Otro operador actualizó el conector. Recargamos los datos; revisá su estado antes de volver a operar.', true);
          await options.reload().catch(function () {});
        } else {
          showError(error.status === 400 || error.status === 422
            ? 'El servicio rechazó los datos. Revisá el hash y la versión del conector antes de reintentar.'
            : 'No pudimos confirmar la operación. Conservamos el hash; al reintentar se consulta la misma operación si no cambiás los datos.');
        }
      } finally {
        if (ticket === generation) { busy = false; submit.disabled = false; }
      }
    });

    document.getElementById('connectorDialogClose').addEventListener('click', clear);
    document.getElementById('connectorDialogCancel').addEventListener('click', clear);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); clear(); });
    dialog.addEventListener('close', function () {
      var previous = trigger; trigger = null;
      if (editing) clear();
      if (previous && document.contains(previous)) previous.focus();
    });
    window.addEventListener('pagehide', clear);
    document.addEventListener('mc:session-changed', function () { allowed = false; clear(); });
    document.addEventListener('mc:auth-changed', function () { allowed = false; clear(); });
    return { cell: cell, updateAccess: updateAccess, clear: clear, canManage: function () { return allowed; } };
  };
})();
