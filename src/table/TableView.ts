import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView, NodeView, ViewMutationRecord } from '@tiptap/pm/view'

import { getColStyleDeclaration } from './utilities/colStyle.js'

export function updateColumns(
  node: ProseMirrorNode,
  colgroup: HTMLTableColElement, // <colgroup> has the same prototype as <col>
  table: HTMLTableElement,
  cellMinWidth: number,
  overrideCol?: number,
  overrideValue?: number,
) {
  let totalWidth = 0
  let fixedWidth = true
  let nextDOM = colgroup.firstChild
  const row = node.firstChild

  if (row !== null) {
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs

      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth = overrideCol === col ? overrideValue : ((colwidth && colwidth[j]) as number | undefined)
        const cssWidth = hasWidth ? `${hasWidth}px` : ''

        totalWidth += hasWidth || cellMinWidth

        if (!hasWidth) {
          fixedWidth = false
        }

        if (!nextDOM) {
          const colElement = document.createElement('col')
          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth)
          colElement.style.setProperty(propertyKey, propertyValue)
          colgroup.appendChild(colElement)
        } else {
          if ((nextDOM as HTMLTableColElement).style.width !== cssWidth) {
            const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth)
            ;(nextDOM as HTMLTableColElement).style.setProperty(propertyKey, propertyValue)
          }

          nextDOM = nextDOM.nextSibling
        }
      }
    }
  }

  while (nextDOM) {
    const after = nextDOM.nextSibling
    nextDOM.parentNode?.removeChild(nextDOM)
    nextDOM = after
  }

  if (fixedWidth) {
    table.style.width = `${totalWidth}px`
    table.style.minWidth = ''
  } else {
    table.style.width = ''
    table.style.minWidth = `${totalWidth}px`
  }
}

export class TableView implements NodeView {
  node: ProseMirrorNode

  cellMinWidth: number

  dom: HTMLDivElement

  table!: HTMLTableElement

  colgroup!: HTMLTableColElement

  contentDOM!: HTMLTableSectionElement

  view?: EditorView

  getPos?: () => number | undefined

  customScrollbar: boolean

  scrollContainer?: HTMLDivElement

  scrollbarTrack?: HTMLDivElement

  scrollbarThumb?: HTMLDivElement

  private isDragging = false

  private dragStartX = 0

  private dragStartScrollLeft = 0

  private rafId: number | null = null

  private resizeObserver?: ResizeObserver

