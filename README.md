# Espacio

Notion personal, sin IA: páginas anidadas, editor de bloques con `/`, bases de datos con vistas
Tabla y Tablero (Kanban), y más adelante calendario (EGS / Personal / UADE) y notificaciones push.

**Stack:** Vite + React + TypeScript · Dexie (IndexedDB, local-first) · BlockNote · Supabase · Vercel · PWA.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitarios (vitest)
npm run build    # build de producción
```

Sin `.env.local` la app funciona **solo en modo local** (los datos quedan en el navegador).

## Conectar Supabase (gratis) — sincroniza compu ↔ celular

1. Crear un proyecto en <https://supabase.com> (plan Free).
2. **SQL Editor** → ejecutar en orden `0001_init.sql`, `0002_storage.sql` y `0003_calendar_sources.sql` (carpeta `supabase/migrations/`).
3. **Authentication → Users → Add user**: crear tu usuario con tu email.
4. **Authentication → Sign In / Providers → Email**: desactivar *Allow new users to sign up*
   (así nadie más puede crear cuenta).
5. **Authentication → Email Templates → Magic Link**: reemplazar el cuerpo por algo que incluya
   el código, por ejemplo: `<p>Tu código para entrar a Espacio: <strong>{{ .Token }}</strong></p>`.
   (Usamos código y no link porque en el iPhone el link abriría Safari y no la app instalada.)
6. **Project Settings → API**: copiar URL y `anon` key a `.env.local` (ver `.env.example`).

## Deploy en Vercel (gratis)

1. Subir el repo a GitHub.
2. En <https://vercel.com> → *Add New Project* → importar el repo (detecta Vite solo).
3. En *Environment Variables* cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Cada `git push` vuelve a publicar.

## Calendario y cuentas vinculadas

Pestaña **Calendario** (barra lateral) → botón **Cuentas**. Cada calendario se vincula con su
link iCal privado y se le asigna una categoría: **Laboral (EGS)**, **Personal** o **UADE**.
Los chips de arriba filtran o juntan las categorías; **Tareas** muestra las filas de tus bases de datos que tienen fecha.

- **EGS / personal (Google):** Configuración → tu calendario → *Integrar el calendario* → *Dirección secreta en formato iCal*.
- **UADE (Outlook):** Configuración → Calendario → Calendarios compartidos → *Publicar un calendario* → link ICS.

Los eventos se descargan a través de `api/ics.ts` (función gratis de Vercel; en desarrollo la sirve Vite)
porque el navegador no puede leer esos links directo (CORS). Se actualizan cada 15 min y son de solo lectura;
la escritura en Google Calendar (two-way) queda para una fase posterior con OAuth.

## Instalar en el iPhone

Abrir la URL de Vercel en **Safari** → botón Compartir → **Agregar a inicio**.
Se abre como app, funciona offline y (fase 8) recibe notificaciones push.

## Estructura

```
src/
  lib/          datos: db.ts (Dexie), sync.ts (Supabase), pages.ts (acciones), query.ts (filtros/orden)
  blocks/       bloques propios del editor: callout, enlace a página, embed
  components/   UI: Sidebar, PageView, Editor, SearchPalette (⌘K), database/ (Tabla, Tablero, propiedades)
  components/calendar/  pestaña Calendario, diálogo de cuentas
  sw.ts         service worker (offline + push)
api/ics.ts      función de Vercel que descarga los .ics
supabase/migrations/   SQL del backend
```

## Roadmap

- [x] Fase 1: base, local-first, sync, PWA
- [x] Fase 2: páginas anidadas (drag en la barra lateral), editor con `/`, toggles, callouts, código, ⌘K, papelera
- [x] Fase 3: bases de datos, Tabla (virtualizada) y Kanban, filtros y orden
- [ ] Fase 4: vistas Calendario, Galería y Timeline; Relaciones y Rollups
- [ ] Fase 5: plantillas y botones de automatización
- [ ] Fase 6: más embeds (PDF subido, bookmarks) — básico ya disponible con `/embed`
- [x] Fase 7a: pestaña Calendario, cuentas vinculadas por iCal (Google EGS/personal, Outlook UADE), filtros por categoría, tareas con fecha
- [ ] Fase 7b: escritura en Google Calendar (OAuth), vista "Mi día" con time-blocking
- [ ] Fase 8: notificaciones push
- [ ] Fase 9: pulido
