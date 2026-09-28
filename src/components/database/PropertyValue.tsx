import { Check, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { updateSchema } from '../../lib/pages'
import type { DateValue, OptionColor, Property, PropValue, SelectOption } from '../../lib/types'
import { cx, uid } from '../../lib/util'
import { Popover, usePopover } from '../ui'

const COLORS: OptionColor[] = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

export function OptionTag({ option }: { option?: SelectOption }) {
  if (!option) return null
  return <span className={`opt opt-${option.color}`}>{option.name}</span>
}

export function formatDate(v: DateValue | null | undefined) {
  if (!v?.start) return ''
  const fmt = (s: string) =>
    new Date(s.length === 10 ? `${s}T00:00` : s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
  return v.end ? `${fmt(v.start)} → ${fmt(v.end)}` : fmt(v.start)
}

/** Read-only rendering (board cards). */
export function PropertyDisplay({ prop, value }: { prop: Property; value: PropValue }) {
  if (value == null || value === '') return null
  switch (prop.type) {
    case 'select':
    case 'status':
      return <OptionTag option={prop.options?.find((o) => o.id === value)} />
    case 'multi_select':
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((id) => (
            <OptionTag key={id} option={prop.options?.find((o) => o.id === id)} />
          ))}
        </span>
      )
    case 'date':
      return <span className="text-xs text-muted">{formatDate(value as DateValue)}</span>
    case 'checkbox':
      return value ? <span className="text-xs">☑ {prop.name}</span> : null
    default:
      return <span className="truncate text-xs text-muted">{String(value)}</span>
  }
}

/** Editable value used in table cells and the row page header. */
export function PropertyValue({
  prop,
  value,
  databaseId,
  onChange,
}: {
  prop: Property
  value: PropValue
  databaseId: string
  onChange: (v: PropValue) => void
}) {
  switch (prop.type) {
    case 'text':
    case 'url':
    case 'number':
      return <TextInput prop={prop} value={value} onChange={onChange} />
    case 'checkbox':
      return (
        <label className="flex h-full cursor-pointer items-center px-2">
          <input type="checkbox" className="size-4 accent-(--accent)" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        </label>
      )
    case 'date':
      return <DateInput value={value as DateValue | null} onChange={onChange} />
    case 'select':
    case 'status':
    case 'multi_select':
      return <SelectInput prop={prop} value={value} databaseId={databaseId} onChange={onChange} />
  }
}

function TextInput({ prop, value, onChange }: { prop: Property; value: PropValue; onChange: (v: PropValue) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  const commit = () => {
    const v = prop.type === 'number' ? (draft === '' ? null : Number(draft)) : draft
    if (v !== value && !(prop.type === 'number' && Number.isNaN(v))) onChange(v)
  }
  return (
    <div className="flex h-full items-center">
      <input
        type={prop.type === 'number' ? 'number' : 'text'}
        inputMode={prop.type === 'number' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={cx('h-full w-full min-w-0 bg-transparent px-2 py-1 outline-none', prop.type === 'number' && 'text-right')}
      />
      {prop.type === 'url' && draft && (
        <a href={draft.includes('://') ? draft : `https://${draft}`} target="_blank" rel="noreferrer" className="px-1 text-xs text-accent">
          ↗
        </a>
      )}
    </div>
  )
}

function DateInput({ value, onChange }: { value: DateValue | null; onChange: (v: PropValue) => void }) {
  return (
    <input
      type="date"
      value={value?.start?.slice(0, 10) ?? ''}
      onChange={(e) => onChange(e.target.value ? { ...value, start: e.target.value } : null)}
      className="h-full w-full min-w-0 bg-transparent px-2 py-1 text-sm outline-none"
    />
  )
}

function SelectInput({
  prop,
  value,
  databaseId,
  onChange,
}: {
  prop: Property
  value: PropValue
  databaseId: string
  onChange: (v: PropValue) => void
}) {
  const pop = usePopover()
  const [query, setQuery] = useState('')
  const multi = prop.type === 'multi_select'
  const selected = multi ? ((value as string[] | null) ?? []) : value ? [value as string] : []
  const options = prop.options ?? []
  const matches = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
  const exact = options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase())

  const pick = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
    else {
      onChange(selected[0] === id ? null : id)
      pop.close()
    }
    setQuery('')
  }

  const create = async () => {
    const name = query.trim()
    if (!name) return
    const option: SelectOption = { id: uid(), name, color: COLORS[options.length % COLORS.length] }
    await updateSchema(databaseId, (schema) =>
      schema.map((p) => (p.id === prop.id ? { ...p, options: [...(p.options ?? []), option] } : p)),
    )
    pick(option.id)
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => pop.toggle(e.currentTarget)}
        className="flex h-full min-h-8 w-full flex-wrap items-center gap-1 px-2 py-1 text-left"
      >
        {selected.map((id) => (
          <OptionTag key={id} option={options.find((o) => o.id === id)} />
        ))}
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-60">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            if (matches[0] && (exact || !query.trim())) pick(matches[0].id)
            else create()
          }}
          placeholder="Buscar o crear opción…"
          className="mb-1 w-full rounded border border-line bg-hover px-2 py-1 outline-none"
        />
        {matches.map((o) => (
          <button key={o.id} type="button" onClick={() => pick(o.id)} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-hover">
            <OptionTag option={o} />
            {selected.includes(o.id) && <Check size={14} className="ml-auto text-muted" />}
          </button>
        ))}
        {query.trim() && !exact && (
          <button type="button" onClick={create} className="flex w-full items-center gap-2 rounded px-2 py-1 text-muted hover:bg-hover">
            <Plus size={14} /> Crear <span className="opt opt-gray">{query.trim()}</span>
          </button>
        )}
      </Popover>
    </>
  )
}
