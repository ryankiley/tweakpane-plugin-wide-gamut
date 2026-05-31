/*
 * Top-level colour view, reusing Tweakpane's native `tp-colv` layout (header with
 * swatch + colour text field, plus the popup container) so sizing, padding and
 * margins match the built-in picker exactly.
 */
import {
	type Foldable,
	type View,
	type ViewProps,
	ClassName,
} from '@tweakpane/core';

const cnCol = ClassName('col');
const cnSw = ClassName('colsw');

interface Config {
	viewProps: ViewProps;
	foldable: Foldable;
}

export class ColorView implements View {
	public readonly element: HTMLElement;
	public readonly swatchButtonElement: HTMLButtonElement;
	public readonly swatchBoxElement: HTMLElement;
	public readonly textElement: HTMLElement;

	constructor(doc: Document, config: Config) {
		const root = doc.createElement('div');
		root.classList.add(cnCol(), cnCol(undefined, 'cpl'));
		config.viewProps.bindClassModifiers(root);
		config.foldable.bindExpandedClass(root, cnCol(undefined, 'expanded'));

		const head = doc.createElement('div');
		head.classList.add(cnCol('h'));
		root.appendChild(head);

		const swatchWrap = doc.createElement('div');
		swatchWrap.classList.add(cnCol('s'));
		head.appendChild(swatchWrap);

		const swatch = doc.createElement('div');
		swatch.classList.add(cnSw());
		config.viewProps.bindClassModifiers(swatch);
		swatchWrap.appendChild(swatch);

		const box = doc.createElement('div');
		box.classList.add(cnSw('sw'));
		swatch.appendChild(box);
		this.swatchBoxElement = box;

		const button = doc.createElement('button');
		button.classList.add(cnSw('b'));
		config.viewProps.bindDisabled(button);
		swatch.appendChild(button);
		this.swatchButtonElement = button;

		const text = doc.createElement('div');
		text.classList.add(cnCol('t'));
		head.appendChild(text);
		this.textElement = text;

		this.element = root;
	}
}
