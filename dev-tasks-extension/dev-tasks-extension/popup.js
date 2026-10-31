// Formulario de la extensión: texto + imágenes (arrastrar, pegar o elegir) → Imgur → Enviar.
// Se abre en una ventana propia (ver openForm en background.js) para que no se cierre al arrastrar archivos.
const MAX_IMAGES = 8
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const $ = (id) => document.getElementById(id)

const images = []              // [{ url, name }] ya listas (subidas a Imgur o enlaces)
const uploading = new Map()    // id → { name, preview } subidas en curso
let sending = false

// ---------- estado y avisos ----------
function setStatus(kind, message) {
  const el = $('status')
  el.className = kind
  el.textContent = message
}

function updateControls() {
  $('send').disabled = sending || uploading.size > 0
  $('send').textContent = sending ? 'Enviando…' : 'Enviar'
}

function render() {
  const box = $('thumbs')
  box.textContent = ''
  images.forEach((image, index) => {
    const tile = document.createElement('div'); tile.className = 'thumb'
    const img = document.createElement('img'); img.src = image.url; img.alt = image.name; img.referrerPolicy = 'no-referrer'
    tile.append(img)
    if (index === 0) { const cover = document.createElement('span'); cover.className = 'cover'; cover.textContent = 'Portada'; tile.append(cover) }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '✕'; remove.setAttribute('aria-label', `Quitar ${image.name}`)
    remove.addEventListener('click', () => { images.splice(index, 1); render() })
    tile.append(remove)
    box.append(tile)
  })
  for (const [id, item] of uploading) {
    const tile = document.createElement('div'); tile.className = 'thumb loading'; tile.dataset.id = id; tile.setAttribute('role', 'status'); tile.setAttribute('aria-label', `Subiendo ${item.name} a Imgur`)
    const img = document.createElement('img'); img.src = item.preview; img.alt = ''
    const spinner = document.createElement('span'); spinner.className = 'spinner'
    tile.append(img, spinner); box.append(tile)
  }
  updateControls()
}

// ---------- Imgur ----------
let clientId = null
async function getClientId() {
  if (clientId) return clientId
  const response = await fetch(`${APP_URL}/api/upload-imgur`, { credentials: 'include' })
  let data = {}
  try { data = await response.json() } catch (_) { /* sin JSON */ }
  if (response.status === 401) throw new Error('Inicia sesión en la web de Recursos (en este mismo navegador).')
  if (response.status === 403) throw new Error('Solo los administradores pueden subir imágenes.')
  if (!response.ok || !data.clientId) throw new Error(data.error || 'Imgur no está configurado en la web.')
  clientId = data.clientId
  return clientId
}

function imgurError(data, status) {
  const error = data && data.data && data.data.error
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  if (status === 429) return 'Imgur ha limitado las subidas, prueba en unos minutos.'
  return `Imgur respondió ${status}`
}

async function uploadToImgur(file) {
  const id = await getClientId()
  const body = new FormData()
  body.append('image', file); body.append('type', 'file'); body.append('name', file.name)
  const response = await fetch('https://api.imgur.com/3/image', { method: 'POST', headers: { Authorization: `Client-ID ${id}` }, body })
  let data = null
  try { data = await response.json() } catch (_) { /* sin JSON */ }
  if (!response.ok || !data || !data.success || !data.data || !data.data.link) throw new Error(imgurError(data, response.status))
  return data.data.link.replace(/^http:/, 'https:')
}

async function uploadFiles(source) {
  const files = Array.from(source || []).filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name))
  if (!files.length) return
  const room = MAX_IMAGES - images.length - uploading.size
  if (room <= 0) { setStatus('error', `Puedes adjuntar hasta ${MAX_IMAGES} imágenes.`); return }
  if (files.length > room) setStatus('warn', `Solo caben ${room} imágenes más (máximo ${MAX_IMAGES}).`)
  else setStatus('', '')

  await Promise.all(files.slice(0, room).map(async (file) => {
    if (!ALLOWED.includes(file.type)) { setStatus('error', `${file.name} no es una imagen JPG, PNG, WebP o GIF.`); return }
    if (file.size > MAX_BYTES) { setStatus('error', `${file.name} supera el límite de 8 MB.`); return }
    const id = crypto.randomUUID()
    const preview = URL.createObjectURL(file)
    uploading.set(id, { name: file.name, preview }); render()
    try {
      const url = await uploadToImgur(file)
      if (!images.some((image) => image.url === url)) images.push({ url, name: file.name })
    } catch (error) {
      setStatus('error', `No se pudo subir ${file.name} a Imgur: ${error.message}`)
    } finally {
      URL.revokeObjectURL(preview)
      uploading.delete(id); render()
    }
  }))
}

