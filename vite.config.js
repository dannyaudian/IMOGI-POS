import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Get app name from environment variable or default to cashier-console
  const app = process.env.VITE_APP || 'cashier-console'
  
  return {
    plugins: [react()],
    build: {
      outDir: `imogi_pos/public/react/${app}`,
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, `src/apps/${app}/main.jsx`)
        },
        output: {
          entryFileNames: 'static/js/[name].[hash].js',
          chunkFileNames: 'static/js/[name].[hash].js',
          assetFileNames: 'static/[ext]/[name].[hash].[ext]'
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
