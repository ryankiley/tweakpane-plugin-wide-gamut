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
	/** Alpha row, built lazily the first time the value carries alpha, then kept
	 *  and detached/reattached as `hasAlpha` flips. */
	private alphaRow_: HTMLElement | null = null;

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

		// Alpha row — present exactly while the bound value carries alpha. Native
		// decides this once at construction, but our drop-in claims any colour
		// string, so a value can *gain* alpha later (pasting `rgba(…, 0.5)` into an
		// opaque binding) and would otherwise be left translucent with no UI to
		// adjust it. Built on first need and then detached/reattached rather than
		// rebuilt: core's NumberTextController subscribes to the shared viewProps
		// with no teardown, so recreating it on every flip would leak a listener per
		// toggle — the same reason TextsController caches its per-mode inputs.
		const syncAlphaRow = () => {
			const wants = config.value.rawValue.hasAlpha;
			if (wants && !this.alphaRow_) {
				this.alphaRow_ = this.createAlphaRow_(doc, config.value, shared);
			}
			if (!this.alphaRow_) {
				return;
			}
			if (!wants) {
				this.alphaRow_.remove();
			} else if (this.alphaRow_.parentNode !== root) {
				// Only when actually detached: re-appending an attached node removes
				// and re-inserts it, which blurs a focused descendant — and this runs
				// on every value change, so arrow-stepping in the alpha field would
				// lose focus after one press. Always last, after the texts row.
				root.appendChild(this.alphaRow_);
			}
		};
		syncAlphaRow();

		// Follow the value's output format: typing a different-format colour into
		// the text field (e.g. a hex while in OKLCH mode) re-points the mode
		// dropdown, so it never disagrees with the collapsed readout.
		config.value.emitter.on('change', () => {
			syncAlphaRow();
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
