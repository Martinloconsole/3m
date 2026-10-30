# 3M · 3 Master Tasks

Tus 3 tareas prioritarias del día, con cuenta regresiva hasta las 22:00 e historial en Google Sheets.
Funciona como app web (PWA) y como **APK de Android** que se compila solo en GitHub.

```
www/            La app (index.html, styles.css, app.js, sw.js, manifest.json, icons/, widget/)
backend/        Code.gs para Google Apps Script
native/         Iconos de Android, firma y script que personaliza el proyecto
.github/        Workflow que compila el APK
capacitor.config.json · package.json
```

## 1. Subir a GitHub

1. Crea un repositorio nuevo.
2. Sube **todo** el contenido de esta carpeta. Ojo: `.github` es una carpeta oculta y a veces el explorador no la incluye al arrastrar.
   Si no aparece en el repo, créala desde GitHub: **Add file → Create new file**, escribe `.github/workflows/build-apk.yml` como nombre y pega el contenido de ese archivo.
3. Entra en la pestaña **Actions**. El workflow **Compilar APK** arranca solo con cada subida (tarda 5–10 minutos). También puedes lanzarlo con **Run workflow**.

## 2. Descargar el APK

Cuando termina, abre **Releases** (columna derecha del repo) → última versión → descarga **3M.apk** desde el teléfono.
También queda como artefacto dentro de la ejecución en Actions (ahí viene en un zip).

Para instalarlo, Android pedirá permitir la instalación desde tu navegador (*orígenes desconocidos*).
El APK está firmado con una clave fija incluida en `native/debug.keystore`, así que las versiones nuevas se instalan encima sin perder tus datos.

## 3. Google Sheets

1. Crea una hoja de cálculo. **Extensiones → Apps Script** y pega `backend/Code.gs`.
2. Cambia `SECRET` por una clave tuya y ejecuta `setup` una vez (acepta los permisos). Crea las solapas **Control** e **Histórico**.
3. **Implementar → Nueva implementación → Aplicación web**: ejecutar como *Yo*, acceso *Cualquier persona*. Copia la URL `/exec`.
4. En la app: engranaje → pega URL y token → **Sincronizar ahora**.

Si cambias `Code.gs`, crea una **nueva versión** de la implementación.

## 4. Notificaciones (APK)

En el engranaje activa **Notificación fija con mis 3 tareas** y acepta el permiso.

- Queda en la barra con el icono "3M" y el acento en el violeta `#8B5CF6`. Se actualiza al editar, mover o marcar tareas.
- Cada día a las 08:00 llega un aviso para definir tus tareas (cambia `MORNING_HOUR` en `www/app.js`).
- Android tiñe el icono y el nombre de la notificación con tu color. No permite pintar todo el fondo de la notificación, salvo en servicios en primer plano.
- Android 14 o superior deja descartar notificaciones fijas; la app la vuelve a publicar cuando la abres.

## 5. Reloj

Muestra horas, minutos y segundos que faltan para las 22:00. Pasada esa hora marca `00:00:00` hasta medianoche. Para cambiar la hora, edita `CLOSE_HOUR` en `www/app.js`.

## Como PWA (opcional)

Puedes alojar la carpeta `www/` en cualquier hosting estático e instalarla desde el navegador. Allí las notificaciones tienen más límites (no hay avisos programados con la app cerrada).

## Si falla la compilación

Abre la ejecución en **Actions**, entra en el paso en rojo y copia las últimas líneas del log.
