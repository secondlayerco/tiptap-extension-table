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

  table: HTMLTableElement

  colgroup: HTMLTableColElement

  contentDOM: HTMLTableSectionElement

  view?: EditorView

  getPos?: () => number | undefined

  constructor(node: ProseMirrorNode, cellMinWidth: number, view?: EditorView, getPos?: () => number | undefined) {
    console.log('[ERWAN] TableView', node)
    this.node = node
    this.cellMinWidth = cellMinWidth
    this.view = view
    this.getPos = getPos
    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'
    this.table = this.dom.appendChild(document.createElement('table'))
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, cellMinWidth)
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    // After the browser has laid out the table, capture the actual column widths
    this.captureColumnWidths()
  }

  /**
   * Captures the actual rendered column widths from the browser and updates the node
   * attributes if columns don't already have explicit widths set.
   */
  private captureColumnWidths() {
    console.log('[TableView] captureColumnWidths called')
    
    // Use requestAnimationFrame to ensure the browser has finished layout
    requestAnimationFrame(() => {
      console.log('[TableView] requestAnimationFrame callback executing')
      
      if (!this.view || !this.getPos) {
        console.log('[TableView] Missing view or getPos:', { view: !!this.view, getPos: !!this.getPos })
        return
      }

      const pos = this.getPos()
      console.log('[TableView] Table position:', pos)
      
      if (pos === undefined) {
        console.log('[TableView] Position is undefined, exiting')
        return
      }

      const row = this.node.firstChild
      if (!row) {
        console.log('[TableView] No first row found')
        return
      }

      console.log('[TableView] First row has', row.childCount, 'cells')

      // Check if we need to set widths (only if columns don't have widths)
      let needsWidths = false
      for (let i = 0; i < row.childCount; i += 1) {
        const cell = row.child(i)
        console.log(`[TableView] Cell ${i} colwidth:`, cell.attrs.colwidth)
        if (!cell.attrs.colwidth) {
          needsWidths = true
        }
      }

      console.log('[TableView] Needs widths:', needsWidths)
      
      if (!needsWidths) {
        console.log('[TableView] All cells already have widths, exiting')
        return
      }

      // Get the actual rendered column widths
      const cols = this.colgroup.querySelectorAll('col')
      console.log('[TableView] Found', cols.length, 'col elements')
      
      const colWidths: number[] = []

      cols.forEach((col, idx) => {
        const width = (col as HTMLElement).offsetWidth
        console.log(`[TableView] Col ${idx} offsetWidth:`, width)
        colWidths.push(width)
      })

      console.log('[TableView] Collected widths:', colWidths)

      if (colWidths.length === 0) {
        console.log('[TableView] No widths collected, exiting')
        return
      }

      // Update the cell attributes with the captured widths
      const { tr } = this.view.state
      let colIndex = 0
      let cellPos = pos + 1 // Start after the table node

      console.log('[TableView] Starting to update cell attributes')

      for (let i = 0; i < row.childCount; i += 1) {
        const cell = row.child(i)
        const { colspan } = cell.attrs

        console.log(`[TableView] Processing cell ${i}, colspan: ${colspan}, cellPos: ${cellPos}`)

        // Only update if the cell doesn't already have colwidth
        if (!cell.attrs.colwidth) {
          const cellWidths: number[] = []
          for (let j = 0; j < colspan; j += 1) {
            if (colIndex + j < colWidths.length) {
              cellWidths.push(colWidths[colIndex + j])
            }
          }

          console.log(`[TableView] Cell ${i} will get widths:`, cellWidths)

          if (cellWidths.length > 0) {
            tr.setNodeMarkup(cellPos, undefined, {
              ...cell.attrs,
              colwidth: cellWidths,
            })
          }
        }

        colIndex += colspan
        cellPos += cell.nodeSize
      }

      console.log('[TableView] Transaction docChanged:', tr.docChanged)

      if (tr.docChanged) {
        console.log('[TableView] Dispatching transaction')
        this.view.dispatch(tr)
      } else {
        console.log('[TableView] No changes to dispatch')
      }
    })
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false
    }

    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)

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
}
