import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Cloud,
  CloudOff,
  Copy,
  Ellipsis,
  Eraser,
  ExternalLink,
  FilePlus2,
  Hand,
  Highlighter,
  Lasso,
  Loader2,
  PenLine,
  Ruler,
  SlidersHorizontal,
  Redo2,
  Share,
  Smartphone,
  Trash2,
  Undo2,
  UploadCloud,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { DEFAULT_HIGHLIGHTER, DEFAULT_PEN, feelOf, outline, PAPERS, svgPath } from '../../lib/ink/geometry'
import type { InkStatus } from '../../lib/ink/store'
import { HIGHLIGHT_COLORS, PEN_COLORS, SIZE_RANGE, SIZES, useInkTools, type PenState } from '../../lib/ink/tools'
import type { Paper, Pen, Tool } from '../../lib/ink/types'
import { cx } from '../../lib/util'
import { MenuItem, Popover, usePopover } from '../ui'

const TOOLS: { id: Tool; name: string; icon: ReactNode }[] = [
  { id: 'pen', name: 'Lapicera', icon: <PenLine size={19} /> },
  { id: 'highlighter', name: 'Resaltador', icon: <Highlighter size={19} /> },
  { id: 'eraser', name: 'Goma', icon: <Eraser size={19} /> },
  { id: 'lasso', name: 'Lazo: seleccionar y mover', icon: <Lasso size={19} /> },
]

const btn = 'flex size-9 flex-none items-center justify-center rounded-lg text-fg/80 hover:bg-hover disabled:opacity-30'

const STATUS: Record<InkStatus['state'], { icon: ReactNode; text: string }> = {
  saved: { icon: <Cloud size={14} />, text: 'Guardado en Drive' },
  saving: { icon: <Loader2 size={14} className="animate-spin" />, text: 'Guardando…' },
  pending: { icon: <UploadCloud size={14} />, text: 'Sin subir' },
  offline: { icon: <CloudOff size={14} />, text: 'Sin conexión: se sube después' },
  local: { icon: <Smartphone size={14} />, text: 'Solo en este dispositivo' },
  error: { icon: <AlertTriangle size={14} />, text: 'No se pudo guardar · reintentar' },
}

