export class Position {
	constructor(public line: number, public character: number) {}
}
export class Range {
	constructor(public start: Position, public end: Position) {}
}
export class Selection extends Range {}
export const window = {};
export const commands = {};
export const StatusBarAlignment = { Left: 1, Right: 2 };
export class ThemeColor {
	constructor(public id: string) {}
}
export const TextEditorRevealType = { InCenter: 0, InCenterIfOutsideViewport: 1 };
