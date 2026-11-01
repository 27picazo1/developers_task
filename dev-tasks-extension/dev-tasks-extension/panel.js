// Panel de la extensión: formulario completo para guardar la página en Recursos (o actualizarla si ya estaba).
// Vive dentro de la propia página (iframe) para no cerrarse al hacer clic fuera. Ver background.js.
const MAX_IMAGES = 8
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const $ = (id) => document.getElementById(id)

const params = new URLSearchParams(location.search)
const token = params.get('t') || ''
const mode = params.get('mode') === 'window' ? 'window' : 'panel'

const state = {
  existing: null,          // { id, owned } si la página ya estaba guardada
  saved: [],               // imágenes que ya tiene el recurso (solo se muestran)
  hiddenImages: 0,         // imágenes de R2 que no se pueden mostrar aquí
  images: [],              // imágenes NUEVAS listas: [{ url, name }]
  uploading: new Map(),    // subidas en curso
  sending: false,
  locked: false,           // recurso de otra persona: no se puede editar
}

// ---------- avisos y controles ----------
function setStatus(kind, message) {
  const el = $('status')
  el.className = kind
  el.textContent = message
}

function updateControls() {
  $('send').textContent = state.sending ? (state.existing ? 'Actualizando…' : 'Enviando…') : state.existing ? 'Actualizar información' : 'Enviar'
  $('send').disabled = state.sending || state.uploading.size > 0 || state.locked
}

function setChip(text, kind) {
  const chip = $('chip')
  chip.textContent = text
  chip.className = 'chip' + (kind ? ' ' + kind : '')
}

function render() {
  const box = $('thumbs')
  box.textContent = ''
  const add = (url, alt, className, tag, onRemove) => {
    const tile = document.createElement('div'); tile.className = 'thumb ' + className
    const img = document.createElement('img'); img.src = url; img.alt = alt; img.referrerPolicy = 'no-referrer'
    tile.append(img)
    if (tag) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; tile.append(t) }
    if (onRemove) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '✕'; b.setAttribute('aria-label', `Quitar ${alt}`); b.addEventListener('click', onRemove); tile.append(b)
    }
    box.append(tile)
    return tile
  }
  state.saved.forEach((image) => add(image.url, image.name || 'imagen', 'saved', image.isBanner ? 'Portada' : 'Guardada', null))
  state.images.forEach((image, index) => add(image.url, image.name, 'new', !state.saved.length && index === 0 ? 'Portada' : 'Nueva', () => { state.images.splice(index, 1); render() }))
  for (const [id, item] of state.uploading) {
    const tile = add(item.preview, '', 'loading', '', null)
    tile.dataset.id = id; tile.setAttribute('role', 'status'); tile.setAttribute('aria-label', `Subiendo ${item.name}`)
    const spinner = document.createElement('span'); spinner.className = 'spinner'; tile.append(spinner)
  }
  const note = $('hidden-note')
  note.hidden = state.hiddenImages === 0
  note.textContent = state.hiddenImages ? `${state.hiddenImages} ${state.hiddenImages === 1 ? 'imagen más está' : 'imágenes más están'} guardadas en la web (se editan desde allí).` : ''
  updateControls()
}

