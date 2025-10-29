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
  console.log('[TableView] updateColumns called with cellMinWidth:', cellMinWidth, 'type:', typeof cellMinWidth)
  let totalWidth = 0
  let fixedWidth = true
  let nextDOM = colgroup.firstChild
  const row = node.firstChild

  if (row !== null) {
    console.log('[TableView] updateColumns - Row has', row.childCount, 'cells')
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs
      console.log(`[TableView] updateColumns - Cell ${i} colwidth:`, colwidth)

      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth = overrideCol === col ? overrideValue : ((colwidth && colwidth[j]) as number | undefined)
        const cssWidth = hasWidth ? `${hasWidth}px` : ''

        console.log(`[TableView] updateColumns - Col ${col}: hasWidth=${hasWidth}, cssWidth=${cssWidth}`)

        totalWidth += hasWidth || cellMinWidth

        if (!hasWidth) {
          fixedWidth = false
        }

        if (!nextDOM) {
          console.log(`[TableView] updateColumns - Creating new col element for col ${col}`)
          const colElement = document.createElement('col')

          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth)
          console.log(`[TableView] updateColumns - Setting ${propertyKey}: ${propertyValue}`)

          colElement.style.setProperty(propertyKey, propertyValue)

          colgroup.appendChild(colElement)
        } else {
          const currentWidth = (nextDOM as HTMLTableColElement).style.width
          console.log(`[TableView] updateColumns - Col ${col} current width: "${currentWidth}", target: "${cssWidth}"`)
          
          if ((nextDOM as HTMLTableColElement).style.width !== cssWidth) {
            const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth)
            console.log(`[TableView] updateColumns - Updating col ${col} with ${propertyKey}: ${propertyValue}`)

            ;(nextDOM as HTMLTableColElement).style.setProperty(propertyKey, propertyValue)
          } else {
            console.log(`[TableView] updateColumns - Col ${col} already has correct width, skipping`)
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
      // Position calculation: table node starts at pos, first row at pos+1, first cell at pos+2
      let cellPos = pos + 2

      console.log('[TableView] Starting to update cell attributes, initial cellPos:', cellPos)

      for (let i = 0; i < row.childCount; i += 1) {
        const cell = row.child(i)
        const { colspan } = cell.attrs

        console.log(`[TableView] Processing cell ${i}, colspan: ${colspan}, cellPos: ${cellPos}`)

        // Update ALL cells with actual widths when we detect the table needs adjustment
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

        colIndex += colspan
        cellPos += cell.nodeSize
      }

      console.log('[TableView] Transaction docChanged:', tr.docChanged)
      console.log('[TableView] Transaction steps:', tr.steps.length)

      if (tr.docChanged) {
        console.log('[TableView] Dispatching transaction')
        this.view.dispatch(tr)
        console.log('[TableView] Transaction dispatched')
        
        // Wait a bit longer to ensure the transaction has been applied
        setTimeout(() => {
          if (!this.view || !this.getPos) {
            console.log('[TableView] View or getPos lost after dispatch')
            return
          }
          
          const currentPos = this.getPos()
          console.log('[TableView] Current position after dispatch:', currentPos)
          
          if (currentPos === undefined) {
            console.log('[TableView] Position undefined after dispatch')
            return
          }
          
          console.log('[TableView] Forcing colgroup update after transaction')
          // Get the updated node from the document
          const updatedNode = this.view.state.doc.nodeAt(currentPos)
          if (updatedNode) {
            console.log('[TableView] Got updated node from document')
            console.log('[TableView] Updated node first child colwidth:', updatedNode.firstChild?.child(0).attrs.colwidth)
            this.node = updatedNode
            updateColumns(updatedNode, this.colgroup, this.table, this.cellMinWidth)
            console.log('[TableView] Colgroup columns updated with updateColumns')
            
            // Also log the actual DOM state
            const cols = this.colgroup.querySelectorAll('col')
            cols.forEach((col, idx) => {
              console.log(`[TableView] After update - Col ${idx} style.width:`, (col as HTMLElement).style.width)
            })
          } else {
            console.log('[TableView] Could not get updated node from document')
          }
        }, 100)
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
