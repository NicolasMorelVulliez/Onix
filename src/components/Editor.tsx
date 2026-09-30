import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { es } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { useNavigate } from '@tanstack/react-router'
import { Database, FileText, Frame, HardDrive, MessageSquareQuote, NotebookPen } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { schema, type AppEditor } from '../blocks/schema'
import { uploadFile } from '../lib/files'
import { driveBlock } from '../lib/drive-block'
import { notebookInDrive } from '../lib/ink/store'
import { useInkTools } from '../lib/ink/tools'
import { createDatabase, createPage, updatePage } from '../lib/pages'
import { useDrivePicker } from './drive/DrivePicker'
import type { Page } from '../lib/types'
import { debounce } from '../lib/util'
import { useColorScheme } from '../lib/theme'

function customItems(editor: AppEditor, page: Page, open: (id: string) => void, openInk: (docId: string) => void): DefaultReactSuggestionItem[] {
  return [
    {
      title: 'Página',
      subtext: 'Crear una subpágina dentro de esta',
      aliases: ['page', 'pagina', 'subpagina'],
      group: 'Páginas',
      icon: <FileText size={18} />,
      onItemClick: async () => {
        const child = await createPage({ parent_id: page.id })
        insertOrUpdateBlockForSlashMenu(editor, { type: 'pageLink', props: { pageId: child.id } })
        open(child.id)
      },
    },
    {
      title: 'Base de datos',
      subtext: 'Tabla y tablero Kanban en una subpágina',
      aliases: ['database', 'db', 'tabla', 'kanban', 'tablero'],
      group: 'Páginas',
      icon: <Database size={18} />,
      onItemClick: async () => {
        const child = await createDatabase({ parent_id: page.id })
        insertOrUpdateBlockForSlashMenu(editor, { type: 'pageLink', props: { pageId: child.id } })
        open(child.id)
      },
    },
    {
      title: 'Callout',
      subtext: 'Caja destacada con ícono',
      aliases: ['callout', 'nota', 'destacado', 'aviso'],
      group: 'Bloques básicos',
      icon: <MessageSquareQuote size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' }),
    },
    {
      title: 'Archivo de Drive',
      subtext: 'Vincular un archivo de tus cuentas de Google Drive',
      aliases: ['drive', 'google', 'archivo', 'doc', 'sheet', 'pdf'],
      group: 'Multimedia',
      icon: <HardDrive size={18} />,
      onItemClick: () =>
        useDrivePicker.getState().open((file, accountId) => insertOrUpdateBlockForSlashMenu(editor, driveBlock(file, accountId))),
    },
    {
      title: 'Cuaderno',
      subtext: 'Hojas para escribir con el lápiz, guardadas como PDF en Drive',
      aliases: ['cuaderno', 'notebook', 'lapiz', 'lápiz', 'escribir', 'dibujar', 'apuntes', 'goodnotes'],
      group: 'Multimedia',
      icon: <NotebookPen size={18} />,
      onItemClick: async () => {
        try {
          const { docId, file, accountId } = await notebookInDrive({ name: `Apuntes - ${page.title || 'sin título'}`, folder: page.drive ?? null, paper: useInkTools.getState().paper })
          insertOrUpdateBlockForSlashMenu(editor, driveBlock(file, accountId))
          openInk(docId)
        } catch (e) {
          alert(e instanceof Error ? e.message : String(e))
        }
      },
    },
    {
      title: 'Embed',
      subtext: 'Figma, Google Drive, YouTube, Loom, PDF…',
      aliases: ['embed', 'incrustar', 'figma', 'drive', 'youtube', 'iframe'],
      group: 'Multimedia',
      icon: <Frame size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'embed' }),
    },
  ]
}

export function Editor({ page }: { page: Page }) {
  const scheme = useColorScheme()
  const navigate = useNavigate()
  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: es,
      uploadFile,
      initialContent: page.content?.length ? (page.content as never) : undefined,
    },
    [page.id],
  )

  const save = useMemo(
    () => debounce((id: string, content: unknown) => updatePage(id, { content: content as Page['content'] }), 400),
    [],
  )
  // Save pending edits when leaving the page.
  useEffect(() => () => save.flush(), [page.id, save])

  return (
    <BlockNoteView
      editor={editor}
      theme={scheme}
      slashMenu={false}
      onChange={() => save(page.id, editor.document)}
      className="-mx-12 max-md:-mx-4"
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            [
              ...getDefaultReactSlashMenuItems(editor),
              ...customItems(
                editor,
                page,
                (id) => navigate({ to: '/p/$pageId', params: { pageId: id } }),
                (docId) => navigate({ to: '/ink/$docId', params: { docId } }),
              ),
            ],
            query,
          )
        }
      />
    </BlockNoteView>
  )
}
