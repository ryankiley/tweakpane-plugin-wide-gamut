import {
	type BaseInputParams,
	type BindingTarget,
	type InputBindingPlugin,
	createPlugin,
	parseRecord,
} from '@tweakpane/core';

import {ColorController} from './controller.js';
import {OklchColor} from './model/color.js';

export interface OklchInputParams extends BaseInputParams {
	expanded?: boolean;
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
		if (!OklchColor.isColorString(exValue)) {
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
