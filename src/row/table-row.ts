import '../types.js'

import { mergeAttributes, Node } from '@tiptap/core'

export interface TableRowOptions {
  /**
   * The HTML attributes for a table row node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>
}

/**
 * This extension allows you to create table rows.
 * @see https://www.tiptap.dev/api/nodes/table-row
 */
export const TableRow = Node.create<TableRowOptions>({
  name: 'tableRow',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: '(tableCell | tableHeader)*',

  addAttributes() {
    return {
      rowheight: {
        default: null,
        parseHTML: element => {
          const rowheight = element.getAttribute('rowheight')
          const value = rowheight ? parseInt(rowheight, 10) : null

          return value
        },
        renderHTML: attributes => {
          if (!attributes.rowheight) {
            return {}
          }

          return {
            rowheight: attributes.rowheight,
          }
        },
      },
    }
  },

  tableRole: 'row',

  parseHTML() {
    return [{ tag: 'tr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
})
