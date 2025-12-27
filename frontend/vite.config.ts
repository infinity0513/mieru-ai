import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

export default defineConfig(({ mode }) => {
    // .envファイルが存在しない場合でもエラーにならないようにする
    let env = {};
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        // ファイルが存在するか確認してから読み込む
        if (fs.existsSync(envPath)) {
            env = loadEnv(mode, process.cwd(), '');
        } else {
            console.warn('Warning: .env file not found, using default values');
        }
    } catch (e: any) {
        // .envファイルが存在しない場合やアクセス権限エラーの場合は空のオブジェクトを使用
        if (e.code === 'EPERM' || e.code === 'ENOENT') {
            console.warn('Warning: Could not load .env file (permission denied or not found), using default values');
        } else {
            console.warn('Warning: Could not load .env file:', e.message || e);
        }
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
