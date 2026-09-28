import { useVirtualizer } from '@tanstack/react-virtual'
import { FileText, Maximize2, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addRow, setRowProp, updatePage } from '../../lib/pages'
import type { Page, View } from '../../lib/types'
import { AddPropertyButton, PropertyHeader } from './properties'
import { PropertyValue } from './PropertyValue'

const ROW_H = 36
const NAME_W = 280
const COL_W = 180

export function TableView({ db, view, rows, onOpenRow }: { db: Page; view: View; rows: Page[]; onOpenRow: (id: string) => void }) {
  const props = (db.schema ?? []).filter((p) => !view.hidden.includes(p.id))
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  })
  const width = NAME_W + props.length * COL_W + 140
  const template = `${NAME_W}px repeat(${props.length}, ${COL_W}px) 140px`

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-auto text-sm">
      <div style={{ width, minWidth: '100%' }}>
        <div className="sticky top-0 z-10 grid border-b border-line bg-bg" style={{ gridTemplateColumns: template, height: ROW_H }}>
          <div className="flex items-center gap-1.5 border-r border-line px-2 text-muted">
            <FileText size={14} /> Nombre
          </div>
          {props.map((p) => (
            <div key={p.id} className="border-r border-line">
              <PropertyHeader prop={p} databaseId={db.id} />
            </div>
          ))}
          <AddPropertyButton databaseId={db.id} className="px-2 text-left text-muted hover:bg-hover" />
        </div>

        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]
            return (
              <div
                key={row.id}
                className="group absolute inset-x-0 grid border-b border-line"
                style={{ gridTemplateColumns: template, height: ROW_H, transform: `translateY(${vr.start}px)` }}
              >
                <div className="flex items-center border-r border-line">
                  <span className="pl-2 text-base leading-none">{row.icon}</span>
                  <TitleInput row={row} />
                  <button
                    type="button"
                    onClick={() => onOpenRow(row.id)}
                    className="mr-1 flex items-center gap-1 rounded border border-line bg-bg px-1.5 py-0.5 text-xs text-muted opacity-0 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <Maximize2 size={12} /> Abrir
                  </button>
                </div>
                {props.map((p) => (
                  <div key={p.id} className="min-w-0 overflow-hidden border-r border-line hover:bg-hover">
                    <PropertyValue prop={p} value={row.props[p.id] ?? null} databaseId={db.id} onChange={(v) => setRowProp(row.id, p.id, v)} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => addRow(db.id)}
          className="flex w-full items-center gap-1.5 border-b border-line px-2 text-muted hover:bg-hover"
          style={{ height: ROW_H }}
        >
          <Plus size={14} /> Nueva fila
        </button>
        <div className="px-2 py-1 text-xs text-muted">{rows.length} filas</div>
      </div>
    </div>
  )
}

function TitleInput({ row }: { row: Page }) {
  const [draft, setDraft] = useState(row.title)
  useEffect(() => setDraft(row.title), [row.title])
  return (
    <input
      value={draft}
      placeholder="Sin título"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== row.title && updatePage(row.id, { title: draft })}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="h-full min-w-0 flex-1 bg-transparent px-2 font-medium outline-none placeholder:text-muted"
    />
  )
}
