// src/table/table.ts
import {
  callOrReturn,
  getExtensionField,
  mergeAttributes,
  Node
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
  constructor(node, cellMinWidth = 25, view, getPos, customScrollbar = false) {
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartScrollLeft = 0;
    this.rafId = null;
    console.log("[TableView] Constructor called with customScrollbar:", customScrollbar);
    console.log("[TableView] Constructor stack trace:", new Error().stack);
    this.node = node;
    this.cellMinWidth = cellMinWidth || 25;
    this.view = view;
    this.getPos = getPos;
    this.customScrollbar = customScrollbar;
    this.dom = document.createElement("div");
    this.dom.className = "tableWrapper";
    if (this.customScrollbar) {
      console.log("[TableView] Setting up custom scrollbar");
      this.setupCustomScrollbar();
    } else {
      console.log("[TableView] Using native scrollbar");
      this.table = this.dom.appendChild(document.createElement("table"));
      this.colgroup = this.table.appendChild(document.createElement("colgroup"));
      updateColumns(node, this.colgroup, this.table, this.cellMinWidth);
      this.contentDOM = this.table.appendChild(document.createElement("tbody"));
    }
    this.captureColumnWidths();
  }
  /**
   * Sets up the custom scrollbar structure and event handlers
   */
  setupCustomScrollbar() {
    console.log("[TableView] setupCustomScrollbar called");
    this.scrollContainer = document.createElement("div");
    this.scrollContainer.className = "tableScrollContainer";
    this.scrollContainer.style.cssText = `
      overflow-x: hidden;
      overflow-y: visible;
      position: relative;
      scrollbar-width: none;
      -ms-overflow-style: none;
    `;
    const style = document.createElement("style");
    style.textContent = `
      .tableScrollContainer::-webkit-scrollbar {
        display: none;
      }
    `;
    this.dom.appendChild(style);
    this.table = this.scrollContainer.appendChild(document.createElement("table"));
    this.colgroup = this.table.appendChild(document.createElement("colgroup"));
    updateColumns(this.node, this.colgroup, this.table, this.cellMinWidth);
    this.contentDOM = this.table.appendChild(document.createElement("tbody"));
    this.dom.appendChild(this.scrollContainer);
    this.scrollbarTrack = document.createElement("div");
    this.scrollbarTrack.className = "customScrollbarTrack";
    this.scrollbarTrack.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 12px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 6px;
      cursor: pointer;
      display: none;
    `;
    this.scrollbarThumb = document.createElement("div");
    this.scrollbarThumb.className = "customScrollbarThumb";
    this.scrollbarThumb.style.cssText = `
      position: absolute;
      top: 2px;
      left: 0;
      height: 8px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
      cursor: grab;
      transition: background 0.2s;
    `;
    this.scrollbarThumb.addEventListener("mouseenter", () => {
      if (!this.isDragging && this.scrollbarThumb) {
        this.scrollbarThumb.style.background = "rgba(0, 0, 0, 0.5)";
      }
    });
    this.scrollbarThumb.addEventListener("mouseleave", () => {
      if (!this.isDragging && this.scrollbarThumb) {
        this.scrollbarThumb.style.background = "rgba(0, 0, 0, 0.3)";
      }
    });
    this.scrollbarTrack.appendChild(this.scrollbarThumb);
    this.dom.appendChild(this.scrollbarTrack);
    this.setupScrollbarEvents();
    this.setupObservers();
    this.updateScrollbar();
  }
  /**
   * Sets up all event handlers for custom scrollbar
   */
  setupScrollbarEvents() {
    if (!this.scrollContainer || !this.scrollbarThumb || !this.scrollbarTrack) return;
    const handleWheel = (e) => {
      if (!this.scrollContainer) return;
      if (this.table.scrollWidth <= this.scrollContainer.clientWidth) return;
      e.preventDefault();
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        if (!this.scrollContainer) {
          this.rafId = null;
          return;
        }
        let delta = e.deltaX;
        if (delta === 0 && e.shiftKey) {
          delta = e.deltaY;
        }
        const newScrollLeft = Math.max(
          0,
          Math.min(
            this.scrollContainer.scrollWidth - this.scrollContainer.clientWidth,
            this.scrollContainer.scrollLeft + delta
          )
        );
        this.scrollContainer.scrollLeft = newScrollLeft;
        this.updateScrollbarPosition();
        this.rafId = null;
      });
    };
    this.scrollContainer.addEventListener("wheel", handleWheel, { passive: false });
    const handleThumbMouseDown = (e) => {
      if (!this.scrollContainer) return;
      e.preventDefault();
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartScrollLeft = this.scrollContainer.scrollLeft;
      if (this.scrollbarThumb) {
        this.scrollbarThumb.style.cursor = "grabbing";
        this.scrollbarThumb.style.background = "rgba(0, 0, 0, 0.5)";
      }
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);
    };
    const handleDocumentMouseMove = (e) => {
      if (!this.isDragging || !this.scrollContainer || !this.scrollbarTrack) return;
      e.preventDefault();
      const deltaX = e.clientX - this.dragStartX;
      const trackWidth = this.scrollbarTrack.clientWidth;
      const scrollWidth = this.scrollContainer.scrollWidth;
      const clientWidth = this.scrollContainer.clientWidth;
      const scrollRatio = scrollWidth / trackWidth;
      const scrollDelta = deltaX * scrollRatio;
      this.scrollContainer.scrollLeft = Math.max(
        0,
        Math.min(scrollWidth - clientWidth, this.dragStartScrollLeft + scrollDelta)
      );
      this.updateScrollbarPosition();
    };
    const handleDocumentMouseUp = () => {
      this.isDragging = false;
      if (this.scrollbarThumb) {
        this.scrollbarThumb.style.cursor = "grab";
        this.scrollbarThumb.style.background = "rgba(0, 0, 0, 0.3)";
      }
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
    this.scrollbarThumb.addEventListener("mousedown", handleThumbMouseDown);
    const handleTrackClick = (e) => {
      if (!this.scrollContainer || !this.scrollbarTrack || !this.scrollbarThumb || e.target === this.scrollbarThumb) {
        return;
      }
      const rect = this.scrollbarTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const trackWidth = this.scrollbarTrack.clientWidth;
      const thumbWidth = this.scrollbarThumb.clientWidth;
      const targetThumbLeft = Math.max(0, Math.min(trackWidth - thumbWidth, clickX - thumbWidth / 2));
      const scrollRatio = (this.scrollContainer.scrollWidth - this.scrollContainer.clientWidth) / (trackWidth - thumbWidth);
      this.scrollContainer.scrollLeft = targetThumbLeft * scrollRatio;
      this.updateScrollbarPosition();
    };
    this.scrollbarTrack.addEventListener("click", handleTrackClick);
  }
  /**
   * Sets up resize and mutation observers for dynamic updates
   */
  setupObservers() {
    if (!this.scrollContainer) return;
    this.resizeObserver = new ResizeObserver(() => {
      this.updateScrollbar();
    });
    this.resizeObserver.observe(this.scrollContainer);
    this.resizeObserver.observe(this.table);
    this.mutationObserver = new MutationObserver(() => {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = requestAnimationFrame(() => {
        this.updateScrollbar();
        this.rafId = null;
      });
    });
    this.mutationObserver.observe(this.table, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  }
  /**
   * Updates scrollbar visibility and thumb size
   */
  updateScrollbar() {
    if (!this.scrollContainer || !this.scrollbarTrack || !this.scrollbarThumb) return;
    const scrollWidth = this.scrollContainer.scrollWidth;
    const clientWidth = this.scrollContainer.clientWidth;
    if (scrollWidth > clientWidth) {
      this.scrollbarTrack.style.display = "block";
      const thumbWidth = Math.max(30, clientWidth / scrollWidth * this.scrollbarTrack.clientWidth);
      this.scrollbarThumb.style.width = `${thumbWidth}px`;
      this.updateScrollbarPosition();
    } else {
      this.scrollbarTrack.style.display = "none";
      this.scrollContainer.scrollLeft = 0;
    }
  }
  /**
   * Updates scrollbar thumb position based on scroll position
   */
  updateScrollbarPosition() {
    if (!this.scrollContainer || !this.scrollbarTrack || !this.scrollbarThumb) return;
    const scrollLeft = this.scrollContainer.scrollLeft;
    const scrollWidth = this.scrollContainer.scrollWidth;
    const clientWidth = this.scrollContainer.clientWidth;
    const trackWidth = this.scrollbarTrack.clientWidth;
    const thumbWidth = this.scrollbarThumb.clientWidth;
    const maxScrollLeft = scrollWidth - clientWidth;
    const maxThumbLeft = trackWidth - thumbWidth;
    const thumbLeft = maxScrollLeft > 0 ? scrollLeft / maxScrollLeft * maxThumbLeft : 0;
    this.scrollbarThumb.style.left = `${thumbLeft}px`;
  }
  /**
   * Captures the actual rendered column widths from the browser and updates the node
   * attributes. Uses a temporary removal of width constraints to let the browser
   * calculate natural widths, then captures and persists those widths.
   */
  captureColumnWidths() {
    if (!this.view || !this.getPos) {
      return;
    }
    requestAnimationFrame(() => {
      if (!this.view || !this.getPos) {
        return;
      }
      const pos = this.getPos();
      if (pos === void 0) {
        return;
      }
      const cols = this.colgroup.querySelectorAll("col");
      cols.forEach((col) => {
        ;
        col.style.width = "";
        col.style.minWidth = "";
      });
      requestAnimationFrame(() => {
        if (!this.view || !this.getPos) {
          return;
        }
        const currentPos = this.getPos();
        if (currentPos === void 0) {
          return;
        }
        const colWidths = [];
        cols.forEach((col) => {
          colWidths.push(col.offsetWidth);
        });
        if (colWidths.length === 0) {
          return;
        }
        const currentNode = this.view.state.doc.nodeAt(currentPos);
        if (!currentNode || !currentNode.firstChild) {
          return;
        }
        const newRows = [];
        currentNode.forEach((tableRow) => {
          const newCells = [];
          let colIndex = 0;
          tableRow.forEach((cell) => {
            const { colspan } = cell.attrs;
            const cellWidths = [];
            for (let j = 0; j < colspan; j += 1) {
              if (colIndex + j < colWidths.length) {
                cellWidths.push(colWidths[colIndex + j]);
              }
            }
            const newAttrs = { ...cell.attrs, colwidth: cellWidths.length > 0 ? cellWidths : cell.attrs.colwidth };
            const newCell = cell.type.create(newAttrs, cell.content, cell.marks);
            newCells.push(newCell);
            colIndex += colspan;
          });
          const newRow = tableRow.type.create(tableRow.attrs, newCells, tableRow.marks);
          newRows.push(newRow);
        });
        const newTable = currentNode.type.create(currentNode.attrs, newRows, currentNode.marks);
        const tr = this.view.state.tr.replaceWith(currentPos, currentPos + currentNode.nodeSize, newTable);
        if (tr.docChanged) {
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
              this.node = finalNode;
              updateColumns(finalNode, this.colgroup, this.table, this.cellMinWidth);
              if (this.customScrollbar) {
                this.updateScrollbar();
              }
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
    this.node = node;
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth);
    if (this.customScrollbar) {
      this.updateScrollbar();
    }
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
  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = void 0;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = void 0;
    }
    this.scrollContainer = void 0;
    this.scrollbarTrack = void 0;
    this.scrollbarThumb = void 0;
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
console.log("[Table Extension] Module loaded");
var Table = Node.create({
  name: "table",
  // @ts-ignore
  addOptions() {
    console.log("[Table] addOptions called");
    const ViewWrapper = function(node, cellMinWidth, view, getPos) {
      console.log("[ViewWrapper] Called with arguments");
      return new TableView(node, cellMinWidth, view, getPos, false);
    };
    const options = {
      HTMLAttributes: {},
      resizable: false,
      handleWidth: 5,
      cellMinWidth: 25,
      View: ViewWrapper,
      lastColumnResizable: true,
      allowTableNodeSelection: false,
      customScrollbar: false
    };
    console.log("[Table] Default options:", options);
    return options;
  },
  content: "tableRow+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseHTML() {
    return [{ tag: "table" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const { colgroup, tableWidth, tableMinWidth } = createColGroup(node, this.options.cellMinWidth);
    const table = [
      "table",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
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
  // @ts-ignore - TypeScript doesn't like conditional returns, but this is intentional
  addNodeView() {
    const customScrollbar = this.options.customScrollbar;
    const cellMinWidth = this.options.cellMinWidth;
    const isResizable = this.options.resizable && this.editor.isEditable;
    console.log("[Table] addNodeView called, isResizable:", isResizable, "customScrollbar:", customScrollbar);
    if (isResizable) {
      console.log("[Table] Returning undefined from addNodeView because resizable=true");
      return void 0;
    }
    return ({ node, view, getPos }) => {
      const getPosFunc = typeof getPos === "function" ? getPos : void 0;
      console.log("[Table] Creating TableView from addNodeView (non-resizable) with customScrollbar:", customScrollbar);
      return new TableView(node, cellMinWidth, view, getPosFunc, customScrollbar);
    };
  },
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable && this.editor.isEditable;
    const customScrollbar = this.options.customScrollbar;
    const cellMinWidth = this.options.cellMinWidth;
    console.log("[Table] addProseMirrorPlugins called, isResizable:", isResizable, "customScrollbar:", customScrollbar);
    console.log("[Table] this.options.View BEFORE modification:", this.options.View);
    const TableViewWithOptions = class extends TableView {
      constructor(node, _cellMinWidth, view, getPos) {
        console.log("[TableViewWithOptions] Constructor called, will pass customScrollbar:", customScrollbar);
        super(node, cellMinWidth, view, getPos, customScrollbar);
      }
    };
    if (isResizable) {
      console.log("[Table] Updating this.options.View to TableViewWithOptions");
      this.options.View = TableViewWithOptions;
      console.log("[Table] this.options.View AFTER modification:", this.options.View);
    }
    const columnResizingPlugin = isResizable ? columnResizing({
      handleWidth: this.options.handleWidth,
      cellMinWidth: this.options.cellMinWidth,
      defaultCellMinWidth: this.options.cellMinWidth,
      View: TableViewWithOptions,
      lastColumnResizable: this.options.lastColumnResizable
    }) : null;
    if (columnResizingPlugin) {
      console.log("[Table] columnResizing plugin created:", columnResizingPlugin);
      console.log("[Table] columnResizing plugin spec:", columnResizingPlugin.spec);
    }
    const plugins = [
      ...isResizable && columnResizingPlugin ? [columnResizingPlugin] : [],
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection
      })
    ];
    console.log("[Table] Returning plugins:", plugins.length, "plugins");
    return plugins;
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
export {
  DEFAULT_CELL_LINE_SEPARATOR,
  Table,
  createColGroup,
  createTable,
  renderTableToMarkdown
};
//# sourceMappingURL=index.js.map