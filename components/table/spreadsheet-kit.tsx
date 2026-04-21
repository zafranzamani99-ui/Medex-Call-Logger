'use client'

// WHY: Shared Excel-grade spreadsheet primitives used by CRM + Reports tables.
// Built on @tanstack/react-table v8 + @dnd-kit for reorder + native resize events.
//
// What this file provides:
//   · measureAutoFitWidth()     — canvas-measure auto-fit (double-click resize handle)
//   · <ResizeHandle>             — 8px hit zone, 2px visible line, active glow
//   · <ColumnResizeIndicator>   — full-height blue guide line + px-width pill while dragging
//   · <HorizontalDndProvider>   — DndContext preconfigured for header reordering
//   · <SortableHeader>           — useSortable wrapper with blue insertion indicator

import React, { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { restrictToHorizontalAxis, restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers'
import type { Table, Header } from '@tanstack/react-table'

// ─ Auto-fit measurement ────────────────────────────────────────────
// Measures the widest rendered cell value via canvas measureText so we can
// fit a column to its longest content (Airtable-style double-click). Returns
// a clamped px width.

let measureCanvas: HTMLCanvasElement | null = null

export function measureAutoFitWidth(
  values: Array<string | null | undefined>,
  opts: {
    font?: string
    paddingX?: number // left + right cell padding (px)
    minWidth?: number
    maxWidth?: number
    headerText?: string
  } = {}
): number {
  const { font = '13px Inter, system-ui, sans-serif', paddingX = 24, minWidth = 60, maxWidth = 600, headerText = '' } = opts
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return minWidth
  ctx.font = font

  let max = headerText ? ctx.measureText(headerText).width : 0
  for (const v of values) {
    if (!v) continue
    const w = ctx.measureText(String(v)).width
    if (w > max) max = w
  }
  // Round up a touch so we don't trim antialiased pixels.
  const computed = Math.ceil(max) + paddingX
  return Math.max(minWidth, Math.min(maxWidth, computed))
}

// ─ Resize handle ───────────────────────────────────────────────────
// 8px wide hit area with a 2px centred visible line. Becomes solid accent
// colour during active drag. Always rendered — no hover-to-reveal (users
// shouldn't have to guess where the edge is).

export function ResizeHandle<T>({ header, onDoubleClick }: {
  header: Header<T, unknown>
  onDoubleClick?: () => void
}) {
  const isResizing = header.column.getIsResizing()
  return (
    <div
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (onDoubleClick) onDoubleClick()
        else header.column.resetSize()
      }}
      title="Drag to resize · double-click to auto-fit"
      className="group absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize select-none touch-none z-20"
      style={{ userSelect: 'none' }}
    >
      {/* Visible line centred inside the hit zone */}
      <div
        className={`absolute top-1/4 bottom-1/4 left-1/2 -translate-x-1/2 w-[2px] rounded-full transition-colors ${
          isResizing ? 'bg-accent' : 'bg-border group-hover:bg-accent/70'
        }`}
      />
    </div>
  )
}

// ─ Full-height indicator + width pill ─────────────────────────────
// Renders a vertical guide line at `col-edge + deltaOffset` spanning the
// whole table. `containerRef` should point to the scroll container (usually
// the div wrapping the <table>). Positioning is relative to that container.

