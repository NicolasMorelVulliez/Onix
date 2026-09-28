import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { addRow, updatePage, updateView } from '../../lib/pages'
import { groupRows, type Group } from '../../lib/query'
import type { Page, View } from '../../lib/types'
import { cx, keyBetween } from '../../lib/util'
import { PropertyDisplay } from './PropertyValue'

export function BoardView({ db, view, rows, onOpenRow }: { db: Page; view: View; rows: Page[]; onOpenRow: (id: string) => void }) {
  const schema = db.schema ?? []
  const groupable = schema.filter((p) => p.type === 'select' || p.type === 'status')
  const groupProp = groupable.find((p) => p.id === view.group_by) ?? groupable[0]
  const [dragging, setDragging] = useState<Page | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  if (!groupProp) {
    return <p className="py-6 text-sm text-muted">Para usar el tablero, agregá una propiedad de tipo Estado o Selección.</p>
  }

  const groups = groupRows(rows, groupProp)
  const cardProps = schema.filter((p) => p.id !== groupProp.id && !view.hidden.includes(p.id))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    if (!over) return
    const row = rows.find((r) => r.id === active.id)
    if (!row) return
    const overData = over.data.current as { group: string; index?: number }
    const group = groups.find((g) => g.id === overData.group)
    if (!group) return
    const list = group.rows.filter((r) => r.id !== row.id)
    // Dropping on a card places it before that card; on the column, at the end.
    const idx = overData.index === undefined ? list.length : list.findIndex((r) => r.id === over.id)
    const at = idx < 0 ? list.length : idx
    const sort_key = keyBetween(list[at - 1]?.sort_key, list[at]?.sort_key)
    updatePage(row.id, { sort_key, props: { ...row.props, [groupProp.id]: group.id || null } })
  }

  return (
    <div className="text-sm">
      {groupable.length > 1 && (
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          Agrupar por
          <select
            value={groupProp.id}
            onChange={(e) => updateView(view.id, { group_by: e.target.value })}
            className="rounded border border-line bg-bg px-1 py-0.5"
          >
            {groupable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(rows.find((r) => r.id === e.active.id) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="mt-3 flex gap-3 overflow-x-auto pb-4">
          {groups.map((g) => (
            <Column
              key={g.id || 'none'}
              group={g}
              onAdd={async () => onOpenRow((await addRow(db.id, g.id ? { [groupProp.id]: g.id } : {})).id)}
            >
              {g.rows.map((r, i) => (
                <Card key={r.id} row={r} group={g.id} index={i} onOpen={() => onOpenRow(r.id)}>
                  <CardBody row={r} props={cardProps} />
                </Card>
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>
          {dragging && (
            <div className="rotate-2 rounded-md border border-line bg-bg p-2 shadow-lg">
              <CardBody row={dragging} props={cardProps} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function Column({ group, children, onAdd }: { group: Group; children: React.ReactNode; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${group.id}`, data: { group: group.id } })
  return (
    <div ref={setNodeRef} className={cx('flex w-64 flex-none flex-col gap-2 rounded-lg p-1.5', isOver && 'bg-hover')}>
      <div className="flex items-center gap-2 px-1">
        <span className={`opt opt-${group.color}`}>{group.name}</span>
        <span className="text-xs text-muted">{group.rows.length}</span>
      </div>
      {children}
      <button type="button" onClick={onAdd} className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-hover">
        <Plus size={14} /> Nuevo
      </button>
    </div>
  )
}

function Card({
  row,
  group,
  index,
  onOpen,
  children,
}: {
  row: Page
  group: string
  index: number
  onOpen: () => void
  children: React.ReactNode
}) {
  const drag = useDraggable({ id: row.id })
  const drop = useDroppable({ id: row.id, data: { group, index } })
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={onOpen}
      className={cx(
        'cursor-pointer rounded-md border border-line bg-bg p-2 shadow-sm hover:bg-hover',
        drag.isDragging && 'opacity-30',
        drop.isOver && !drag.isDragging && 'shadow-[0_-2px_0_0_var(--accent)]',
      )}
    >
      {children}
    </div>
  )
}

function CardBody({ row, props }: { row: Page; props: NonNullable<Page['schema']> }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium">
        {row.icon && <span className="mr-1">{row.icon}</span>}
        {row.title || <span className="text-muted">Sin título</span>}
      </div>
      {props.map((p) => (
        <PropertyDisplay key={p.id} prop={p} value={row.props[p.id] ?? null} />
      ))}
    </div>
  )
}
