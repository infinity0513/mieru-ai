import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

export default defineConfig(({ mode }) => {
    // .envファイルが存在しない場合でもエラーにならないようにする
    let env = {};
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        // ファイルが存在し、読み取り可能か確認してから読み込む
        if (fs.existsSync(envPath)) {
            try {
                // ファイルの読み取り権限を確認
                fs.accessSync(envPath, fs.constants.R_OK);
                env = loadEnv(mode, process.cwd(), '');
            } catch (accessError: any) {
                // アクセス権限エラーやloadEnvエラーは無視
                console.warn('Warning: Could not load .env file, using default values');
            }
        }
        // .envファイルが存在しない場合は空のオブジェクトを使用（Netlify環境など）
    } catch (e: any) {
        // すべてのエラーを無視して空のオブジェクトを使用
        console.warn('Warning: Could not load .env file, using default values');
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
