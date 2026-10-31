// =====================================================================
//  Dev Tasks · Guardar en Recursos
//  · Clic en el icono (o Alt+Shift+R): abre el formulario (arrastra imágenes y pulsa Enviar).
//  · Alt+Shift+S: guarda la página actual directamente, sin formulario.
//  · Clic derecho: guardar la página (directo o con formulario), un enlace o una imagen.
//
//  No pide contraseñas: usa la sesión que ya tienes abierta en la web.
//  La dirección de la web se configura en config.js.
// =====================================================================
importScripts('config.js')

const MENU = { page: 'save-page', form: 'open-form', link: 'save-link', image: 'save-image' }

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.page, title: 'Guardar página en Recursos (directo)', contexts: ['page', 'selection'] })
    chrome.contextMenus.create({ id: MENU.form, title: 'Guardar en Recursos con imágenes…', contexts: ['page', 'selection'] })
    chrome.contextMenus.create({ id: MENU.link, title: 'Guardar enlace en Recursos', contexts: ['link'] })
    chrome.contextMenus.create({ id: MENU.image, title: 'Guardar imagen en Recursos', contexts: ['image'] })
  })
})

// Clic en el icono / Alt+Shift+R → formulario. Alt+Shift+S → guardado directo.
chrome.action.onClicked.addListener((tab) => openForm(tab))
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'quick-save') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) saveFromTab(tab)
})
chrome.contextMenus.onClicked.addListener((info, tab) => handleMenuClick(info, tab))

function handleMenuClick(info, tab) {
  if (!tab || !tab.id) return
  if (info.menuItemId === MENU.link && info.linkUrl) {
    return saveText(tab, [info.linkUrl, info.selectionText || ''].filter(Boolean).join('\n'))
  }
  if (info.menuItemId === MENU.form) return openForm(tab, info.selectionText)
  if (info.menuItemId === MENU.image && info.srcUrl) {
    // La página es la referencia y la imagen se añade como portada.
    return saveText(tab, [tab.url || '', tab.title || '', info.srcUrl].filter(Boolean).join('\n'))
  }
  return saveFromTab(tab, info.selectionText)
}

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

// Formulario en una ventana propia (no en el globo del icono): así sigue abierto mientras
// arrastras archivos desde el Explorador, cosa que el globo no permite porque se cierra al perder el foco.
async function openForm(tab, knownSelection) {
  if (!tab || !tab.id) return
  const url = /^https?:/i.test(tab.url || '') ? tab.url : ''
  const selection = (knownSelection || (url ? await readSelection(tab) : '')).trim().slice(0, 800)
  const query = new URLSearchParams({ url, title: url ? tab.title || '' : '', sel: selection })
  if (formWindowId !== null) {
    try { await chrome.windows.remove(formWindowId) } catch (_) { /* ya estaba cerrada */ }
    formWindowId = null
  }
  const created = await chrome.windows.create({ url: `popup.html?${query}`, type: 'popup', width: 560, height: 820, focused: true })
  formWindowId = created.id ?? null
}

async function saveFromTab(tab, knownSelection) {
  if (!tab || !tab.id) return
  const url = tab.url || ''
  if (!/^https?:/i.test(url)) {
    return report(tab, 'warn', 'Esta página no se puede guardar (solo webs http/https).', '!')
  }
  const selection = knownSelection || (await readSelection(tab))
  // Mismo formato que el guardado rápido de la web: enlace, título y (si hay) texto seleccionado.
  const text = [url, tab.title || '', selection.trim().slice(0, 800)].filter(Boolean).join('\n')
  return saveText(tab, text)
}

async function saveText(tab, text) {
  setBadge(tab.id, '…', '#6b7280')
  try {
    const response = await fetch(`${APP_URL}/api/quick-resource`, {
      method: 'POST',
      credentials: 'include', // usa la sesión de la web
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dev-tasks-extension' },
      body: JSON.stringify({ text }),
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
      return report(tab, 'info', `Ya estaba guardado: ${data.title}`, '=')
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
