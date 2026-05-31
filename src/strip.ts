/*
 * Hue / alpha strips, reusing Tweakpane's native h-palette (`tp-hplv`) and
 * a-palette (`tp-aplv`) DOM + classes so the loaded Tweakpane CSS styles them
 * identically to the built-in picker. The hue strip edits the fixed axis of the
 * current mode's area plane (oklch H / okhsv h / hsl H); the alpha strip edits
 * alpha.
 */
import {
	type PointerHandlerEvent,
	type Value,
	type ViewProps,
	ClassName,
	PointerHandler,
} from '@tweakpane/core';

import {type EditMode, OklchColor} from './model/color.js';

const cnHpl = ClassName('hpl');
const cnApl = ClassName('apl');

interface Config {
	kind: 'hue' | 'alpha';
	value: Value<OklchColor>;
	mode: Value<EditMode>;
	viewProps: ViewProps;
}

export class StripController {
	public readonly element: HTMLElement;
	private readonly kind_: 'hue' | 'alpha';
	private readonly value_: Value<OklchColor>;
	private readonly mode_: Value<EditMode>;
	private readonly markerElem_: HTMLElement;
	private readonly fillElem_: HTMLElement;

	constructor(doc: Document, config: Config) {
		this.kind_ = config.kind;
		this.value_ = config.value;
		this.mode_ = config.mode;
		this.onPoint_ = this.onPoint_.bind(this);
		this.refresh_ = this.refresh_.bind(this);

		const cn = config.kind === 'hue' ? cnHpl : cnApl;
		const root = doc.createElement('div');
		root.classList.add(cn());
		config.viewProps.bindClassModifiers(root);
		config.viewProps.bindTabIndex(root);

		if (config.kind === 'hue') {
			const bar = doc.createElement('div');
			bar.classList.add(cn('c')); // rainbow gradient comes from native CSS
			root.appendChild(bar);
			this.fillElem_ = bar;
			const marker = doc.createElement('div');
			marker.classList.add(cn('m'));
			root.appendChild(marker);
			this.markerElem_ = marker;
		} else {
			const bar = doc.createElement('div');
			bar.classList.add(cn('b'));
			root.appendChild(bar);
			const fill = doc.createElement('div');
			fill.classList.add(cn('c'));
			bar.appendChild(fill);
			this.fillElem_ = fill;
			const marker = doc.createElement('div');
			marker.classList.add(cn('m'));
			root.appendChild(marker);
			const preview = doc.createElement('div');
			preview.classList.add(cn('p'));
			marker.appendChild(preview);
			this.markerElem_ = marker;
		}

		this.element = root;

		const ph = new PointerHandler(root);
		ph.emitter.on('down', this.onPoint_);
		ph.emitter.on('move', this.onPoint_);
		ph.emitter.on('up', this.onPoint_);

		this.value_.emitter.on('change', this.refresh_);
		this.mode_.emitter.on('change', this.refresh_);
		this.refresh_();
	}

	private onPoint_(ev: PointerHandlerEvent): void {
		const point = ev.data.point;
		if (!point) {
			return;
		}
		const t = Math.max(0, Math.min(1, point.x / ev.data.bounds.width));
		const c = this.value_.rawValue;
		// The area is locked to the OKLCH plane, so the hue strip edits OKLCH hue.
		this.value_.rawValue =
			this.kind_ === 'hue' ? c.withAreaHue(t * 360) : c.withAlpha(t);
	}

	private refresh_(): void {
		const c = this.value_.rawValue;
		if (this.kind_ === 'hue') {
			const h = c.areaHue();
			this.markerElem_.style.left = `${(h / 360) * 100}%`;
			// Like native: fill the marker with the pure hue at its position, so it
			// blends into the rainbow (its white ring makes it visible) instead of
			// showing the muted current colour.
			this.markerElem_.style.backgroundColor = `hsl(${h} 100% 50%)`;
		} else {
			const [l, ch, hh] = c.coordsIn('oklch').coords;
			this.fillElem_.style.background = `linear-gradient(to right, oklch(${l} ${ch} ${hh} / 0), oklch(${l} ${ch} ${hh} / 1))`;
			this.markerElem_.style.left = `${c.alpha * 100}%`;
			this.markerElem_.style.backgroundColor = c.displayCss();
		}
	}
}
