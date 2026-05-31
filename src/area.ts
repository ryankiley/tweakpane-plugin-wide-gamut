/*
 * The colour area — our gamut-aware `AreaPicker` wrapped as a Tweakpane
 * sub-controller. It's an OKLCH lightness×chroma plane scaled to the mode's gamut
 * (see `areaStretch`): the sRGB-bound modes draw the sRGB plane (no lines), every
 * wide mode draws the P3 plane with the solid sRGB line inside and a dashed P3
 * line at the edge. P3 is the plane's edge — the widest gamut real displays show
 * — so you can't drag into colours the screen can't render. (The thumb shifts a
 * little when switching between the sRGB and P3 planes, since the axis rescales.)
 */
import {
	type Value,
	type ViewProps,
	bindValue,
	ClassName,
} from '@tweakpane/core';

import {AreaPicker} from './area-picker.js';
import {type EditMode, areaStretch, OklchColor} from './model/color.js';

const cnSv = ClassName('svp');

interface Config {
	value: Value<OklchColor>;
	mode: Value<EditMode>;
	viewProps: ViewProps;
}

export class AreaController {
	public readonly element: HTMLElement;
	private readonly value_: Value<OklchColor>;
	private readonly mode_: Value<EditMode>;
	private readonly picker_: AreaPicker;
	// True while writing the value in response to the picker's own onChange, so
	// the value->setValue binding doesn't echo back into it.
	private fromArea_ = false;

	constructor(doc: Document, config: Config) {
		this.value_ = config.value;
		this.mode_ = config.mode;

		const root = doc.createElement('div');
		root.classList.add(cnSv());
		config.viewProps.bindClassModifiers(root);
		config.viewProps.bindTabIndex(root); // focusable, like the native SV palette

		const canvas = doc.createElement('canvas');
		// `area-canvas` is the hook AreaPicker queries; `tp-svpv_c` (the native SV
		// canvas class) gives it the exact native crosshair cursor + size.
		canvas.classList.add('area-canvas', cnSv('c'));
		root.appendChild(canvas);

		const thumb = doc.createElement('div');
		// Reuse the native SV-marker class so the selection circle is pixel-identical.
		thumb.classList.add('area-thumb', cnSv('m'));
		root.appendChild(thumb);

		this.element = root;

		this.picker_ = new AreaPicker(root, (css, isDragging) => {
			let next: OklchColor;
			try {
				next = this.value_.rawValue.withCss(css);
			} catch {
				return;
			}
			this.fromArea_ = true;
			this.value_.rawValue = next;
			this.fromArea_ = false;
			if (!isDragging) {
				this.sync_();
			}
		});

		bindValue(this.value_, () => {
			if (this.fromArea_) {
				return;
			}
			this.sync_();
		});
		// The plane's gamut tracks the mode (sRGB / P3 / Rec2020); narrower gamuts
		// are then drawn as inner boundary lines.
		const syncGamut = () =>
			this.picker_.setStretch(areaStretch(this.mode_.rawValue));
		syncGamut();
		this.mode_.emitter.on('change', syncGamut);

		config.viewProps.handleDispose(() => {
			this.picker_.unmount();
		});
	}

	private sync_(): void {
		this.picker_.setValue(this.value_.rawValue.displayCss());
	}

	/** Re-render once the popup is visible (the canvas needs a real layout size). */
	public refresh(): void {
		this.sync_();
	}
}
