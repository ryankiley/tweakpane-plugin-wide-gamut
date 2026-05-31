/*
 * Interactive OKLCH lightness×chroma plane: a canvas gradient with the gamut
 * boundary drawn over it, a draggable thumb, and keyboard nudging. The plane is
 * always a fixed-hue L×C slice (see ./area-compute for the raster); this file is
 * purely the DOM/interaction layer.
 *
 * State is two plain coord triples — `#value` (committed) and `#live` (the
 * optimistic value mid-drag, so the thumb tracks the pointer without waiting for
 * the binding round-trip) — and `#sync()` reapplies the three effects (thumb,
 * drag class, repaint) after any change. The repaint is rAF-coalesced and only
 * runs when the hue moves, so dragging within a slice never re-rasterises.
 */
import {
	type AreaResult,
	type BoundarySpec,
	computeArea,
	sampleCurve,
} from './area-compute.js';
import type {Space} from './core/convert.js';
import {convert} from './core/convert.js';
import {parse} from './core/parse.js';

type Coords3 = [number, number, number];

/** Chroma span assumed for the canvas before the first frame builds the curve. */
const FALLBACK_CHROMA = 0.37;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const finite = (v: number | null | undefined): number =>
	v == null || Number.isNaN(v) ? 0 : v;

/** Whether a 2D canvas can be backed by Display-P3 (probe the real API). */
const wideCanvas = (() => {
	try {
		const ctx = document
			.createElement('canvas')
			.getContext('2d', {colorSpace: 'display-p3'});
		const attrs = (
			ctx as {getContextAttributes?: () => {colorSpace?: string}} | null
		)?.getContextAttributes?.();
		return attrs?.colorSpace === 'display-p3';
	} catch {
		return false;
	}
})();

function strokeBoundary(ctx: CanvasRenderingContext2D, b: BoundarySpec): void {
	if (b.points.length < 2) {
		return;
	}
	ctx.save();
	ctx.strokeStyle = b.color;
	ctx.lineWidth = b.lineWidth;
	ctx.lineJoin = ctx.lineCap = 'round';
	ctx.setLineDash(b.dash);
	ctx.beginPath();
	b.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
	ctx.stroke();
	ctx.restore();
}

/** Interactive OKLCH L×C plane bound to a host element + an onChange callback. */
export class AreaPicker {
	#abort = new AbortController();
	#root: HTMLElement | null;
	#canvas: HTMLCanvasElement | null;
	#emit: (css: string, dragging: boolean) => void;

	#value: Coords3 | null = null; // committed colour
	#live: Coords3 | null = null; // optimistic colour while dragging
	#curve: Float64Array | null = null; // per-lightness chroma ceiling (last frame)
	// The gamut the plane is stretched to (the current mode's own gamut). Drives
	// the gradient extent and which narrower gamuts are drawn as boundary lines.
	#stretch: Space = 'p3';
	#paintedHue = NaN; // hue of the last raster; -repaint only when it changes
	#raf: number | null = null;
	// Pointer grab offset (thumb-centre → cursor), in normalised plane units.
	#grab = {x: 0, y: 0};
	// Offscreen raster canvas, reused across frames; resized only when the
	// subsampled dimensions change (so a hue drag never reallocates it).
	#off: HTMLCanvasElement | null = null;
	#offCtx: CanvasRenderingContext2D | null = null;
	#offW = 0;
	#offH = 0;

	constructor(
		root: HTMLElement | null,
		onChange: (css: string, dragging: boolean) => void,
	) {
		this.#root = root;
		this.#canvas =
			root?.querySelector<HTMLCanvasElement>('.area-canvas') ?? null;
		this.#emit = onChange;
		if (!root || !this.#canvas) {
			return;
		}
		this.#bindPointer(root);
		this.#bindKeyboard(root);
		// Repaint once the canvas actually has a laid-out size, and on any later
		// resize. The first frame can otherwise rasterise against a still-unsized
		// canvas (clientWidth 0), fall back to a default width the browser then
		// downsamples into the real box, and leave the boundary stroke too thin
		// until the first interaction forces a fresh frame at the correct size.
		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(() => this.#schedulePaint());
			ro.observe(this.#canvas);
			this.#abort.signal.addEventListener('abort', () => ro.disconnect());
		}
		this.#abort.signal.addEventListener('abort', () => {
			if (this.#raf !== null) {
				cancelAnimationFrame(this.#raf);
			}
		});
	}

	// ── Public API ───────────────────────────────────────────────────────────

