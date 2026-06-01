/*
 * The texts row, reusing Tweakpane's native `tp-coltxtv` DOM + classes (mode
 * <select> + dropdown chevron + per-channel inputs) so it's styled identically
 * to the built-in picker. Channel inputs reuse core's `NumberTextController`;
 * hex mode uses a single `TextController`.
 *
 * All value<->input syncing is gated by `syncing_` so programmatic updates never
 * feed back as user edits (otherwise rebuilds oscillate the shared value).
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
	TextController,
	ValueMap,
} from '@tweakpane/core';

import {
	type EditMode,
	digitsFor,
	EDIT_MODES,
	MODE_CHANNELS,
	MODE_LABELS,
	OklchColor,
} from './model/color.js';

const cn = ClassName('coltxt');

interface Config {
	value: Value<OklchColor>;
	mode: Value<EditMode>;
	viewProps: ViewProps;
}

export class TextsController {
	public readonly element: HTMLElement;
	private readonly doc_: Document;
	private readonly value_: Value<OklchColor>;
	private readonly mode_: Value<EditMode>;
	private readonly viewProps_: ViewProps;
	private readonly selectElem_: HTMLSelectElement;
	private readonly inputsElem_: HTMLElement;
	private readonly gamutElem_: HTMLElement;
	private numberCs_: NumberTextController[] = [];
	private hexC_: TextController<string> | null = null;
	private syncing_ = false;
	private measureCtx_: CanvasRenderingContext2D | null = null;

	constructor(doc: Document, config: Config) {
		this.doc_ = doc;
		this.value_ = config.value;
		this.mode_ = config.mode;
		this.viewProps_ = config.viewProps;
		this.onSelectChange_ = this.onSelectChange_.bind(this);
		this.onModeChange_ = this.onModeChange_.bind(this);
		this.onColorChange_ = this.onColorChange_.bind(this);

		const root = doc.createElement('div');
		root.classList.add(cn(), 'wgc-coltxt');
		config.viewProps.bindClassModifiers(root);

		// Header line: mode <select> + chevron (native markup) on the left, the
		// smallest-containing-gamut readout on the right. Giving the dropdown its
		// own line frees a full row for the channel numbers below.
		const head = doc.createElement('div');
		head.classList.add('wgc-coltxt_head');
		const modeWrap = doc.createElement('div');
		modeWrap.classList.add(cn('m'));
		const select = doc.createElement('select');
		select.classList.add(cn('ms'));
		config.viewProps.bindDisabled(select);
		EDIT_MODES.forEach((m) => {
			const opt = doc.createElement('option');
			opt.textContent = MODE_LABELS[m];
			opt.value = m;
			select.appendChild(opt);
		});
		select.value = this.mode_.rawValue;
		select.addEventListener('change', this.onSelectChange_);
		modeWrap.appendChild(select);
		const marker = doc.createElement('div');
		marker.classList.add(cn('mm'));
		// Intrinsic `width`/`height`/`viewBox` so the chevron keeps its size even
		// in a host that resets `svg { width: auto }` (Tweakpane core sizes its own
		// copy purely via CSS, which such a reset would defeat). The matching
		// `max-width: none` guard for `svg { max-width: 100% }` hosts lives in
		// plugin.scss — together they keep the chevron robust to global svg resets.
		marker.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 7h6l-3 3 z"></path></svg>';
		modeWrap.appendChild(marker);
		head.appendChild(modeWrap);
		this.selectElem_ = select;

		const gamut = doc.createElement('div');
		gamut.classList.add('wgc-gamut');
		head.appendChild(gamut);
		this.gamutElem_ = gamut;

		root.appendChild(head);

		const inputs = doc.createElement('div');
		inputs.classList.add(cn('w'));
		root.appendChild(inputs);
		this.inputsElem_ = inputs;

		this.element = root;

		this.buildInputs_();
		this.refreshGamut_();
		this.value_.emitter.on('change', this.onColorChange_);
		this.mode_.emitter.on('change', this.onModeChange_);
		// Size the select once it's in the DOM (a microtask fires right after the
		// blade is mounted, and — unlike rAF — even in a background tab).
		queueMicrotask(() => this.sizeSelect_());
	}

	/** Re-measure the mode select; call when the picker becomes visible (the
	 *  select can only be measured once it's in the DOM + styled). */
	public refreshLayout(): void {
		this.sizeSelect_();
	}

	private onSelectChange_(): void {
		const mode = this.selectElem_.value as EditMode;
		this.mode_.rawValue = mode;
		// Re-format the bound value (and thus the collapsed readout) into the chosen
		// mode; the canonical OKLCH coords are untouched, so nothing is lost.
		this.value_.rawValue = this.value_.rawValue.withFormat(mode);
	}

	private onModeChange_(): void {
		if (this.selectElem_.value !== this.mode_.rawValue) {
			this.selectElem_.value = this.mode_.rawValue;
		}
		this.sizeSelect_();
		this.buildInputs_();
	}

	/**
	 * Size the mode <select> to its current label so the chevron stays beside the
	 * text. Our OKLCH label is wider than native's 3-char options, so a fixed
	 * (widest-option) width would leave a gap for shorter labels like RGB.
	 */
	private sizeSelect_(): void {
		const opt = this.selectElem_.options[this.selectElem_.selectedIndex];
		if (!opt) {
			return;
		}
		if (!this.measureCtx_) {
			this.measureCtx_ = this.doc_.createElement('canvas').getContext('2d');
		}
		const ctx = this.measureCtx_;
		if (!ctx) {
			return;
		}
		const cs = getComputedStyle(this.selectElem_);
		ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
		const w = ctx.measureText(opt.text).width;
		// label width + native's horizontal padding (4px left + 18px right chevron)
		this.selectElem_.style.width = `${Math.ceil(w) + 22}px`;
	}

	private onColorChange_(): void {
		this.refreshGamut_();
		if (this.syncing_) {
			return;
		}
		this.refreshInputs_();
	}

	/** Update the gamut readout (the smallest gamut containing the colour). */
	private refreshGamut_(): void {
		this.gamutElem_.textContent = this.value_.rawValue.gamutLabel();
	}

	/** Wrap an input in a `tp-coltxtv_c` cell, like native (provides the spacing). */
	private appendInput_(el: HTMLElement): void {
		const cell = this.doc_.createElement('div');
		cell.classList.add(cn('c'));
		cell.appendChild(el);
		this.inputsElem_.appendChild(cell);
	}

	private buildInputs_(): void {
		this.syncing_ = true;
		try {
			const doc = this.doc_;
			const mode = this.mode_.rawValue;
			this.numberCs_ = [];
			this.hexC_ = null;
			this.inputsElem_.textContent = '';

			if (mode === 'hex') {
				const tc = new TextController<string>(doc, {
					parser: (t) => t,
					props: ValueMap.fromObject({formatter: (v: string) => v}),
					value: createValue(this.value_.rawValue.gamutCss()),
					viewProps: this.viewProps_,
				});
				tc.value.emitter.on('change', () => {
					if (this.syncing_) {
						return;
					}
					const parsed = OklchColor.tryFromString(tc.value.rawValue);
					if (parsed) {
						this.value_.rawValue = parsed;
					}
				});
				this.appendInput_(tc.view.element);
				this.hexC_ = tc;
				return;
			}

			const channels = MODE_CHANNELS[mode];
			const vals = this.value_.rawValue.channelValues(mode);
			this.numberCs_ = channels.map((ch, i) => {
				// Clamp to the channel's range (e.g. RGB stops at 255) on both drag
				// and typed entry. OKLCH chroma's cap is generous (0.5, past every
				// real gamut) so wide-gamut colours still fit.
				const cr = createRangeConstraint({min: ch.min, max: ch.max});
				const nc = new NumberTextController(doc, {
					parser: parseNumber,
					props: ValueMap.fromObject({
						formatter: createNumberFormatter(digitsFor(ch.step)),
						keyScale: ch.step,
						pointerScale: ch.step,
					}),
					value: createValue(vals[i], cr ? {constraint: cr} : undefined),
					viewProps: this.viewProps_,
					arrayPosition:
						i === 0 ? 'fst' : i === channels.length - 1 ? 'lst' : 'mid',
				});
				nc.value.emitter.on('change', () => {
					if (this.syncing_) {
						return;
					}
					this.value_.rawValue = this.value_.rawValue.withChannel(
						mode,
						i,
						nc.value.rawValue,
					);
				});
				this.appendInput_(nc.view.element);
				return nc;
			});
		} finally {
			this.syncing_ = false;
		}
	}

	private refreshInputs_(): void {
		this.syncing_ = true;
		try {
			const mode = this.mode_.rawValue;
			if (mode === 'hex') {
				if (this.hexC_) {
					this.hexC_.value.rawValue = this.value_.rawValue.gamutCss();
				}
			} else {
				const vals = this.value_.rawValue.channelValues(mode);
				this.numberCs_.forEach((nc, i) => {
					nc.value.rawValue = vals[i];
				});
			}
		} finally {
			this.syncing_ = false;
		}
	}
}
