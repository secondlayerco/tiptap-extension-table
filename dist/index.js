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

// src/header/table-header.ts
import { mergeAttributes as mergeAttributes2, Node as Node2 } from "@tiptap/core";
var TableHeader = Node2.create({
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
    return ["th", mergeAttributes2(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});

// src/kit/index.ts
import { Extension } from "@tiptap/core";

// src/row/table-row.ts
import { mergeAttributes as mergeAttributes3, Node as Node3 } from "@tiptap/core";
var TableRow = Node3.create({
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
    return ["tr", mergeAttributes3(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});

// src/table/table.ts
import {
  callOrReturn,
  getExtensionField,
  mergeAttributes as mergeAttributes4,
  Node as Node4
} from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection as CellSelection2,
  columnResizing,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  mergeCells,
  setCellAttr,
  splitCell,
  tableEditing,
  toggleHeader,
  toggleHeaderCell
} from "@tiptap/pm/tables";

// src/table/utilities/colStyle.ts
function getColStyleDeclaration(minWidth, width) {
  if (width) {
    return ["width", `${Math.max(width, minWidth)}px`];
  }
  return ["min-width", `${minWidth}px`];
}

// src/table/TableView.ts
function updateColumns(node, colgroup, table, cellMinWidth, overrideCol, overrideValue) {
  console.log("[TableView] updateColumns called with cellMinWidth:", cellMinWidth, "type:", typeof cellMinWidth);
  let totalWidth = 0;
  let fixedWidth = true;
  let nextDOM = colgroup.firstChild;
  const row = node.firstChild;
  if (row !== null) {
    console.log("[TableView] updateColumns - Row has", row.childCount, "cells");
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs;
      console.log(`[TableView] updateColumns - Cell ${i} colwidth:`, colwidth);
      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth = overrideCol === col ? overrideValue : colwidth && colwidth[j];
        const cssWidth = hasWidth ? `${hasWidth}px` : "";
        console.log(`[TableView] updateColumns - Col ${col}: hasWidth=${hasWidth}, cssWidth=${cssWidth}`);
        totalWidth += hasWidth || cellMinWidth;
        if (!hasWidth) {
          fixedWidth = false;
        }
        if (!nextDOM) {
          console.log(`[TableView] updateColumns - Creating new col element for col ${col}`);
          const colElement = document.createElement("col");
          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth);
          console.log(`[TableView] updateColumns - Setting ${propertyKey}: ${propertyValue}`);
          colElement.style.setProperty(propertyKey, propertyValue);
          colgroup.appendChild(colElement);
        } else {
          const currentWidth = nextDOM.style.width;
          console.log(`[TableView] updateColumns - Col ${col} current width: "${currentWidth}", target: "${cssWidth}"`);
          if (nextDOM.style.width !== cssWidth) {
            const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth);
            console.log(`[TableView] updateColumns - Updating col ${col} with ${propertyKey}: ${propertyValue}`);
            nextDOM.style.setProperty(propertyKey, propertyValue);
          } else {
            console.log(`[TableView] updateColumns - Col ${col} already has correct width, skipping`);
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
  constructor(node, cellMinWidth = 25, view, getPos) {
    console.log("[TableView] constructor called with cellMinWidth:", cellMinWidth, "view:", !!view, "getPos:", !!getPos);
    this.node = node;
    this.cellMinWidth = cellMinWidth || 25;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("div");
    this.dom.className = "tableWrapper";
    this.table = this.dom.appendChild(document.createElement("table"));
    this.colgroup = this.table.appendChild(document.createElement("colgroup"));
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth);
    this.contentDOM = this.table.appendChild(document.createElement("tbody"));
    this.captureColumnWidths();
  }
  /**
   * Captures the actual rendered column widths from the browser and updates the node
   * attributes. Uses a temporary removal of width constraints to let the browser
   * calculate natural widths, then captures and persists those widths.
   */
  captureColumnWidths() {
    console.log("[TableView] captureColumnWidths called");
    if (!this.view || !this.getPos) {
      console.log("[TableView] Missing view or getPos:", { view: !!this.view, getPos: !!this.getPos });
      return;
    }
    requestAnimationFrame(() => {
      console.log("[TableView] Initial render complete");
      if (!this.view || !this.getPos) {
        return;
      }
      const pos = this.getPos();
      if (pos === void 0) {
        return;
      }
      const cols = this.colgroup.querySelectorAll("col");
      console.log("[TableView] Temporarily removing col constraints");
      const originalStyles = [];
      cols.forEach((col, idx) => {
        originalStyles[idx] = col.style.width;
        col.style.width = "";
        col.style.minWidth = "";
      });
      requestAnimationFrame(() => {
        console.log("[TableView] Browser recalculated, capturing widths");
        if (!this.view || !this.getPos) {
          return;
        }
        const currentPos = this.getPos();
        if (currentPos === void 0) {
          return;
        }
        const colWidths = [];
        cols.forEach((col, idx) => {
          const width = col.offsetWidth;
          console.log(`[TableView] Col ${idx} browser-calculated offsetWidth:`, width);
          colWidths.push(width);
        });
        if (colWidths.length === 0) {
          console.log("[TableView] No widths captured");
          return;
        }
        const currentNode = this.view.state.doc.nodeAt(currentPos);
        if (!currentNode || !currentNode.firstChild) {
          console.log("[TableView] Could not get current node");
          return;
        }
        const row = currentNode.firstChild;
        console.log("[TableView] Building new table structure with captured widths");
        const newRows = [];
        currentNode.forEach((tableRow, rowOffset, rowIndex) => {
          const newCells = [];
          let colIndex = 0;
          tableRow.forEach((cell, cellOffset, cellIndex) => {
            const { colspan } = cell.attrs;
            const cellWidths = [];
            for (let j = 0; j < colspan; j += 1) {
              if (colIndex + j < colWidths.length) {
                cellWidths.push(colWidths[colIndex + j]);
              }
            }
            console.log(`[TableView] Row ${rowIndex} Cell ${cellIndex} (colspan ${colspan}) will get widths:`, cellWidths);
            const newAttrs = { ...cell.attrs, colwidth: cellWidths.length > 0 ? cellWidths : cell.attrs.colwidth };
            const newCell = cell.type.create(newAttrs, cell.content, cell.marks);
            newCells.push(newCell);
            colIndex += colspan;
          });
          const newRow = tableRow.type.create(tableRow.attrs, newCells, tableRow.marks);
          newRows.push(newRow);
        });
        const newTable = currentNode.type.create(currentNode.attrs, newRows, currentNode.marks);
        console.log("[TableView] Replacing table node");
        const tr = this.view.state.tr.replaceWith(currentPos, currentPos + currentNode.nodeSize, newTable);
        console.log("[TableView] Transaction has", tr.steps.length, "steps, docChanged:", tr.docChanged);
        if (tr.docChanged) {
          console.log("[TableView] Dispatching transaction");
          this.view.dispatch(tr);
          setTimeout(() => {
            if (!this.view || !this.getPos) {
              return;
            }
            const finalPos = this.getPos();
            if (finalPos === void 0) {
              return;
            }
            const finalNode = this.view.state.doc.nodeAt(finalPos);
            if (finalNode) {
              console.log("[TableView] Forcing colgroup update with final node");
              console.log("[TableView] Final node cells:", finalNode.firstChild?.childCount);
              finalNode.firstChild?.forEach((cell, idx) => {
                console.log(`[TableView] Final cell ${idx} colwidth:`, cell.attrs.colwidth);
              });
              this.node = finalNode;
              updateColumns(finalNode, this.colgroup, this.table, this.cellMinWidth);
              const finalCols = this.colgroup.querySelectorAll("col");
              finalCols.forEach((col, idx) => {
                console.log(`[TableView] Final col ${idx} style.width:`, col.style.width);
              });
            }
          }, 100);
        }
      });
    });
  }
  update(node) {
    if (node.type !== this.node.type) {
      return false;
    }
    console.log("[TableView] update() called, this.cellMinWidth:", this.cellMinWidth);
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
import { findParentNodeClosestToPos } from "@tiptap/core";

// src/table/utilities/isCellSelection.ts
import { CellSelection } from "@tiptap/pm/tables";
function isCellSelection(value) {
  return value instanceof CellSelection;
}

// src/table/utilities/deleteTableWhenAllCellsSelected.ts
var deleteTableWhenAllCellsSelected = ({ editor }) => {
  const { selection } = editor.state;
  if (!isCellSelection(selection)) {
    return false;
  }
  let cellCount = 0;
  const table = findParentNodeClosestToPos(selection.ranges[0].$from, (node) => {
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
var Table = Node4.create({
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
      mergeAttributes4(this.options.HTMLAttributes, HTMLAttributes, {
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
          tr.replaceSelectionWith(node).scrollIntoView().setSelection(TextSelection.near(tr.doc.resolve(offset)));
        }
        return true;
      },
      addColumnBefore: () => ({ state, dispatch }) => {
        return addColumnBefore(state, dispatch);
      },
      addColumnAfter: () => ({ state, dispatch }) => {
        return addColumnAfter(state, dispatch);
      },
      deleteColumn: () => ({ state, dispatch }) => {
        return deleteColumn(state, dispatch);
      },
      addRowBefore: () => ({ state, dispatch }) => {
        return addRowBefore(state, dispatch);
      },
      addRowAfter: () => ({ state, dispatch }) => {
        return addRowAfter(state, dispatch);
      },
      deleteRow: () => ({ state, dispatch }) => {
        return deleteRow(state, dispatch);
      },
      deleteTable: () => ({ state, dispatch }) => {
        return deleteTable(state, dispatch);
      },
      mergeCells: () => ({ state, dispatch }) => {
        return mergeCells(state, dispatch);
      },
      splitCell: () => ({ state, dispatch }) => {
        return splitCell(state, dispatch);
      },
      toggleHeaderColumn: () => ({ state, dispatch }) => {
        return toggleHeader("column")(state, dispatch);
      },
      toggleHeaderRow: () => ({ state, dispatch }) => {
        return toggleHeader("row")(state, dispatch);
      },
      toggleHeaderCell: () => ({ state, dispatch }) => {
        return toggleHeaderCell(state, dispatch);
      },
      mergeOrSplit: () => ({ state, dispatch }) => {
        if (mergeCells(state, dispatch)) {
          return true;
        }
        return splitCell(state, dispatch);
      },
      setCellAttribute: (name, value) => ({ state, dispatch }) => {
        return setCellAttr(name, value)(state, dispatch);
      },
      goToNextCell: () => ({ state, dispatch }) => {
        return goToNextCell(1)(state, dispatch);
      },
      goToPreviousCell: () => ({ state, dispatch }) => {
        return goToNextCell(-1)(state, dispatch);
      },
      fixTables: () => ({ state, dispatch }) => {
        if (dispatch) {
          fixTables(state);
        }
        return true;
      },
      setCellSelection: (position) => ({ tr, dispatch }) => {
        if (dispatch) {
          const selection = CellSelection2.create(tr.doc, position.anchorCell, position.headCell);
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
        columnResizing({
          handleWidth: this.options.handleWidth,
          cellMinWidth: this.options.cellMinWidth,
          defaultCellMinWidth: this.options.cellMinWidth,
          View: this.options.View,
          lastColumnResizable: this.options.lastColumnResizable
        })
      ] : [],
      tableEditing({
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
      tableRole: callOrReturn(getExtensionField(extension, "tableRole", context))
    };
  }
});

// src/kit/index.ts
var TableKit = Extension.create({
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
export {
  DEFAULT_CELL_LINE_SEPARATOR,
  Table,
  TableCell,
  TableHeader,
  TableKit,
  TableRow,
  TableView,
  createColGroup,
  createTable,
  renderTableToMarkdown,
  updateColumns
};
//# sourceMappingURL=index.js.map