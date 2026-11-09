import { defineConfig } from 'vite';

export default defineConfig({
  base: 'lab_2_three.js_island',
  build: {
    rollupOptions: {
      external: (id) => (
        id === 'three'
        || id.startsWith('three/addons/')
        || id === 'cannon-es'
        || id === 'lil-gui'
      ),
      output: {
        format: 'es',
      },
    },
  },
});
