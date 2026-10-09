/* eslint-env node */

import {nodeResolve} from '@rollup/plugin-node-resolve';
import Replace from '@rollup/plugin-replace';
import Terser from '@rollup/plugin-terser';
import Typescript from '@rollup/plugin-typescript';
import Autoprefixer from 'autoprefixer';
import Postcss from 'postcss';
import Sass from 'sass';

import Package from './package.json';

async function compileCss() {
	const css = Sass.renderSync({
		file: 'src/sass/plugin.scss',
		outputStyle: 'compressed',
	}).css.toString();

	const result = await Postcss([Autoprefixer]).process(css, {
		from: undefined,
	});
	return result.css.replace(/'/g, "\\'").trim();
}

function getPlugins(css, shouldMinify) {
	return [
		Typescript({
			tsconfig: 'src/tsconfig.json',
			// Emit native `#private` fields (ES2022) so no tslib `__classPrivateField*`
			// helper is pulled in — avoids the TS2807 helper-mismatch warning.
			target: 'ES2022',
			importHelpers: false,
		}),
		nodeResolve(),
		Replace({
			__css__: css,
			preventAssignment: false,
		}),
		...(shouldMinify ? [Terser()] : []),
	];
}

function getDistName(packageName) {
	// `@tweakpane/plugin-foobar` -> `tweakpane-plugin-foobar`
	// `tweakpane-plugin-foobar`  -> `tweakpane-plugin-foobar`
	return packageName
		.split(/[@/-]/)
		.reduce((comps, comp) => (comp !== '' ? [...comps, comp] : comps), [])
		.join('-');
}

export default async () => {
	const production = process.env.BUILD === 'production';
	const postfix = production ? '.min' : '';

	const distName = getDistName(Package.name);
	const css = await compileCss();
	return {
		input: 'src/index.ts',
		external: ['tweakpane'],
		output: {
			file: `dist/${distName}${postfix}.js`,
			format: 'esm',
			globals: {
				tweakpane: 'Tweakpane',
			},
		},
		plugins: getPlugins(css, production),
		// `@tweakpane/core` has no top-level side effects, but rollup can't tell and
		// would keep all 136 of its modules (every built-in blade and picker). Telling
		// it so lets the unused ones drop: the bundle is a third of the size.
		treeshake: {
			moduleSideEffects: (id) => !id.includes('@tweakpane/core'),
		},

		// Suppress `Circular dependency` warning
		onwarn(warning, rollupWarn) {
			if (warning.code === 'CIRCULAR_DEPENDENCY') {
				return;
			}
			rollupWarn(warning);
		},
	};
};
