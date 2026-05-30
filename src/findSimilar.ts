export interface SimilarBlock {
	originalText: string;
	startOffset: number;
	paramValues: Map<string, string>; // param name → value found in candidate
}

type Token =
	| { kind: 'open'; tag: string; attrPairs: [string, string][] }
	| { kind: 'close'; tag: string }
	| { kind: 'self-close'; tag: string; attrPairs: [string, string][] }
	| { kind: 'text'; value: string }
	| { kind: 'expr'; value: string };

const VOID_TAGS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function parseAttrs(attrStr: string): [string, string][] {
	const attrs: [string, string][] = [];
	const re = /([a-zA-Z:@][a-zA-Z0-9:_\-.@]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\{[^}]*\})|(\S+)))?/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(attrStr)) !== null) {
		const val = m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
		attrs.push([m[1], val]);
	}
	return attrs;
}

function tokenize(html: string): Token[] | null {
	const tokens: Token[] = [];
	let i = 0;

	while (i < html.length) {
		if (/\s/.test(html[i])) { i++; continue; }

		if (html[i] === '<') {
			if (html.startsWith('<!--', i)) {
				const end = html.indexOf('-->', i + 4);
				if (end === -1) return null;
				i = end + 3;
				continue;
			}

			const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/)?>/s.exec(html.slice(i));
			if (!tagMatch) return null;

			const isClose = tagMatch[1] === '/';
			const tag = tagMatch[2].toLowerCase();
			const attrStr = tagMatch[3].trim();
			const isSelfClose = tagMatch[4] === '/' || VOID_TAGS.has(tag);

			if (isClose) {
				tokens.push({ kind: 'close', tag });
			} else if (isSelfClose) {
				tokens.push({ kind: 'self-close', tag, attrPairs: parseAttrs(attrStr) });
			} else {
				tokens.push({ kind: 'open', tag, attrPairs: parseAttrs(attrStr) });
			}
			i += tagMatch[0].length;

		} else if (html[i] === '{') {
			let depth = 0;
			let j = i;
			while (j < html.length) {
				if (html[j] === '{') depth++;
				else if (html[j] === '}') { depth--; if (depth === 0) { j++; break; } }
				j++;
			}
			tokens.push({ kind: 'expr', value: html.slice(i, j) });
			i = j;

		} else {
			let j = i;
			while (j < html.length && html[j] !== '<' && html[j] !== '{') j++;
			const text = html.slice(i, j).trim();
			if (text) tokens.push({ kind: 'text', value: text });
			i = j;
		}
	}

	return tokens;
}

// Returns the param name if value is exactly {identifier}, else null
function getSimpleIdentifier(value: string): string | null {
	const m = value.match(/^\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}$/);
	return m ? m[1] : null;
}

// Extracts a leaf value from a candidate token, stripping expr braces
function getLeafValue(token: Token): string | null {
	if (token.kind === 'text') return token.value;
	if (token.kind === 'expr') return token.value.slice(1, -1).trim();
	return null;
}


interface CompareResult {
	matches: boolean;
	paramValues: Map<string, string>;
}

// Compare variablized tokens vs candidate tokens.
// {paramName} positions in variablized are wildcards; all else must match exactly.
// All occurrences of the same param must have the same value in the candidate.
function compareVariablized(
	variablized: Token[],
	candidate: Token[],
	paramNames: string[]
): CompareResult {
	const empty = { matches: false, paramValues: new Map<string, string>() };
	if (variablized.length !== candidate.length) return empty;

	const paramValues = new Map<string, string>();

	for (let i = 0; i < variablized.length; i++) {
		const v = variablized[i];
		const c = candidate[i];

		// Param slot: variablized has {identifier} expr that is a known param
		if (v.kind === 'expr') {
			const paramName = getSimpleIdentifier(v.value);
			if (paramName && paramNames.includes(paramName)) {
				const cVal = getLeafValue(c);
				if (cVal === null) return empty;

				// Text nodes are string literals → quote them; expr tokens are JS expressions → use as-is
				const storedVal = c.kind === 'text' ? JSON.stringify(cVal) : cVal;

				if (paramValues.has(paramName)) {
					if (paramValues.get(paramName) !== storedVal) return empty;
				} else {
					paramValues.set(paramName, storedVal);
				}
				continue;
			}
		}

		// Non-param: must match exactly
		if (v.kind !== c.kind) return empty;

		if (v.kind === 'text' && c.kind === 'text') {
			if (v.value !== c.value) return empty;

		} else if (v.kind === 'expr' && c.kind === 'expr') {
			if (v.value !== c.value) return empty;

		} else if (
			(v.kind === 'open' || v.kind === 'self-close') &&
			(c.kind === 'open' || c.kind === 'self-close')
		) {
			if (v.tag !== c.tag) return empty;
			if (v.attrPairs.length !== c.attrPairs.length) return empty;

			for (let j = 0; j < v.attrPairs.length; j++) {
				if (v.attrPairs[j][0] !== c.attrPairs[j][0]) return empty;

				const vAttrVal = v.attrPairs[j][1];
				const cAttrVal = c.attrPairs[j][1];

				const paramName = getSimpleIdentifier(vAttrVal);
				if (paramName && paramNames.includes(paramName)) {
					// Expression attr ({someVar}) → use unbraced value; literal attr ("foo") → quote it
					const isExprAttr = cAttrVal.startsWith('{') && cAttrVal.endsWith('}');
					const finalVal = isExprAttr
						? cAttrVal.slice(1, -1).trim()
						: JSON.stringify(cAttrVal);
					if (paramValues.has(paramName)) {
						if (paramValues.get(paramName) !== finalVal) return empty;
					} else {
						paramValues.set(paramName, finalVal);
					}
				} else if (vAttrVal !== cAttrVal) {
					return empty;
				}
			}

		} else if (v.kind === 'close' && c.kind === 'close') {
			if (v.tag !== c.tag) return empty;
		}
	}

	return { matches: true, paramValues };
}

