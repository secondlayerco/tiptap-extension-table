// src/header/table-header.ts
import { mergeAttributes, Node } from "@tiptap/core";
var TableHeader = Node.create({
  name: "tableHeader",
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
          return value;
        }
      },
      rowheight: {
        default: null,
        parseHTML: (element) => {
          const rowheight = element.getAttribute("rowheight");
          const value = rowheight ? rowheight.split(",").map((height) => parseInt(height, 10)) : null;
          return value;
        },
        renderHTML: (attributes) => {
          if (!attributes.rowheight) {
            return {};
          }
          return {
            rowheight: attributes.rowheight.join(",")
          };
        }
      }
    };
  },
  tableRole: "header_cell",
  isolating: true,
  parseHTML() {
    return [{ tag: "th" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["th", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});
export {
  TableHeader
};
//# sourceMappingURL=index.js.map