import { build } from 'esbuild'

const banner = `window.__ModuleLoader__.load({
\tid: "dsh-remote-control-bridge",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`
const footer = `
\t\treturn module.exports;
\t}
});`

await build({
  entryPoints: ['client/index.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/*'],
  banner: { js: banner },
  footer: { js: footer },
  outfile: 'lib/client.js',
  sourcemap: 'inline',
  logLevel: 'info',
})
