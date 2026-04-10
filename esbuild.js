const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const error of result.errors) {
        console.error(`x [ERROR] ${error.text}`);
        if (error.location) {
          console.error(`  ${error.location.file}:${error.location.line}:${error.location.column}`);
        }
      }
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode', 'better-sqlite3'],
    sourcemap: !production,
    minify: production,
    sourcesContent: false,
    logLevel: 'warning',
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
    return;
  }

  await ctx.rebuild();
  await ctx.dispose();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
