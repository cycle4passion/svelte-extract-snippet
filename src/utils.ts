import * as vscode from 'vscode';

export function findInsertOffset(text: string, selectionStartOffset: number): number {
	// Find end of all </script> and </style> blocks that appear before the selection
	let blockEnd = 0;
	const closingTagRe = /<\/(?:script|style)>/gi;
	let m: RegExpExecArray | null;
	while ((m = closingTagRe.exec(text)) !== null) {
		const tagEnd = m.index + m[0].length;
		if (tagEnd <= selectionStartOffset) {
			blockEnd = Math.max(blockEnd, tagEnd);
		}
	}

	// Advance to the start of the line after the closing tag
	let pos = 0;
	if (blockEnd > 0) {
		pos = blockEnd;
		while (pos < text.length && text[pos] !== '\n') pos++;
		if (pos < text.length) pos++;
	}

	// Scan past consecutive top-level {#snippet} blocks, tracking nesting depth
	while (pos < selectionStartOffset) {
		if (text[pos] === '\n' || text[pos] === '\r') { pos++; continue; }

		if (text.startsWith('{#snippet ', pos)) {
			let depth = 0;
			while (pos < text.length) {
				if (text.startsWith('{#snippet ', pos)) {
					depth++;
					pos += 10;
				} else if (text.startsWith('{/snippet}', pos)) {
					depth--;
					pos += 10;
					if (depth === 0) break;
				} else {
					pos++;
				}
			}
			if (pos < text.length && text[pos] === '\r') pos++;
			if (pos < text.length && text[pos] === '\n') pos++;
		} else {
			break;
		}
	}

	return pos;
}

export function snippetPadding(
	text: string,
	insertOffset: number,
): { prefix: string; suffix: string } {
	const hasContentAbove = insertOffset > 0;
	const hasBlankLineAbove = insertOffset >= 2 && text[insertOffset - 2] === '\n';
	const prefix = hasContentAbove && !hasBlankLineAbove ? '\n' : '';

	const hasContentBelow = insertOffset < text.length;
	const suffix = hasContentBelow ? (text[insertOffset] === '\n' ? '\n' : '\n\n') : '';

	return { prefix, suffix };
}

export function findInsertPosition(
	document: vscode.TextDocument,
	selectionStartOffset: number,
): { position: vscode.Position; offset: number } {
	const offset = findInsertOffset(document.getText(), selectionStartOffset);
	return { position: document.positionAt(offset), offset };
}

export async function revertDocument(
	editor: vscode.TextEditor,
	document: vscode.TextDocument,
	originalText: string,
): Promise<void> {
	const fullRange = new vscode.Range(
		new vscode.Position(0, 0),
		document.positionAt(document.getText().length),
	);
	await editor.edit((eb) => eb.replace(fullRange, originalText), {
		undoStopBefore: true,
		undoStopAfter: true,
	});
}

// Shows a persistent status bar button and waits for the user to click it.
// Returns true if Continue was clicked, false if cancelled via the escape item.
export function waitForContinue(hint: string): Promise<boolean> {
	return new Promise((resolve) => {
		const cmdId = `svelte-extract-snippet.continue_${Date.now()}`;

		const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
		statusBar.text = '$(check) Continue {#snippet} Extraction';
		statusBar.tooltip = hint;
		statusBar.command = cmdId;
		statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		statusBar.show();

		const cmd = vscode.commands.registerCommand(cmdId, () => {
			statusBar.dispose();
			cmd.dispose();
			resolve(true);
		});
	});
}

// Only treat {identifier} as a param if it didn't already exist in the original markup
export function discoverParams(variablizedText: string, originalText: string): string[] {
	const preExisting = new Set<string>();
	const preRe = /\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}/g;
	let m: RegExpExecArray | null;
	while ((m = preRe.exec(originalText)) !== null) {
		preExisting.add(m[1]);
	}

	const seen = new Set<string>();
	const params: string[] = [];
	const re = /\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}/g;
	while ((m = re.exec(variablizedText)) !== null) {
		if (!preExisting.has(m[1]) && !seen.has(m[1])) {
			seen.add(m[1]);
			params.push(m[1]);
		}
	}
	return params;
}
