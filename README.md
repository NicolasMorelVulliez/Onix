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
2. **SQL Editor** → ejecutar `supabase/migrations/0001_init.sql` y después `0002_storage.sql`.
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

## Instalar en el iPhone

Abrir la URL de Vercel en **Safari** → botón Compartir → **Agregar a inicio**.
Se abre como app, funciona offline y (fase 8) recibe notificaciones push.

## Estructura

```
src/
  lib/          datos: db.ts (Dexie), sync.ts (Supabase), pages.ts (acciones), query.ts (filtros/orden)
  blocks/       bloques propios del editor: callout, enlace a página, embed
  components/   UI: Sidebar, PageView, Editor, SearchPalette (⌘K), database/ (Tabla, Tablero, propiedades)
  sw.ts         service worker (offline + push)
supabase/migrations/   SQL del backend
```

## Roadmap

- [x] Fase 1: base, local-first, sync, PWA
- [x] Fase 2: páginas anidadas (drag en la barra lateral), editor con `/`, toggles, callouts, código, ⌘K, papelera
- [x] Fase 3: bases de datos, Tabla (virtualizada) y Kanban, filtros y orden
- [ ] Fase 4: vistas Calendario, Galería y Timeline; Relaciones y Rollups
- [ ] Fase 5: plantillas y botones de automatización
- [ ] Fase 6: más embeds (PDF subido, bookmarks) — básico ya disponible con `/embed`
- [ ] Fase 7: calendario Google (EGS + personal) + ICS de Outlook (UADE), vista "Mi día"
- [ ] Fase 8: notificaciones push
- [ ] Fase 9: pulido
