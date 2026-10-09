import {
	type BaseInputParams,
	type BindingTarget,
	type InputBindingPlugin,
	createPlugin,
	parseRecord,
} from '@tweakpane/core';

import {ColorController} from './controller.js';
import {parse} from './core/parse.js';
import {OklchColor} from './model/color.js';

/**
 * Last meaningful OKLCH hue written per binding target. A grey has no hue of its
 * own, so when one is read back from outside — `pane.refresh()`, a preset, the
 * host app assigning `#808080` — the reader gives it the hue the picker was last
 * on, and the plane + hue strip stay put instead of jumping to parser noise.
 * Keyed on the target (reader and writer share it) and weak, so a disposed
 * binding leaves nothing behind.
 */
const lastHue = new WeakMap<BindingTarget, number>();

export interface OklchInputParams extends BaseInputParams {
	expanded?: boolean;
}

/**
 * Is the bound value a colour string *on its own*? Deliberately the strict
 * parser, not the model's lenient `OklchColor.tryFromString`: that one recovers a
 * colour from surrounding text (a CSS declaration, a quoted value, an
 * `!important`), which is what the picker's text field wants but not what
 * `accept` wants. Claiming a binding whose value merely *contains* a colour —
 * `'box-shadow: 0 0 4px rgba(0,0,0,0.5)'` — would swap a text input for a colour
 * picker and then, on the first write, persist only the extracted token and
 * discard the rest of the string.
 */
function isBareColorString(value: unknown): value is string {
	return typeof value === 'string' && parse(value) !== null;
}

/**
 * Drop-in OKLCH colour picker. Because Tweakpane tries registered plugins before
 * its built-ins, this claims any colour-string binding and replaces the native
 * picker — no `view` parameter required.
 */
export const OklchInputPlugin: InputBindingPlugin<
	OklchColor,
	string,
	OklchInputParams
> = createPlugin({
	id: 'input-wide-gamut',
	type: 'input',

	accept(exValue: unknown, params: Record<string, unknown>) {
		if (!isBareColorString(exValue)) {
			return null;
		}
		const result = parseRecord<OklchInputParams>(params, (p) => ({
			expanded: p.optional.boolean,
		}));
		if (!result) {
			return null;
		}
		return {
			initialValue: exValue,
			params: result,
		};
	},

	binding: {
		reader:
			(args) =>
			(exValue: unknown): OklchColor => {
				const c = OklchColor.fromString(String(exValue));
				const h = lastHue.get(args.target);
				return c.hueIsPowerless && h !== undefined ? c.withRetainedHue(h) : c;
			},

		equals: (a, b) => a.equals(b),

		writer: (args) => (target: BindingTarget, inValue: OklchColor) => {
			if (!inValue.hueIsPowerless) {
				lastHue.set(args.target, inValue.areaHue());
			}
			target.write(inValue.serialize());
		},
	},

	controller(args) {
		return new ColorController(args.document, {
			value: args.value,
			viewProps: args.viewProps,
			expanded: args.params.expanded,
		});
	},
});
