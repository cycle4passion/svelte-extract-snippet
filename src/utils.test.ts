import { describe, it, expect } from 'vitest';
import { findInsertOffset, snippetPadding } from './utils';

// ---------------------------------------------------------------------------
// findInsertOffset
// ---------------------------------------------------------------------------

describe('findInsertOffset — section ordering', () => {
	it('script → markup: inserts after </script>', () => {
		const text = '<script>\n</script>\n<div>A</div>\n';
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe(sel);
	});

	it('style → markup: inserts after </style>', () => {
		const text = '<style>\n</style>\n<div>A</div>\n';
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe(sel);
	});

	it('style → markup → script: uses </style>, ignores </script> after selection', () => {
		const text = '<style>\n\n</style>\n\n<div>A</div>\n<div>B</div>\n\n<script>\n\n</script>\n';
		const sel = text.indexOf('<div>A');
		// insert position lands at start of <div>A (blank line already exists above)
		expect(findInsertOffset(text, sel)).toBe(sel);
	});

	it('script → style → markup: uses </style> (later of the two)', () => {
		const text = '<script>\n</script>\n<style>\n</style>\n<div>A</div>\n';
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe(sel);
	});

	it('markup only (no script/style): inserts at 0', () => {
		const text = '<div>A</div>\n<div>B</div>\n';
		const sel = text.indexOf('<div>A');
		expect(findInsertOffset(text, sel)).toBe(0);
	});
});

describe('findInsertOffset — existing snippets', () => {
	it('inserts after a single existing snippet', () => {
		const snippet = '{#snippet foo()}\n  body\n{/snippet}\n';
		const markup = '<div>A</div>\n';
		const text = snippet + markup;
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe(snippet.length);
	});

	it('inserts after multiple existing snippets', () => {
		const s1 = '{#snippet foo()}\n  body\n{/snippet}\n';
		const s2 = '{#snippet bar()}\n  body\n{/snippet}\n';
		const markup = '<div>A</div>\n';
		const text = s1 + s2 + markup;
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe((s1 + s2).length);
	});

	it('correctly handles nested snippets via depth tracking', () => {
		const nested =
			'{#snippet outer()}\n  {#snippet inner()}\n    x\n  {/snippet}\n{/snippet}\n';
		const markup = '<div>A</div>\n';
		const text = nested + markup;
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe(nested.length);
	});

	it('skips blank lines between snippets', () => {
		const s1 = '{#snippet foo()}\n  body\n{/snippet}\n';
		const blank = '\n';
		const markup = '<div>A</div>\n';
		const text = s1 + blank + markup;
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe((s1 + blank).length);
	});

	it('inserts after snippets that follow a script block', () => {
		const script = '<script>\n</script>\n';
		const snippet = '{#snippet foo()}\n  body\n{/snippet}\n';
		const markup = '<div>A</div>\n';
		const text = script + snippet + markup;
		const sel = text.indexOf('<div>');
		expect(findInsertOffset(text, sel)).toBe((script + snippet).length);
	});
});

// ---------------------------------------------------------------------------
// snippetPadding
// ---------------------------------------------------------------------------

describe('snippetPadding', () => {
	it('adds leading \\n when no blank line above', () => {
		// text ends with single \n before insert point
		const text = '</script>\n<div>markup</div>\n';
		const offset = text.indexOf('<div>');
		const { prefix } = snippetPadding(text, offset);
		expect(prefix).toBe('\n');
	});

	it('no leading \\n when blank line already above', () => {
		const text = '</script>\n\n<div>markup</div>\n';
		const offset = text.indexOf('<div>');
		const { prefix } = snippetPadding(text, offset);
		expect(prefix).toBe('');
	});

	it('no leading \\n at start of file', () => {
		const text = '<div>markup</div>\n';
		const { prefix } = snippetPadding(text, 0);
		expect(prefix).toBe('');
	});

	it('adds \\n\\n suffix when markup follows directly', () => {
		const text = '</script>\n<div>markup</div>\n';
		const offset = text.indexOf('<div>');
		const { suffix } = snippetPadding(text, offset);
		expect(suffix).toBe('\n\n');
	});

	it('adds \\n suffix when blank line already follows', () => {
		const text = '{/snippet}\n\n<div>markup</div>\n';
		const offset = text.indexOf('\n\n') + 1; // offset of second \n (the blank line)
		const { suffix } = snippetPadding(text, offset);
		expect(suffix).toBe('\n');
	});

	it('no suffix at end of file', () => {
		const text = '</script>\n';
		const { suffix } = snippetPadding(text, text.length);
		expect(suffix).toBe('');
	});
});
