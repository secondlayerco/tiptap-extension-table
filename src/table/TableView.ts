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

  constructor(node: ProseMirrorNode, cellMinWidth: number = 25, view?: EditorView, getPos?: () => number | undefined) {
    console.log('[TableView] constructor called with cellMinWidth:', cellMinWidth, 'view:', !!view, 'getPos:', !!getPos)
    this.node = node
    this.cellMinWidth = cellMinWidth || 25 // Fallback to default 25
    this.view = view
    this.getPos = getPos
    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'
    this.table = this.dom.appendChild(document.createElement('table'))
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    // After the browser has laid out the table, capture the actual column widths
    this.captureColumnWidths()
  }

  /**
   * Captures the actual rendered column widths from the browser and updates the node
   * attributes. Uses a temporary removal of width constraints to let the browser
   * calculate natural widths, then captures and persists those widths.
   */
  private captureColumnWidths() {
    console.log('[TableView] captureColumnWidths called')
    
    if (!this.view || !this.getPos) {
      console.log('[TableView] Missing view or getPos:', { view: !!this.view, getPos: !!this.getPos })
      return
    }

    // Wait for initial render
    requestAnimationFrame(() => {
      console.log('[TableView] Initial render complete')
      
      if (!this.view || !this.getPos) {
        return
      }

      const pos = this.getPos()
      if (pos === undefined) {
        return
      }

      // Temporarily remove all col widths to let browser calculate
      const cols = this.colgroup.querySelectorAll('col')
      console.log('[TableView] Temporarily removing col constraints')
      
      const originalStyles: string[] = []
      cols.forEach((col, idx) => {
        originalStyles[idx] = (col as HTMLElement).style.width
        ;(col as HTMLElement).style.width = ''
        ;(col as HTMLElement).style.minWidth = ''
      })

      // Wait for browser to recalculate
      requestAnimationFrame(() => {
        console.log('[TableView] Browser recalculated, capturing widths')
        
        if (!this.view || !this.getPos) {
          return
        }

        const currentPos = this.getPos()
        if (currentPos === undefined) {
          return
        }

        // Capture the browser-calculated widths
        const colWidths: number[] = []
        cols.forEach((col, idx) => {
          const width = (col as HTMLElement).offsetWidth
          console.log(`[TableView] Col ${idx} browser-calculated offsetWidth:`, width)
          colWidths.push(width)
        })

        if (colWidths.length === 0) {
          console.log('[TableView] No widths captured')
          return
        }

        // Get the current node
        const currentNode = this.view.state.doc.nodeAt(currentPos)
        if (!currentNode || !currentNode.firstChild) {
          console.log('[TableView] Could not get current node')
          return
        }

        const row = currentNode.firstChild
        
        // Rebuild the entire table with updated cell attributes
        console.log('[TableView] Building new table structure with captured widths')
        
        const newRows: ProseMirrorNode[] = []
        
        // Iterate through all rows in the table
        currentNode.forEach((tableRow, rowOffset, rowIndex) => {
          const newCells: ProseMirrorNode[] = []
          let colIndex = 0
          
          // Iterate through cells in this row
          tableRow.forEach((cell, cellOffset, cellIndex) => {
            const { colspan } = cell.attrs
            const cellWidths: number[] = []
            
            // Get the widths for this cell's columns
            for (let j = 0; j < colspan; j += 1) {
              if (colIndex + j < colWidths.length) {
                cellWidths.push(colWidths[colIndex + j])
              }
            }
            
            console.log(`[TableView] Row ${rowIndex} Cell ${cellIndex} (colspan ${colspan}) will get widths:`, cellWidths)
            
            // Create new cell with updated colwidth
            const newAttrs = { ...cell.attrs, colwidth: cellWidths.length > 0 ? cellWidths : cell.attrs.colwidth }
            const newCell = cell.type.create(newAttrs, cell.content, cell.marks)
            newCells.push(newCell)
            
            colIndex += colspan
          })
          
          // Create new row with updated cells
          const newRow = tableRow.type.create(tableRow.attrs, newCells, tableRow.marks)
          newRows.push(newRow)
        })
        
        // Create new table with updated rows
        const newTable = currentNode.type.create(currentNode.attrs, newRows, currentNode.marks)
        
        console.log('[TableView] Replacing table node')
        const tr = this.view.state.tr.replaceWith(currentPos, currentPos + currentNode.nodeSize, newTable)
        
        console.log('[TableView] Transaction has', tr.steps.length, 'steps, docChanged:', tr.docChanged)

        if (tr.docChanged) {
          console.log('[TableView] Dispatching transaction')
          this.view.dispatch(tr)
          
          // Force update after transaction
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
              console.log('[TableView] Forcing colgroup update with final node')
              console.log('[TableView] Final node cells:', finalNode.firstChild?.childCount)
              finalNode.firstChild?.forEach((cell, idx) => {
                console.log(`[TableView] Final cell ${idx} colwidth:`, cell.attrs.colwidth)
              })
              
              this.node = finalNode
              updateColumns(finalNode, this.colgroup, this.table, this.cellMinWidth)
              
              const finalCols = this.colgroup.querySelectorAll('col')
              finalCols.forEach((col, idx) => {
                console.log(`[TableView] Final col ${idx} style.width:`, (col as HTMLElement).style.width)
              })
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

    console.log('[TableView] update() called, this.cellMinWidth:', this.cellMinWidth)
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
