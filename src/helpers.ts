export function isTypeScript(text: string): boolean {
	return /<script[^>]+lang=["'](ts|typescript)["']/i.test(text);
}

export function snippetExists(text: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`\\{#snippet\\s+${escaped}\\s*\\(`).test(text);
}

export function dedent(text: string): string {
	const lines = text.split('\n');
	const nonEmpty = lines.filter((l) => l.trim().length > 0);
	if (nonEmpty.length === 0) return text;
	const minIndent = Math.min(...nonEmpty.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0));
	return lines.map((l) => l.slice(minIndent)).join('\n');
}
