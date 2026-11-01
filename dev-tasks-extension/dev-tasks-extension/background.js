// =====================================================================
//  Dev Tasks · Guardar en Recursos
//  · Clic en el icono (o Alt+Shift+R): abre un panel desplegable dentro de la página. NO se cierra al hacer
//    clic fuera: solo con Enviar/Actualizar, con ✕, con Esc o volviendo a pulsar el icono.
//  · Alt+Shift+S: guarda la página actual directamente, sin panel.
//  · Clic derecho: guardar la página (directo o con panel), un enlace o una imagen.
//
//  No pide contraseñas: usa la sesión que ya tienes abierta en la web.
//  La dirección de la web se configura en config.js.
// =====================================================================
importScripts('config.js')

const MENU = { page: 'save-page', panel: 'open-panel', link: 'save-link', image: 'save-image' }
const PANEL_ID = '__dev-tasks-panel'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.page, title: 'Guardar página en Recursos (directo)', contexts: ['page', 'selection'] })
    chrome.contextMenus.create({ id: MENU.panel, title: 'Abrir panel de Recursos…', contexts: ['page', 'selection'] })
    chrome.contextMenus.create({ id: MENU.link, title: 'Guardar enlace en Recursos', contexts: ['link'] })
    chrome.contextMenus.create({ id: MENU.image, title: 'Guardar imagen en Recursos', contexts: ['image'] })
  })
})

chrome.action.onClicked.addListener((tab) => openPanel(tab))
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'quick-save') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) saveFromTab(tab)
})
chrome.contextMenus.onClicked.addListener((info, tab) => handleMenuClick(info, tab))

function handleMenuClick(info, tab) {
  if (!tab || !tab.id) return
  if (info.menuItemId === MENU.panel) return openPanel(tab, info.selectionText)
  if (info.menuItemId === MENU.link && info.linkUrl) {
    return saveText(tab, [info.linkUrl, info.selectionText || ''].filter(Boolean).join('\n'), { referenceUrl: info.linkUrl })
  }
  if (info.menuItemId === MENU.image && info.srcUrl) {
    // La página es la referencia (completa) y la imagen se añade como portada.
    return saveText(tab, [tab.url || '', tab.title || '', info.srcUrl].filter(Boolean).join('\n'), /^https?:/i.test(tab.url || '') ? { referenceUrl: tab.url } : {})
  }
  return saveFromTab(tab, info.selectionText)
}

// ---------------------------------------------------------------------
//  Panel
// ---------------------------------------------------------------------
let formWindowId = null
chrome.windows.onRemoved.addListener((id) => { if (id === formWindowId) formWindowId = null })

// Texto seleccionado en la pestaña (solo se puede leer en el momento del clic: activeTab).
async function readSelection(tab) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection ? window.getSelection() : ''),
    })
    return (result && result.result) || ''
  } catch (_) {
    return '' // página restringida
  }
}

// Se ejecuta DENTRO de la página (tiene que ser autónoma): abre el panel, o lo cierra si ya estaba abierto.
function togglePanel(id, query) {
  const existing = document.getElementById(id)
  if (existing) { existing.remove(); return 'closed' }
  const frame = document.createElement('iframe')
  frame.id = id
  frame.title = 'Guardar en Recursos'
  frame.src = chrome.runtime.getURL('panel.html') + query
  frame.setAttribute('allow', 'clipboard-write')
  frame.style.cssText = [
    'position:fixed', 'top:12px', 'right:16px', 'width:410px', 'height:min(660px,calc(100vh - 24px))',
    'z-index:2147483647', 'border:1px solid #2a3c3e', 'border-radius:14px', 'background:#0b1517',
    'box-shadow:0 18px 50px rgba(0,0,0,.55)', 'color-scheme:dark',
  ].join(';')
  frame.addEventListener('load', () => { try { frame.contentWindow.focus() } catch (_) { /* sin foco */ } })
  document.documentElement.appendChild(frame)
  return 'opened'
}

function removePanel(id) {
  const el = document.getElementById(id)
  if (el) el.remove()
}

async function openPanel(tab, knownSelection) {
  if (!tab || !tab.id) return
  const url = /^https?:/i.test(tab.url || '') ? tab.url : ''
  const selection = (knownSelection || (url ? await readSelection(tab) : '')).trim().slice(0, 800)
  const token = crypto.randomUUID()
  const key = `panel:${token}`
  await cleanOldTokens()
  await chrome.storage.session.set({ [key]: { tabId: tab.id, mode: 'panel', url, title: url ? tab.title || '' : '', selection, createdAt: Date.now() } })
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: togglePanel, args: [PANEL_ID, `?t=${token}`] })
    if (result && result.result === 'closed') await chrome.storage.session.remove(key) // segundo clic en el icono: se cierra
    return
  } catch (_) { /* página donde no se puede inyectar (chrome://, tienda…): se usa una ventana */ }
  await chrome.storage.session.set({ [key]: { tabId: tab.id, mode: 'window', url, title: url ? tab.title || '' : '', selection, createdAt: Date.now() } })
  if (formWindowId !== null) {
    try { await chrome.windows.remove(formWindowId) } catch (_) { /* ya estaba cerrada */ }
    formWindowId = null
  }
  const created = await chrome.windows.create({ url: `panel.html?t=${token}&mode=window`, type: 'popup', width: 440, height: 780, focused: true })
  formWindowId = created.id ?? null
}