// ---------- comunicación con la web (con tu sesión) ----------
async function api(path, init = {}) {
  const response = await fetch(`${APP_URL}${path}`, {
    credentials: 'include',
    redirect: 'manual',
    ...init,
    headers: { 'X-Requested-With': 'dev-tasks-extension', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  let data = {}
  try { data = await response.json() } catch (_) { /* sin JSON */ }
  return { response, data }
}

/** Avisos comunes a todas las peticiones. Devuelve true si ya ha mostrado un error. */
function reportProblem(response, data) {
  if (response.status === 401 || data.error === 'not_authenticated') {
    setStatus('warn', 'Inicia sesión en la web de Recursos (en este mismo navegador) y vuelve a intentarlo.')
    $('open-web').hidden = false
    return true
  }
  if (response.status === 403) { setStatus('error', 'Solo los administradores pueden guardar recursos.'); return true }
  return false
}

// ---------- subir imágenes (con servicios de respaldo) ----------
const PROVIDER_NAMES = { imgur: 'Imgur', imgbb: 'ImgBB', freeimage: 'freeimage.host' }
const COOLDOWN_MS = 10 * 60 * 1000
const cooldownUntil = new Map()
let providers = null

async function getProviders() {
  if (providers) return providers
  const { response, data } = await api('/api/upload-imgur')
  if (response.status === 401) throw new Error('Inicia sesión en la web de Recursos (en este mismo navegador).')
  if (response.status === 403) throw new Error('Solo los administradores pueden subir imágenes.')
  const list = Array.isArray(data.providers) ? data.providers : data.provider ? [data] : data.clientId ? [{ provider: 'imgur', clientId: data.clientId }] : []
  const valid = list.filter((item) => item && PROVIDER_NAMES[item.provider] && (item.clientId || item.apiKey))
  if (!response.ok || !valid.length) throw new Error(data.error || 'No hay un servicio de imágenes configurado en la web.')
  providers = valid
  return providers
}

const errorText = (value) => (typeof value === 'string' && value) || (value && typeof value.message === 'string' && value.message) || ''
function hostError(name, status, text) {
  const error = new Error(text || (status === 429 ? `${name} ha limitado las subidas, prueba en unos minutos.` : `${name} respondió ${status}`))
  error.cooldown = status === 429 || status >= 500
  return error
}
async function post(name, url, init) {
  let response
  try { response = await fetch(url, init) } catch (e) { const error = new Error(e.message || 'sin conexión'); error.cooldown = true; throw error }
  let data = null
  try { data = await response.json() } catch (_) { /* sin JSON */ }
  return { response, data }
}

async function uploadWith(provider, file) {
  const body = new FormData()
  if (provider.provider === 'imgur') {
    body.append('image', file); body.append('type', 'file'); body.append('name', file.name)
    const { response, data } = await post('Imgur', 'https://api.imgur.com/3/image', { method: 'POST', headers: { Authorization: `Client-ID ${provider.clientId}` }, body })
    if (!response.ok || !data || !data.success || !data.data || !data.data.link) throw hostError('Imgur', response.status, errorText(data && data.data && data.data.error))
    return data.data.link
  }
  if (provider.provider === 'imgbb') {
    body.append('key', provider.apiKey); body.append('image', file)
    const { response, data } = await post('ImgBB', 'https://api.imgbb.com/1/upload', { method: 'POST', body })
    if (!response.ok || !data || !data.success || !data.data || !data.data.url) throw hostError('ImgBB', response.status, errorText(data && data.error))
    return data.data.url
  }
  body.append('key', provider.apiKey); body.append('action', 'upload'); body.append('format', 'json'); body.append('source', file)
  const { response, data } = await post('freeimage.host', 'https://freeimage.host/api/1/upload', { method: 'POST', body })
  if (!response.ok || !data || data.status_code !== 200 || !data.image || !data.image.url) throw hostError('freeimage.host', response.status, errorText(data && data.error))
  return data.image.url
}

async function uploadImage(file) {
  const list = await getProviders()
  const resting = (item) => (cooldownUntil.get(item.provider) || 0) > Date.now()
  const errors = []
  for (const provider of [...list.filter((item) => !resting(item)), ...list.filter(resting)]) {
    try {
      const url = await uploadWith(provider, file)
      cooldownUntil.delete(provider.provider)
      return url.replace(/^http:/, 'https:')
    } catch (error) {
      if (error.cooldown) cooldownUntil.set(provider.provider, Date.now() + COOLDOWN_MS)
      errors.push(`${PROVIDER_NAMES[provider.provider]}: ${error.message}`)
    }
  }
  throw new Error(errors.join(' · '))
}

const imagesLeft = () => MAX_IMAGES - state.saved.length - state.hiddenImages - state.images.length - state.uploading.size

async function uploadFiles(source) {
  if (state.locked) return
  const files = Array.from(source || []).filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name))
  if (!files.length) return
  const room = imagesLeft()
  if (room <= 0) { setStatus('error', `Puedes adjuntar hasta ${MAX_IMAGES} imágenes.`); return }
  if (files.length > room) setStatus('warn', `Solo caben ${room} imágenes más (máximo ${MAX_IMAGES}).`)
  else setStatus('', '')

  await Promise.all(files.slice(0, room).map(async (file) => {
    if (!ALLOWED.includes(file.type)) { setStatus('error', `${file.name} no es una imagen JPG, PNG, WebP o GIF.`); return }
    if (file.size > MAX_BYTES) { setStatus('error', `${file.name} supera el límite de 8 MB.`); return }
    const id = crypto.randomUUID()
    const preview = URL.createObjectURL(file)
    state.uploading.set(id, { name: file.name, preview }); render()
    try {
      const url = await uploadImage(file)
      if (!state.images.some((image) => image.url === url) && !state.saved.some((image) => image.url === url)) state.images.push({ url, name: file.name })
    } catch (error) {
      setStatus('error', `No se pudo subir ${file.name}: ${error.message}`)
    } finally {
      URL.revokeObjectURL(preview)
      state.uploading.delete(id); render()
    }
  }))
}

// ---------- arrastrar, pegar, elegir ----------
const types = (event) => Array.from((event.dataTransfer && event.dataTransfer.types) || [])
const IMAGE_LINK = /^https?:\/\/(i\.imgur\.com\/|i\.ibb\.co\/|iili\.io\/|.*\.(png|jpe?g|gif|webp)(\?.*)?$)/i

document.addEventListener('dragover', (event) => {
  if (!types(event).includes('Files') && !types(event).includes('text/uri-list')) return
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; document.body.classList.add('dragging')
})
document.addEventListener('dragleave', (event) => { if (!event.relatedTarget) document.body.classList.remove('dragging') })
document.addEventListener('drop', (event) => {
  document.body.classList.remove('dragging')
  const files = Array.from((event.dataTransfer && event.dataTransfer.files) || [])
  if (files.length) { event.preventDefault(); void uploadFiles(files); return }
  const links = event.dataTransfer && event.dataTransfer.getData('text/uri-list')
  if (!links) return
  event.preventDefault()
  for (const link of links.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line))) {
    if (IMAGE_LINK.test(link)) {
      if (imagesLeft() <= 0) { setStatus('error', `Puedes adjuntar hasta ${MAX_IMAGES} imágenes.`); break }
      if (!state.images.some((image) => image.url === link) && !state.saved.some((image) => image.url === link)) state.images.push({ url: link, name: link.split('/').pop().split('?')[0] || 'imagen' })
    } else {
      const box = $('downloads'); box.value = `${box.value.replace(/\s+$/, '')}\n${link}`.trim()   // un enlace suelto → descargas (se puede mover a mano)
    }
  }
  render()
})
document.addEventListener('paste', (event) => {
  const pasted = Array.from((event.clipboardData && event.clipboardData.files) || []).filter((file) => file.type.startsWith('image/'))
  if (!pasted.length) return
  event.preventDefault(); void uploadFiles(pasted)
})
$('file').addEventListener('change', (event) => { void uploadFiles(event.target.files); event.target.value = '' })

