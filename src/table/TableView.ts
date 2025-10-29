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

  constructor(node: ProseMirrorNode, cellMinWidth: number = 25, view?: EditorView, getPos?: () => number | undefined) {
    this.node = node
    this.cellMinWidth = cellMinWidth || 25
    this.view = view
    this.getPos = getPos
    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'
    this.table = this.dom.appendChild(document.createElement('table'))
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    this.captureColumnWidths()
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
