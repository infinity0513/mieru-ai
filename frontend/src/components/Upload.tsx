import React, { useState, useCallback } from 'react';
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { CampaignData } from '../types';

interface UploadProps {
  onUploadComplete: (data: CampaignData[]) => void;
}

export const Upload: React.FC<UploadProps> = ({ onUploadComplete }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recordCount, setRecordCount] = useState(0);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    if (
      file.type === "text/csv" || 
      file.name.endsWith('.csv') || 
      file.name.endsWith('.xlsx') || 
      file.name.endsWith('.xls')
    ) {
      setFile(file);
      setError(null);
      setSuccess(false);
    } else {
      setError("CSV または Excel (.xlsx) ファイルのみアップロード可能です。");
    }
  };

  const handleDownloadSampleCSV = () => {
    // サンプルデータを作成
    const sampleData = [
      {
        '日付': '2024-01-01',
        'キャンペーン名': 'サンプルキャンペーンA',
        '広告セット名': '広告セット1',
        '広告名': '広告1',
        'インプレッション': '10000',
        'クリック数': '500',
        '費用': '5000',
        'コンバージョン数': '50',
        'コンバージョン価値': '100000',
        'リーチ': '8000',
        'エンゲージメント': '200',
        'リンククリック': '450',
        'ランディングページビュー': '400'
      },
      {
        '日付': '2024-01-02',
        'キャンペーン名': 'サンプルキャンペーンA',
        '広告セット名': '広告セット1',
        '広告名': '広告1',
        'インプレッション': '12000',
        'クリック数': '600',
        '費用': '6000',
        'コンバージョン数': '60',
        'コンバージョン価値': '120000',
        'リーチ': '9500',
        'エンゲージメント': '250',
        'リンククリック': '550',
        'ランディングページビュー': '500'
      },
      {
        '日付': '2024-01-03',
        'キャンペーン名': 'サンプルキャンペーンB',
        '広告セット名': '広告セット2',
        '広告名': '広告2',
        'インプレッション': '15000',
        'クリック数': '750',
        '費用': '7500',
        'コンバージョン数': '75',
        'コンバージョン価値': '150000',
        'リーチ': '12000',
        'エンゲージメント': '300',
        'リンククリック': '700',
        'ランディングページビュー': '650'
      }
    ];

    // CSVヘッダー
    const headers = [
      '日付',
      'キャンペーン名',
      '広告セット名',
      '広告名',
      'インプレッション',
      'クリック数',
      '費用',
      'コンバージョン数',
      'コンバージョン価値',
      'リーチ',
      'エンゲージメント',
      'リンククリック',
      'ランディングページビュー'
    ];

    // CSVデータを生成
    const csvRows = [
      headers.join(','),
      ...sampleData.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // カンマや改行を含む場合はダブルクォートで囲む
          if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];

    const csvContent = csvRows.join('\n');
    
    // BOMを追加してExcelで正しく開けるようにする（UTF-8）
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // ダウンロードリンクを作成
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'サンプルデータ.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    
    try {
      const result = await Api.uploadFile(file);
      
      if (!result.success) {
        throw new Error("アップロードに失敗しました。");
      }

      setRecordCount(result.rows);
      setSuccess(true);
      
      // Fetch campaign data after upload
      try {
        const data = await Api.fetchCampaignData();
      setTimeout(() => {
        onUploadComplete(data);
      }, 1000);
      } catch (fetchError) {
        // If fetch fails, still show success for upload
        console.warn("Failed to fetch campaign data:", fetchError);
        setTimeout(() => {
          onUploadComplete([]);
        }, 1000);
      }

    } catch (err: any) {
      console.error(err);
      // Extract error message from various possible error formats
      let errorMessage = "ファイルのアップロード中にエラーが発生しました。";
      if (err.message) {
        errorMessage = err.message;
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.detail) {
        errorMessage = err.detail;
      }
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 transition-colors">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">データインポート</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">META広告のレポートデータ（CSV / Excel）をアップロードしてください。</p>
        </div>

        <div 
          className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleChange}
            accept=".csv, .xlsx, .xls"
          />
          
          <div className="flex flex-col items-center justify-center pointer-events-none">
            <div className={`p-4 rounded-full ${file ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-gray-100 dark:bg-gray-700'} mb-4`}>
              {file ? <FileSpreadsheet className="text-indigo-600 dark:text-indigo-400 w-8 h-8" /> : <UploadIcon className="text-gray-400 dark:text-gray-500 w-8 h-8" />}
            </div>
            
            {file ? (
              <div>
                <p className="text-lg font-medium text-gray-900 dark:text-white">{file.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{(file.size / 1024).toFixed(2)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium text-gray-900 dark:text-white">ここにファイルをドロップ</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">またはクリックしてファイルを選択</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center text-red-700 dark:text-red-300">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 rounded-lg flex items-center text-green-700 dark:text-green-300">
            <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            <div>
              <p className="font-medium">インポート完了！</p>
              <p className="text-sm">{recordCount}件のレコードを処理しました。ダッシュボードへ移動します...</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <Button 
            disabled={!file || success} 
            onClick={handleUpload}
            isLoading={uploading}
            className="w-full sm:w-auto"
          >
            {uploading ? '解析中...' : 'アップロードと解析開始'}
          </Button>
        </div>
      </div>

      <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">対応フォーマット</h3>
          <Button
            onClick={handleDownloadSampleCSV}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            サンプルCSVをダウンロード
          </Button>
        </div>
        <div className="p-6 text-sm text-gray-600 dark:text-gray-300">
          <p className="mb-2">Facebook広告マネージャのエクスポート形式に対応しています（CSVまたはExcel形式）。</p>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">※ サンプルCSVをダウンロードして、フォーマットを確認してください。</p>
          <div className="mb-3">
            <p className="font-medium mb-1">必須カラム:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>日付</li>
              <li>キャンペーン名</li>
              <li>広告セット名</li>
              <li>広告名</li>
              <li>インプレッション</li>
              <li>クリック数</li>
              <li>費用</li>
              <li>コンバージョン数</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">オプションカラム:</p>
          <ul className="list-disc pl-5 space-y-1">
              <li>コンバージョン価値</li>
              <li>リーチ</li>
              <li>エンゲージメント</li>
              <li>リンククリック</li>
              <li>ランディングページビュー</li>
          </ul>
          </div>
        </div>
      </div>
    </div>
  );
};