  private mutationObserver?: MutationObserver

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number = 25,
    view?: EditorView,
    getPos?: () => number | undefined,
    customScrollbar: boolean = false,
  ) {
    this.node = node
    this.cellMinWidth = cellMinWidth || 25
    this.view = view
    this.getPos = getPos
    this.customScrollbar = customScrollbar
    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'

    if (this.customScrollbar) {
      this.setupCustomScrollbar()
    } else {
      this.table = this.dom.appendChild(document.createElement('table'))
      this.colgroup = this.table.appendChild(document.createElement('colgroup'))
      updateColumns(node, this.colgroup, this.table, this.cellMinWidth)
      this.contentDOM = this.table.appendChild(document.createElement('tbody'))
    }

    this.captureColumnWidths()
  }

  /**
   * Sets up the custom scrollbar structure and event handlers
   */
  private setupCustomScrollbar() {
    // Create scroll container
    this.scrollContainer = document.createElement('div')
    this.scrollContainer.className = 'tableScrollContainer'
    // Hide webkit scrollbar
    const style = document.createElement('style')
    this.dom.appendChild(style)

    // Create table inside scroll container
    this.table = this.scrollContainer.appendChild(document.createElement('table'))
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(this.node, this.colgroup, this.table, this.cellMinWidth)
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    // Append scroll container to wrapper
    this.dom.appendChild(this.scrollContainer)

    // Create custom scrollbar
    this.scrollbarTrack = document.createElement('div')
    this.scrollbarTrack.className = 'customScrollbarTrack'

    this.scrollbarThumb = document.createElement('div')
    this.scrollbarThumb.className = 'customScrollbarThumb'
    this.scrollbarThumb.addEventListener('mouseenter', () => {
      if (!this.isDragging && this.scrollbarThumb) {
        this.scrollbarThumb.style.background = 'rgba(0, 0, 0, 0.5)'
      }
    })
    this.scrollbarThumb.addEventListener('mouseleave', () => {
      if (!this.isDragging && this.scrollbarThumb) {
        this.scrollbarThumb.style.background = 'rgba(0, 0, 0, 0.3)'
      }
    })

    this.scrollbarTrack.appendChild(this.scrollbarThumb)
    this.dom.appendChild(this.scrollbarTrack)

    // Set up event listeners
    this.setupScrollbarEvents()
    this.setupObservers()
    this.updateScrollbar()
  }

  /**
   * Sets up all event handlers for custom scrollbar
   */
  private setupScrollbarEvents() {
    if (!this.scrollContainer || !this.scrollbarThumb || !this.scrollbarTrack) return

    // Mouse wheel event with RAF throttling
    const handleWheel = (e: WheelEvent) => {
      if (!this.scrollContainer) return

      // Check if table is wider than container
      if (this.table.scrollWidth <= this.scrollContainer.clientWidth) return

      // Determine if this is primarily a horizontal scroll gesture
      // Only intercept if horizontal delta is significant OR shift key is pressed
      const absX = Math.abs(e.deltaX)
      const absY = Math.abs(e.deltaY)
      const isHorizontalScroll = absX > absY || (e.shiftKey && absY > 0)

      // Only handle horizontal scrolling, let vertical scroll pass through
      if (!isHorizontalScroll) return

      // Only prevent default if we're actually going to scroll
      // This allows vertical scrolling to work smoothly
      const scrollLeft = this.scrollContainer.scrollLeft
      const maxScrollLeft = this.scrollContainer.scrollWidth - this.scrollContainer.clientWidth

      let delta = e.deltaX
      if (delta === 0 && e.shiftKey) {
        delta = e.deltaY
      }

      // Check if we can actually scroll in the intended direction
      const canScrollLeft = delta < 0 && scrollLeft > 0
      const canScrollRight = delta > 0 && scrollLeft < maxScrollLeft

      if (!canScrollLeft && !canScrollRight) return

      e.preventDefault()

      if (this.rafId !== null) return

      this.rafId = requestAnimationFrame(() => {
        if (!this.scrollContainer) {
          this.rafId = null
          return
        }

        const newScrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollLeft + delta))

        this.scrollContainer.scrollLeft = newScrollLeft
        this.updateScrollbarPosition()
        this.rafId = null
      })
    }

    this.scrollContainer.addEventListener('wheel', handleWheel, { passive: false })

    // Thumb drag events
    const handleThumbMouseDown = (e: MouseEvent) => {
      if (!this.scrollContainer) return

      e.preventDefault()
      this.isDragging = true
      this.dragStartX = e.clientX
      this.dragStartScrollLeft = this.scrollContainer.scrollLeft

      if (this.scrollbarThumb) {
        this.scrollbarThumb.style.cursor = 'grabbing'
        this.scrollbarThumb.style.background = 'rgba(0, 0, 0, 0.5)'
      }

      document.addEventListener('mousemove', handleDocumentMouseMove)
      document.addEventListener('mouseup', handleDocumentMouseUp)
    }

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.scrollContainer || !this.scrollbarTrack) return

      e.preventDefault()

      const deltaX = e.clientX - this.dragStartX
      const trackWidth = this.scrollbarTrack.clientWidth
      const scrollWidth = this.scrollContainer.scrollWidth
      const clientWidth = this.scrollContainer.clientWidth

      const scrollRatio = scrollWidth / trackWidth
      const scrollDelta = deltaX * scrollRatio

      this.scrollContainer.scrollLeft = Math.max(
        0,
        Math.min(scrollWidth - clientWidth, this.dragStartScrollLeft + scrollDelta),
      )

      this.updateScrollbarPosition()
    }

    const handleDocumentMouseUp = () => {
      this.isDragging = false

      if (this.scrollbarThumb) {
        this.scrollbarThumb.style.cursor = 'grab'
        this.scrollbarThumb.style.background = 'rgba(0, 0, 0, 0.3)'
      }

      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
    }

    this.scrollbarThumb.addEventListener('mousedown', handleThumbMouseDown)

    // Track click to jump
    const handleTrackClick = (e: MouseEvent) => {
      if (
        !this.scrollContainer
        || !this.scrollbarTrack
        || !this.scrollbarThumb
        || e.target === this.scrollbarThumb
      ) {
        return
      }

      const rect = this.scrollbarTrack.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const trackWidth = this.scrollbarTrack.clientWidth
      const thumbWidth = this.scrollbarThumb.clientWidth

      const targetThumbLeft = Math.max(0, Math.min(trackWidth - thumbWidth, clickX - thumbWidth / 2))
      const scrollRatio = (this.scrollContainer.scrollWidth - this.scrollContainer.clientWidth) / (trackWidth - thumbWidth)

      this.scrollContainer.scrollLeft = targetThumbLeft * scrollRatio
      this.updateScrollbarPosition()
    }

    this.scrollbarTrack.addEventListener('click', handleTrackClick)
  }

  /**
   * Sets up resize and mutation observers for dynamic updates
   */
  private setupObservers() {
    if (!this.scrollContainer) return

    // Observe container and table size changes
    this.resizeObserver = new ResizeObserver(() => {
      this.updateScrollbar()
    })

    this.resizeObserver.observe(this.scrollContainer)
    this.resizeObserver.observe(this.table)

    // Observe DOM mutations
    this.mutationObserver = new MutationObserver(() => {
      // Debounce updates
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId)
      }

      this.rafId = requestAnimationFrame(() => {
        this.updateScrollbar()
        this.rafId = null
      })
    })

    this.mutationObserver.observe(this.table, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })
  }

  /**
   * Updates scrollbar visibility and thumb size
   */
  private updateScrollbar() {
    if (!this.scrollContainer || !this.scrollbarTrack || !this.scrollbarThumb) return

    const scrollWidth = this.scrollContainer.scrollWidth
    const clientWidth = this.scrollContainer.clientWidth

    // Show/hide scrollbar based on whether content is scrollable
    if (scrollWidth > clientWidth) {
      this.scrollbarTrack.style.display = 'block'

      // Calculate thumb width
      const thumbWidth = Math.max(30, (clientWidth / scrollWidth) * this.scrollbarTrack.clientWidth)
      this.scrollbarThumb.style.width = `${thumbWidth}px`

      this.updateScrollbarPosition()
    } else {
      this.scrollbarTrack.style.display = 'none'
      this.scrollContainer.scrollLeft = 0
    }
  }

  /**
   * Updates scrollbar thumb position based on scroll position
   */
  private updateScrollbarPosition() {
    if (!this.scrollContainer || !this.scrollbarTrack || !this.scrollbarThumb) return

    const scrollLeft = this.scrollContainer.scrollLeft
    const scrollWidth = this.scrollContainer.scrollWidth
    const clientWidth = this.scrollContainer.clientWidth
    const trackWidth = this.scrollbarTrack.clientWidth
    const thumbWidth = this.scrollbarThumb.clientWidth

    const maxScrollLeft = scrollWidth - clientWidth
    const maxThumbLeft = trackWidth - thumbWidth

    const thumbLeft = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * maxThumbLeft : 0
    this.scrollbarThumb.style.left = `${thumbLeft}px`
  }

  /**
   * Captures the actual rendered column widths from the browser and updates the node
   * attributes. Uses a temporary removal of width constraints to let the browser
   * calculate natural widths, then captures and persists those widths.
   */
  private captureColumnWidths() {
    if (!this.view || !this.getPos) {
      return
    }

    requestAnimationFrame(() => {
      if (!this.view || !this.getPos) {
        return
      }

      const pos = this.getPos()
      if (pos === undefined) {
        return
      }

      const cols = this.colgroup.querySelectorAll('col')

      cols.forEach((col) => {
        ;(col as HTMLElement).style.width = ''
        ;(col as HTMLElement).style.minWidth = ''
      })

      requestAnimationFrame(() => {
        if (!this.view || !this.getPos) {
          return
        }

        const currentPos = this.getPos()
        if (currentPos === undefined) {
          return
        }

        const colWidths: number[] = []
        cols.forEach((col) => {
          colWidths.push((col as HTMLElement).offsetWidth)
        })

        if (colWidths.length === 0) {
          return
        }

        const currentNode = this.view.state.doc.nodeAt(currentPos)
        if (!currentNode || !currentNode.firstChild) {
          return
        }

        const newRows: ProseMirrorNode[] = []

        currentNode.forEach((tableRow) => {
          const newCells: ProseMirrorNode[] = []
          let colIndex = 0

          tableRow.forEach((cell) => {
            const { colspan } = cell.attrs
            const cellWidths: number[] = []

            for (let j = 0; j < colspan; j += 1) {
              if (colIndex + j < colWidths.length) {
                cellWidths.push(colWidths[colIndex + j])
              }
            }

            const newAttrs = { ...cell.attrs, colwidth: cellWidths.length > 0 ? cellWidths : cell.attrs.colwidth }
            const newCell = cell.type.create(newAttrs, cell.content, cell.marks)
            newCells.push(newCell)

            colIndex += colspan
          })

          const newRow = tableRow.type.create(tableRow.attrs, newCells, tableRow.marks)
          newRows.push(newRow)
        })

        const newTable = currentNode.type.create(currentNode.attrs, newRows, currentNode.marks)
        const tr = this.view.state.tr.replaceWith(currentPos, currentPos + currentNode.nodeSize, newTable)

        if (tr.docChanged) {
          this.view.dispatch(tr)

          setTimeout(() => {
            if (!this.view || !this.getPos) {
              return
            }

            const finalPos = this.getPos()
            if (finalPos === undefined) {
              return
            }

            const finalNode = this.view.state.doc.nodeAt(finalPos)
            if (finalNode) {
              this.node = finalNode
              updateColumns(finalNode, this.colgroup, this.table, this.cellMinWidth)

              // Update scrollbar after column width changes
              if (this.customScrollbar) {
                this.updateScrollbar()
              }
            }
          }, 100)
        }
      })
    })
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false
    }

    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)

    // Update scrollbar after node update
    if (this.customScrollbar) {
      this.updateScrollbar()
    }

    return true
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    const target = mutation.target as Node
    const isInsideWrapper = this.dom.contains(target)
    const isInsideContent = this.contentDOM.contains(target)

    if (isInsideWrapper && !isInsideContent) {
      if (mutation.type === 'attributes' || mutation.type === 'childList' || mutation.type === 'characterData') {
        return true
      }
    }

    return false
  }

  destroy() {
    // Clean up RAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    // Clean up observers
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = undefined
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = undefined
    }

    // Clean up DOM references
    this.scrollContainer = undefined
    this.scrollbarTrack = undefined
    this.scrollbarThumb = undefined
  }
}
