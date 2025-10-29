"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/kit/index.ts
var index_exports = {};
__export(index_exports, {
  TableKit: () => TableKit
});
module.exports = __toCommonJS(index_exports);
var import_core6 = require("@tiptap/core");

// src/cell/table-cell.ts
var import_core = require("@tiptap/core");
var TableCell = import_core.Node.create({
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
      }
    };
  },
  tableRole: "cell",
  isolating: true,
  parseHTML() {
    return [{ tag: "td" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["td", (0, import_core.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});

// src/header/table-header.ts
var import_core2 = require("@tiptap/core");
var TableHeader = import_core2.Node.create({
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
      }
    };
  },
  tableRole: "header_cell",
  isolating: true,
  parseHTML() {
    return [{ tag: "th" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["th", (0, import_core2.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});

// src/row/table-row.ts
var import_core3 = require("@tiptap/core");
var TableRow = import_core3.Node.create({
  name: "tableRow",
  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },
  content: "(tableCell | tableHeader)*",
  tableRole: "row",
  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["tr", (0, import_core3.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});

// src/table/table.ts
var import_core5 = require("@tiptap/core");
var import_state = require("@tiptap/pm/state");
var import_tables2 = require("@tiptap/pm/tables");

// src/table/utilities/colStyle.ts
function getColStyleDeclaration(minWidth, width) {
  if (width) {
    return ["width", `${Math.max(width, minWidth)}px`];
  }
  return ["min-width", `${minWidth}px`];
}

// src/table/TableView.ts
function updateColumns(node, colgroup, table, cellMinWidth, overrideCol, overrideValue) {
  let totalWidth = 0;
  let fixedWidth = true;
  let nextDOM = colgroup.firstChild;
  const row = node.firstChild;
  if (row !== null) {
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs;
      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth = overrideCol === col ? overrideValue : colwidth && colwidth[j];
        const cssWidth = hasWidth ? `${hasWidth}px` : "";
        totalWidth += hasWidth || cellMinWidth;
        if (!hasWidth) {
          fixedWidth = false;
        }
        if (!nextDOM) {
          const colElement = document.createElement("col");
          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth);
          colElement.style.setProperty(propertyKey, propertyValue);
          colgroup.appendChild(colElement);
        } else {
          if (nextDOM.style.width !== cssWidth) {
            const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth);
            nextDOM.style.setProperty(propertyKey, propertyValue);
          }
          nextDOM = nextDOM.nextSibling;
        }
      }
    }
  }
  while (nextDOM) {
    const after = nextDOM.nextSibling;
    nextDOM.parentNode?.removeChild(nextDOM);
    nextDOM = after;
  }
  if (fixedWidth) {
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = "";
  } else {
    table.style.width = "";
    table.style.minWidth = `${totalWidth}px`;
  }
}
var TableView = class {
  constructor(node, cellMinWidth, view, getPos) {
    console.log("[ERWAN] TableView", node);
    this.node = node;
    this.cellMinWidth = cellMinWidth;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("div");
    this.dom.className = "tableWrapper";
    this.table = this.dom.appendChild(document.createElement("table"));
    this.colgroup = this.table.appendChild(document.createElement("colgroup"));
    updateColumns(node, this.colgroup, this.table, cellMinWidth);
    this.contentDOM = this.table.appendChild(document.createElement("tbody"));
    this.captureColumnWidths();
  }
  /**
   * Captures the actual rendered column widths from the browser and updates the node
   * attributes if columns don't already have explicit widths set.
   */
  captureColumnWidths() {
    console.log("[TableView] captureColumnWidths called");
    requestAnimationFrame(() => {
      console.log("[TableView] requestAnimationFrame callback executing");
      if (!this.view || !this.getPos) {
        console.log("[TableView] Missing view or getPos:", { view: !!this.view, getPos: !!this.getPos });
        return;
      }
      const pos = this.getPos();
      console.log("[TableView] Table position:", pos);
      if (pos === void 0) {
        console.log("[TableView] Position is undefined, exiting");
        return;
      }
      const row = this.node.firstChild;
      if (!row) {
        console.log("[TableView] No first row found");
        return;
      }
      console.log("[TableView] First row has", row.childCount, "cells");
      let needsWidths = false;
      for (let i = 0; i < row.childCount; i += 1) {
        const cell = row.child(i);
        console.log(`[TableView] Cell ${i} colwidth:`, cell.attrs.colwidth);
        if (!cell.attrs.colwidth) {
          needsWidths = true;
        }
      }
      console.log("[TableView] Needs widths:", needsWidths);
      if (!needsWidths) {
        console.log("[TableView] All cells already have widths, exiting");
        return;
      }
      const cols = this.colgroup.querySelectorAll("col");
      console.log("[TableView] Found", cols.length, "col elements");
      const colWidths = [];
      cols.forEach((col, idx) => {
        const width = col.offsetWidth;
        console.log(`[TableView] Col ${idx} offsetWidth:`, width);
        colWidths.push(width);
      });
      console.log("[TableView] Collected widths:", colWidths);
      if (colWidths.length === 0) {
        console.log("[TableView] No widths collected, exiting");
        return;
      }
      const { tr } = this.view.state;
      let colIndex = 0;
      let cellPos = pos + 1;
      console.log("[TableView] Starting to update cell attributes");
      for (let i = 0; i < row.childCount; i += 1) {
        const cell = row.child(i);
        const { colspan } = cell.attrs;
        console.log(`[TableView] Processing cell ${i}, colspan: ${colspan}, cellPos: ${cellPos}`);
        const cellWidths = [];
        for (let j = 0; j < colspan; j += 1) {
          if (colIndex + j < colWidths.length) {
            cellWidths.push(colWidths[colIndex + j]);
          }
        }
        console.log(`[TableView] Cell ${i} will get widths:`, cellWidths);
        if (cellWidths.length > 0) {
          tr.setNodeMarkup(cellPos, void 0, {
            ...cell.attrs,
            colwidth: cellWidths
          });
        }
        colIndex += colspan;
        cellPos += cell.nodeSize;
      }
      console.log("[TableView] Transaction docChanged:", tr.docChanged);
      console.log("[TableView] Transaction steps:", tr.steps.length);
      if (tr.docChanged) {
        console.log("[TableView] Dispatching transaction");
        this.view.dispatch(tr);
        console.log("[TableView] Transaction dispatched");
        setTimeout(() => {
          if (!this.view || !this.getPos) {
            console.log("[TableView] View or getPos lost after dispatch");
            return;
          }
          const currentPos = this.getPos();
          console.log("[TableView] Current position after dispatch:", currentPos);
          if (currentPos === void 0) {
            console.log("[TableView] Position undefined after dispatch");
            return;
          }
          console.log("[TableView] Forcing colgroup update after transaction");
          const updatedNode = this.view.state.doc.nodeAt(currentPos);
          if (updatedNode) {
            console.log("[TableView] Got updated node from document");
            console.log("[TableView] Updated node first child colwidth:", updatedNode.firstChild?.child(0).attrs.colwidth);
            this.node = updatedNode;
            updateColumns(updatedNode, this.colgroup, this.table, this.cellMinWidth);
            console.log("[TableView] Colgroup columns updated with updateColumns");
            const cols2 = this.colgroup.querySelectorAll("col");
            cols2.forEach((col, idx) => {
              console.log(`[TableView] After update - Col ${idx} style.width:`, col.style.width);
            });
          } else {
            console.log("[TableView] Could not get updated node from document");
          }
        }, 100);
      } else {
        console.log("[TableView] No changes to dispatch");
      }
    });
  }
  update(node) {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth);
    return true;
  }
  ignoreMutation(mutation) {
    const target = mutation.target;
    const isInsideWrapper = this.dom.contains(target);
    const isInsideContent = this.contentDOM.contains(target);
    if (isInsideWrapper && !isInsideContent) {
      if (mutation.type === "attributes" || mutation.type === "childList" || mutation.type === "characterData") {
        return true;
      }
    }
    return false;
  }
};

// src/table/utilities/createColGroup.ts
function createColGroup(node, cellMinWidth, overrideCol, overrideValue) {
  let totalWidth = 0;
  let fixedWidth = true;
  const cols = [];
  const row = node.firstChild;
  if (!row) {
    return {};
  }
  for (let i = 0, col = 0; i < row.childCount; i += 1) {
    const { colspan, colwidth } = row.child(i).attrs;
    for (let j = 0; j < colspan; j += 1, col += 1) {
      const hasWidth = overrideCol === col ? overrideValue : colwidth && colwidth[j];
      totalWidth += hasWidth || cellMinWidth;
      if (!hasWidth) {
        fixedWidth = false;
      }
      const [property, value] = getColStyleDeclaration(cellMinWidth, hasWidth);
      cols.push(["col", { style: `${property}: ${value}` }]);
    }
  }
  const tableWidth = fixedWidth ? `${totalWidth}px` : "";
  const tableMinWidth = fixedWidth ? "" : `${totalWidth}px`;
  const colgroup = ["colgroup", {}, ...cols];
  return { colgroup, tableWidth, tableMinWidth };
}

// src/table/utilities/createCell.ts
function createCell(cellType, cellContent) {
  if (cellContent) {
    return cellType.createChecked(null, cellContent);
  }
  return cellType.createAndFill();
}

// src/table/utilities/getTableNodeTypes.ts
function getTableNodeTypes(schema) {
  if (schema.cached.tableNodeTypes) {
    return schema.cached.tableNodeTypes;
  }
  const roles = {};
  Object.keys(schema.nodes).forEach((type) => {
    const nodeType = schema.nodes[type];
    if (nodeType.spec.tableRole) {
      roles[nodeType.spec.tableRole] = nodeType;
    }
  });
  schema.cached.tableNodeTypes = roles;
  return roles;
}

// src/table/utilities/createTable.ts
function createTable(schema, rowsCount, colsCount, withHeaderRow, cellContent) {
  const types = getTableNodeTypes(schema);
  const headerCells = [];
  const cells = [];
  for (let index = 0; index < colsCount; index += 1) {
    const cell = createCell(types.cell, cellContent);
    if (cell) {
      cells.push(cell);
    }
    if (withHeaderRow) {
      const headerCell = createCell(types.header_cell, cellContent);
      if (headerCell) {
        headerCells.push(headerCell);
      }
    }
  }
  const rows = [];
  for (let index = 0; index < rowsCount; index += 1) {
    rows.push(types.row.createChecked(null, withHeaderRow && index === 0 ? headerCells : cells));
  }
  return types.table.createChecked(null, rows);
}

// src/table/utilities/deleteTableWhenAllCellsSelected.ts
var import_core4 = require("@tiptap/core");

// src/table/utilities/isCellSelection.ts
var import_tables = require("@tiptap/pm/tables");
function isCellSelection(value) {
  return value instanceof import_tables.CellSelection;
}

// src/table/utilities/deleteTableWhenAllCellsSelected.ts
var deleteTableWhenAllCellsSelected = ({ editor }) => {
  const { selection } = editor.state;
  if (!isCellSelection(selection)) {
    return false;
  }
  let cellCount = 0;
  const table = (0, import_core4.findParentNodeClosestToPos)(selection.ranges[0].$from, (node) => {
    return node.type.name === "table";
  });
  table?.node.descendants((node) => {
    if (node.type.name === "table") {
      return false;
    }
    if (["tableCell", "tableHeader"].includes(node.type.name)) {
      cellCount += 1;
    }
  });
  const allCellsSelected = cellCount === selection.ranges.length;
  if (!allCellsSelected) {
    return false;
  }
  editor.commands.deleteTable();
  return true;
};

// src/table/utilities/markdown.ts
var DEFAULT_CELL_LINE_SEPARATOR = "";
function collapseWhitespace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}
function renderTableToMarkdown(node, h, options = {}) {
  const cellSep = options.cellLineSeparator ?? DEFAULT_CELL_LINE_SEPARATOR;
  if (!node || !node.content || node.content.length === 0) {
    return "";
  }
  const rows = [];
  node.content.forEach((rowNode) => {
    const cells = [];
    if (rowNode.content) {
      rowNode.content.forEach((cellNode) => {
        let raw = "";
        if (cellNode.content && Array.isArray(cellNode.content) && cellNode.content.length > 1) {
          const parts = cellNode.content.map((child) => h.renderChildren(child));
          raw = parts.join(cellSep);
        } else {
          raw = cellNode.content ? h.renderChildren(cellNode.content) : "";
        }
        const text = collapseWhitespace(raw);
        const isHeader = cellNode.type === "tableHeader";
        cells.push({ text, isHeader });
      });
    }
    rows.push(cells);
  });
  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  if (columnCount === 0) {
    return "";
  }
  const colWidths = new Array(columnCount).fill(0);
  rows.forEach((r) => {
    for (let i = 0; i < columnCount; i += 1) {
      const cell = r[i]?.text || "";
      const len = cell.length;
      if (len > colWidths[i]) {
        colWidths[i] = len;
      }
      if (colWidths[i] < 3) {
        colWidths[i] = 3;
      }
    }
  });
  const pad = (s, width) => s + " ".repeat(Math.max(0, width - s.length));
  const headerRow = rows[0];
  const hasHeader = headerRow.some((c) => c.isHeader);
  let out = "\n";
  const headerTexts = new Array(columnCount).fill(0).map((_, i) => hasHeader ? headerRow[i] && headerRow[i].text || "" : "");
  out += `| ${headerTexts.map((t, i) => pad(t, colWidths[i])).join(" | ")} |
`;
  out += `| ${colWidths.map((w) => "-".repeat(Math.max(3, w))).join(" | ")} |
`;
  const body = hasHeader ? rows.slice(1) : rows;
  body.forEach((r) => {
    out += `| ${new Array(columnCount).fill(0).map((_, i) => pad(r[i] && r[i].text || "", colWidths[i])).join(" | ")} |
`;
  });
  return out;
}
var markdown_default = renderTableToMarkdown;

