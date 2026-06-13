# linui

Plain HTML, CSS, and JavaScript — no libraries or build steps. Web Components with Shadow DOM.

## Running

```
npm start   # serves public/ on localhost:3000
npm run check  # biome format + lint
```

## JavaScript style

**Declare short, well-named variables rather than nesting expressions.**
Every intermediate value should have a name that makes the intent clear without a comment.

```js
// preferred
const realScrollTop = scrollTop - padTop + delta;
const nextPadTop = Math.max(0, -realScrollTop);

// avoid
contentStyle.paddingTop = `${Math.max(0, -(scrollTop - padTop + delta))}px`;
```

**Use `const` everywhere.** Reach for `let` only when a loop counter truly mutates; otherwise restructure.

**Avoid `if`/`switch` for value selection.** Use `Math.max`, `Math.min`, ternary, or nullish coalescing instead.

```js
// preferred
const nextPadTop = Math.max(0, -realScrollTop);

// avoid
let nextPadTop = 0;
if (realScrollTop < 0) nextPadTop = -realScrollTop;
```

**Structure functions as read → compute → write.** Read all DOM values up front, derive the new state in pure expressions, then commit to the DOM in one pass. Avoid interleaved reads and writes.

```js
// read
const { scrollTop, scrollHeight, clientHeight } = this.#container;
const padTop = parseFloat(contentStyle.paddingTop) || 0;

// compute
const realScrollTop = scrollTop - padTop + delta;
const nextPadTop = Math.max(0, -realScrollTop);

// write
contentStyle.paddingTop = `${nextPadTop}px`;
```

**Use destructuring** to read multiple properties from the same object in one statement.

**Use default parameters** rather than `|| 0` guards at the call site.

## Web Components

- Shadow DOM template defined once at module scope as a `<template>` element and cloned in the constructor.
- Use `connectedCallback`/`disconnectedCallback` to add and remove event listeners.
- Private class fields (`#field`) for all internal state.
- Event handler methods are arrow-function class fields so they bind without `.bind(this)`.
- Use noop `html` and `css` tagged template literals at the top of each module for editor syntax highlighting.

## scroll-pane

`<scroll-pane>` is a Web Component that wraps slotted children in a scrollable container and fires `visibleChildrenChange` events to drive virtual list rendering.

When slotted children are added or removed, or when they resize, the container scrolls to minimize layout shifts.

### Public API

- **`visibleChildren`** — iterator of slotted elements currently intersecting the scroll container.
- **`visibleChildrenChange`** event — fired (debounce-free) whenever the visible set changes; consumer calls `render()` in response.

### `#anchor`

An anchor is the slotted element or its descendent that the user is interacting with using the mouse, and its viewport-top position at the time of interaction. It’s null if the use isn’t interacting with any particular child element. The anchor is frozen during periods of active layout shift.

### `#onResize()`

`#onResize` (a `ResizeObserver` callback) runs when any slotted element is added, removed or if its size changes, calling `#scrollPad()` to compensate for any layout shifts. If an anchor element exists, it computes the scroll amount that compensates for its viewport-relative layout shift; otherwise it computes the scroll amount that eliminates content-relative layout shift for the largest possible subset of visible slotted children.

### Scroll padding

Layout-shift compensation can scroll beyond the edges by adding `padding-top`/`padding-bottom` to the inner `.scroll-content` wrapper div.

## CSS

- One declaration per line, tab-indented.
- `::details-content` for animating `<details>` expand/collapse (Chrome 131+). Requires `interpolate-size: allow-keywords` on `:root`.
- Expand transition on `details[open]::details-content`, collapse transition on `details::details-content` — CSS applies the transition from the target state, so durations differ naturally.
