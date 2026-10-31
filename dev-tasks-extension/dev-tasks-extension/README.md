# Dev Tasks · Guardar en Recursos (extensión) · v1.1

Guarda la página que estás viendo en los **Recursos** de tu web.
Funciona en Chrome, Edge, Brave y Opera (navegadores basados en Chromium).

## Dos formas de guardar

| Cómo | Qué hace |
|------|----------|
| **Clic en el icono** o `Alt+Shift+R` | Abre una **ventanita con el formulario**: arrastra imágenes y pulsa **Enviar**. |
| **`Alt+Shift+S`** o clic derecho → *Guardar página en Recursos (directo)* | Guarda la página al instante, sin formulario. |

### El formulario
- Ya viene relleno con el enlace, el título y el texto que tuvieras seleccionado en la página.
  La primera línea de texto es el título; puedes editarlo todo antes de enviar.
- **Imágenes**: arrástralas a la ventana desde el Explorador, pégalas con `Ctrl+V` (capturas de pantalla)
  o haz clic en la zona punteada. Se suben a **Imgur** y se guarda su enlace. La primera es la portada
  y puedes quitar cualquiera con la ✕. También puedes arrastrar una imagen o un enlace desde otra página.
  Hasta 8 imágenes (JPG, PNG, WebP o GIF, 8 MB cada una).
- **Tipo** (por defecto *Automático*) y **Prioridad** (por defecto *Media*).
- **Enviar** (o `Ctrl+Enter`) guarda el recurso y la ventana se cierra sola.
  `Esc` o *Cancelar* cierran sin guardar.
- Si la página ya estaba guardada te lo dice y no crea un duplicado.

> ¿Por qué una ventana y no un globo bajo el icono? Porque el globo se cierra en cuanto pierde el foco, y al
> arrastrar un archivo desde el Explorador lo pierde. La ventana se queda abierta.

### Clic derecho
- sobre la página → *Guardar página en Recursos (directo)* o *Guardar en Recursos con imágenes…* (formulario)
- sobre un enlace → *Guardar enlace en Recursos*
- sobre una imagen → *Guardar imagen en Recursos* (la página queda de referencia y la imagen de portada)

## Instalar (1 minuto)

1. Descomprime esta carpeta donde no la vayas a borrar (por ejemplo `Documentos\dev-tasks-extension`).
2. Abre `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Activa **Modo de desarrollador** (arriba a la derecha).
4. Pulsa **Cargar descomprimida** y elige la carpeta `dev-tasks-extension`.
5. Pulsa el icono del puzzle de la barra y **ancla** la extensión.

### Si ya tenías la versión anterior
Sustituye los archivos de la carpeta por los nuevos y pulsa el botón ⟳ de la extensión en `chrome://extensions`.
Si el navegador la marca como desactivada por **permisos nuevos** (ahora necesita hablar con Imgur), pulsa
*Activar* / *Aceptar*. Comprueba también tus atajos en `chrome://extensions/shortcuts`.

## Requisitos
- Haber **iniciado sesión en la web de Recursos en ese mismo navegador**. La extensión usa esa sesión:
  no pide ni guarda contraseñas.
- Solo los **administradores** pueden guardar recursos (igual que en la web).
- Para subir imágenes, la web debe tener configurada la variable `IMGUR_CLIENT_ID` (en Vercel).
- No funciona en páginas internas del navegador (`chrome://…`, tienda de extensiones…): el formulario se abre
  vacío, pero el guardado directo avisa con el icono `!`.

## Avisos del icono (guardado directo)

| Icono | Significado |
|-------|-------------|
| ✓ verde | Guardado |
| = azul | Ya estaba guardado |
| ! ámbar | Falta iniciar sesión, o la página no se puede guardar |
| ! rojo | Sin permiso (no eres admin), sin conexión o error al guardar |

## Si cambias la dirección de la web

Cámbiala en **dos sitios** y recarga la extensión (⟳ en `chrome://extensions`):

1. `config.js`: la constante `APP_URL`.
2. `manifest.json`: la lista `host_permissions`.

## Privacidad y permisos

- Solo habla con tu web (`APP_URL`) y con Imgur (para subir las imágenes que tú arrastras). Nada más.
- `activeTab` y `scripting`: leer el texto seleccionado y mostrar el aviso, solo en la pestaña donde pulsas.
- `contextMenus`: las opciones del clic derecho.
