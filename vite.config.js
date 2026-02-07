import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  // Get app name from environment variable or default to cashier-console
  const app = process.env.VITE_APP || 'cashier-console'
  
  // Determine if building for debug (non-minified with sourcemaps)
  const isDebugBuild = process.env.VITE_DEBUG === 'true'
  
  // Determine if sourcemaps should be generated for staging/qa
  const shouldGenerateSourcemap =
    isDebugBuild ||
    process.env.VITE_SOURCEMAP === 'true' ||
    mode === 'development' ||
    process.env.NODE_ENV === 'staging' ||
    process.env.NODE_ENV === 'qa' ||
    process.env.BUILD_ENV === 'staging'
  
  return {
    plugins: [react()],
    build: {
      outDir: `imogi_pos/public/react/${app}${isDebugBuild ? '-debug' : ''}`,
      emptyOutDir: true,
      manifest: true,
      
      // CRITICAL: Enable sourcemaps for readable error stacks
      // Uses 'hidden' for production (sourceMappingURL still works, just not exposed)
      // Uses 'inline' for debug builds (sourcemap embedded in bundle)
      sourcemap: isDebugBuild ? 'inline' : (shouldGenerateSourcemap ? 'hidden' : false),
      
      // Debug build: disable minification for readable code
      minify: isDebugBuild ? false : 'esbuild',
      
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, `src/apps/${app}/main.jsx`)
        },
        output: {
          entryFileNames: 'static/js/[name].[hash].js',
          chunkFileNames: 'static/js/[name].[hash].js',
          assetFileNames: 'static/[ext]/[name].[hash].[ext]',
          // CRITICAL: Ensure sourceMappingURL comments are preserved
          // This comment tells browser where sourcemap file is located
          sourcemapPathTransform: (relativeSourcePath) => relativeSourcePath
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@cashier-console': path.resolve(__dirname, './src/apps/cashier-console'),
        '@cashier-payment': path.resolve(__dirname, './src/apps/cashier-payment'),
        '@kitchen': path.resolve(__dirname, './src/apps/kitchen'),
        '@waiter': path.resolve(__dirname, './src/apps/waiter'),
        '@kiosk': path.resolve(__dirname, './src/apps/kiosk'),
        '@self-order': path.resolve(__dirname, './src/apps/self-order'),
        '@customer-display': path.resolve(__dirname, './src/apps/customer-display'),
        '@table-display': path.resolve(__dirname, './src/apps/table-display'),
        '@customer-display-editor': path.resolve(__dirname, './src/apps/customer-display-editor'),
        '@table-display-editor': path.resolve(__dirname, './src/apps/table-display-editor')
      }
    },
    server: {
      port: 3000,
      proxy: {
        // Proxy Frappe API calls during development
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/assets': {
          target: 'http://localhost:8000',
          changeOrigin: true
        }
      }
    }
  }
})
