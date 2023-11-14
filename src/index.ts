import { Annotation, EditorSelection, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, ViewPlugin } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

const fromTreeView = Annotation.define()

const transactionIsFromTreeView = (tr: Transaction) => tr.annotation(fromTreeView)

const treeViewPane = ViewPlugin.define((view) => {
  const scroller = document.querySelector<HTMLDivElement>('.cm-scroller')

  if (!scroller) {
    return {}
  }

  const container = document.createElement('div')
  container.classList.add('cm-tree-view-container')
  scroller.after(container)
  scroller.style.width = '50%'

  const highlightNodeRange = (from: number, to: number) => {
    view.dispatch({
      effects: [selectedNodeEffect.of({ from, to })],
    })
  }

  const selectNodeRange = (from: number, to: number) => {
    view.dispatch({
      annotations: [fromTreeView.of(true)],
      selection: EditorSelection.single(from, to),
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
    view.focus()
  }

  let prevTree = syntaxTree(view.state)

  buildPanel(view.state, container, highlightNodeRange, selectNodeRange, true)

  return {
    update(update) {
      const tree = syntaxTree(view.state)
      if (prevTree !== tree || update.selectionSet) {
        const scroll = !update.transactions.some(transactionIsFromTreeView)
        buildPanel(update.state, container, highlightNodeRange, selectNodeRange, scroll)
      }
      prevTree = tree
    },
    destroy() {
      container.remove()
      scroller.style.width = 'unset'
    },
  }
})

const buildPanel = (
  state: EditorState,
  container: HTMLDivElement,
  highlightNodeRange: (from: number, to: number) => void,
  selectNodeRange: (from: number, to: number) => void,
  scroll: boolean
) => {
  container.textContent = '' // clear

  const tree = syntaxTree(state)
  const { selection } = state
  let itemToCenter: HTMLDivElement

  let depth = 0
  tree.iterate({
    enter(nodeRef) {
      const { from, to, name } = nodeRef

      const element = document.createElement('div')
      element.classList.add('cm-tree-view-item')
      element.style.paddingLeft = `${depth * 16}px`
      element.textContent = name

      element.addEventListener('mouseover', () => {
        highlightNodeRange(from, to)
      })

      element.addEventListener('click', () => {
        selectNodeRange(from, to)
      })

      container.append(element)

      for (const range of selection.ranges) {
        // completely covered by selection
        if (range.from <= from && range.to >= to) {
          element.classList.add('cm-tree-view-selected-item')
          itemToCenter = element
        } else if ((range.from > from && range.from < to) || (range.to > from && range.to < to)) {
          element.classList.add('cm-tree-view-covered-item')
          itemToCenter = element
        }

        if (range.head === from) {
          element.classList.add('cm-tree-view-cursor-before')
          itemToCenter = element
        }
      }
      depth++
    },
    leave(node) {
      depth--
    },
  })

  const positions = document.createElement('div')
  positions.classList.add('cm-tree-view-positions')
  container.append(positions)

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head)
    const column = range.head - line.from + 1
    const position = document.createElement('div')
    position.classList.add('cm-tree-view-position')
    position.textContent = `line ${line.number}, col ${column}, pos ${range.head}`
    positions.append(position)
  }

  if (scroll && itemToCenter!) {
    window.setTimeout(() => {
      itemToCenter.scrollIntoView({
        block: 'center',
        inline: 'center',
      })
    })
  }
}

const selectedNodeEffect = StateEffect.define<{
  from: number
  to: number
} | null>()

const highlightSelectedNode = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(value, tr) {
    if (tr.selection) {
      value = Decoration.none
    }
    for (const effect of tr.effects) {
      if (effect.is(selectedNodeEffect)) {
        if (effect.value) {
          const { from, to } = effect.value

          // TODO: widget decoration if no range to decorate?
          if (to > from) {
            value = Decoration.set([
              Decoration.mark({
                class: 'cm-selected-node-highlight',
              }).range(from, to),
            ])
          }
        } else {
          value = Decoration.none
        }
      }
    }
    return value
  },
  provide(f) {
    return EditorView.decorations.from(f)
  },
})

const treeViewTheme = EditorView.baseTheme({
  '.cm-tree-view-container': {
    padding: '8px 8px 0',
    backgroundColor: '#222',
    color: '#eee',
    fontSize: '13px',
    flexShrink: '0',
    fontFamily: 'ui-monospace, monospace',
    height: 'calc(100% - 32px)',
    overflow: 'auto',
    position: 'absolute',
    top: '32px',
    right: 0,
    width: '50%',
  },
  '.cm-tree-view-item': {
    cursor: 'pointer',
    borderTop: '2px solid transparent',
    borderBottom: '2px solid transparent',
    scrollMargin: '2em',
  },
  '.cm-selected-node-highlight': {
    backgroundColor: 'yellow',
  },
  '.cm-tree-view-covered-item': {
    backgroundColor: 'rgba(255, 255, 0, 0.2)',
  },
  '.cm-tree-view-selected-item': {
    backgroundColor: 'rgba(255, 255, 0, 0.5)',
    color: '#000',
  },
  '.cm-tree-view-cursor-before': {
    borderTopColor: 'rgba(255, 255, 0, 1)',
    '& + .cm-tree-view-cursor-before': {
      borderTopColor: 'transparent',
    },
  },
  '.cm-tree-view-positions': {
    position: 'sticky',
    bottom: '0',
    backgroundColor: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  '.cm-tree-view-position': {
    padding: '4px 0',
  },
})

export const treeView = [treeViewPane, highlightSelectedNode, treeViewTheme]
