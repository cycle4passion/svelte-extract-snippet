import * as vscode from 'vscode';
import { extractAsSnippet } from './extractSnippet';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		'svelte-extract-snippet.extract',
		() => extractAsSnippet()
	);
	context.subscriptions.push(disposable);
}

export function deactivate() {}
