import { describe, expect, it } from 'vitest';
import { dedent, isTypeScript, snippetExists } from './helpers';

describe('isTypeScript', () => {
	it('detects lang="ts"', () => {
		expect(isTypeScript('<script lang="ts">')).toBe(true);
	});

	it('detects lang="typescript"', () => {
		expect(isTypeScript('<script lang="typescript">')).toBe(true);
	});

	it('detects single-quoted lang', () => {
		expect(isTypeScript("<script lang='ts'>")).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(isTypeScript('<script LANG="TS">')).toBe(true);
	});

	it('returns false for plain script tag', () => {
		expect(isTypeScript('<script>')).toBe(false);
	});

	it('returns false for lang="js"', () => {
		expect(isTypeScript('<script lang="js">')).toBe(false);
	});

	it('returns false when no script tag present', () => {
		expect(isTypeScript('<div>hello</div>')).toBe(false);
	});
});

describe('snippetExists', () => {
	it('finds an existing snippet', () => {
		expect(snippetExists('{#snippet myCard(title)}\n<p>{title}</p>\n{/snippet}', 'myCard')).toBe(true);
	});

	it('returns false when snippet is absent', () => {
		expect(snippetExists('<div>hello</div>', 'myCard')).toBe(false);
	});

	it('does not match a snippet with a different name', () => {
		expect(snippetExists('{#snippet otherCard()}', 'myCard')).toBe(false);
	});

	it('handles names with regex special characters', () => {
		// name like "foo.bar" must not be treated as a regex pattern
		expect(snippetExists('{#snippet fooXbar()}', 'foo.bar')).toBe(false);
		expect(snippetExists('{#snippet foo.bar()}', 'foo.bar')).toBe(true);
	});

	it('does not match a prefix of another name', () => {
		expect(snippetExists('{#snippet myCardExtended()}', 'myCard')).toBe(false);
	});

	it('allows whitespace between name and opening paren', () => {
		expect(snippetExists('{#snippet myCard  ()}', 'myCard')).toBe(true);
	});
});

describe('dedent', () => {
	it('removes common leading whitespace', () => {
		const input = '  <div>\n    <p>hi</p>\n  </div>';
		expect(dedent(input)).toBe('<div>\n  <p>hi</p>\n</div>');
	});

	it('leaves already-flush text unchanged', () => {
		const input = '<div>\n  <p>hi</p>\n</div>';
		expect(dedent(input)).toBe(input);
	});

	it('returns empty string unchanged', () => {
		expect(dedent('')).toBe('');
	});

	it('returns all-whitespace string unchanged', () => {
		expect(dedent('   \n   ')).toBe('   \n   ');
	});

	it('handles single-line input', () => {
		expect(dedent('    hello')).toBe('hello');
	});

	it('ignores empty lines when computing min indent', () => {
		const input = '    foo\n\n    bar';
		expect(dedent(input)).toBe('foo\n\nbar');
	});

	it('handles tab indentation', () => {
		const input = '\t\tfoo\n\t\tbar';
		expect(dedent(input)).toBe('foo\nbar');
	});
});
