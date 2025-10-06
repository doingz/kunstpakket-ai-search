import esbuild from 'esbuild';
import { compile } from 'sass';
import { readFileSync, writeFileSync } from 'fs';

const isWatch = process.argv.includes('--watch');

// Compile SCSS to CSS
const cssResult = compile('src/styles/widget.scss', {
  style: 'compressed',
  sourceMap: false
});

// Inline CSS plugin
const inlineCSSPlugin = {
  name: 'inline-css',
  setup(build) {
    build.onLoad({ filter: /\.css-inline$/ }, () => ({
      contents: `export default ${JSON.stringify(cssResult.css)}`,
      loader: 'js'
    }));
  }
};

// Build config
const buildOptions = {
  entryPoints: ['src/js/index.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/widget.js',
  plugins: [inlineCSSPlugin],
  define: {
    'import.meta.CSS': JSON.stringify(cssResult.css)
  }
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('👀 Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  
  // Copy to worker directory
  const widgetContent = readFileSync('dist/widget.js', 'utf-8');
  writeFileSync('worker/widget.txt', widgetContent);
  
  console.log('✅ Build complete: dist/widget.js');
  console.log('✅ Copied to: worker/widget.txt');
}
