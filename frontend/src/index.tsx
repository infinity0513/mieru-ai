import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// 一時的にReact Strict Modeを無効化（開発環境での重複リクエストを防ぐため）
// 本番デプロイ前に戻してください
root.render(
  <App />
  // <React.StrictMode>
  //   <App />
  // </React.StrictMode>
);