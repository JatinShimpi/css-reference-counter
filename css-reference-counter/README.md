# CSS Reference Counter and Peek

A VS Code extension that shows how many times each CSS selector is used across your project. It displays an inline reference count above every CSS rule and supports Ctrl+Click navigation from HTML/JSX to CSS declarations.

## Features

### Inline Usage Count (CodeLens)
Displays `implementations: N` above each CSS rule in `.css` and `.scss` files. Selectors with zero usages are easy to spot, helping you identify and remove dead CSS.

![CodeLens showing implementation count above CSS selectors](https://raw.githubusercontent.com/JatinShimpi/css-reference-counter/main/css-reference-counter/images/codelens-demo.png)

### Go to Definition
Ctrl+Click on a class name inside `class="..."` or `className="..."` in HTML, JSX, TSX, or Vue files to jump directly to its CSS declaration.

![Go to definition from JSX className to CSS](https://raw.githubusercontent.com/JatinShimpi/css-reference-counter/main/css-reference-counter/images/go-to-definition.png)

### Multiple Usage Count
Tracks usage across the entire project. A selector used in many places shows the total count.

![Usage count of 4 for .page-title](https://raw.githubusercontent.com/JatinShimpi/css-reference-counter/main/css-reference-counter/images/usage-count.png)

### Find All References
Right-click a CSS selector and choose "Find All References" to see every file where that class or ID is used.

![Find all references panel showing 12 locations](https://raw.githubusercontent.com/JatinShimpi/css-reference-counter/main/css-reference-counter/images/find-all-references.png)

### Sidebar Panel
A dedicated panel in the Activity Bar showing:
- Scan status with live progress
- Number of CSS/SCSS files and selectors indexed
- A **Rescan Workspace** button to manually re-scan

### Smart Scanning
- Scan results are **cached to disk** — subsequent activations load instantly without rescanning the entire workspace.
- Only files that have been **modified since the last scan** are re-scanned (delta scanning).
- Live updates as you edit and save files.
- File creation, deletion, and renames are handled automatically.

## Supported Files

CSS declarations are read from `.css` and `.scss` files.

Usage is detected in `.html`, `.htm`, `.jsx`, `.tsx`, `.js`, `.ts`, `.vue`, and `.svelte` files.

### Detected Patterns
- `class="foo bar"`
- `className="foo"` / `className={'foo'}`
- `classList.add('foo')` / `.toggle()` / `.remove()`
- `:class="{ foo: true }"` (Vue)
- `document.querySelector('.foo')`
- `document.getElementById('bar')`

## Commands

- **CSS Reference Counter: Rescan Workspace** — Manually trigger a full workspace rescan. Also available from the sidebar panel.

## Settings

### `cssReferenceCounter.includedFileTypes`
File extensions to scan for CSS class/id usage.

**Default:** `["html", "htm", "jsx", "tsx", "vue", "svelte", "js", "ts"]`

### `cssReferenceCounter.excludePatterns`
Glob patterns for files and folders to **exclude** from scanning.

**Default:**
```json
[
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/target/**",
  "**/out/**",
  "**/vendor/**",
  "**/bower_components/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/.svelte-kit/**",
  "**/.angular/**",
  "**/.cache/**",
  "**/tmp/**",
  "**/public/assets/**"
]
```

#### Customizing Excluded Folders

If your project has folders you want to exclude (e.g. a backend API folder, a Rust `target` directory, or generated files), add them to your workspace or user settings:

1. Open **Settings** (`Ctrl+,`)
2. Search for `cssReferenceCounter.excludePatterns`
3. Add your patterns

Or add directly in `.vscode/settings.json`:
```json
{
  "cssReferenceCounter.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/target/**",
    "**/api/**",
    "**/server/**",
    "**/my-custom-folder/**"
  ]
}
```

> **Note:** When you override this setting, it replaces the full default list. Make sure to include the base patterns you still want.

## Development

```bash
npm install
npm run compile
```

Press F5 in VS Code to launch the Extension Development Host for testing.

## Bug Reports & Feedback

Found a bug or have a feature request? We'd love to hear from you!

- 🐛 **Report a Bug:** [Open an issue on GitHub](https://github.com/JatinShimpi/css-reference-counter/issues/new?labels=bug&template=bug_report.md)
- 💡 **Request a Feature:** [Open a feature request](https://github.com/JatinShimpi/css-reference-counter/issues/new?labels=enhancement&template=feature_request.md)
- ⭐ **Like the extension?** [Leave a review on the Marketplace](https://marketplace.visualstudio.com/items?itemName=JatinShimpi.css-reference-counter-and-peek&ssr=false#review-details)

When reporting a bug, please include:
1. VS Code version (`Help > About`)
2. Extension version
3. Steps to reproduce the issue
4. Relevant output from the **Output** panel → **Extension Host**

## License

MIT
