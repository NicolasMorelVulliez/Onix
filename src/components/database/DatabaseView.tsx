import { ArrowDownUp, Filter as FilterIcon, KanbanSquare, MoreHorizontal, Plus, Table2, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useRows, useViews } from '../../lib/hooks'
import { addRow, createView, deleteView, updateView } from '../../lib/pages'
import { applyQuery } from '../../lib/query'
import type { Filter, FilterOp, Page, Property, View, ViewType } from '../../lib/types'
import { useUI } from '../../lib/ui-store'
import { cx, uid } from '../../lib/util'
import { MenuItem, Popover, usePopover } from '../ui'
import { BoardView } from './BoardView'
import { TableView } from './TableView'

const VIEW_TYPES: { type: ViewType; label: string; icon: typeof Table2 }[] = [
  { type: 'table', label: 'Tabla', icon: Table2 },
  { type: 'board', label: 'Tablero', icon: KanbanSquare },
]

export function DatabaseView({ db: database, onOpenRow }: { db: Page; onOpenRow: (id: string) => void }) {
  const views = useViews(database.id)
  const rows = useRows(database.id)
  const activeId = useUI((s) => s.activeView[database.id])
  const setActive = useUI((s) => s.setActiveView)
  const view = views?.find((v) => v.id === activeId) ?? views?.[0]
  const schema = useMemo(() => database.schema ?? [], [database.schema])

  const visibleRows = useMemo(
    () => (rows && view ? applyQuery(rows, schema, view.filters, view.sorts) : []),
    [rows, view, schema],
  )

  if (!views || !rows) return null

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-1 text-sm">
        {views.map((v) => {
          const Icon = VIEW_TYPES.find((t) => t.type === v.type)!.icon
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActive(database.id, v.id)}
              className={cx(
                'flex items-center gap-1.5 rounded px-2 py-1 hover:bg-hover',
                v.id === view?.id ? 'font-medium text-fg' : 'text-muted',
              )}
            >
              <Icon size={14} /> {v.name}
            </button>
          )
        })}
        <AddViewButton databaseId={database.id} schema={schema} onCreated={(id) => setActive(database.id, id)} />
        <div className="ml-auto flex items-center gap-1">
          {view && <FilterButton view={view} schema={schema} />}
          {view && <SortButton view={view} schema={schema} />}
          {view && <ViewMenu view={view} canDelete={views.length > 1} />}
          <button
            type="button"
            onClick={async () => onOpenRow((await addRow(database.id)).id)}
            className="flex items-center gap-1 rounded bg-accent px-2 py-1 font-medium text-white"
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      {view?.type === 'table' && <TableView db={database} view={view} rows={visibleRows} onOpenRow={onOpenRow} />}
      {view?.type === 'board' && <BoardView db={database} view={view} rows={visibleRows} onOpenRow={onOpenRow} />}
    </div>
  )
}