// src/table/table.ts
var Table = import_core5.Node.create({
  name: "table",
  // @ts-ignore
  addOptions() {
    return {
      HTMLAttributes: {},
      resizable: false,
      handleWidth: 5,
      cellMinWidth: 25,
      // TODO: fix
      View: TableView,
      lastColumnResizable: true,
      allowTableNodeSelection: false
    };
  },
  content: "tableRow+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseHTML() {
    return [{ tag: "table" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    console.log("[ERWAN] renderHTML", node);
    const { colgroup, tableWidth, tableMinWidth } = createColGroup(node, this.options.cellMinWidth);
    const table = [
      "table",
      (0, import_core5.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes, {
        style: tableWidth ? `width: ${tableWidth}` : `min-width: ${tableMinWidth}`
      }),
      colgroup,
      ["tbody", 0]
    ];
    return table;
  },
  parseMarkdown: (token, h) => {
    const rows = [];
    if (token.header) {
      const headerCells = [];
      token.header.forEach((cell) => {
        headerCells.push(h.createNode("tableHeader", {}, [{ type: "paragraph", content: h.parseInline(cell.tokens) }]));
      });
      rows.push(h.createNode("tableRow", {}, headerCells));
    }
    if (token.rows) {
      token.rows.forEach((row) => {
        const bodyCells = [];
        row.forEach((cell) => {
          bodyCells.push(h.createNode("tableCell", {}, [{ type: "paragraph", content: h.parseInline(cell.tokens) }]));
        });
        rows.push(h.createNode("tableRow", {}, bodyCells));
      });
    }
    return h.createNode("table", void 0, rows);
  },
  renderMarkdown: (node, h) => {
    return markdown_default(node, h);
  },
  addCommands() {
    return {
      insertTable: ({ rows = 3, cols = 3, withHeaderRow = true } = {}) => ({ tr, dispatch, editor }) => {
        const node = createTable(editor.schema, rows, cols, withHeaderRow);
        if (dispatch) {
          const offset = tr.selection.from + 1;
          tr.replaceSelectionWith(node).scrollIntoView().setSelection(import_state.TextSelection.near(tr.doc.resolve(offset)));
        }
        return true;
      },
      addColumnBefore: () => ({ state, dispatch }) => {
        return (0, import_tables2.addColumnBefore)(state, dispatch);
      },
      addColumnAfter: () => ({ state, dispatch }) => {
        return (0, import_tables2.addColumnAfter)(state, dispatch);
      },
      deleteColumn: () => ({ state, dispatch }) => {
        return (0, import_tables2.deleteColumn)(state, dispatch);
      },
      addRowBefore: () => ({ state, dispatch }) => {
        return (0, import_tables2.addRowBefore)(state, dispatch);
      },
      addRowAfter: () => ({ state, dispatch }) => {
        return (0, import_tables2.addRowAfter)(state, dispatch);
      },
      deleteRow: () => ({ state, dispatch }) => {
        return (0, import_tables2.deleteRow)(state, dispatch);
      },
      deleteTable: () => ({ state, dispatch }) => {
        return (0, import_tables2.deleteTable)(state, dispatch);
      },
      mergeCells: () => ({ state, dispatch }) => {
        return (0, import_tables2.mergeCells)(state, dispatch);
      },
      splitCell: () => ({ state, dispatch }) => {
        return (0, import_tables2.splitCell)(state, dispatch);
      },
      toggleHeaderColumn: () => ({ state, dispatch }) => {
        return (0, import_tables2.toggleHeader)("column")(state, dispatch);
      },
      toggleHeaderRow: () => ({ state, dispatch }) => {
        return (0, import_tables2.toggleHeader)("row")(state, dispatch);
      },
      toggleHeaderCell: () => ({ state, dispatch }) => {
        return (0, import_tables2.toggleHeaderCell)(state, dispatch);
      },
      mergeOrSplit: () => ({ state, dispatch }) => {
        if ((0, import_tables2.mergeCells)(state, dispatch)) {
          return true;
        }
        return (0, import_tables2.splitCell)(state, dispatch);
      },
      setCellAttribute: (name, value) => ({ state, dispatch }) => {
        return (0, import_tables2.setCellAttr)(name, value)(state, dispatch);
      },
      goToNextCell: () => ({ state, dispatch }) => {
        return (0, import_tables2.goToNextCell)(1)(state, dispatch);
      },
      goToPreviousCell: () => ({ state, dispatch }) => {
        return (0, import_tables2.goToNextCell)(-1)(state, dispatch);
      },
      fixTables: () => ({ state, dispatch }) => {
        if (dispatch) {
          (0, import_tables2.fixTables)(state);
        }
        return true;
      },
      setCellSelection: (position) => ({ tr, dispatch }) => {
        if (dispatch) {
          const selection = import_tables2.CellSelection.create(tr.doc, position.anchorCell, position.headCell);
          tr.setSelection(selection);
        }
        return true;
      }
    };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.commands.goToNextCell()) {
          return true;
        }
        if (!this.editor.can().addRowAfter()) {
          return false;
        }
        return this.editor.chain().addRowAfter().goToNextCell().run();
      },
      "Shift-Tab": () => this.editor.commands.goToPreviousCell(),
      Backspace: deleteTableWhenAllCellsSelected,
      "Mod-Backspace": deleteTableWhenAllCellsSelected,
      Delete: deleteTableWhenAllCellsSelected,
      "Mod-Delete": deleteTableWhenAllCellsSelected
    };
  },
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable && this.editor.isEditable;
    return [
      ...isResizable ? [
        (0, import_tables2.columnResizing)({
          handleWidth: this.options.handleWidth,
          cellMinWidth: this.options.cellMinWidth,
          defaultCellMinWidth: this.options.cellMinWidth,
          View: this.options.View,
          lastColumnResizable: this.options.lastColumnResizable
        })
      ] : [],
      (0, import_tables2.tableEditing)({
        allowTableNodeSelection: this.options.allowTableNodeSelection
      })
    ];
  },
  extendNodeSchema(extension) {
    const context = {
      name: extension.name,
      options: extension.options,
      storage: extension.storage
    };
    return {
      tableRole: (0, import_core5.callOrReturn)((0, import_core5.getExtensionField)(extension, "tableRole", context))
    };
  }
});

// src/kit/index.ts
var TableKit = import_core6.Extension.create({
  name: "tableKit",
  addExtensions() {
    const extensions = [];
    if (this.options.table !== false) {
      extensions.push(Table.configure(this.options.table));
    }
    if (this.options.tableCell !== false) {
      extensions.push(TableCell.configure(this.options.tableCell));
    }
    if (this.options.tableHeader !== false) {
      extensions.push(TableHeader.configure(this.options.tableHeader));
    }
    if (this.options.tableRow !== false) {
      extensions.push(TableRow.configure(this.options.tableRow));
    }
    return extensions;
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TableKit
});
//# sourceMappingURL=index.cjs.map