// Enlaces arrastrados desde otra ventana (una imagen o un enlace de una página).
const IMAGE_LINK = /^https?:\/\/(i\.imgur\.com\/|.*\.(png|jpe?g|gif|webp)(\?.*)?$)/i
function addDroppedLinks(uriList) {
  const links = uriList.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line))
  for (const link of links) {
    if (IMAGE_LINK.test(link)) {
      if (images.length + uploading.size >= MAX_IMAGES) { setStatus('error', `Puedes adjuntar hasta ${MAX_IMAGES} imágenes.`); break }
      if (!images.some((image) => image.url === link)) images.push({ url: link, name: link.split('/').pop().split('?')[0] || 'imagen' })
    } else {
      const text = $('text'); text.value = `${text.value.replace(/\s+$/, '')}\n${link}`.trim()
    }
  }
  render()
}

// ---------- arrastrar, pegar, elegir ----------
const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
const hasLinks = (event) => Array.from(event.dataTransfer?.types || []).includes('text/uri-list')

// Se acepta soltar en cualquier punto de la ventana (si no, el navegador abriría la imagen).
document.addEventListener('dragover', (event) => {
  if (!hasFiles(event) && !hasLinks(event)) return
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; document.body.classList.add('dragging')
})
document.addEventListener('dragleave', (event) => { if (!event.relatedTarget) document.body.classList.remove('dragging') })
document.addEventListener('drop', (event) => {
  document.body.classList.remove('dragging')
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length) { event.preventDefault(); void uploadFiles(files); return }
  const links = event.dataTransfer?.getData('text/uri-list')
  if (links) { event.preventDefault(); addDroppedLinks(links) }
})
document.addEventListener('paste', (event) => {
  const pasted = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'))
  if (!pasted.length) return
  event.preventDefault(); void uploadFiles(pasted)
})
$('file').addEventListener('change', (event) => { void uploadFiles(event.target.files); event.target.value = '' })

// ---------- enviar ----------
async function send() {
  if (sending || uploading.size > 0) return
  const text = $('text').value.trim()
  if (!text && images.length === 0) { setStatus('warn', 'Escribe algo o añade una imagen.'); return }
  sending = true; updateControls(); setStatus('', '')
  $('open-web').hidden = true
  try {
    const payload = { text, images: images.map((image) => image.url), priority: $('priority').value }
    if ($('type').value) payload.resourceType = $('type').value
    const response = await fetch(`${APP_URL}/api/quick-resource`, {
      method: 'POST', credentials: 'include', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dev-tasks-extension' },
      body: JSON.stringify(payload),
    })
    let data = {}
    try { data = await response.json() } catch (_) { /* sin JSON */ }

    if (response.status === 401 || data.error === 'not_authenticated') {
      setStatus('warn', 'Inicia sesión en la web de Recursos (en este mismo navegador) y pulsa Enviar otra vez.')
      $('open-web').hidden = false
    } else if (response.status === 403) {
      setStatus('error', 'Solo los administradores pueden guardar recursos.')
    } else if (data.duplicate) {
      setStatus('info', `Ya estaba guardado: ${data.title}`)
    } else if (response.ok && data.ok) {
      setStatus('ok', `Guardado en Recursos: ${data.title}`)
      setTimeout(() => window.close(), 900)
      return // la ventana se cierra sola; el botón queda bloqueado para no enviar dos veces
    } else {
      setStatus('error', `No se pudo guardar (${data.error || response.status}).`)
    }
  } catch (_) {
    setStatus('error', 'No hay conexión con la web de Recursos.')
  }
  sending = false; updateControls()
}

$('send').addEventListener('click', () => void send())
$('cancel').addEventListener('click', () => window.close())
$('open-web').addEventListener('click', () => { chrome.tabs.create({ url: `${APP_URL}/resources` }) })
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send() }
  if (event.key === 'Escape') window.close()
})

// ---------- arranque: rellenar con la página desde la que se abrió ----------
const params = new URLSearchParams(location.search)
$('text').value = [params.get('url'), params.get('title'), params.get('sel')].filter(Boolean).join('\n')
$('text').focus()
render()
