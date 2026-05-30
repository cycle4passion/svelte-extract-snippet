import * as vscode from 'vscode';
import { findSimilarBlocksVariablized, extractOriginalValues } from './findSimilar';
import { discoverParams, findInsertPosition, snippetPadding, revertDocument, waitForContinue } from './utils';
import { isTypeScript, snippetExists, dedent } from './helpers';

export async function extractAsSnippet(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const document = editor.document;

	if (!document.fileName.endsWith('.svelte') && document.languageId !== 'svelte') {
		vscode.window.showErrorMessage('Svelte Extract as #snippet: Only works in .svelte files.');
		return;
	}

	const selection = editor.selection;
	if (selection.isEmpty) {
		vscode.window.showErrorMessage('Svelte Extract as #snippet: Please select markup to extract.');
		return;
	}

	const originalDocText = document.getText();
	const isTS = isTypeScript(originalDocText);

	const { position: insertPos, offset: insertOffset } = findInsertPosition(
		document,
		document.offsetAt(selection.start),
	);
	if (insertOffset > document.offsetAt(selection.start)) {
		vscode.window.showErrorMessage(
			'Svelte Extract as #snippet: Please select template markup, not script content.',
		);
		return;
	}

	// Ask for snippet name — no document edits yet
	const snippetName = await vscode.window.showInputBox({
		prompt: 'Snippet name',
		placeHolder: 'e.g. snippetName',
		validateInput: (v) => {
			if (!v?.trim()) return 'Name is required';
			if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v.trim()))
				return 'Must be a valid JavaScript identifier';
			if (snippetExists(document.getText(), v.trim()))
				return `A snippet named '${v.trim()}' already exists`;
			return null;
		},
	});

	if (snippetName === undefined) return;
	const name = snippetName.trim();

	// Build draft snippet from selected text
	const selectedText = document.getText(selection);
	const indent = editor.options.insertSpaces ? ' '.repeat(editor.options.tabSize as number) : '\t';
	const body = dedent(selectedText.trim())
		.split('\n')
		.map((l) => indent + l)
		.join('\n');

	const { prefix, suffix } = snippetPadding(originalDocText, insertOffset);
	const draftSnippet = `${prefix}{#snippet ${name}()}\n${body}\n{/snippet}${suffix}`;
	const renderCallDraft = `{@render ${name}()}`;

	// Phase 1: insert snippet at top + replace selection with draft render call
	const phase1ok = await editor.edit(
		(eb) => {
			eb.insert(insertPos, draftSnippet);
			eb.replace(selection, renderCallDraft);
		},
		{ undoStopBefore: true, undoStopAfter: true },
	);

	if (!phase1ok) {
		vscode.window.showErrorMessage('Svelte Extract as #snippet: Edit failed.');
		return;
	}

	// Select inner content of first element in snippet body (e.g. <p>Header</p> → selects "Header")
	const docAfterPhase1 = document.getText();
	const snippetHeader = `{#snippet ${name}()}\n`;
	const snippetClose = `\n{/snippet}`;
	const headerIdx = docAfterPhase1.indexOf(snippetHeader);
	if (headerIdx !== -1) {
		const bodyStartOffset = headerIdx + snippetHeader.length;
		const closeIdx = docAfterPhase1.indexOf(snippetClose, bodyStartOffset);
		const bodyText = docAfterPhase1.slice(bodyStartOffset, closeIdx !== -1 ? closeIdx : undefined);

		const openTagMatch = bodyText.match(/<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/);
		if (openTagMatch && openTagMatch.index !== undefined) {
			const tagName = openTagMatch[1].toLowerCase();
			const innerStart = bodyStartOffset + openTagMatch.index + openTagMatch[0].length;
			const closeTagStr = `</${tagName}>`;
			// find matching close tag by depth
			let depth = 1,
				searchFrom = openTagMatch.index + openTagMatch[0].length;
			const openRe = new RegExp(`<${tagName}[\\s>]`, 'gi');
			const closeRe = new RegExp(`<\\/${tagName}>`, 'gi');
			let innerEnd = closeIdx !== -1 ? closeIdx : bodyStartOffset + bodyText.length;
			while (depth > 0) {
				openRe.lastIndex = searchFrom;
				closeRe.lastIndex = searchFrom;
				const nextOpen = openRe.exec(bodyText);
				const nextClose = closeRe.exec(bodyText);
				if (!nextClose) break;
				if (nextOpen && nextOpen.index < nextClose.index) {
					depth++;
					searchFrom = nextOpen.index + 1;
				} else {
					depth--;
					if (depth === 0) innerEnd = bodyStartOffset + nextClose.index;
					searchFrom = nextClose.index + closeTagStr.length;
				}
			}
			const innerContent = docAfterPhase1.slice(innerStart, innerEnd);
			const isSimple = !/<[a-zA-Z]/.test(innerContent);

			if (isSimple) {
				// Single tag with plain text — select inner content
				const startPos = document.positionAt(innerStart);
				const endPos = document.positionAt(innerEnd);
				editor.selection = new vscode.Selection(startPos, endPos);
				editor.revealRange(
					new vscode.Range(startPos, endPos),
					vscode.TextEditorRevealType.InCenter,
				);
			} else {
				// Complex markup — cursor at start of body
				const startPos = document.positionAt(bodyStartOffset);
				editor.selection = new vscode.Selection(startPos, startPos);
				editor.revealRange(
					new vscode.Range(startPos, startPos),
					vscode.TextEditorRevealType.InCenter,
				);
			}
		} else {
			// No element tag — cursor at start of body
			const startPos = document.positionAt(bodyStartOffset);
			editor.selection = new vscode.Selection(startPos, startPos);
			editor.revealRange(
				new vscode.Range(startPos, startPos),
				vscode.TextEditorRevealType.InCenter,
			);
		}
	}

	// Show persistent status bar Continue button
	vscode.window.showInformationMessage(`Variablize body: replace literals with {paramName}`);
	// Fire second notification after first auto-dismisses (~4s), without blocking the status bar
	new Promise<void>((resolve) => setTimeout(resolve, 4000)).then(() =>
		vscode.window.showInformationMessage(
			`Then click ✓ Continue {#snippet} Extraction in the status bar`,
		),
	);
	const didContinue = await waitForContinue(
		'When done updating snippet body with params, click here to continue',
	);

	if (!didContinue) {
		await revertDocument(editor, document, originalDocText);
		return;
	}

	// Extract variablized body from between snippet markers
	const currentDocText = document.getText();
	const snippetOpenMarker = `{#snippet ${name}()}\n`;
	const snippetCloseMarker = `\n{/snippet}`;
	const openIdx = currentDocText.indexOf(snippetOpenMarker);
	const closeIdx = openIdx !== -1 ? currentDocText.indexOf(snippetCloseMarker, openIdx) : -1;

	if (openIdx === -1 || closeIdx === -1) {
		await revertDocument(editor, document, originalDocText);
		vscode.window.showErrorMessage(
			'Svelte Extract as #snippet: Could not locate snippet body. Did you delete the snippet markers?',
		);
		return;
	}

	const variablizedBody = currentDocText.slice(openIdx + snippetOpenMarker.length, closeIdx);
	const paramNameList = discoverParams(variablizedBody, selectedText);

	const params =
		isTS && paramNameList.length > 0
			? paramNameList.map((n) => `${n}: any`).join(', ')
			: paramNameList.join(', ');
	const paramNames = paramNameList.join(', ');

	// Phase 2: update signature, render call, and all similar blocks in one atomic edit
	let replacedCount = 0;

	if (paramNameList.length > 0) {
		const oldHeader = `{#snippet ${name}()}`;
		const newHeader = `{#snippet ${name}(${params})}`;
		const oldRender = `{@render ${name}()}`;

		const originalValues = extractOriginalValues(
			dedent(variablizedBody.trim()),
			dedent(selectedText.trim()),
			paramNameList,
		);
		const originalArgs = paramNameList.map((p) => originalValues.get(p) ?? p).join(', ');
		const newRender = `{@render ${name}(${originalArgs})}`;

		const headerPos = currentDocText.indexOf(oldHeader);
		const renderPos = currentDocText.indexOf(oldRender);

		if (headerPos !== -1 && renderPos !== -1) {
			const candidates = findSimilarBlocksVariablized(
				currentDocText,
				dedent(variablizedBody.trim()),
				paramNameList,
			);

			await editor.edit(
				(eb) => {
					eb.replace(
						new vscode.Range(
							document.positionAt(headerPos),
							document.positionAt(headerPos + oldHeader.length),
						),
						newHeader,
					);
					eb.replace(
						new vscode.Range(
							document.positionAt(renderPos),
							document.positionAt(renderPos + oldRender.length),
						),
						newRender,
					);
					for (const candidate of candidates) {
						const args = paramNameList.map((p) => candidate.paramValues.get(p) ?? p);
						const filledRender = `{@render ${name}(${args.join(', ')})}`;
						let blockEndOffset = candidate.startOffset + candidate.originalText.length;
						if (currentDocText[blockEndOffset] === '\n' && currentDocText[blockEndOffset + 1] === '\n') {
							blockEndOffset++;
						}
						eb.replace(
							new vscode.Range(
								document.positionAt(candidate.startOffset),
								document.positionAt(blockEndOffset),
							),
							filledRender,
						);
					}
				},
				{ undoStopBefore: true, undoStopAfter: true },
			);

			replacedCount = candidates.length;
		}
	}

	// Position cursor: TS with params → select first 'any'; else cursor inside ()
	const positionCursor = () => {
		const text = document.getText();
		const pattern = `{#snippet ${name}(`;
		const idx = text.indexOf(pattern);
		if (idx === -1) return;
		if (isTS && paramNameList.length > 0) {
			const anyIdx = text.indexOf('any', idx + pattern.length);
			if (anyIdx !== -1) {
				const start = document.positionAt(anyIdx);
				const end = document.positionAt(anyIdx + 3);
				editor.selection = new vscode.Selection(start, end);
				editor.revealRange(
					new vscode.Range(start, end),
					vscode.TextEditorRevealType.InCenterIfOutsideViewport,
				);
				return;
			}
		}
		const cursorPos = document.positionAt(idx + pattern.length);
		editor.selection = new vscode.Selection(cursorPos, cursorPos);
		editor.revealRange(
			new vscode.Range(cursorPos, cursorPos),
			vscode.TextEditorRevealType.InCenterIfOutsideViewport,
		);
	};

	if (paramNameList.length > 0) {
		vscode.window.showInformationMessage(
			`Snippet extracted. ${replacedCount + 1} block(s) replaced with @render.`,
		);
	}
	if (isTS && paramNameList.length > 0) {
		vscode.window.showInformationMessage(`You probably wish to update snippet types`);
	} else if (paramNames) {
		vscode.window.showInformationMessage(`Now update markup to reference params (${paramNames})`);
	}

	positionCursor();
}
