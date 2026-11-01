# Dev Tasks · Guardar en Recursos (extensión) · v2.0

Guarda la página que estás viendo en los **Recursos** de tu web, o **actualiza** el recurso si ya estaba guardado.
Funciona en Chrome, Edge, Brave y Opera (navegadores basados en Chromium).

## Cómo se usa

| Cómo | Qué hace |
|------|----------|
| **Clic en el icono** o `Alt+Shift+R` | Abre un **panel desplegable dentro de la página**. Volver a pulsarlo lo cierra. |
| **`Alt+Shift+S`** o clic derecho → *Guardar página en Recursos (directo)* | Guarda la página al instante, sin panel. |

### El panel
- **No se cierra al hacer clic fuera.** Puedes copiar un enlace de la página, abrir otra pestaña o escribir en la
  página y el panel sigue ahí. Se cierra solo al **Enviar/Actualizar**, con la ✕, con `Esc` o pulsando de nuevo el icono.
  (Si navegas a otra página en la *misma* pestaña, el panel desaparece, como cualquier cosa de una página.)
- Viene relleno con el **título**, el **enlace de referencia completo** (con ruta, parámetros y `#`) y el texto
  que tuvieras seleccionado (como descripción). Todo es editable.
- **Tipo** (por defecto *Automático*) y **Prioridad** (por defecto *Media*).
- **Descargas**: un enlace por línea; puedes poner varios.
- **Imágenes**: arrástralas desde el Explorador, pégalas con `Ctrl+V` (capturas) o haz clic en la zona punteada. Se suben
  solas a un servicio de imágenes y se guarda su enlace; la primera es la portada. Si Imgur te limita las subidas,
  pasa automáticamente a ImgBB o freeimage.host. También puedes arrastrar una imagen desde otra página.
- **Enviar** (o `Ctrl+Enter`).

### Si la página ya estaba guardada
El panel lo detecta al abrirse: aparece **«Ya guardado · actualizar»**, los campos muestran lo que hay guardado y el
botón pasa a **Actualizar información**. Puedes cambiar título, tipo, prioridad, descargas, descripción, referencia y
**añadir** imágenes. Las imágenes que ya tenía se ven como «Guardada» (las subidas a R2 solo se cuentan; se editan
desde la web). Si el recurso lo guardó **otra persona**, el panel avisa y no deja editarlo.

### Clic derecho
- sobre la página → *Guardar página en Recursos (directo)* o *Abrir panel de Recursos…*
- sobre un enlace → *Guardar enlace en Recursos*
- sobre una imagen → *Guardar imagen en Recursos* (la página queda de referencia y la imagen de portada)

## Instalar (1 minuto)

1. Descomprime esta carpeta donde no la vayas a borrar (por ejemplo `Documentos\dev-tasks-extension`).
2. Abre `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Activa **Modo de desarrollador** (arriba a la derecha).
4. Pulsa **Cargar descomprimida** y elige la carpeta `dev-tasks-extension`.
5. Pulsa el icono del puzzle de la barra y **ancla** la extensión.

### Si ya tenías la versión anterior
Sustituye los archivos de la carpeta por los nuevos (**borra antes `popup.html`, `popup.css` y `popup.js`**, ya no se
usan) y pulsa ⟳ en la extensión. Si el navegador la desactiva por **permisos nuevos**, pulsa *Activar* / *Aceptar*.
Comprueba tus atajos en `chrome://extensions/shortcuts`.

## Requisitos
- Haber **iniciado sesión en la web de Recursos en ese mismo navegador**. La extensión usa esa sesión: no pide ni guarda contraseñas.
- Solo los **administradores** pueden guardar recursos (igual que en la web).
- Para subir imágenes, la web debe tener al menos una de estas variables en Vercel: `IMGBB_API_KEY`,
  `FREEIMAGE_API_KEY` o `IMGUR_CLIENT_ID`.
- En páginas internas del navegador (`chrome://…`, tienda de extensiones…) no se puede mostrar el panel dentro de la
  página: se abre en una ventana pequeña con el mismo formulario.

## Avisos del icono (guardado directo)

| Icono | Significado |
|-------|-------------|
| ✓ verde | Guardado |
| = azul | Ya estaba guardado (abre el panel para actualizarlo) |
| ! ámbar | Falta iniciar sesión, o la página no se puede guardar |
| ! rojo | Sin permiso (no eres admin), sin conexión o error al guardar |

## Si cambias la dirección de la web
Cámbiala en **dos sitios** y recarga la extensión (⟳ en `chrome://extensions`):
1. `config.js`: la constante `APP_URL`.
2. `manifest.json`: la lista `host_permissions`.

## Privacidad y permisos
- Solo habla con tu web (`APP_URL`) y con el servicio de imágenes que uses (Imgur, ImgBB o freeimage.host) para subir lo que tú arrastras.
- `activeTab` y `scripting`: leer el texto seleccionado y mostrar el panel, solo en la pestaña donde pulsas.
- `storage`: recordar, mientras el navegador está abierto, el código secreto del panel que acabas de abrir.
- `contextMenus`: las opciones del clic derecho.
- El panel solo se activa con un código secreto creado al abrirlo; una web ajena no puede incrustarlo ni usarlo.
