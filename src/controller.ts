/*
 * Top-level colour controller — composes the swatch button, the colour text
 * field, and the popup picker over a single bound `OklchColor` value. Mirrors
 * Tweakpane's native `ColorController` (popup layout).
 */
import {
	type Value,
	type ValueController,
	type ViewProps,
	connectValues,
	Foldable,
	PopupController,
	TextController,
	ValueMap,
} from '@tweakpane/core';

import {OklchColor} from './model/color.js';
import {PickerController} from './picker.js';
import {ColorView} from './view.js';

interface Config {
	value: Value<OklchColor>;
	viewProps: ViewProps;
	expanded?: boolean;
}

export class ColorController implements ValueController<OklchColor, ColorView> {
	public readonly value: Value<OklchColor>;
	public readonly view: ColorView;
	public readonly viewProps: ViewProps;
	private readonly foldable_: Foldable;
	private readonly picker_: PickerController;

	constructor(doc: Document, config: Config) {
		this.value = config.value;
		this.viewProps = config.viewProps;
		this.onButtonClick_ = this.onButtonClick_.bind(this);
		this.onValueChange_ = this.onValueChange_.bind(this);
		this.onDocPointerDown_ = this.onDocPointerDown_.bind(this);
		this.onKeydown_ = this.onKeydown_.bind(this);

		this.foldable_ = Foldable.create(config.expanded ?? false);
		this.view = new ColorView(doc, {
			viewProps: this.viewProps,
			foldable: this.foldable_,
		});
		this.view.swatchButtonElement.addEventListener(
			'click',
			this.onButtonClick_,
		);
		// Close on a pointer-down outside this colour view. Deliberately focus-
		// INDEPENDENT, so it's robust in Safari — which doesn't move focus to a
		// clicked button / tabindex element and doesn't reliably set a focus
		// relatedTarget (the gap @tweakpane/core's own `findNextTarget` leaves as a
		// "TODO: Workaround for Safari", where a focus-based close mis-fires). It also
		// gives "one open at a time": a pointer-down on another swatch is outside this
		// view, so this popup closes.
		doc.addEventListener('pointerdown', this.onDocPointerDown_, true);
		this.view.element.addEventListener('keydown', this.onKeydown_);
		this.viewProps.handleDispose(() => {
			doc.removeEventListener('pointerdown', this.onDocPointerDown_, true);
		});

		// Colour text field, two-way bound directly to the colour value. The header
		// is tight, so we show just the channel numbers — no `oklch(`…`)` wrapper
		// and no `display-p3`/`rec2020` name (the mode dropdown already says it);
		// hex stays as `#…`. Editing accepts a full colour string, or bare numbers
		// re-wrapped into the current mode's form via `wrapReadout`.
		const textC = new TextController<OklchColor>(doc, {
			parser: (text) => {
				const t = text.trim();
				// `.asEdited()` drops the verbatim source so the result re-serialises
				// from its clamped coords — an out-of-range entry (e.g. a chroma of
				// 40000) shows as the clamped value instead of echoing the nonsense.
				const direct = OklchColor.tryFromString(t);
				if (direct) {
					return direct.asEdited();
				}
				const wrapped = OklchColor.tryFromString(
					this.value.rawValue.wrapReadout(t),
				);
				return wrapped ? wrapped.asEdited() : null;
			},
			props: ValueMap.fromObject({
				formatter: (c: OklchColor) => c.readoutString(),
			}),
			value: this.value,
			viewProps: this.viewProps,
		});
		this.view.textElement.appendChild(textC.view.element);

		this.picker_ = new PickerController(doc, {
			value: this.value,
			viewProps: this.viewProps,
		});

		const popC = new PopupController(doc, {viewProps: this.viewProps});
		this.view.element.appendChild(popC.view.element);
		popC.view.element.appendChild(this.picker_.element);
		connectValues({
			primary: this.foldable_.value('expanded'),
			secondary: popC.shows,
			forward: (p) => p,
			backward: (_, s) => s,
		});

		this.value.emitter.on('change', this.onValueChange_);
		this.refreshSwatch_();

		// On open: re-render the area (the canvas needs a real size) and move focus
		// into the picker for keyboard navigation.
		this.foldable_.value('expanded').emitter.on('change', () => {
			if (this.foldable_.get('expanded')) {
				requestAnimationFrame(() => {
					this.picker_.refresh();
					this.picker_.focus();
				});
			}
		});
	}

	private onDocPointerDown_(e: Event): void {
		if (!this.foldable_.get('expanded')) {
			return;
		}
		const target = e.target as Node | null;
		if (!target || !this.view.element.contains(target)) {
			this.foldable_.set('expanded', false);
		}
	}

	private onKeydown_(e: KeyboardEvent): void {
		if (e.key === 'Escape' && this.foldable_.get('expanded')) {
			this.foldable_.set('expanded', false);
			this.view.swatchButtonElement.focus();
		}
	}

	private refreshSwatch_(): void {
		this.view.swatchBoxElement.style.backgroundColor =
			this.value.rawValue.displayCss();
	}

	private onValueChange_(): void {
		this.refreshSwatch_();
	}

	private onButtonClick_(): void {
		this.foldable_.set('expanded', !this.foldable_.get('expanded'));
	}
}
