/* eslint-disable no-console */
/* eslint-env node */

import Fs from 'fs';
// Named import: glob dropped its default export in v9. It is a direct
// devDependency — it used to resolve only through rimraf@3's transitive copy,
// which a rimraf bump would have silently taken away.
import {globSync} from 'glob';
import Path from 'path';

const Package = JSON.parse(
	Fs.readFileSync(new URL('../package.json', import.meta.url)),
);

const PATTERN = 'dist/*';

const paths = globSync(PATTERN);
paths.forEach((path) => {
	const fileName = Path.basename(path);
	if (Fs.statSync(path).isDirectory()) {
		return;
	}

	const ext = fileName.match(/(\..+)$/)[1];
	const base = Path.basename(fileName, ext);
	const versionedPath = Path.join(
		Path.dirname(path),
		`${base}-${Package.version}${ext}`,
	);
	Fs.renameSync(path, versionedPath);
});