function findRootTag(html: string): string | null {
	const m = html.trim().match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
	return m ? m[1].toLowerCase() : null;
}

function getExcludeRanges(docText: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	const blockRe = /<(script|style)[\s>][\s\S]*?<\/\1>/gi;
	let m: RegExpExecArray | null;
	while ((m = blockRe.exec(docText)) !== null) {
		ranges.push([m.index, m.index + m[0].length]);
	}
	const snippetRe = /\{#snippet\s/g;
	while ((m = snippetRe.exec(docText)) !== null) {
		const end = docText.indexOf('{/snippet}', m.index);
		if (end !== -1) ranges.push([m.index, end + '{/snippet}'.length]);
	}
	return ranges;
}

function isInRange(pos: number, ranges: Array<[number, number]>): boolean {
	return ranges.some(([s, e]) => pos >= s && pos < e);
}

function findElementBlocks(
	text: string,
	baseOffset: number,
	rootTag: string,
	excludeRanges: Array<[number, number]>
): Array<{ text: string; startOffset: number }> {
	const results: Array<{ text: string; startOffset: number }> = [];
	const lText = text.toLowerCase();
	const openStr = `<${rootTag}`;
	const closeStr = `</${rootTag}>`;

	let pos = 0;
	while (pos < text.length) {
		const openIdx = lText.indexOf(openStr, pos);
		if (openIdx === -1) break;

		const nextChar = lText[openIdx + openStr.length];
		if (nextChar !== '>' && nextChar !== ' ' && nextChar !== '\n' &&
			nextChar !== '\t' && nextChar !== '\r' && nextChar !== '/') {
			pos = openIdx + 1;
			continue;
		}

		const absStart = baseOffset + openIdx;
		if (isInRange(absStart, excludeRanges)) { pos = openIdx + 1; continue; }

		const tagEnd = lText.indexOf('>', openIdx);
		if (tagEnd === -1) break;
		if (lText[tagEnd - 1] === '/') { pos = tagEnd + 1; continue; }

		let depth = 1;
		let searchFrom = tagEnd + 1;

		while (depth > 0 && searchFrom < text.length) {
			const nextClose = lText.indexOf(closeStr, searchFrom);
			if (nextClose === -1) { depth = -1; break; }

			const nextOpen = lText.indexOf(openStr, searchFrom);
			let isFullOpen = false;
			if (nextOpen !== -1 && nextOpen < nextClose) {
				const c = lText[nextOpen + openStr.length];
				isFullOpen = c === '>' || c === ' ' || c === '\n' || c === '\t' || c === '\r';
			}

			if (isFullOpen && nextOpen < nextClose) {
				const innerTagEnd = lText.indexOf('>', nextOpen);
				if (innerTagEnd !== -1 && lText[innerTagEnd - 1] === '/') {
					searchFrom = innerTagEnd + 1;
				} else {
					depth++;
					searchFrom = nextOpen + openStr.length;
				}
			} else {
				depth--;
				searchFrom = nextClose + closeStr.length;
			}
		}

		if (depth === 0) {
			results.push({ text: text.slice(openIdx, searchFrom), startOffset: absStart });
		}

		pos = openIdx + 1;
	}

	return results;
}

// Extracts the original literal values at each param's positions by comparing
// the variablized body against the original (pre-edit) body.
export function extractOriginalValues(
	variablizedBody: string,
	originalBody: string,
	paramNames: string[]
): Map<string, string> {
	if (paramNames.length === 0) return new Map();
	const vTokens = tokenize(variablizedBody);
	const oTokens = tokenize(originalBody);
	if (!vTokens || !oTokens) return new Map();
	const result = compareVariablized(vTokens, oTokens, paramNames);
	return result.matches ? result.paramValues : new Map();
}

export function findSimilarBlocksVariablized(
	docText: string,
	variablizedBody: string,
	paramNames: string[]
): SimilarBlock[] {
	if (paramNames.length === 0) return [];

	const rootTag = findRootTag(variablizedBody);
	if (!rootTag) return [];

	const variablizedTokens = tokenize(variablizedBody);
	if (!variablizedTokens) return [];

	const excludeRanges = getExcludeRanges(docText);
	const candidates = findElementBlocks(docText, 0, rootTag, excludeRanges);

	const results: SimilarBlock[] = [];
	for (const candidate of candidates) {
		const candidateTokens = tokenize(candidate.text);
		if (!candidateTokens) continue;

		const result = compareVariablized(variablizedTokens, candidateTokens, paramNames);
		if (!result.matches) continue;

		// All declared params must have found a value (exact N match)
		if (result.paramValues.size !== paramNames.length) continue;

		results.push({
			originalText: candidate.text,
			startOffset: candidate.startOffset,
			paramValues: result.paramValues,
		});
	}

	return results;
}
