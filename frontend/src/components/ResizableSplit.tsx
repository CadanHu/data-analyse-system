import { useState, useRef, useEffect } from 'react'

interface ResizableSplitProps {
  left: React.ReactNode
  center: React.ReactNode
  right?: React.ReactNode
  defaultLeftWidth?: number
  defaultRightWidth?: number
  minLeftWidth?: number
  minCenterWidth?: number
  minRightWidth?: number
}

export default function ResizableSplit({
  left,
  center,
  right,
  defaultLeftWidth = 280,
  defaultRightWidth = 420,
  minLeftWidth = 200,
  minCenterWidth = 400,
  minRightWidth = 320,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const [rightWidth, setRightWidth] = useState(defaultRightWidth)
  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)

  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingLeft(true)
  }

  const handleRightResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingRight(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()

      if (isDraggingLeft) {
        const newLeftWidth = e.clientX - containerRect.left
        const maxLeftWidth = containerRect.width - rightWidth - minCenterWidth - 8
        const clampedLeftWidth = Math.max(minLeftWidth, Math.min(newLeftWidth, maxLeftWidth))
        setLeftWidth(clampedLeftWidth)
      }

      if (isDraggingRight) {
        const newRightWidth = containerRect.right - e.clientX
        const maxRightWidth = containerRect.width - leftWidth - minCenterWidth - 8
        const clampedRightWidth = Math.max(minRightWidth, Math.min(newRightWidth, maxRightWidth))
        setRightWidth(clampedRightWidth)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingLeft(false)
      setIsDraggingRight(false)
    }

    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = isDraggingLeft ? 'col-resize' : 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDraggingLeft, isDraggingRight, leftWidth, rightWidth, minLeftWidth, minRightWidth, minCenterWidth])

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div style={{ width: `${leftWidth}px` }} className="flex-none flex flex-col">
        {left}
      </div>

      <div
        className={`flex-none w-1 cursor-col-resize transition-colors ${
          isDraggingLeft ? 'bg-[#BFFFD9]' : 'bg-white/40 hover:bg-white/60'
        }`}
        onMouseDown={handleLeftResizeStart}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {center}
      </div>

      {right && (
        <>
          <div
            className={`flex-none w-1 cursor-col-resize transition-colors ${
              isDraggingRight ? 'bg-[#BFFFD9]' : 'bg-white/40 hover:bg-white/60'
            }`}
            onMouseDown={handleRightResizeStart}
          />

          <div style={{ width: `${rightWidth}px` }} className="flex-none flex flex-col">
            {right}
          </div>
        </>
      )}
    </div>
  )
}