// ---------- cerrar ----------
function closePanel() {
  if (mode === 'window') { window.close(); return }
  chrome.runtime.sendMessage({ type: 'panel-close', token })
}
$('close').addEventListener('click', closePanel)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send() }
  if (event.key === 'Escape') closePanel()
})
$('open-web').addEventListener('click', () => { window.open(`${APP_URL}/resources`, '_blank') })

// ---------- enviar / actualizar ----------
const httpLine = /^https?:\/\/\S+$/i

async function send() {
  if (state.sending || state.uploading.size > 0 || state.locked) return
  const title = $('title').value.trim()
  const referenceUrl = $('reference').value.trim()
  const description = $('description').value.trim()
  const downloadLines = $('downloads').value.split(/\s+/).map((line) => line.trim()).filter(Boolean)

  if (!title && !referenceUrl && !description && !downloadLines.length && !state.images.length) { setStatus('warn', 'Escribe algo o añade una imagen.'); return }
  if (referenceUrl && !httpLine.test(referenceUrl)) { setStatus('error', 'El enlace de referencia tiene que empezar por http:// o https://'); $('reference').focus(); return }
  const badLine = downloadLines.find((line) => !httpLine.test(line))
  if (badLine) { setStatus('error', `Cada descarga tiene que ser un enlace http:// o https:// (revisa: ${badLine.slice(0, 40)}).`); $('downloads').focus(); return }

  state.sending = true; updateControls(); setStatus('', ''); $('open-web').hidden = true
  const body = {
    title,
    ...(referenceUrl ? { referenceUrl } : {}),
    downloadUrls: downloadLines,
    description,
    images: state.images.map((image) => image.url),
    priority: $('priority').value,
    ...($('type').value ? { resourceType: $('type').value } : {}),
  }
  try {
    const update = !!state.existing
    const { response, data } = await api('/api/quick-resource', {
      method: update ? 'PATCH' : 'POST',
      body: JSON.stringify(update ? { id: state.existing.id, ...body } : { ...body, text: description }),
    })
    if (reportProblem(response, data)) { /* aviso mostrado */ }
    else if (data.error === 'not_owner') { setStatus('error', 'Este recurso es de otra persona: solo su autor puede actualizarlo.') }
    else if (data.duplicate) { setStatus('info', `Ya estaba guardado: ${data.title}. Vuelve a abrir el panel para actualizarlo.`) }
    else if (response.ok && data.ok) {
      setStatus('ok', update ? `Actualizado: ${data.title}` : `Guardado en Recursos: ${data.title}`)
      setTimeout(closePanel, 900)
      return // el panel se cierra solo; el botón queda bloqueado para no enviar dos veces
    } else setStatus('error', `No se pudo ${update ? 'actualizar' : 'guardar'} (${data.error || response.status}).`)
  } catch (_) {
    setStatus('error', 'No hay conexión con la web de Recursos.')
  }
  state.sending = false; updateControls()
}
$('send').addEventListener('click', () => void send())

