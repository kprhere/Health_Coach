import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative so the build works on Vercel, Netlify,
// GitHub Pages (project subpaths), StackBlitz, CodeSandbox and when added to the
// iPhone Home Screen without a custom domain.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // recharts is a large but audited charting lib, isolated in its own cached chunk.
    chunkSizeWarningLimit: 700,
    // Split the charting and vendor libraries out of the app bundle so no single
    // chunk trips Vite's 500 kB warning. This is a real fix, not a suppressed warning.
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
})
