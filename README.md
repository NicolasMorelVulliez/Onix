# Onix

Notion personal, sin IA: páginas anidadas, editor de bloques con `/`, bases de datos (Tabla y Kanban),
calendario unificado y Drive, con **todas las cuentas de Google que quieras** (EGS, personal…).

**Stack:** Vite + React + TypeScript · Dexie (IndexedDB, local-first) · BlockNote · **Firebase** (Hosting, Auth, Firestore — plan Spark gratis) · **Vercel** (solo funciones `/api`, gratis) · PWA.

```
Navegador (todo local, instantáneo) ──sync──► Firestore (users/{uid}/…)
      │
      ├──► Google Calendar / Drive APIs directo, con un token de 1 h de cada cuenta vinculada
      └──► Vercel /api: /google/* (canjea permisos, guarda el refresh token cifrado) · /ics (UADE)
```

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173 (también sirve /api)
npm test
```

Sin `.env.local` la app funciona **solo en modo local**. Ver `.env.example`.

## Configuración (una sola vez)

### 1. Firebase (gratis, plan Spark)
1. <https://console.firebase.google.com> → *Agregar proyecto* (sin Analytics).
2. **Authentication** → *Comenzar* → proveedor **Google** → habilitar.
   En *Configuración → Dominios autorizados* tiene que estar `localhost` y `tu-proyecto.web.app`.
3. **Firestore Database** → *Crear base de datos* → ubicación `southamerica-east1` (São Paulo) → modo producción.
4. *Configuración del proyecto → Tus apps → Web (</>)* → copiar `apiKey`, `projectId`, `appId` a `.env.local`.

### 2. Google Cloud (mismo proyecto que Firebase)
1. <https://console.cloud.google.com> → elegir el proyecto → *APIs y servicios → Biblioteca*:
   habilitar **Google Calendar API**, **Google Drive API** y **Gmail API**.
2. *Pantalla de consentimiento de OAuth* → tipo **Externo** → completar nombre (Onix) y tu email.
   Agregar los permisos: `calendar.calendarlist.readonly`, `calendar.events`, `drive`, `gmail.modify`.
   Después tocar **Publicar app** (estado *En producción*): si queda en *Prueba*, Google corta el acceso cada 7 días.
   Como la app no está verificada, al vincular vas a ver un aviso: *Configuración avanzada → Ir a Onix*.
3. *Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web*. URIs de redireccionamiento:
   - `http://localhost:5173/api/google/callback`
   - `https://TU-APP.vercel.app/api/google/callback`
   Copiar el ID y el secreto a `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. Generar `TOKEN_SECRET` con `openssl rand -base64 32`.

> **EGS (Google Workspace):** si al vincular dice que la app está bloqueada, el administrador tiene que permitirla
> (Admin → Seguridad → Controles de API → Acceso de apps de terceros).

### 3. Vercel (gratis, solo para `/api`)
1. Subir el repo a GitHub e importarlo en <https://vercel.com>.
2. *Settings → Environment Variables*: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_SECRET`,
   `FIREBASE_PROJECT_ID`, `APP_ORIGINS=https://tu-proyecto.web.app`.

### IA para cronogramas (opcional)
Crear una API key en <https://console.anthropic.com> (necesita saldo; cada cronograma cuesta centavos) y cargarla en Vercel como `ANTHROPIC_API_KEY`.

### 4. Publicar en Firebase Hosting
Crear `.env.production.local` (solo se usa al compilar para producción) con
`VITE_API_URL=https://TU-APP.vercel.app` y `VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.web.app`.
En Google Cloud → Clientes, agregar la URI `https://tu-proyecto.web.app/__/auth/handler` al cliente
*Web client (auto created by Google Service)* (lo usa el login de Firebase). Poner el id del proyecto en `.firebaserc` y:

```bash
npx firebase-tools login
npm run deploy     # build + hosting + reglas de Firestore
```

La app queda en `https://tu-proyecto.web.app`. En el iPhone: Safari → Compartir → **Agregar a inicio**.

## Cuentas, Calendario y Drive

