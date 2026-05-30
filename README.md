# Svelte Extract as {#snippet} Extension

This is **NOT** a collection of VS Code snippets for Svelte.

The extension is a refactoring tool which extracts your selected template markup directly into a name Svelte 5 `{#snippet ...}` block and replaces the original markup, and other qualifying blocks with `{@render ...}`.

## Simple Example - One prop, no typescript

![Simple extraction](https://raw.githubusercontent.com/cycle4passion/svelte-extract-snippet/main/images/simple.gif)

## Usage

1. You select template markup in a `.svelte` file
2. You trigger Extension
    - Right-click → Select **Svelte: Extract as {#snippet}**
    - or, open the Command Palette (Ctrl/Cmd+Shift+P) → Search for it
    - or, trigger your chosen keyboard shortcut [see below](#keyboard-shortcut)
3. You enter a snippet name
4. The #snippet is inserted and you are asked to replace literal values with `{paramName}` expressions to variablize the body
5. You click "**✓ Continue {#snippet} Extraction**" in the status bar
6. The extension takes over again. The params in the #snippet body are recognized, and automatically added to the snippet signature
7. The extension searches for structurally similar blocks (allowing for param differences) and auto-replace them with `{@render(paramName, ...)}` with the appropriate arguments

Note: For TypeScript files where params are declared: the params are auto-typed as `any`.

## Complex Example - Multiple props, typescript

![Complex extraction](https://raw.githubusercontent.com/cycle4passion/svelte-extract-snippet/main/images/complex.gif)

## Example

**Before** — repeated stat blocks:

```ts
<div class="stat">
  <span class="label">Revenue</span>
  <span class="value">$4,200</span>
</div>

<div class="stat">
  <span class="label">Users</span>
  <span class="value">1,847</span>
</div>

```

1. You select the first `<div class="stat">` block, run **Extract as #Snippet**, name it `stat`.

2. The extension inserts the snippet.

3. You replace `Revenue` with `{label}` and `$4,200` with `{value}`

4. You click **✓ Continue #Snippet Extraction**.

5. The extension updates the snippet call signature and replaces similar blocks with `{@render stat(...)}`.

**After:**

```ts
{#snippet stat(label: any, value: any)}
  <div class="stat">
    <span class="label">{label}</span>
    <span class="value">{value}</span>
  </div>
{/snippet}

{@render stat("Revenue", "$4,200")}
{@render stat("Users", "1,847")}
```

Assuming at TS file, the cursor lands on the first snippets param type `any` and is ready for you to  update the types.

## Keyboard Shortcut

No default binding is registered to avoid conflicts. Suggested binding:

- **Mac:** `Cmd+Alt+Shift+X`
- **Windows/Linux:** `Ctrl+Alt+Shift+X`

Add to your `keybindings.json`:

```json
{
  "key": "cmd+alt+shift+x",
  "command": "svelte-extract-snippet.extract",
  "when": "editorHasSelection && resourceExtname == .svelte"
}
```

## Requirements

- Svelte 5 (uses `{#snippet}` / `{@render}` — not compatible with Svelte 4 `<slot>`)
- VS Code 1.95.0 or later

## Notes

- TypeScript detection is based on `lang="ts"` on the `<script>` tag
- Snippet is inserted after the last `</script>` tag. Various orders of <script>, <style> and markup are supported.
- Fully tested

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
