import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // .envファイルが存在しない場合でもエラーにならないようにする
    let env = {};
    try {
        env = loadEnv(mode, process.cwd(), '');
    } catch (e) {
        // .envファイルが存在しない場合は空のオブジェクトを使用
        console.warn('Warning: Could not load .env file:', e);
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