- **Cuentas** (barra lateral): *Vincular cuenta* abre el selector de Google; repetilo para cada cuenta.
  Cada una tiene una categoría (Laboral EGS / Personal / UADE) y elegís qué calendarios mostrar.
  Para Outlook (UADE) se pega el link iCal publicado.
- **Mi día:** agenda de hoy con tus tareas al lado; arrastrá una tarea al horario (o tocá ⏰ en el celular) para agendarla.
- **Tareas repetitivas:** en la página de la tarea, *Repetir* (diaria, semanal con días, mensual, anual); al marcarla hecha pasa sola a la próxima fecha.
- **Importar de Notion:** Inicio → *Importar de Notion* y subí el .zip exportado en formato *Markdown y CSV*.
- **Materias:** en una página de cuatrimestre, *Nueva materia acá*: días y horarios (o *Leer el cronograma* con IA) → crea la materia, su cronograma de clases en el Calendario (UADE) y las carpetas `Materia/Clase N - dd mm/Grabaciones` en Drive. Cualquier página se puede vincular a una carpeta de Drive y las grabaciones se ven dentro de Onix.
- **Siri:** el atajo *Agregar a Onix* (iCloud Drive → Onix) crea tareas dictadas: "comprar yerba mañana a las 10".
- **Calendario:** junta todo; creá, editá, mové y borrá eventos de Google; los chips filtran por categoría y *Tareas* muestra filas de bases de datos con fecha.
- **Correo:** bandeja unificada de todas las cuentas: leer, buscar (sintaxis de Gmail), responder, archivar y redactar
  eligiendo desde qué cuenta sale. Las cuentas vinculadas antes de Gmail muestran *Sumar Gmail*.
- **Meet:** *Nuevo Meet* en el Calendario crea el evento con link de Meet (instantáneo o programado) e invita por mail;
  los eventos con Meet muestran *Unirse*.
- **Drive:** explorá *Mi unidad*, *Compartido conmigo* y unidades compartidas de cada cuenta, con búsqueda y
  vista previa. *Vincular a una página* agrega el archivo a una página; en el editor también con `/drive`.
- Las imágenes pegadas en páginas se guardan comprimidas dentro de la página (el plan gratis no tiene storage);
  PDFs y otros archivos van en Drive y se vinculan.

**Seguridad:** el permiso permanente de cada cuenta (refresh token) se cifra en Vercel y solo Vercel puede usarlo;
el navegador recibe tokens de 1 hora. Firestore solo deja leer y escribir tus propios datos (`firestore.rules`).

## Estructura

```
src/
  lib/          datos: db.ts (Dexie), sync.ts (Firestore), google.ts (Calendar/Drive), pages.ts, query.ts
  blocks/       bloques propios del editor: callout, enlace a página, embed
  components/   UI: Sidebar, PageView, Editor, SearchPalette (⌘K), database/ (Tabla, Tablero, propiedades)
  components/calendar/  pestaña Calendario
  components/drive/     pestaña Drive, selector de archivos
  components/AccountsPage.tsx  cuentas de Google y links iCal
  sw.ts         service worker (offline + push)
api/            funciones de Vercel: google/{start,callback,token}, ics
firestore.rules, firebase.json   Firebase
```

## Roadmap

- [x] Fase 1: base, local-first, sync, PWA
- [x] Fase 2: páginas anidadas (drag en la barra lateral), editor con `/`, toggles, callouts, código, ⌘K, papelera
- [x] Fase 3: bases de datos, Tabla (virtualizada) y Kanban, filtros y orden
- [ ] Fase 4: vistas Calendario, Galería y Timeline; Relaciones y Rollups
- [ ] Fase 5: plantillas y botones de automatización
- [ ] Fase 6: más embeds (PDF subido, bookmarks) — básico ya disponible con `/embed`
- [x] Fase 7a: pestaña Calendario, cuentas vinculadas por iCal (Google EGS/personal, Outlook UADE), filtros por categoría, tareas con fecha
- [x] Fase 7b: Firebase, multi-cuenta Google (Calendar API + Drive)
- [ ] Fase 7c: crear/editar eventos en Google Calendar, vista "Mi día" con time-blocking
- [ ] Fase 8: notificaciones push
- [ ] Fase 9: pulido
