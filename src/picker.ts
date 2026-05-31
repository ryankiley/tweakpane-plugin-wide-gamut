/*
 * The picker body, reusing Tweakpane's native `tp-colpv` layout: an `_hsv` block
 * (colour area + hue strip), the `_rgb` texts row, and — when the value has alpha
 * — an `_a` row holding the alpha strip (`_ap`) + an alpha number input (`_at`).
 * The mode value is owned here and shared with the area, hue strip and texts row.
 */
import {
	type Value,
	type ViewProps,
	ClassName,
	createNumberFormatter,
	createRangeConstraint,
	createValue,
	NumberTextController,
	parseNumber,
	ValueMap,
} from '@tweakpane/core';

import {AreaController} from './area.js';
import {type EditMode, OklchColor} from './model/color.js';
import {StripController} from './strip.js';
import {TextsController} from './texts.js';

const cn = ClassName('colp');

interface Config {
	value: Value<OklchColor>;
	viewProps: ViewProps;
}

export class PickerController {
	public readonly element: HTMLElement;
	public readonly mode: Value<EditMode>;
	private readonly area_: AreaController;
	private readonly texts_: TextsController;

	constructor(doc: Document, config: Config) {
		// Start in the value's own mode, so the dropdown + collapsed readout agree.
		this.mode = createValue<EditMode>(config.value.rawValue.mode);
		const shared = {
			value: config.value,
			mode: this.mode,
			viewProps: config.viewProps,
		};

		const root = doc.createElement('div');
		root.classList.add(cn());
		config.viewProps.bindClassModifiers(root);

		// HSV block: colour area + hue strip.
		const hsv = doc.createElement('div');
		hsv.classList.add(cn('hsv'));
		root.appendChild(hsv);

		const svWrap = doc.createElement('div');
		svWrap.classList.add(cn('sv'));
		this.area_ = new AreaController(doc, shared);
		svWrap.appendChild(this.area_.element);
		hsv.appendChild(svWrap);

		const hWrap = doc.createElement('div');
		hWrap.classList.add(cn('h'));
		const hue = new StripController(doc, {kind: 'hue', ...shared});
		hWrap.appendChild(hue.element);
		hsv.appendChild(hWrap);

		// Texts row (mode dropdown + channel inputs).
		const rgb = doc.createElement('div');
		rgb.classList.add(cn('rgb'));
		this.texts_ = new TextsController(doc, shared);
		rgb.appendChild(this.texts_.element);
		root.appendChild(rgb);

		// Alpha row — only when the bound value carries alpha (matches native).
		if (config.value.rawValue.hasAlpha) {
			root.appendChild(this.createAlphaRow_(doc, config.value, shared));
		}

		// Follow the value's output format: typing a different-format colour into
		// the text field (e.g. a hex while in OKLCH mode) re-points the mode
		// dropdown, so it never disagrees with the collapsed readout.
		config.value.emitter.on('change', () => {
			const mode = config.value.rawValue.mode;
			if (mode !== this.mode.rawValue) {
				this.mode.rawValue = mode;
			}
		});

		this.element = root;
	}

	private createAlphaRow_(
		doc: Document,
		value: Value<OklchColor>,
		shared: {
			value: Value<OklchColor>;
			mode: Value<EditMode>;
			viewProps: ViewProps;
		},
	): HTMLElement {
		const row = doc.createElement('div');
		row.classList.add(cn('a'));

		const apWrap = doc.createElement('div');
		apWrap.classList.add(cn('ap'));
		const strip = new StripController(doc, {kind: 'alpha', ...shared});
		apWrap.appendChild(strip.element);
		row.appendChild(apWrap);

		const atWrap = doc.createElement('div');
		atWrap.classList.add(cn('at'));
		const aCr = createRangeConstraint({min: 0, max: 1});
		const num = new NumberTextController(doc, {
			parser: parseNumber,
			props: ValueMap.fromObject({
				formatter: createNumberFormatter(2),
				keyScale: 0.1,
				pointerScale: 0.01,
			}),
			value: createValue(
				value.rawValue.alpha,
				aCr ? {constraint: aCr} : undefined,
			),
			viewProps: shared.viewProps,
		});
		let syncing = false;
		num.value.emitter.on('change', () => {
			if (syncing) {
				return;
			}
			const a = Math.max(0, Math.min(1, num.value.rawValue));
			value.rawValue = value.rawValue.withAlpha(a);
		});
		value.emitter.on('change', () => {
			syncing = true;
			num.value.rawValue = value.rawValue.alpha;
			syncing = false;
		});
		atWrap.appendChild(num.view.element);
		row.appendChild(atWrap);

		return row;
	}

	/** Re-render the area + size the mode select after the popup opens (both need
	 *  a real, visible layout). */
	public refresh(): void {
		this.area_.refresh();
		this.texts_.refreshLayout();
	}

	/** Move focus into the picker so focus-out can later auto-close it. */
	public focus(): void {
		this.area_.element.focus();
	}
}