function AddViewButton({ databaseId, schema, onCreated }: { databaseId: string; schema: Property[]; onCreated: (id: string) => void }) {
  const pop = usePopover()
  return (
    <>
      <button type="button" title="Agregar vista" onClick={(e) => pop.toggle(e.currentTarget)} className="rounded p-1 text-muted hover:bg-hover">
        <Plus size={14} />
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-44">
        {VIEW_TYPES.map(({ type, label, icon: Icon }) => (
          <MenuItem
            key={type}
            icon={<Icon size={14} />}
            onClick={async () => {
              pop.close()
              const groupBy = schema.find((p) => p.type === 'status' || p.type === 'select')?.id ?? null
              const v = await createView(databaseId, { name: label, type, group_by: type === 'board' ? groupBy : null })
              onCreated(v.id)
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Popover>
    </>
  )
}

function ViewMenu({ view, canDelete }: { view: View; canDelete: boolean }) {
  const pop = usePopover()
  const [name, setName] = useState(view.name)
  return (
    <>
      <button
        type="button"
        title="Opciones de la vista"
        onClick={(e) => {
          setName(view.name)
          pop.toggle(e.currentTarget)
        }}
        className="rounded p-1 text-muted hover:bg-hover"
      >
        <MoreHorizontal size={16} />
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} align="end" className="w-56">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== view.name && updateView(view.id, { name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="mb-1 w-full rounded border border-line bg-hover px-2 py-1 outline-none"
        />
        {canDelete && (
          <MenuItem
            danger
            icon={<Trash2 size={14} />}
            onClick={() => {
              pop.close()
              deleteView(view.id)
            }}
          >
            Eliminar vista
          </MenuItem>
        )}
      </Popover>
    </>
  )
}

const OPS: Record<string, { op: FilterOp; label: string }[]> = {
  text: [
    { op: 'contains', label: 'contiene' },
    { op: 'is_empty', label: 'está vacío' },
    { op: 'not_empty', label: 'no está vacío' },
  ],
  select: [
    { op: 'is', label: 'es' },
    { op: 'is_not', label: 'no es' },
    { op: 'is_empty', label: 'está vacío' },
    { op: 'not_empty', label: 'no está vacío' },
  ],
  checkbox: [
    { op: 'checked', label: 'marcada' },
    { op: 'unchecked', label: 'sin marcar' },
  ],
}
const opsFor = (p?: Property) =>
  !p ? OPS.text : p.type === 'checkbox' ? OPS.checkbox : p.options ? OPS.select : OPS.text

function FilterButton({ view, schema }: { view: View; schema: Property[] }) {
  const pop = usePopover()
  const props: Property[] = [{ id: 'title', name: 'Nombre', type: 'text' }, ...schema]
  const set = (filters: Filter[]) => updateView(view.id, { filters })
  const patch = (id: string, changes: Partial<Filter>) => set(view.filters.map((f) => (f.id === id ? { ...f, ...changes } : f)))
  return (
    <>
      <button
        type="button"
        title="Filtrar"
        onClick={(e) => pop.toggle(e.currentTarget)}
        className={cx('flex items-center gap-1 rounded p-1 hover:bg-hover', view.filters.length ? 'text-accent' : 'text-muted')}
      >
        <FilterIcon size={15} />
        {view.filters.length > 0 && <span className="text-xs">{view.filters.length}</span>}
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} align="end" className="w-[22rem] max-w-[calc(100vw-16px)] p-2">
        {view.filters.map((f) => {
          const prop = props.find((p) => p.id === f.prop)
          const ops = opsFor(prop)
          const needsValue = ['contains', 'is', 'is_not'].includes(f.op)
          return (
            <div key={f.id} className="mb-1 flex items-center gap-1">
              <select
                value={f.prop}
                onChange={(e) => {
                  const np = props.find((p) => p.id === e.target.value)
                  patch(f.id, { prop: e.target.value, op: opsFor(np)[0].op, value: '' })
                }}
                className="w-28 rounded border border-line bg-bg px-1 py-1"
              >
                {props.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select value={f.op} onChange={(e) => patch(f.id, { op: e.target.value as FilterOp })} className="rounded border border-line bg-bg px-1 py-1">
                {ops.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
              {needsValue &&
                (prop?.options ? (
                  <select value={f.value ?? ''} onChange={(e) => patch(f.id, { value: e.target.value })} className="min-w-0 flex-1 rounded border border-line bg-bg px-1 py-1">
                    <option value="">—</option>
                    {prop.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={f.value ?? ''}
                    onChange={(e) => patch(f.id, { value: e.target.value })}
                    className="min-w-0 flex-1 rounded border border-line bg-bg px-1 py-1 outline-none"
                  />
                ))}
              <button type="button" title="Quitar filtro" onClick={() => set(view.filters.filter((x) => x.id !== f.id))} className="ml-auto rounded p-1 text-muted hover:bg-hover">
                <X size={14} />
              </button>
            </div>
          )
        })}
        <MenuItem icon={<Plus size={14} />} onClick={() => set([...view.filters, { id: uid(), prop: 'title', op: 'contains', value: '' }])}>
          Agregar filtro
        </MenuItem>
      </Popover>
    </>
  )
}

function SortButton({ view, schema }: { view: View; schema: Property[] }) {
  const pop = usePopover()
  const props: Property[] = [{ id: 'title', name: 'Nombre', type: 'text' }, ...schema]
  const set = (sorts: View['sorts']) => updateView(view.id, { sorts })
  return (
    <>
      <button
        type="button"
        title="Ordenar"
        onClick={(e) => pop.toggle(e.currentTarget)}
        className={cx('flex items-center gap-1 rounded p-1 hover:bg-hover', view.sorts.length ? 'text-accent' : 'text-muted')}
      >
        <ArrowDownUp size={15} />
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} align="end" className="w-72 p-2">
        {view.sorts.map((s, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <select
              value={s.prop}
              onChange={(e) => set(view.sorts.map((x, j) => (j === i ? { ...x, prop: e.target.value } : x)))}
              className="min-w-0 flex-1 rounded border border-line bg-bg px-1 py-1"
            >
              {props.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={s.dir}
              onChange={(e) => set(view.sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}
              className="rounded border border-line bg-bg px-1 py-1"
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
            <button type="button" title="Quitar orden" onClick={() => set(view.sorts.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-hover">
              <X size={14} />
            </button>
          </div>
        ))}
        <MenuItem icon={<Plus size={14} />} onClick={() => set([...view.sorts, { prop: 'title', dir: 'asc' }])}>
          Agregar orden
        </MenuItem>
      </Popover>
    </>
  )
}
