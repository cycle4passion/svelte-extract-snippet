import { describe, it, expect } from 'vitest';
import { extractOriginalValues, findSimilarBlocksVariablized } from './findSimilar';
import { discoverParams } from './utils';

// ---------------------------------------------------------------------------
// discoverParams
// ---------------------------------------------------------------------------

describe('discoverParams', () => {
	it('discovers a newly added param', () => {
		expect(discoverParams('<p>{label}</p>', '<p>Revenue</p>')).toEqual(['label']);
	});

	it('discovers multiple new params in order', () => {
		expect(discoverParams('<p>{label}</p><p>{value}</p>', '<p>A</p><p>B</p>')).toEqual(['label', 'value']);
	});

	it('excludes pre-existing {identifier} from the original', () => {
		// {title} was already in the original — should NOT become a param
		expect(discoverParams('<p>{title}</p>', '<p>{title}</p>')).toEqual([]);
	});

	it('excludes pre-existing refs but includes new ones', () => {
		const original = '<div class={cls}>Hello {name}</div>';
		const variablized = '<div class={cls}>{greeting} {name}</div>';
		// {cls} and {name} were pre-existing; {greeting} is new
		expect(discoverParams(variablized, original)).toEqual(['greeting']);
	});

	it('deduplicates repeated new params', () => {
		expect(discoverParams('<p>{label}</p><p>{label}</p>', '<p>A</p><p>B</p>')).toEqual(['label']);
	});

	it('returns empty when no {} expressions', () => {
		expect(discoverParams('<p>Hello</p>', '<p>Hello</p>')).toEqual([]);
	});

	it('ignores complex expressions like {obj.prop}', () => {
		expect(discoverParams('<p>{obj.prop}</p>', '<p>old</p>')).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// extractOriginalValues
// ---------------------------------------------------------------------------

describe('extractOriginalValues', () => {
	it('returns empty map when no params', () => {
		const result = extractOriginalValues('<p>Hello</p>', '<p>Hello</p>', []);
		expect(result.size).toBe(0);
	});

	it('extracts text content as quoted string', () => {
		const result = extractOriginalValues('<p>{content}</p>', '<p>Hello</p>', ['content']);
		expect(result.get('content')).toBe('"Hello"');
	});

	it('extracts expression content unquoted', () => {
		const result = extractOriginalValues('<p>{content}</p>', '<p>{someVar}</p>', ['content']);
		expect(result.get('content')).toBe('someVar');
	});

	it('extracts literal attribute as quoted string', () => {
		const result = extractOriginalValues(
			'<div class={cls}>text</div>',
			'<div class="card">text</div>',
			['cls']
		);
		expect(result.get('cls')).toBe('"card"');
	});

	it('extracts expression attribute unquoted', () => {
		const result = extractOriginalValues(
			'<div class={cls}>text</div>',
			'<div class={myClass}>text</div>',
			['cls']
		);
		expect(result.get('cls')).toBe('myClass');
	});

	it('extracts two params', () => {
		const variablized = '<div><span>{label}</span><span>{value}</span></div>';
		const original = '<div><span>Revenue</span><span>$4,200</span></div>';
		const result = extractOriginalValues(variablized, original, ['label', 'value']);
		expect(result.get('label')).toBe('"Revenue"');
		expect(result.get('value')).toBe('"$4,200"');
	});

	it('returns empty map when structure does not match', () => {
		const result = extractOriginalValues('<p>{content}</p>', '<span>Hello</span>', ['content']);
		expect(result.size).toBe(0);
	});

	it('handles special characters in text content', () => {
		const result = extractOriginalValues('<p>{content}</p>', '<p>It\'s "quoted"</p>', ['content']);
		expect(result.get('content')).toBe('"It\'s \\"quoted\\""');
	});
});

// ---------------------------------------------------------------------------
// findSimilarBlocksVariablized
// ---------------------------------------------------------------------------

describe('findSimilarBlocksVariablized', () => {
	it('returns empty when no params', () => {
		const doc = '<script></script><p>Hello</p><p>World</p>';
		expect(findSimilarBlocksVariablized(doc, '<p>{content}</p>', [])).toHaveLength(0);
	});

	it('finds matching sibling blocks', () => {
		const doc = `<script></script>
<p>Hello</p>
<p>World</p>`;
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		expect(results).toHaveLength(2);
	});

	it('stores text param values as quoted strings', () => {
		const doc = '<script></script><p>Hello</p>';
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		expect(results[0].paramValues.get('content')).toBe('"Hello"');
	});

	it('stores expression param values unquoted', () => {
		const doc = '<script></script><p>{myVar}</p>';
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		expect(results[0].paramValues.get('content')).toBe('myVar');
	});

	it('finds two-param matches', () => {
		const doc = `<script></script>
<div class="stat"><span class="label">Revenue</span><span class="value">$4,200</span></div>
<div class="stat"><span class="label">Users</span><span class="value">1,847</span></div>`;
		const variablized = '<div class="stat"><span class="label">{label}</span><span class="value">{value}</span></div>';
		const results = findSimilarBlocksVariablized(doc, variablized, ['label', 'value']);
		expect(results).toHaveLength(2);
		expect(results[0].paramValues.get('label')).toBe('"Revenue"');
		expect(results[0].paramValues.get('value')).toBe('"$4,200"');
		expect(results[1].paramValues.get('label')).toBe('"Users"');
		expect(results[1].paramValues.get('value')).toBe('"1,847"');
	});

	it('excludes blocks inside snippet ranges', () => {
		const doc = `<script></script>
{#snippet pg(content: string)}
<p>{content}</p>
{/snippet}
<p>Hello</p>`;
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		// Only the <p>Hello</p> outside the snippet should match
		expect(results).toHaveLength(1);
		expect(results[0].paramValues.get('content')).toBe('"Hello"');
	});

	it('does not match blocks with different structure', () => {
		const doc = '<script></script><span>Hello</span>';
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		expect(results).toHaveLength(0);
	});

	it('does not match blocks with different attributes', () => {
		const doc = '<script></script><p class="foo">Hello</p>';
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		expect(results).toHaveLength(0);
	});

	it('does not match when param is inconsistent across uses', () => {
		// variablized uses {content} twice, candidate has different values — no match
		const doc = '<script></script><p><span>A</span><span>B</span></p>';
		const variablized = '<p><span>{content}</span><span>{content}</span></p>';
		const results = findSimilarBlocksVariablized(doc, variablized, ['content']);
		expect(results).toHaveLength(0);
	});

	it('matches when same param appears twice with same value', () => {
		const doc = '<script></script><p><span>A</span><span>A</span></p>';
		const variablized = '<p><span>{content}</span><span>{content}</span></p>';
		const results = findSimilarBlocksVariablized(doc, variablized, ['content']);
		expect(results).toHaveLength(1);
		expect(results[0].paramValues.get('content')).toBe('"A"');
	});

	it('reports correct startOffset', () => {
		const prefix = '<script></script>\n';
		const block = '<p>Hello</p>';
		const doc = prefix + block;
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		expect(results[0].startOffset).toBe(prefix.length);
		expect(results[0].originalText).toBe(block);
	});

	it('skips markup inside <style>', () => {
		const doc = '<script></script><p>Hello</p><style>p { color: red; }</style>';
		const results = findSimilarBlocksVariablized(doc, '<p>{content}</p>', ['content']);
		expect(results).toHaveLength(1);
	});

	it('handles self-closing void tags in structure', () => {
		const doc = '<script></script><label>Name<input type="text" /></label><label>Age<input type="text" /></label>';
		const variablized = '<label>{label}<input type="text" /></label>';
		const results = findSimilarBlocksVariablized(doc, variablized, ['label']);
		expect(results).toHaveLength(2);
		expect(results[0].paramValues.get('label')).toBe('"Name"');
		expect(results[1].paramValues.get('label')).toBe('"Age"');
	});

	it('handles attribute param with expression value', () => {
		const doc = '<script></script><div class={foo}>text</div><div class={bar}>text</div>';
		const variablized = '<div class={cls}>text</div>';
		const results = findSimilarBlocksVariablized(doc, variablized, ['cls']);
		expect(results).toHaveLength(2);
		expect(results[0].paramValues.get('cls')).toBe('foo');
		expect(results[1].paramValues.get('cls')).toBe('bar');
	});

	// --- section-ordering variants ---

	it('finds siblings: markup only (no script or style)', () => {
		const doc = '<div>A</div><div>B</div>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: script → markup', () => {
		const doc = '<script></script><div>A</div><div>B</div>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: markup → script', () => {
		const doc = '<div>A</div><div>B</div><script></script>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: script → markup → style', () => {
		const doc = '<script></script><div>A</div><div>B</div><style></style>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: markup → script → style', () => {
		const doc = '<div>A</div><div>B</div><script></script><style></style>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: style → markup → script', () => {
		const doc = '<style></style><div>A</div><div>B</div><script></script>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: markup → style (no script)', () => {
		const doc = '<div>A</div><div>B</div><style></style>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: style → markup (no script)', () => {
		const doc = '<style></style><div>A</div><div>B</div>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});

	it('finds siblings: script → style → markup', () => {
		const doc = '<script></script><style></style><div>A</div><div>B</div>';
		const results = findSimilarBlocksVariablized(doc, '<div>{c}</div>', ['c']);
		expect(results).toHaveLength(2);
	});
});
