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
    // Use requestAnimationFrame to ensure the browser has finished layout
    requestAnimationFrame(() => {
      if (!this.view || !this.getPos) return

      const pos = this.getPos()
      if (pos === undefined) return

      const row = this.node.firstChild
      if (!row) return

      // Check if we need to set widths (only if columns don't have widths)
      let needsWidths = false
      for (let i = 0; i < row.childCount; i += 1) {
        const cell = row.child(i)
        if (!cell.attrs.colwidth) {
          needsWidths = true
          break
        }
      }

      if (!needsWidths) return

      // Get the actual rendered column widths
      const cols = this.colgroup.querySelectorAll('col')
      const colWidths: number[] = []

      cols.forEach(col => {
        const width = (col as HTMLElement).offsetWidth
        colWidths.push(width)
      })

      if (colWidths.length === 0) return

      // Update the cell attributes with the captured widths
      const { tr } = this.view.state
      let colIndex = 0
      let cellPos = pos + 1 // Start after the table node

      for (let i = 0; i < row.childCount; i += 1) {
        const cell = row.child(i)
        const { colspan } = cell.attrs

        // Only update if the cell doesn't already have colwidth
        if (!cell.attrs.colwidth) {
          const cellWidths: number[] = []
          for (let j = 0; j < colspan; j += 1) {
            if (colIndex + j < colWidths.length) {
              cellWidths.push(colWidths[colIndex + j])
            }
          }

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

      if (tr.docChanged) {
        this.view.dispatch(tr)
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
