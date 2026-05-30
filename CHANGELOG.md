# Changelog

## [0.1.0] — Initial Release

### Extraction flow

- Select template markup, name the snippet — inserted immediately with original body intact
- Inner content of the first element auto-selected for quick variablization (single-tag only; complex markup places cursor at body start)
- Persistent status bar button `$(check) Continue {#snippet} Extraction` waits for variablization — does not auto-dismiss like a notification
- Params discovered automatically from `{identifier}` expressions written into the snippet body — no manual entry required
- Pre-existing `{identifier}` references (component scope variables) are excluded from param discovery — only newly introduced expressions become params
- Full atomic revert on cancel at any prompt

### TypeScript support

- `lang="ts"` detected automatically from the `<script>` tag
- Params initially typed as `any` in the snippet signature; cursor lands on first `any` after extraction — ready to update
- Notification reminder: "Update snippet types"

### Similar block detection

- After variablizing, scans the rest of the markup for structurally identical blocks
- `{paramName}` positions act as wildcards; all other tokens must match exactly
- Matching blocks auto-replaced with `{@render name(...)}` — no confirmation prompt
- Text content arguments auto-quoted as string literals (`"Revenue"`); expression arguments passed bare (`someVar`)
- Trailing blank lines between replaced blocks consumed to keep render calls compact
- Snippet ranges excluded from search
- Similar block search now works in all Svelte file orderings — markup-first (`<div>…<script>`), style-first (`<style>…<div>…<script>`), script-last, style-last, and markup-only files were previously not searched
- Snippet insert position now respects `</style>` in addition to `</script>`, so the snippet lands in the correct location regardless of section order
- Snippet insert position skips over existing `{#snippet}` blocks, placing new snippets after all existing ones rather than before them
- Snippet padding (blank lines before/after the inserted block) is now computed from the surrounding document context rather than hardcoded

### Code quality

- Works for any root tag (`<p>`, `<span>`, `<div>`, Svelte components, etc.)
- Indentation in generated snippet body matches editor settings (spaces or tabs, correct width)
- Unsaved `.svelte` files supported via `languageId` check in addition to file extension
- Vitest unit test suite covering tokenizer, param matching, quoting logic, offset accuracy, snippet exclusion, and edge cases
