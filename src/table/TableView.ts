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
   * attributes. First clears any existing colwidth attributes to let the browser
   * calculate natural widths, then captures and persists those widths.
   */
  private captureColumnWidths() {
    console.log('[TableView] captureColumnWidths called')
    
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

    // STEP 1: Clear all existing colwidth attributes to let browser decide
    const { tr } = this.view.state
    let cellPos = pos + 2 // First cell position

    console.log('[TableView] STEP 1: Clearing all colwidth attributes')
    for (let i = 0; i < row.childCount; i += 1) {
      const cell = row.child(i)
      const currentColwidth = cell.attrs.colwidth
      
      console.log(`[TableView] Cell ${i} current colwidth:`, currentColwidth)
      
      // Clear colwidth if it exists
      if (currentColwidth) {
        tr.setNodeMarkup(cellPos, undefined, {
          ...cell.attrs,
          colwidth: null,
        })
        console.log(`[TableView] Cleared colwidth for cell ${i}`)
      }
      
      cellPos += cell.nodeSize
    }

    if (tr.docChanged) {
      console.log('[TableView] Dispatching transaction to clear colwidths')
      this.view.dispatch(tr)
      console.log('[TableView] Colwidths cleared, waiting for browser layout')
    }

    // STEP 2: Wait for browser to re-layout, then capture widths
    requestAnimationFrame(() => {
      console.log('[TableView] STEP 2: Browser layout complete, capturing widths')
      
      if (!this.view || !this.getPos) {
        console.log('[TableView] View or getPos lost after clearing')
        return
      }

      const currentPos = this.getPos()
      if (currentPos === undefined) {
        console.log('[TableView] Position undefined after clearing')
        return
      }

      // Get the updated node after clearing
      const updatedNode = this.view.state.doc.nodeAt(currentPos)
      if (!updatedNode) {
        console.log('[TableView] Could not get updated node')
        return
      }

      const updatedRow = updatedNode.firstChild
      if (!updatedRow) {
        console.log('[TableView] No first row in updated node')
        return
      }

      // Get the actual rendered column widths from DOM
      const cols = this.colgroup.querySelectorAll('col')
      console.log('[TableView] Found', cols.length, 'col elements')
      
      const colWidths: number[] = []
      cols.forEach((col, idx) => {
        const width = (col as HTMLElement).offsetWidth
        console.log(`[TableView] Col ${idx} offsetWidth:`, width)
        colWidths.push(width)
      })

      console.log('[TableView] Collected browser-calculated widths:', colWidths)

      if (colWidths.length === 0) {
        console.log('[TableView] No widths collected, exiting')
        return
      }

      // STEP 3: Set the captured widths on all cells
      const { tr: setTr } = this.view.state
      let colIndex = 0
      let setCellPos = currentPos + 2

      console.log('[TableView] STEP 3: Setting captured widths on cells')

      for (let i = 0; i < updatedRow.childCount; i += 1) {
        const cell = updatedRow.child(i)
        const { colspan } = cell.attrs

        console.log(`[TableView] Setting widths for cell ${i}, colspan: ${colspan}, cellPos: ${setCellPos}`)

        const cellWidths: number[] = []
        for (let j = 0; j < colspan; j += 1) {
          if (colIndex + j < colWidths.length) {
            cellWidths.push(colWidths[colIndex + j])
          }
        }

        console.log(`[TableView] Cell ${i} will get widths:`, cellWidths)

        if (cellWidths.length > 0) {
          setTr.setNodeMarkup(setCellPos, undefined, {
            ...cell.attrs,
            colwidth: cellWidths,
          })
        }

        colIndex += colspan
        setCellPos += cell.nodeSize
      }

      console.log('[TableView] Set transaction docChanged:', setTr.docChanged)
      console.log('[TableView] Set transaction steps:', setTr.steps.length)

      if (setTr.docChanged) {
        console.log('[TableView] Dispatching transaction to set widths')
        this.view.dispatch(setTr)
        console.log('[TableView] Widths set, waiting for final update')
        
        // STEP 4: Force final colgroup update
        setTimeout(() => {
          if (!this.view || !this.getPos) {
            console.log('[TableView] View or getPos lost after setting widths')
            return
          }
          
          const finalPos = this.getPos()
          if (finalPos === undefined) {
            console.log('[TableView] Position undefined after setting widths')
            return
          }
          
          const finalNode = this.view.state.doc.nodeAt(finalPos)
          if (finalNode) {
            console.log('[TableView] STEP 4: Forcing final colgroup update')
            console.log('[TableView] Final node first cell colwidth:', finalNode.firstChild?.child(0).attrs.colwidth)
            this.node = finalNode
            updateColumns(finalNode, this.colgroup, this.table, this.cellMinWidth)
            console.log('[TableView] Final colgroup update complete')
            
            // Log final DOM state
            const finalCols = this.colgroup.querySelectorAll('col')
            finalCols.forEach((col, idx) => {
              console.log(`[TableView] Final - Col ${idx} style.width:`, (col as HTMLElement).style.width)
            })
          }
        }, 100)
      } else {
        console.log('[TableView] No width changes to dispatch')
      }
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