export function StatusBadge({ status, onRetry }: { status?: InkStatus; onRetry: () => void }) {
  const state = status?.state ?? 'saved'
  const { icon, text } = STATUS[state]
  return (
    <button
      type="button"
      onClick={onRetry}
      title={status?.message ?? text}
      className={cx('flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs', state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted')}
    >
      <span className="flex-none">{icon}</span>
      <span className={cx('truncate', state !== 'error' && 'max-lg:hidden')}>{status?.message && (state === 'saved' || state === 'error') ? status.message : text}</span>
    </button>
  )
}

export function InkToolbar({
  title,
  status,
  canUndo,
  canRedo,
  onBack,
  onUndo,
  onRedo,
  onAddPage,
  onDeletePage,
  onShare,
  onRetry,
  driveUrl,
}: {
  title: string
  status?: InkStatus
  canUndo: boolean
  canRedo: boolean
  onBack: () => void
  onUndo: () => void
  onRedo: () => void
  onAddPage: (paper: Paper) => void
  onDeletePage: (() => void) | null
  onShare: () => void
  onRetry: () => void
  driveUrl: string | null
}) {
  const t = useInkTools()
  const add = usePopover()
  const more = usePopover()
  const feel = usePopover()
  const pen = t.tool === 'highlighter' ? t.highlighter : t.pen
  const colors = t.tool === 'highlighter' ? HIGHLIGHT_COLORS : PEN_COLORS
  const sizes = t.tool === 'eraser' ? SIZES.eraser : t.tool === 'highlighter' ? SIZES.highlighter : SIZES.pen
  const size = t.tool === 'eraser' ? t.eraser : pen.size

  const setColor = (color: string) => (t.tool === 'highlighter' ? t.set({ highlighter: { ...t.highlighter, color } }) : t.set({ pen: { ...t.pen, color }, tool: t.tool === 'lasso' ? 'pen' : t.tool }))
  const setSize = (v: number) =>
    t.tool === 'eraser' ? t.set({ eraser: v }) : t.tool === 'highlighter' ? t.set({ highlighter: { ...t.highlighter, size: v } }) : t.set({ pen: { ...t.pen, size: v } })

  return (
    // Solid background: Safari on the iPad draws translucent, blurred bars out of focus over a zoomed page.
    <header className="z-10 flex flex-none flex-wrap items-center gap-x-1 gap-y-1 border-b border-line bg-bg px-2 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
      <div className="flex min-w-0 flex-1 basis-32 items-center gap-1">
        <button type="button" onClick={onBack} aria-label="Volver" className={btn}>
          <ChevronLeft size={22} />
        </button>
        <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        <StatusBadge status={status} onRetry={onRetry} />
      </div>

      <div className="flex flex-none items-center gap-0.5 max-sm:order-last max-sm:w-full max-sm:overflow-x-auto">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            title={tool.name}
            aria-label={tool.name}
            aria-pressed={t.tool === tool.id}
            onClick={(e) => {
              // Tapping the pen (or highlighter) that's already in use opens its settings.
              if (t.tool === tool.id && (tool.id === 'pen' || tool.id === 'highlighter')) feel.toggle(e.currentTarget)
              else t.set({ tool: tool.id })
            }}
            className={cx(btn, t.tool === tool.id && 'bg-accent/15 text-accent')}
          >
            {tool.icon}
          </button>
        ))}
        <button
          type="button"
          title="Regla"
          aria-label="Regla"
          aria-pressed={t.ruler}
          onClick={() => t.set({ ruler: !t.ruler })}
          className={cx(btn, t.ruler && 'bg-accent/15 text-accent')}
        >
          <Ruler size={19} />
        </button>
        <span className="mx-0.5 h-6 w-px flex-none bg-(--border)" />
        {t.tool !== 'eraser' &&
          colors.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} className="flex size-7 flex-none items-center justify-center">
              <span
                className={cx('size-5 rounded-full shadow-[inset_0_0_0_1px_rgba(128,128,128,0.45)] ring-offset-2 ring-offset-(--elevated)', t.tool !== 'lasso' && pen.color === c && 'ring-2 ring-accent')}
                style={{ background: c }}
              />
            </button>
          ))}
        {t.tool !== 'lasso' && (
          <>
            <span className={cx('mx-0.5 h-6 w-px flex-none bg-(--border)', t.tool !== 'eraser' && 'max-lg:hidden')} />
            {sizes.map((v, i) => (
              // Upright iPad: no room for them; the thickness is in the pen settings.
              <button key={v} type="button" aria-label={`Grosor ${i + 1}`} onClick={() => setSize(v)} className={cx(btn, size === v && 'bg-hover', t.tool !== 'eraser' && 'max-lg:hidden')}>
                <span className="rounded-full bg-fg/80" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
              </button>
            ))}
          </>
        )}
        {(t.tool === 'pen' || t.tool === 'highlighter') && (
          <button type="button" title="Ajustes de la lapicera" aria-label="Ajustes de la lapicera" onClick={(e) => feel.toggle(e.currentTarget)} className={btn}>
            <SlidersHorizontal size={18} />
          </button>
        )}
      </div>

      <div className="ml-auto flex flex-none items-center gap-0.5">
        <button type="button" title="Deshacer" aria-label="Deshacer" disabled={!canUndo} onClick={onUndo} className={btn}>
          <Undo2 size={19} />
        </button>
        <button type="button" title="Rehacer" aria-label="Rehacer" disabled={!canRedo} onClick={onRedo} className={btn}>
          <Redo2 size={19} />
        </button>
        <button type="button" title="Agregar hoja" aria-label="Agregar hoja" onClick={(e) => add.toggle(e.currentTarget)} className={btn}>
          <FilePlus2 size={19} />
        </button>
        <button type="button" title="Más" aria-label="Más" onClick={(e) => more.toggle(e.currentTarget)} className={btn}>
          <Ellipsis size={19} />
        </button>
      </div>

      <Popover anchor={feel.anchor} open={feel.open && (t.tool === 'pen' || t.tool === 'highlighter')} onClose={feel.close} className="w-80 select-none">
        {(t.tool === 'pen' || t.tool === 'highlighter') && <PenSettingsPanel tool={t.tool} />}
      </Popover>

      <Popover anchor={add.anchor} open={add.open} onClose={add.close} align="end" className="w-56 select-none">
        <p className="px-2 py-1 text-xs text-muted">Hoja nueva después de esta</p>
        {PAPERS.map((p) => (
          <MenuItem
            key={p.id}
            icon={<PaperIcon paper={p.id} />}
            onClick={() => {
              add.close()
              t.set({ paper: p.id })
              onAddPage(p.id)
            }}
          >
            {p.name}
          </MenuItem>
        ))}
      </Popover>

      <Popover anchor={more.anchor} open={more.open} onClose={more.close} align="end" className="w-64 select-none">
        <MenuItem icon={t.fingerDraws ? <Check size={15} /> : <Hand size={15} />} onClick={() => t.set({ fingerDraws: !t.fingerDraws })}>
          Dibujar con el dedo {t.fingerDraws ? '(activado)' : ''}
        </MenuItem>
        <MenuItem
          icon={<Share size={15} />}
          onClick={() => {
            more.close()
            onShare()
          }}
        >
          Compartir o descargar el PDF
        </MenuItem>
        {driveUrl && (
          <a href={driveUrl} target="_blank" rel="noreferrer" onClick={more.close} className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
            <ExternalLink size={15} className="text-muted" /> Abrir en Drive
          </a>
        )}
        {onDeletePage && (
          <MenuItem
            danger
            icon={<Trash2 size={15} />}
            onClick={() => {
              more.close()
              onDeletePage()
            }}
          >
            Borrar esta página
          </MenuItem>
        )}
        <p className="px-2 pb-1 pt-2 text-xs leading-snug text-muted">
          Con el lápiz se escribe y con los dedos te movés y hacés zoom. La palma apoyada no raya.
        </p>
      </Popover>
    </header>
  )
}