async function cleanOldTokens() {
  const all = await chrome.storage.session.get(null)
  const stale = Object.keys(all).filter((key) => key.startsWith('panel:') && Date.now() - (all[key].createdAt || 0) > 6 * 60 * 60 * 1000)
  if (stale.length) await chrome.storage.session.remove(stale)
}

// Mensajes del panel. Solo se atienden los de esta misma extensión.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  ;(async () => {
    const key = `panel:${message && message.token}`
    const stored = message && message.token ? (await chrome.storage.session.get(key))[key] : null
    if (message && message.type === 'panel-hello') {
      // El panel solo se activa con el código secreto que se creó al abrirlo y desde la pestaña correcta:
      // una web que intentara incrustarlo por su cuenta se queda con el panel bloqueado.
      const valid = stored && (stored.mode === 'window' || (sender.tab && sender.tab.id === stored.tabId))
      sendResponse(valid ? { ok: true, data: stored } : { ok: false })
    } else if (message && message.type === 'panel-close') {
      if (stored) {
        await chrome.storage.session.remove(key)
        if (stored.mode !== 'window' && sender.tab && sender.tab.id === stored.tabId) {
          try { await chrome.scripting.executeScript({ target: { tabId: stored.tabId }, func: removePanel, args: [PANEL_ID] }) } catch (_) { /* ya no está */ }
        }
      }
      sendResponse({ ok: true })
    } else {
      sendResponse({ ok: false })
    }
  })()
  return true // respuesta asíncrona
})

// ---------------------------------------------------------------------
//  Guardado directo
// ---------------------------------------------------------------------
async function saveFromTab(tab, knownSelection) {
  if (!tab || !tab.id) return
  const url = tab.url || ''
  if (!/^https?:/i.test(url)) {
    return report(tab, 'warn', 'Esta página no se puede guardar (solo webs http/https).', '!')
  }
  const selection = knownSelection || (await readSelection(tab))
  // Mismo formato que el guardado rápido de la web, y la referencia es siempre el enlace completo de la página.
  const text = [url, tab.title || '', selection.trim().slice(0, 800)].filter(Boolean).join('\n')
  return saveText(tab, text, { referenceUrl: url })
}

async function saveText(tab, text, extra) {
  setBadge(tab.id, '…', '#6b7280')
  try {
    const response = await fetch(`${APP_URL}/api/quick-resource`, {
      method: 'POST',
      credentials: 'include', // usa la sesión de la web
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dev-tasks-extension' },
      body: JSON.stringify({ text, ...(extra || {}) }),
    })
    let data = {}
    try { data = await response.json() } catch (_) { /* sin JSON */ }

    if (response.status === 401 || data.error === 'not_authenticated') {
      return report(tab, 'warn', 'Inicia sesión en la web de Recursos (en este mismo navegador) y vuelve a intentarlo.', '!')
    }
    if (response.status === 403) {
      return report(tab, 'error', 'Solo los administradores pueden guardar recursos.', '!')
    }
    if (data.duplicate) {
      return report(tab, 'info', `Ya estaba guardado: ${data.title}. Abre el panel (icono) para actualizarlo.`, '=')
    }
    if (response.ok && data.ok) {
      return report(tab, 'ok', `Guardado en Recursos: ${data.title}`, '✓')
    }
    return report(tab, 'error', `No se pudo guardar (${data.error || response.status}).`, '!')
  } catch (_) {
    return report(tab, 'error', 'No hay conexión con la web de Recursos.', '!')
  }
}

const COLORS = { ok: '#10b981', info: '#38bdf8', warn: '#f59e0b', error: '#ef4444' }

function setBadge(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ tabId, color })
  chrome.action.setBadgeText({ tabId, text })
}

async function report(tab, kind, message, badge) {
  setBadge(tab.id, badge, COLORS[kind] || '#6b7280')
  setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 4000)
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showToast, args: [message, kind, COLORS[kind]] })
  } catch (_) { /* páginas donde no se puede inyectar: queda el aviso del icono */ }
}

// Se ejecuta DENTRO de la página: aviso flotante de 3,5 s. Tiene que ser autónoma.
function showToast(message, kind, color) {
  const previous = document.getElementById('__dev-tasks-toast')
  if (previous) previous.remove()
  const el = document.createElement('div')
  el.id = '__dev-tasks-toast'
  el.setAttribute('role', 'status')
  el.textContent = message
  el.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647', 'max-width:360px',
    'padding:12px 16px', 'border-radius:10px', 'background:#0b1517', 'color:#eef5f4',
    `border:1px solid ${color}`, `border-left:5px solid ${color}`, 'box-shadow:0 8px 30px rgba(0,0,0,.45)',
    'font:600 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif', 'opacity:0', 'transition:opacity .2s',
  ].join(';')
  document.documentElement.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250) }, 3500)
}
