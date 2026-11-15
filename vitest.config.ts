import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Node asset checks run via pretest; the workshop keeps its own package.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'tools/asset-workshop/**', 'nikita models/**', 'scripts/astronaut/**'],
  },
}));
