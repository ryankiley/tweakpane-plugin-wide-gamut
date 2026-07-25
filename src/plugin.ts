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

export interface OklchInputParams extends BaseInputParams {
	expanded?: boolean;
}

/**
 * Is the bound value a colour string *on its own*? Deliberately the strict
 * parser, not the model's lenient `OklchColor.isColorString`: that one recovers a
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
			(_args) =>
			(exValue: unknown): OklchColor =>
				OklchColor.fromString(String(exValue)),

		equals: (a, b) => a.equals(b),

		writer: (_args) => (target: BindingTarget, inValue: OklchColor) => {
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
