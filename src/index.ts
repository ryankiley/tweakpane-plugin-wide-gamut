import {OklchInputPlugin} from './plugin.js';

// Tweakpane plugin-bundle exports. `__css__` is replaced with the compiled SCSS
// at build time by @rollup/plugin-replace (see rollup.config.js).
export const id = 'wide-gamut';
export const css = '__css__';
export const plugins = [OklchInputPlugin];