export function ColumnResizeIndicator<T>({
  table,
  containerRef,
}: {
  table: Table<T>
  containerRef: React.RefObject<HTMLElement>
}) {
  const { columnSizingInfo } = table.getState()
  const resizingColumnId = columnSizingInfo.isResizingColumn
  const deltaOffset = columnSizingInfo.deltaOffset ?? 0

  const [pos, setPos] = useState<{ left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!resizingColumnId || !containerRef.current) {
      setPos(null)
      return
    }
    const container = containerRef.current
    const th = container.querySelector<HTMLElement>(`[data-col-id="${resizingColumnId}"]`)
    if (!th) return

    const cRect = container.getBoundingClientRect()
    const tRect = th.getBoundingClientRect()
    const columnRight = tRect.right - cRect.left + container.scrollLeft
    setPos({
      left: columnRight,
      width: tRect.width,
      height: container.scrollHeight,
    })
  }, [resizingColumnId, deltaOffset, containerRef])

  if (!resizingColumnId || !pos) return null

  const displayWidth = Math.round(pos.width + deltaOffset)

  return (
    <>
      {/* Full-height guide line */}
      <div
        className="pointer-events-none absolute top-0 w-[2px] bg-accent shadow-[0_0_8px_rgba(99,102,241,0.5)]"
        style={{
          left: pos.left + deltaOffset,
          height: pos.height,
          zIndex: 40,
        }}
      />
      {/* Width pill anchored to the dragged edge */}
      <div
        className="pointer-events-none absolute top-2 px-2 py-0.5 rounded-md bg-accent text-white text-[11px] font-semibold tabular-nums shadow-lg"
        style={{
          left: pos.left + deltaOffset + 6,
          zIndex: 41,
        }}
      >
        {displayWidth}px
      </div>
    </>
  )
}

// ─ DnD wrapper ────────────────────────────────────────────────────
// Opinionated DndContext for header reordering. Consumer provides column IDs
// (the sortable ones; pin frozen columns outside this), and an onReorder
// callback receiving (fromId, toId). Auto-scroll + horizontal constraint +
// mouse/keyboard sensors baked in.

export function HorizontalDndProvider({
  columnIds,
  onReorder,
  children,
}: {
  columnIds: string[]
  onReorder: (fromId: string, toId: string) => void
  children: React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }, // ignore click vs drag
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis, restrictToFirstScrollableAncestor]}
      onDragEnd={(e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        onReorder(String(active.id), String(over.id))
      }}
    >
      <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

// Helper: immutable reorder one item within an array, used by consumers.
export function reorderColumns<T extends string>(order: T[], fromId: T, toId: T): T[] {
  const from = order.indexOf(fromId)
  const to = order.indexOf(toId)
  if (from < 0 || to < 0) return order
  return arrayMove(order, from, to)
}

// ─ Sortable header cell ──────────────────────────────────────────
// Wraps any header <th>-style element with drag handle behaviour + visible
// insertion indicator. The visual indicator appears on the OVER target's
// leading edge (left or right depending on drag direction).

export function SortableHeader({
  id,
  disabled = false,
  children,
  className = '',
  style,
  ...thProps
}: {
  id: string
  disabled?: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
} & Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'id' | 'children' | 'className' | 'style'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  // Sibling headers slide out of the way via `transform` + transition — this
  // IS the insertion indicator (same technique tanstack's official column-dnd
  // example uses). No extra blue line needed; the sliding animation makes the
  // drop target obvious.
  const dragStyle: React.CSSProperties = {
    ...(style || {}),
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : style?.transform,
    transition: transition ?? style?.transition,
    opacity: isDragging ? 0.4 : style?.opacity,
    zIndex: isDragging ? 30 : style?.zIndex,
  }

  return (
    <th
      ref={setNodeRef}
      data-col-id={id}
      className={className}
      style={dragStyle}
      {...attributes}
      {...(disabled ? {} : listeners)}
      {...thProps}
    >
      {children}
    </th>
  )
}

// Re-export arrayMove for convenience
export { arrayMove }

// ─ Plain resize handle + indicator (no tanstack required) ─────────
// For tables that don't use @tanstack/react-table (e.g. ReportTable in
// ReportsView). Mouse/touch-driven, with a tiny parent-context indicator.

interface PlainResizeState {
  columnId: string
  startX: number
  startWidth: number
  deltaX: number
}

interface PlainResizeContextValue {
  state: PlainResizeState | null
  begin: (columnId: string, startX: number, startWidth: number) => void
}

const PlainResizeContext = React.createContext<PlainResizeContextValue | null>(null)

