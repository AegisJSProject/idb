import terser from '@rollup/plugin-terser';

export default [{
	input: 'idb.js',
	output: [{
		file: 'idb.cjs',
		format: 'cjs',
	}, {
		file: 'idb.min.js',
		format: 'module',
		plugins: [terser()],
		sourcemap: true,
	}],
}];
