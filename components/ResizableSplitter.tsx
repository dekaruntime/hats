'use client'

import { useEffect, useRef, useState } from 'react'

interface ResizableSplitterProps {
  direction: 'vertical' | 'horizontal'
  onResize: (delta: number) => void
  className?: string
}

export function ResizableSplitter({
  direction,
  onResize,
  className = '',
}: ResizableSplitterProps) {
  const [isDragging, setIsDragging] = useState(false)
  const splitterRef = useRef<HTMLDivElement>(null)
  const lastPosRef = useRef(0)
  const pointerIdRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const deltaRef = useRef(0)
  const onResizeRef = useRef(onResize)
  const directionRef = useRef(direction)

  // Keep refs in sync so native event handlers always see latest values.
  useEffect(() => {
    onResizeRef.current = onResize
    directionRef.current = direction
  })

  useEffect(() => {
    const el = splitterRef.current
    if (!el) return

    const flush = () => {
      rafRef.current = null
      if (deltaRef.current !== 0) {
        onResizeRef.current(deltaRef.current)
        deltaRef.current = 0
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const current = directionRef.current === 'vertical' ? event.clientX : event.clientY
      deltaRef.current += current - lastPosRef.current
      lastPosRef.current = current
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flush)
      }
    }

    const handlePointerUp = () => {
      setIsDragging(false)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      flush()
      deltaRef.current = 0
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.removeAttribute('data-splitter-dragging')

      el.releasePointerCapture?.(pointerIdRef.current)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerup', handlePointerUp)
      el.removeEventListener('pointercancel', handlePointerUp)
      el.removeEventListener('lostpointercapture', handlePointerUp)
    }

    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault()
      setIsDragging(true)
      lastPosRef.current = directionRef.current === 'vertical' ? event.clientX : event.clientY
      pointerIdRef.current = event.pointerId
      document.body.style.cursor = directionRef.current === 'vertical' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      document.body.setAttribute('data-splitter-dragging', directionRef.current)

      el.setPointerCapture?.(event.pointerId)
      el.addEventListener('pointermove', handlePointerMove)
      el.addEventListener('pointerup', handlePointerUp)
      el.addEventListener('pointercancel', handlePointerUp)
      el.addEventListener('lostpointercapture', handlePointerUp)
    }

    el.addEventListener('pointerdown', handlePointerDown)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerup', handlePointerUp)
      el.removeEventListener('pointercancel', handlePointerUp)
      el.removeEventListener('lostpointercapture', handlePointerUp)
    }
  }, [])

  return (
    <div
      ref={splitterRef}
      className={[
        'group relative z-20 flex shrink-0 items-center justify-center',
        'bg-border hover:bg-primary/30 active:bg-primary/50 transition-colors',
        direction === 'vertical'
          ? 'w-1 cursor-col-resize'
          : 'h-1 cursor-row-resize',
        className,
      ].join(' ')}
      role="separator"
      aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
    >
      <div
        className={[
          'rounded-full bg-muted-foreground/40 group-hover:bg-primary',
          'transition-colors',
          direction === 'vertical' ? 'h-8 w-0.5' : 'h-0.5 w-8',
          isDragging ? 'bg-primary' : '',
        ].join(' ')}
      />
    </div>
  )
}
