# CSS Reference Counter and Peek

A VS Code extension that shows how many times each CSS selector is used across your project. It displays an inline reference count above every CSS rule and supports Ctrl+Click navigation from HTML/JSX to CSS declarations.

## Features

### Inline Usage Count (CodeLens)
Displays `implementations: N` above each CSS rule in `.css` and `.scss` files. Selectors with zero usages are easy to spot, helping you identify and remove dead CSS.

Clicking the count opens the references panel showing all usage locations.

### Go to Definition
Ctrl+Click on a class name inside `class="..."` or `className="..."` in HTML, JSX, TSX, or Vue files to jump directly to its CSS declaration.

### Find All References
Right-click a CSS selector and choose "Find All References" to see every file where that class or ID is used.

### Smart Scanning
- On first activation, the extension performs a full background scan with a progress indicator.
- After that, it updates incrementally as you edit and save files.
- File creation, deletion, and renames are handled automatically.

## Supported Files

CSS declarations are read from `.css` and `.scss` files.

Usage is detected in `.html`, `.htm`, `.jsx`, `.tsx`, `.vue`, and `.svelte` files.

### Detected Patterns
- `class="foo bar"`
- `className="foo"` / `className={'foo'}`
- `classList.add('foo')` / `.toggle()` / `.remove()`
- `:class="{ foo: true }"` (Vue)
- `document.querySelector('.foo')`
- `document.getElementById('bar')`

## Commands

- **CSS Reference Counter: Rescan Workspace** - Manually trigger a full workspace rescan.

## Settings

- `cssReferenceCounter.includedFileTypes` - File extensions to scan for usage. Default: `["html", "htm", "jsx", "tsx", "vue", "svelte"]`
- `cssReferenceCounter.excludePatterns` - Glob patterns to exclude from scanning. Default: `["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"]`

## Development

```bash
npm install
npm run compile
```

Press F5 in VS Code to launch the Extension Development Host for testing.

## License

MIT
