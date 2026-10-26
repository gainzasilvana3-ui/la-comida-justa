'use strict';
// Panel de licencias. Sin dependencias. Todo el texto se inserta con textContent (nunca innerHTML con datos).

const API = 'api/';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const $ = (sel) => document.querySelector(sel);

function fmtDate(sec) {
  if (!sec) return '—';
  return new Date(sec * 1000).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function showMsg(text, isError = false) {
  const m = $('#msg');
  m.textContent = text;
  m.className = isError ? 'error' : '';
  m.hidden = false;
  if (!isError) setTimeout(() => { if (m.textContent === text) m.hidden = true; }, 6000);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json', 'X-LCJ-Admin': '1' } : { 'X-LCJ-Admin': '1' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new Error((data && data.message) || `Error ${res.status}`);
  return data;
}

function setRows(tbody, rows) {
  tbody.replaceChildren(...rows);
}

function statusTag(l) {
  if (l.status === 'revoked') return el('span', { class: 'tag revoked' }, 'Revocada');
  if (!l.activated_at) return el('span', { class: 'tag unused' }, 'Sin activar');
  return el('span', { class: 'tag' }, 'Activa');
}

// ---------- pestañas ----------
const loaders = {};
for (const btn of document.querySelectorAll('.tabs button')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b === btn));
    for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== `tab-${btn.dataset.tab}`;
    $('#msg').hidden = true;
    loaders[btn.dataset.tab]?.();
  });
}

// ---------- resumen ----------
loaders.resumen = async () => {
  try {
    const s = await api('stats');
    const card = (label, value) => el('div', { class: 'card' }, el('b', {}, value ?? 0), label);
    $('#stats').replaceChildren(
      card('Códigos generados', s.total),
      card('Activados', s.activated),
      card('Sin activar', s.unused),
      card('Revocados', s.revoked),
      card('Dispositivos activos', s.devices),
      card('Errores (7 días)', s.errors7d),
    );
  } catch (e) { showMsg(e.message, true); }
};

// ---------- generar ----------
let lastCodes = [];
$('#form-batch').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const body = { count: Number(f.get('count')) };
  if (f.get('batch')) body.batch = String(f.get('batch'));
  if (f.get('reference')) body.reference = String(f.get('reference'));
  if (f.get('maxDevices')) body.maxDevices = Number(f.get('maxDevices'));
  const btn = ev.target.querySelector('button');
  btn.disabled = true;
  try {
    const data = await api('licenses/batch', { method: 'POST', body });
    lastCodes = data.codes.map((c) => ({ ...c, batch: body.batch || '' }));
    $('#codes-text').value = lastCodes.map((c) => c.code).join('\n');
    $('#batch-result').hidden = false;
    showMsg(`Se generaron ${lastCodes.length} códigos. Guardalos ahora: no se pueden volver a ver.`);
  } catch (e) { showMsg(e.message, true); } finally { btn.disabled = false; }
});

