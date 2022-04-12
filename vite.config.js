import { resolve } from 'path';
import { defineConfig } from 'vite';
import typescript from '@rollup/plugin-typescript'

export default defineConfig({
    output: {
        dir: resolve(__dirname, 'dist'),
        sourcemap: true
    },
    build: {
        sourcemap: true,
        lib: {
            entry: resolve(__dirname, 'src/python-can-remote.ts'),
            name: 'python-can-remote-ts',
            fileName: (format) => `python-can-remote.${format}.js`
        },
    },
    plugins: [
        typescript()
    ]
})