export function PaperIcon({ paper }: { paper: Paper }) {
  return (
    <svg viewBox="0 0 16 20" className="h-4 w-3.5 rounded-[2px] border border-(--border) bg-white">
      {paper === 'ruled' && [5, 9, 13, 17].map((y) => <line key={y} x1="0" x2="16" y1={y} y2={y} stroke="#9fb0c4" strokeWidth="0.8" />)}
      {paper === 'grid' && (
        <>
          {[4, 8, 12].map((x) => (
            <line key={`x${x}`} x1={x} x2={x} y1="0" y2="20" stroke="#9fb0c4" strokeWidth="0.6" />
          ))}
          {[4, 8, 12, 16].map((y) => (
            <line key={`y${y}`} x1="0" x2="16" y1={y} y2={y} stroke="#9fb0c4" strokeWidth="0.6" />
          ))}
        </>
      )}
      {paper === 'dots' && [4, 8, 12].flatMap((x) => [4, 8, 12, 16].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="#9fb0c4" />))}
    </svg>
  )
}

/** Actions for the strokes chosen with the lasso. */
export function SelectionBar({ onDelete, onDuplicate, onColor }: { onDelete: () => void; onDuplicate: () => void; onColor: (c: string) => void }) {
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-line bg-elevated p-1 shadow-pop">
      {PEN_COLORS.map((c) => (
        <button key={c} type="button" aria-label={`Pintar de ${c}`} onClick={() => onColor(c)} className="flex size-8 items-center justify-center">
          <span className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgba(128,128,128,0.45)]" style={{ background: c }} />
        </button>
      ))}
      <span className="mx-0.5 h-6 w-px flex-none bg-(--border)" />
      <button type="button" title="Duplicar" aria-label="Duplicar" onClick={onDuplicate} className={btn}>
        <Copy size={17} />
      </button>
      <button type="button" title="Borrar" aria-label="Borrar" onClick={onDelete} className={cx(btn, 'text-red-600 dark:text-red-400')}>
        <Trash2 size={17} />
      </button>
    </div>
  )
}

