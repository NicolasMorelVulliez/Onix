import {
  AlignLeft,
  Calendar,
  CheckSquare,
  CircleDot,
  Hash,
  Link2,
  List,
  Tags,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { STATUS_OPTIONS, updateSchema } from '../../lib/pages'
import type { Property, PropertyType } from '../../lib/types'
import { uid } from '../../lib/util'
import { MenuItem, Popover, usePopover } from '../ui'

export const PROPERTY_TYPES: { type: PropertyType; label: string; icon: LucideIcon }[] = [
  { type: 'text', label: 'Texto', icon: AlignLeft },
  { type: 'number', label: 'Número', icon: Hash },
  { type: 'select', label: 'Selección', icon: List },
  { type: 'multi_select', label: 'Selección múltiple', icon: Tags },
  { type: 'status', label: 'Estado', icon: CircleDot },
  { type: 'date', label: 'Fecha', icon: Calendar },
  { type: 'checkbox', label: 'Casilla', icon: CheckSquare },
  { type: 'url', label: 'URL', icon: Link2 },
]

export const typeIcon = (t: PropertyType) => PROPERTY_TYPES.find((p) => p.type === t)!.icon

function newProperty(type: PropertyType, name?: string): Property {
  const label = PROPERTY_TYPES.find((p) => p.type === type)!.label
  return {
    id: uid(),
    name: name || label,
    type,
    ...(type === 'status' ? { options: STATUS_OPTIONS } : type.includes('select') ? { options: [] } : {}),
  }
}

export function AddPropertyButton({ databaseId, className }: { databaseId: string; className?: string }) {
  const pop = usePopover()
  return (
    <>
      <button type="button" onClick={(e) => pop.toggle(e.currentTarget)} className={className}>
        + Propiedad
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-52">
        <div className="px-2 py-1 text-xs text-muted">Tipo de propiedad</div>
        {PROPERTY_TYPES.map(({ type, label, icon: Icon }) => (
          <MenuItem
            key={type}
            icon={<Icon size={14} />}
            onClick={() => {
              pop.close()
              updateSchema(databaseId, (s) => [...s, newProperty(type)])
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Popover>
    </>
  )
}

/** Column header with rename / change type / delete. */
export function PropertyHeader({ prop, databaseId }: { prop: Property; databaseId: string }) {
  const pop = usePopover()
  const [name, setName] = useState(prop.name)
  const Icon = typeIcon(prop.type)
  const patch = (changes: Partial<Property>) =>
    updateSchema(databaseId, (s) => s.map((p) => (p.id === prop.id ? { ...p, ...changes } : p)))

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          setName(prop.name)
          pop.toggle(e.currentTarget)
        }}
        className="flex h-full w-full items-center gap-1.5 px-2 text-left text-muted hover:bg-hover"
      >
        <Icon size={14} className="flex-none" />
        <span className="truncate">{prop.name}</span>
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-56">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== prop.name && patch({ name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="mb-1 w-full rounded border border-line bg-hover px-2 py-1 outline-none"
        />
        <div className="px-2 py-1 text-xs text-muted">Tipo</div>
        {PROPERTY_TYPES.map(({ type, label, icon: TIcon }) => (
          <MenuItem
            key={type}
            active={type === prop.type}
            icon={<TIcon size={14} />}
            onClick={() => {
              const changes: Partial<Property> = { type }
              if (type === 'status' && !prop.options?.length) changes.options = STATUS_OPTIONS
              if (type.includes('select') && !prop.options) changes.options = []
              patch(changes)
            }}
          >
            {label}
          </MenuItem>
        ))}
        <div className="my-1 border-t border-line" />
        <MenuItem
          danger
          icon={<Trash2 size={14} />}
          onClick={() => {
            pop.close()
            if (confirm(`¿Eliminar la propiedad "${prop.name}"?`)) updateSchema(databaseId, (s) => s.filter((p) => p.id !== prop.id))
          }}
        >
          Eliminar propiedad
        </MenuItem>
      </Popover>
    </>
  )
}