	/** Adopt a colour from any CSS string, projected onto the OKLCH plane. */
	setValue(css: string): void {
		const parsed = parse(css);
		this.#value = parsed
			? (convert(parsed.coords, parsed.space, 'oklch').map(finite) as Coords3)
			: null;
		this.#sync();
	}

	/** Stretch the plane to `gamut` (the current mode's gamut). The gradient extent
	 *  and the inner boundary lines both follow from it. */
	setStretch(gamut: Space): void {
		if (gamut !== this.#stretch) {
			this.#stretch = gamut;
			this.#schedulePaint(); // the gradient stretch + boundaries change with it
		}
	}

	unmount(): void {
		this.#abort.abort();
	}

	// ── State plumbing ─────────────────────────────────────────────────────────

	/** The colour the UI should reflect: the drag value if dragging, else committed. */
	#active(): Coords3 | null {
		return this.#live ?? this.#value;
	}

	/** Largest chroma reachable at lightness `L` on the current canvas. */
	#chromaAt(L: number): number {
		return this.#curve ? sampleCurve(this.#curve, L) : FALLBACK_CHROMA;
	}

	/** Push a new colour: store it, tell the binding, refresh the UI. */
	#commit(coords: Coords3, dragging: boolean): void {
		if (dragging) {
			this.#live = coords;
		}
		this.#emit(
			`oklch(${finite(coords[0])} ${finite(coords[1])} ${finite(coords[2])})`,
			dragging,
		);
		this.#sync();
	}

	/** Reapply every reaction to the active colour. Cheap and idempotent. */
	#sync(): void {
		this.#positionThumb();
		// Pointer capture (set on pointerdown) already routes the whole drag to the
		// canvas, and `touch-action: none` blocks touch-scroll — so the drag is
		// isolated without inert-ing the page (which would blur the focused mode
		// dropdown mid-gesture and swallow the first click after a mode switch).
		this.#root?.classList.toggle('dragging', this.#live != null);
		// The gradient only depends on hue; skip the repaint within a slice.
		if ((this.#active()?.[2] ?? 0) !== this.#paintedHue) {
			this.#schedulePaint();
		}
	}

	#positionThumb(): void {
		const c = this.#active();
		if (!c) {
			return;
		}
		const ceiling = this.#chromaAt(c[0]);
		const x = ceiling > 0 ? Math.min(100, (c[1] / ceiling) * 100) : 0;
		this.#root?.style.setProperty('--thumb-x', `${x}%`);
		this.#root?.style.setProperty('--thumb-y', `${(1 - c[0]) * 100}%`);
	}

	// ── Pointer + keyboard ─────────────────────────────────────────────────────

	#bindPointer(root: HTMLElement): void {
		const thumb = root.querySelector<HTMLElement>('.area-thumb');
		const opts = {signal: this.#abort.signal};
		let rect: DOMRect | null = null;
		let activeId: number | null = null;

		// Map a pointer event to OKLCH coords on the plane (x → chroma, y → L).
		// `clamp01` pins it to the plane, so dragging outside lands on the edge.
		const project = (e: PointerEvent): Coords3 | null => {
			const base = this.#active();
			if (!base) {
				return null;
			}
			const r = rect ?? root.getBoundingClientRect();
			const fx = clamp01((e.clientX - r.left) / r.width - this.#grab.x);
			const fy = clamp01(1 - (e.clientY - r.top) / r.height - this.#grab.y);
			return [fy, fx * this.#chromaAt(fy), base[2]];
		};

		// Move/up live on the window for the duration of a drag (not just the
		// canvas), so the thumb keeps tracking — clamped to the edge — even when the
		// pointer is dragged outside the area. Guarded by the originating pointer id.
		const onMove = (e: PointerEvent): void => {
			if (e.pointerId !== activeId || !this.#live) {
				return;
			}
			e.preventDefault();
			const next = project(e);
			if (next) {
				this.#commit(next, true);
			}
		};
		const onUp = (e: PointerEvent): void => {
			if (e.pointerId !== activeId) {
				return;
			}
			activeId = null;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			try {
				root.releasePointerCapture(e.pointerId);
			} catch {
				/* never captured — nothing to release */
			}
			if (this.#live) {
				// Commit the final value as a non-drag change so text inputs settle.
				this.#emit(
					`oklch(${finite(this.#live[0])} ${finite(this.#live[1])} ${finite(
						this.#live[2],
					)})`,
					false,
				);
			}
			this.#live = null;
			this.#grab = {x: 0, y: 0};
			rect = null;
			this.#sync();
		};

		root.addEventListener(
			'pointerdown',
			(e) => {
				activeId = e.pointerId;
				// Capture is a bonus (stops other elements reacting mid-drag); the
				// window listeners are what guarantee delivery once the pointer leaves.
				try {
					root.setPointerCapture(e.pointerId);
				} catch {
					/* ignore — window listeners cover delivery */
				}
				rect = root.getBoundingClientRect();
				const onThumb =
					thumb && (e.target === thumb || thumb.contains(e.target as Node));
				if (onThumb) {
					// Grab: record cursor→thumb-centre offset so the thumb doesn't jump.
					const t = thumb.getBoundingClientRect();
					const cx = (t.left + t.width / 2 - rect.left) / rect.width;
					const cy = 1 - (t.top + t.height / 2 - rect.top) / rect.height;
					this.#grab = {
						x: (e.clientX - rect.left) / rect.width - cx,
						y: 1 - (e.clientY - rect.top) / rect.height - cy,
					};
					const base = this.#active();
					if (base) {
						this.#commit([base[0], base[1], base[2]], true);
					}
				} else {
					// Bare click: jump to the cursor.
					this.#grab = {x: 0, y: 0};
					const next = project(e);
					if (next) {
						this.#commit(next, true);
					}
				}
				window.addEventListener('pointermove', onMove, opts);
				window.addEventListener('pointerup', onUp, opts);
				window.addEventListener('pointercancel', onUp, opts);
			},
			opts,
		);
	}

	#bindKeyboard(root: HTMLElement): void {
		const STEPS: Record<string, [number, number]> = {
			ArrowRight: [1, 0],
			ArrowLeft: [-1, 0],
			ArrowUp: [0, 1],
			ArrowDown: [0, -1],
		};
		root.addEventListener(
			'keydown',
			(e) => {
				const step = STEPS[e.key];
				const base = this.#value;
				if (!step || !base) {
					return;
				}
				e.preventDefault();
				const [L, C, H] = base;
				const ceiling = this.#chromaAt(L);
				const nextC = Math.max(
					0,
					Math.min(ceiling, C + step[0] * (ceiling / 100)),
				);
				const nextL = clamp01(L + step[1] / 100);
				this.#commit([nextL, nextC, H], false);
			},
			{signal: this.#abort.signal},
		);
	}

	// ── Rendering ────────────────────────────────────────────────────────────

	#schedulePaint(): void {
		if (this.#raf !== null) {
			return;
		}
		this.#raf = requestAnimationFrame(() => {
			this.#raf = null;
			this.#paint();
		});
	}

	#paint(): void {
		const canvas = this.#canvas;
		const c = this.#active();
		if (!canvas || !c) {
			return;
		}
		this.#paintedHue = c[2];
		const colorSpace: PredefinedColorSpace = wideCanvas ? 'display-p3' : 'srgb';

		let area: AreaResult;
		try {
			area = computeArea({
				hue: c[2],
				cssW: canvas.clientWidth || 320,
				cssH: canvas.clientHeight || 200,
				dpr: window.devicePixelRatio || 1,
				supportsP3: wideCanvas,
				stretch: this.#stretch,
			});
		} catch {
			return; // never let a bad frame throw out of rAF
		}
		this.#curve = area.chromaCurve;

		// Rasterise the gradient at low res offscreen, then scale it up smoothly.
		// Reuse the offscreen canvas across frames; resizing it (which also clears
		// it) only when the subsampled dimensions change.
		if (!this.#off || this.#offW !== area.W || this.#offH !== area.H) {
			if (!this.#off) {
				this.#off = document.createElement('canvas');
			}
			this.#off.width = area.W;
			this.#off.height = area.H;
			this.#offW = area.W;
			this.#offH = area.H;
			this.#offCtx = this.#off.getContext('2d', {colorSpace});
		}
		const offCtx = this.#offCtx;
		if (!offCtx) {
			return;
		}
		// `area.pixels` is already a correctly-sized Uint8ClampedArray; wrap it as
		// ImageData (tagged with the canvas colour space so P3 bytes aren't read as
		// sRGB) and blit — no intermediate buffer allocation or copy.
		offCtx.putImageData(
			new ImageData(area.pixels, area.W, area.H, {colorSpace}),
			0,
			0,
		);

		canvas.width = area.backingW;
		canvas.height = area.backingH;
		const ctx = canvas.getContext('2d', {colorSpace});
		if (!ctx) {
			return;
		}
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(this.#off, 0, 0, area.backingW, area.backingH);

		// computeArea only returns boundary curves in wide mode, so just draw them.
		area.boundaries.forEach((b) => strokeBoundary(ctx, b));

		// Thumb x depends on the chroma curve we just built.
		this.#positionThumb();
	}
}
