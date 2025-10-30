// src/cell/table-cell.ts
import { mergeAttributes, Node } from "@tiptap/core";
var TableCell = Node.create({
  name: "tableCell",
  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },
  content: "block+",
  addAttributes() {
    return {
      colspan: {
        default: 1
      },
      rowspan: {
        default: 1
      },
      colwidth: {
        default: null,
        parseHTML: (element) => {
          const colwidth = element.getAttribute("colwidth");
          const value = colwidth ? colwidth.split(",").map((width) => parseInt(width, 10)) : null;
          if (!value) {
            const cols = element.closest("table")?.querySelectorAll("colgroup > col");
            const cellIndex = Array.from(element.parentElement?.children || []).indexOf(element);
            if (cellIndex && cellIndex > -1 && cols && cols[cellIndex]) {
              const colWidth = cols[cellIndex].getAttribute("width");
              return colWidth ? [parseInt(colWidth, 10)] : null;
            }
          }
          return value;
        }
      },
      rowheight: {
        default: null,
        parseHTML: (element) => {
          const rowheight = element.getAttribute("rowheight");
          const value = rowheight ? rowheight.split(",").map((height) => parseInt(height, 10)) : null;
          return value;
        }
      }
    };
  },
  tableRole: "cell",
  isolating: true,
  parseHTML() {
    return [{ tag: "td" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["td", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});
export {
  TableCell
};
//# sourceMappingURL=index.js.map