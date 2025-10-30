// src/row/table-row.ts
import { mergeAttributes, Node } from "@tiptap/core";
var TableRow = Node.create({
  name: "tableRow",
  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },
  content: "(tableCell | tableHeader)*",
  addAttributes() {
    return {
      rowheight: {
        default: null,
        parseHTML: (element) => {
          const rowheight = element.getAttribute("rowheight");
          const value = rowheight ? parseInt(rowheight, 10) : null;
          return value;
        },
        renderHTML: (attributes) => {
          if (!attributes.rowheight) {
            return {};
          }
          return {
            rowheight: attributes.rowheight
          };
        }
      }
    };
  },
  tableRole: "row",
  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["tr", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});
export {
  TableRow
};
//# sourceMappingURL=index.js.map