export function PlainResizeProvider({
  widths,
  onChangeWidth,
  children,
  minWidth = 60,
  maxWidth = 800,
}: {
  widths: Record<string, number>
  onChangeWidth: (columnId: string, width: number) => void
  children: React.ReactNode
  minWidth?: number
  maxWidth?: number
}) {
  const [state, setState] = useState<PlainResizeState | null>(null)
  const stateRef = React.useRef<PlainResizeState | null>(null)
  stateRef.current = state

  const begin = React.useCallback((columnId: string, startX: number, startWidth: number) => {
    setState({ columnId, startX, startWidth, deltaX: 0 })
  }, [])

  useEffect(() => {
    if (!state) return
    const onMove = (clientX: number) => {
      const s = stateRef.current
      if (!s) return
      setState({ ...s, deltaX: clientX - s.startX })
    }
    const onEnd = () => {
      const s = stateRef.current
      if (!s) return
      const final = Math.max(minWidth, Math.min(maxWidth, s.startWidth + s.deltaX))
      onChangeWidth(s.columnId, final)
      setState(null)
    }
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX)
    const onTouchMove = (e: TouchEvent) => onMove(e.touches[0]?.clientX ?? 0)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', onEnd)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [state, onChangeWidth, minWidth, maxWidth])

  // Consumers subscribe by widths (not shown here) — the provider just tracks
  // drag state; width application lives in the consumer's render.
  void widths

  return (
    <PlainResizeContext.Provider value={{ state, begin }}>
      {children}
    </PlainResizeContext.Provider>
  )
}

export function PlainResizeHandle({
  columnId,
  currentWidth,
  onAutoFit,
}: {
  columnId: string
  currentWidth: number
  onAutoFit?: () => void
}) {
  const ctx = React.useContext(PlainResizeContext)
  const isActive = ctx?.state?.columnId === columnId

  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx?.begin(columnId, e.clientX, currentWidth)
      }}
      onTouchStart={(e) => {
        e.stopPropagation()
        const t = e.touches[0]
        if (!t) return
        ctx?.begin(columnId, t.clientX, currentWidth)
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); onAutoFit?.() }}
      title="Drag to resize · double-click to auto-fit"
      className="group absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize select-none touch-none z-20"
      style={{ userSelect: 'none' }}
    >
      <div
        className={`absolute top-1/4 bottom-1/4 left-1/2 -translate-x-1/2 w-[2px] rounded-full transition-colors ${
          isActive ? 'bg-accent' : 'bg-border group-hover:bg-accent/70'
        }`}
      />
    </div>
  )
}

export function PlainResizeIndicator({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement>
}) {
  const ctx = React.useContext(PlainResizeContext)
  const [pos, setPos] = useState<{ left: number; width: number; height: number } | null>(null)
  const deltaX = ctx?.state?.deltaX ?? 0
  const columnId = ctx?.state?.columnId

  useEffect(() => {
    if (!columnId || !containerRef.current) {
      setPos(null)
      return
    }
    const container = containerRef.current
    const th = container.querySelector<HTMLElement>(`[data-col-id="${columnId}"]`)
    if (!th) return
    const cRect = container.getBoundingClientRect()
    const tRect = th.getBoundingClientRect()
    const columnRight = tRect.right - cRect.left + container.scrollLeft
    setPos({ left: columnRight, width: tRect.width, height: container.scrollHeight })
  }, [columnId, deltaX, containerRef])

  if (!columnId || !pos) return null
  const displayWidth = Math.round(pos.width + deltaX)
  return (
    <>
      <div
        className="pointer-events-none absolute top-0 w-[2px] bg-accent shadow-[0_0_8px_rgba(99,102,241,0.5)]"
        style={{ left: pos.left + deltaX, height: pos.height, zIndex: 40 }}
      />
      <div
        className="pointer-events-none absolute top-2 px-2 py-0.5 rounded-md bg-accent text-white text-[11px] font-semibold tabular-nums shadow-lg"
        style={{ left: pos.left + deltaX + 6, zIndex: 41 }}
      >
        {displayWidth}px
      </div>
    </>
  )
}
