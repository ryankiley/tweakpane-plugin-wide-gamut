/*
 * Hue / alpha strips, reusing Tweakpane's native h-palette (`tp-hplv`) and
 * a-palette (`tp-aplv`) DOM + classes so the loaded Tweakpane CSS sizes and
 * positions them identically to the built-in picker. The hue strip edits the
 * fixed axis of the area plane (OKLCH H); the alpha strip edits alpha.
 *
 * Both strips paint their own background inline. The native hue strip's is an
 * HSL rainbow PNG, whose hue angles don't line up with OKLCH (sRGB red is HSL 0
 * but OKLCH ≈29; green 120 vs ≈142; blue 240 vs ≈264), so under an OKLCH marker
 * the colours sit 20–30° off. Ours is a gradient of OKLCH hues at the colour's
 * own lightness and chroma (see hue-gradient.ts), so position t shows what
 * dragging to hue t·360 actually produces.
 */
import {
	type PointerHandlerEvent,
	type Value,
	type ViewProps,
	ClassName,
	PointerHandler,
} from '@tweakpane/core';

import {hueStripColor, hueStripGradient} from './hue-gradient.js';
import {type EditMode, areaStretch, OklchColor} from './model/color.js';

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
	/** `L|C|gamut` the hue gradient was last built for — not hue, so a hue drag
	 *  never rebuilds it. */
	private gradientKey_ = '';

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
			bar.classList.add(cn('c')); // sized by native CSS; background set in refresh_
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
			const [l, ch, h] = c.coordsIn('oklch').coords;
			const gamut = areaStretch(this.mode_.rawValue);
			const key = `${l}|${ch}|${gamut}`;
			if (key !== this.gradientKey_) {
				this.gradientKey_ = key;
				this.fillElem_.style.background = hueStripGradient(l, ch, gamut);
			}
			this.markerElem_.style.left = `${h / 3.6}%`;
			// Like native: fill the marker with the strip's own colour at its
			// position, so it blends in (its white ring makes it visible).
			this.markerElem_.style.backgroundColor = hueStripColor(l, ch, h, gamut);
		} else {
			const [l, ch, hh] = c.coordsIn('oklch').coords;
			this.fillElem_.style.background = `linear-gradient(to right, oklch(${l} ${ch} ${hh} / 0), oklch(${l} ${ch} ${hh} / 1))`;
			this.markerElem_.style.left = `${c.alpha * 100}%`;
			this.markerElem_.style.backgroundColor = c.displayCss();
		}
	}
}