// ---------- ¿esta página ya estaba guardada? → modo "Actualizar" ----------
async function lookup(url) {
  try {
    const { response, data } = await api(`/api/quick-resource?url=${encodeURIComponent(url)}`)
    if (reportProblem(response, data) || !data.exists) return
    const r = data.resource
    state.existing = { id: r.id, owned: !!data.owned }
    $('title').value = r.title || ''
    $('reference').value = r.url || url
    $('description').value = r.description || ''
    $('downloads').value = (r.downloadUrls || []).join('\n')
    $('type').value = r.resourceType || ''
    $('priority').value = r.priority || 'medium'
    state.saved = data.images || []
    state.hiddenImages = data.hiddenImages || 0
    if (data.owned) {
      setChip('Ya guardado · actualizar', 'saved')
      setStatus('info', 'Esta página ya estaba en Recursos. Cambia lo que quieras y pulsa Actualizar.')
    } else {
      state.locked = true
      setChip('Guardado por otra persona', 'locked')
      setStatus('warn', 'Este recurso es de otra persona: solo su autor puede actualizarlo.')
      for (const id of ['title', 'reference', 'description', 'downloads', 'type', 'priority']) $(id).disabled = true
    }
    render()
  } catch (_) { /* sin conexión: se puede guardar igualmente como nuevo */ }
}

// ---------- arranque ----------
async function start() {
  const lock = (message) => { $('locked').textContent = message; $('locked').hidden = false }
  if (!token) return lock('Abre este panel desde el icono de la extensión.')
  let hello = null
  try { hello = await chrome.runtime.sendMessage({ type: 'panel-hello', token }) } catch (_) { /* extensión recargada */ }
  if (!hello || !hello.ok) return lock('Panel no autorizado. Ciérralo y ábrelo de nuevo desde el icono de la extensión.')

  const { url, title, selection } = hello.data
  $('title').value = title || ''
  $('reference').value = url || ''
  $('description').value = selection || ''
  $('app').hidden = false
  render()
  window.focus()
  $('title').focus()
  if (url) await lookup(url)
}
void start()
