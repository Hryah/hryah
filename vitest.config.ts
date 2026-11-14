import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// The workshop is an isolated package with its own install and test command.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'tools/asset-workshop/**', 'nikita models/**'],
  },
}));