$('#dl-csv').addEventListener('click', () => {
  const lines = ['codigo,licencia,tanda', ...lastCodes.map((c) => `${c.code},${c.licenseId},"${c.batch.replace(/"/g, '""')}"`)];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `codigos-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
});

$('#copy-codes').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#codes-text').value); showMsg('Códigos copiados.'); }
  catch { $('#codes-text').select(); showMsg('Seleccioné los códigos: copialos con Ctrl+C.'); }
});

// ---------- licencias ----------
let licOffset = 0;
let licQuery = { q: '', status: '' };

async function loadLicenses(append = false) {
  try {
    const params = new URLSearchParams({ ...licQuery, limit: '50', offset: String(licOffset) });
    const data = await api(`licenses?${params}`);
    const rows = data.licenses.map((l) =>
      el('tr', { class: 'clickable', onclick: () => openLicense(l.id) },
        el('td', {}, el('code', {}, l.id.slice(0, 8))),
        el('td', {}, statusTag(l)),
        el('td', {}, l.batch || '—'),
        el('td', {}, l.reference || '—'),
        el('td', {}, fmtDate(l.created_at)),
        el('td', {}, fmtDate(l.activated_at)),
        el('td', {}, `${l.active_devices}/${l.max_devices}`),
      ));
    const tbody = $('#lic-table tbody');
    if (append) tbody.append(...rows); else setRows(tbody, rows);
    $('#lic-more').hidden = data.licenses.length < 50;
  } catch (e) { showMsg(e.message, true); }
}
loaders.licencias = () => { licOffset = 0; loadLicenses(); };

$('#form-search').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  licQuery = { q: String(f.get('q') || ''), status: String(f.get('status') || '') };
  licOffset = 0;
  loadLicenses();
});
$('#lic-more').addEventListener('click', () => { licOffset += 50; loadLicenses(true); });

$('#form-lookup').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const code = String(new FormData(ev.target).get('code') || '');
  try {
    const { id } = await api('licenses/lookup', { method: 'POST', body: { code } });
    openLicense(id);
  } catch (e) { showMsg(e.message, true); }
});

async function licAction(id, action, body = {}, confirmText) {
  if (confirmText && !confirm(confirmText)) return null;
  try {
    const data = await api(`licenses/${id}/${action}`, { method: 'POST', body });
    showMsg('Listo.');
    await openLicense(id);
    loadLicenses();
    return data;
  } catch (e) { showMsg(e.message, true); return null; }
}

async function openLicense(id) {
  const box = $('#lic-detail');
  try {
    const { license: l, devices, transfersLastYear } = await api(`licenses/${id}`);
    const devRows = devices.map((d) => el('tr', {},
      el('td', {}, el('code', {}, d.short_id)),
      el('td', {}, d.status === 'active' ? 'Activo' : 'Liberado'),
      el('td', {}, fmtDate(d.created_at)),
      el('td', {}, fmtDate(d.last_seen_at)),
    ));
    const maxInput = el('input', { type: 'number', min: 1, max: 5, value: l.max_devices });
    const refInput = el('input', { maxlength: 60, value: l.reference || '' });
    box.replaceChildren(
      el('h3', {}, 'Licencia ', el('code', {}, l.id)),
      el('p', {}, statusTag(l), ' · creada ', fmtDate(l.created_at), ' · activada ', fmtDate(l.activated_at),
        l.batch ? ` · tanda ${l.batch}` : ''),
      l.status === 'revoked' ? el('p', {}, `Revocada el ${fmtDate(l.revoked_at)}${l.revoke_reason ? ` · motivo: ${l.revoke_reason}` : ''}`) : null,
      el('p', { class: 'muted' }, `Cambios de dispositivo en los últimos 12 meses: ${transfersLastYear}. Código de recuperación: ${l.has_recovery ? 'entregado' : 'todavía no'}.`),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Dispositivo'), el('th', {}, 'Estado'), el('th', {}, 'Alta'), el('th', {}, 'Última conexión'))),
        el('tbody', {}, devRows.length ? devRows : el('tr', {}, el('td', { colspan: 4 }, 'Sin dispositivos'))))),
      el('div', { class: 'form inline' },
        el('label', {}, 'Dispositivos', maxInput),
        el('label', {}, 'Referencia', refInput),
        el('button', { class: 'secondary', onclick: async () => {
          try {
            await api(`licenses/${l.id}`, { method: 'PATCH', body: { maxDevices: Number(maxInput.value), reference: refInput.value || null } });
            showMsg('Guardado.');
            openLicense(l.id);
          } catch (e) { showMsg(e.message, true); }
        } }, 'Guardar')),
      el('div', { class: 'actions' },
        l.status === 'revoked'
          ? el('button', { onclick: () => licAction(l.id, 'reactivate', {}, '¿Reactivar esta licencia?') }, 'Reactivar')
          : el('button', { class: 'danger', onclick: () => {
              const reason = prompt('Motivo de la revocación (opcional, sin datos personales):', '');
              if (reason === null) return;
              licAction(l.id, 'revoke', { reason });
            } }, 'Revocar'),
        el('button', { class: 'secondary', onclick: () => licAction(l.id, 'reset-devices', {},
          'Se liberan todos los dispositivos. La persona vuelve a entrar con su código de recuperación. ¿Seguimos?') }, 'Liberar dispositivos'),
        el('button', { class: 'secondary', onclick: async () => {
          const data = await licAction(l.id, 'reissue', {},
            'Se genera un código de activación NUEVO. El código anterior y el de recuperación dejan de servir. ¿Seguimos?');
          if (data) {
            box.append(el('p', {}, 'Código nuevo (se muestra una sola vez): ', el('span', { class: 'big-code' }, data.code)));
          }
        } }, 'Generar código nuevo'),
      ),
    );
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { showMsg(e.message, true); }
}

// ---------- catálogo ----------
loaders.catalogo = async () => {
  try {
    const { versions, current } = await api('catalog');
    setRows($('#cat-table tbody'), versions.map((v) => el('tr', {},
      el('td', {}, v.version),
      el('td', {}, v.recipes),
      el('td', {}, v.notes || '—'),
      el('td', {}, `${fmtDate(v.created_at)} · ${v.created_by || ''}`),
      el('td', {}, v.version === current ? el('span', { class: 'tag' }, 'Publicada') : '—'),
      el('td', {}, v.version === current ? '' : el('button', { class: 'secondary', onclick: async () => {
        if (!confirm(`¿Publicar la versión ${v.version}? Los compradores la recibirán al conectarse.`)) return;
        try { await api(`catalog/${v.version}/publish`, { method: 'POST', body: {} }); showMsg('Versión publicada.'); loaders.catalogo(); }
        catch (e) { showMsg(e.message, true); }
      } }, 'Publicar')),
    )));
  } catch (e) { showMsg(e.message, true); }
};

$('#form-catalog').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const file = f.get('file');
  if (!(file instanceof File) || file.size === 0) return showMsg('Elegí un archivo.', true);
  if (file.size > 4 * 1024 * 1024) return showMsg('El archivo es demasiado grande (máximo 4 MB).', true);
  let catalog;
  try { catalog = JSON.parse(await file.text()); } catch { return showMsg('El archivo no es un JSON válido.', true); }
  try {
    const r = await api('catalog', { method: 'POST', body: { catalog, notes: String(f.get('notes') || '') } });
    showMsg(`Versión ${r.version} subida con ${r.recipes} recetas. Todavía no está publicada.`);
    ev.target.reset();
    loaders.catalogo();
  } catch (e) { showMsg(e.message, true); }
});

// ---------- ajustes ----------
loaders.ajustes = async () => {
  try {
    const s = await api('settings');
    const form = $('#form-settings');
    form.default_max_devices.value = s.default_max_devices;
    form.transfers_per_year.value = s.transfers_per_year;
    form.latest_app_version.value = s.latest_app_version;
  } catch (e) { showMsg(e.message, true); }
};
$('#form-settings').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  try {
    await api('settings', { method: 'PUT', body: {
      default_max_devices: Number(f.default_max_devices.value),
      transfers_per_year: Number(f.transfers_per_year.value),
      latest_app_version: f.latest_app_version.value,
    } });
    showMsg('Ajustes guardados.');
  } catch (e) { showMsg(e.message, true); }
});

// ---------- errores y registro ----------
loaders.errores = async () => {
  try {
    const { errors } = await api('errors');
    setRows($('#err-table tbody'), errors.map((e) => el('tr', {},
      el('td', {}, fmtDate(e.at)), el('td', {}, e.app_version || '—'), el('td', {}, e.place || '—'), el('td', {}, e.message))));
  } catch (e) { showMsg(e.message, true); }
};
loaders.registro = async () => {
  try {
    const { audit } = await api('audit');
    setRows($('#audit-table tbody'), audit.map((a) => el('tr', {},
      el('td', {}, fmtDate(a.at)), el('td', {}, a.admin), el('td', {}, a.action), el('td', {}, el('code', {}, a.detail || '')))));
  } catch (e) { showMsg(e.message, true); }
};

// ---------- inicio ----------
api('me').then((d) => { $('#who').textContent = d.email; }).catch(() => {});
loaders.resumen();