/** A wavy line drawn with the current settings, getting harder and softer like a real hand. */
const SAMPLE: number[] = []
for (let i = 0; i <= 60; i++) {
  const x = 8 + i * 1.73
  SAMPLE.push(x, 15 - Math.sin((i / 60) * Math.PI * 2) * 8, 0.25 + 0.6 * Math.sin((i / 60) * Math.PI))
}

function Slider({ label, value, min, max, step, shown, onChange }: { label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex text-sm">
        <span className="flex-1">{label}</span>
        <span className="tabular-nums text-muted">{shown}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-(--accent)" />
    </label>
  )
}

/** Stability, precision, pressure sensitivity and thickness of the pen (or highlighter). */
function PenSettingsPanel({ tool }: { tool: Pen }) {
  const t = useInkTools()
  const pen = t[tool]
  const set = (patch: Partial<PenState>) => t.set({ [tool]: { ...pen, ...patch } })
  const [lo, hi] = SIZE_RANGE[tool]
  const stepSize = tool === 'pen' ? 0.05 : 0.5
  const preview = svgPath(outline({ tool, size: pen.size * 2, feel: feelOf(pen), pressure: true, points: SAMPLE }))
  const reset = () => set({ ...(tool === 'pen' ? DEFAULT_PEN : DEFAULT_HIGHLIGHTER), size: SIZES[tool][1] })

  return (
    <div className="space-y-3 p-2">
      <div className="flex items-center">
        <span className="flex-1 font-semibold">{tool === 'pen' ? 'Lapicera' : 'Resaltador'}</span>
        <button type="button" onClick={reset} className="rounded-md bg-hover px-2 py-0.5 text-xs">
          Restablecer
        </button>
      </div>
      <svg viewBox="0 0 120 30" className="h-20 w-full rounded-lg bg-white">
        <path d={preview} fill={pen.color} fillOpacity={tool === 'highlighter' ? 0.4 : 1} />
      </svg>
      <Slider label="Estabilidad" value={pen.stability} min={0} max={10} step={1} shown={String(pen.stability)} onChange={(v) => set({ stability: v })} />
      <Slider label="Precisión" value={pen.precision} min={0} max={1} step={0.05} shown={`${Math.round(pen.precision * 100)}%`} onChange={(v) => set({ precision: v })} />
      {tool === 'pen' && (
        <Slider
          label="Sensibilidad a la presión"
          value={pen.sensitivity}
          min={0}
          max={1}
          step={0.05}
          shown={`${Math.round(pen.sensitivity * 100)}%`}
          onChange={(v) => set({ sensitivity: v })}
        />
      )}
      <div>
        <span className="mb-1 flex items-center text-sm">
          <span className="flex-1">Grosor</span>
          <button type="button" aria-label="Más fino" onClick={() => set({ size: Math.max(lo, Math.round((pen.size - stepSize) * 100) / 100) })} className="rounded-full px-2 text-muted hover:bg-hover">
            −
          </button>
          <span className="w-10 text-center tabular-nums text-muted">{pen.size.toFixed(2)}</span>
          <button type="button" aria-label="Más grueso" onClick={() => set({ size: Math.min(hi, Math.round((pen.size + stepSize) * 100) / 100) })} className="rounded-full px-2 text-muted hover:bg-hover">
            +
          </button>
        </span>
        <input type="range" min={lo} max={hi} step={stepSize} value={pen.size} onChange={(e) => set({ size: Number(e.target.value) })} className="w-full accent-(--accent)" />
      </div>
      <p className="text-xs leading-snug text-muted">
        Estabilidad alta: líneas más suaves pero el trazo sigue al lápiz con algo de retraso. Precisión alta: respeta las esquinas y los detalles (letras chicas).
      </p>
    </div>
  )
}
