import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** Extension host bundle (Node.js) */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
};

/** Webview bundle (Browser) */
const webviewConfig = {
  entryPoints: ['webview-ui/src/index.ts'],
  bundle: true,
  outfile: 'dist/webview/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2021',
  sourcemap: true,
  minify: !isWatch,
  loader: {
    '.css': 'text',
  },
};

async function build() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('[watch] Build started...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log('[build] Extension and webview built successfully.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
