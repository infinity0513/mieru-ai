import React, { useState, useEffect } from 'react';
import { AIAnalysisResult, CampaignData } from '../types';
import { Api } from '../services/api';
import { Button } from './ui/Button';
import { Star, AlertTriangle, Lightbulb, CheckSquare, RefreshCw, TrendingUp, Printer, Save, Archive, Trash2, Clock, ChevronRight, X, Download, BarChart3 } from 'lucide-react';
import { useToast } from './ui/Toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface AnalysisProps {
  data: CampaignData[];
}

export const Analysis: React.FC<AnalysisProps> = ({ data }) => {
  // JST基準で日付文字列を生成（YYYY-MM-DD形式）
  const formatDateJST = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  
  // History State
  const [history, setHistory] = useState<AIAnalysisResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  
  // Date range for analysis
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Campaign selection
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const availableCampaigns = React.useMemo(() => {
    const campaigns = new Set(data.map(d => d.campaign_name).filter(Boolean));
    return Array.from(campaigns).sort();
  }, [data]);
  
  const { addToast } = useToast();

  // Load history from API on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await Api.getAnalyses();
        const analyses = response.data || [];
        
        // Convert backend format to frontend format
        const convertedHistory = analyses.map((a: any) => {
          // 期間情報をraw_data.periodに設定（analysis_period_start/endから取得）
          const rawData = a.raw_data || {};
          if (!rawData.period && (a.analysis_period_start || a.analysis_period_end)) {
            rawData.period = {
              start_date: a.analysis_period_start ? formatDateJST(new Date(a.analysis_period_start)) : null,
              end_date: a.analysis_period_end ? formatDateJST(new Date(a.analysis_period_end)) : null
            };
          }
          
          return {
          id: String(a.id),
          date: a.created_at,
          campaign_name: a.campaign_name || null,
          overall_rating: a.overall_rating,
          overall_comment: a.overall_comment,
          issues: a.issues || [],
          recommendations: a.recommendations || [],
          action_plan: a.action_plan || [],
            raw_data: rawData
          };
        });
        
        setHistory(convertedHistory);
      } catch (error) {
        console.error("Failed to load analysis history", error);
        // Fallback to localStorage
    const saved = localStorage.getItem('ad_analyzer_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
      }
    };
    
    loadHistory();
  }, []);

  // Set default date range from data (実際のデータ範囲を使用)
  useEffect(() => {
    if (data.length > 0) {
      const dates = data.map(d => new Date(d.date).getTime());
      const maxDate = new Date(Math.max(...dates));
      const minDate = new Date(Math.min(...dates)); // データの最小日付を使用
      
      setStartDate(formatDateJST(minDate));
      setEndDate(formatDateJST(maxDate));
    }
  }, [data]);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setLoading(true);
    setError(null);
    setSavedId(null);
    setAnalysisStatus('分析を開始しています...');
    
    try {
      // Start analysis
      const result = await Api.createAnalysis(
        startDate || undefined, 
        endDate || undefined,
        selectedCampaign || undefined
      );
      
      setAnalysisStatus('AIが分析を実行中です。しばらくお待ちください...');
      
      // Poll for completion
      const completedAnalysis = await Api.pollAnalysisStatus(result.id);
      
      // Convert backend format to frontend format
      console.log('Analysis result from backend:', completedAnalysis);
      
      const convertedResult: AIAnalysisResult = {
        id: String(completedAnalysis.id),
        date: completedAnalysis.created_at || new Date().toISOString(), // ISO形式のタイムスタンプはそのまま
        campaign_name: completedAnalysis.campaign_name || null,
        overall_rating: completedAnalysis.overall_rating || 0,
        overall_comment: completedAnalysis.overall_comment || '',
        issues: Array.isArray(completedAnalysis.issues) ? completedAnalysis.issues : [],
        recommendations: Array.isArray(completedAnalysis.recommendations) ? completedAnalysis.recommendations : [],
        action_plan: Array.isArray(completedAnalysis.action_plan) ? completedAnalysis.action_plan : [],
        raw_data: completedAnalysis.raw_data || null
      };
      
      console.log('Converted result:', convertedResult);
      setResult(convertedResult);
      setShowHistory(false);
      setAnalysisStatus(null);
      addToast('分析が完了しました', 'success');
      
      // Refresh history
      const response = await Api.getAnalyses();
      const analyses = response.data || [];
      const convertedHistory = analyses.map((a: any) => {
        // 期間情報をraw_data.periodに設定（analysis_period_start/endから取得）
        const rawData = a.raw_data || {};
        if (!rawData.period && (a.analysis_period_start || a.analysis_period_end)) {
          rawData.period = {
            start_date: a.analysis_period_start ? formatDateJST(new Date(a.analysis_period_start)) : null,
            end_date: a.analysis_period_end ? formatDateJST(new Date(a.analysis_period_end)) : null
          };
        }
        
        return {
        id: String(a.id),
        date: a.created_at,
        campaign_name: a.campaign_name || null,
        overall_rating: a.overall_rating,
        overall_comment: a.overall_comment,
        issues: a.issues || [],
        recommendations: a.recommendations || [],
        action_plan: a.action_plan || [],
          raw_data: rawData
        };
      });
      setHistory(convertedHistory);
      
    } catch (error: any) {
      console.error('AI分析エラー:', error);
      let errorMessage = "分析中にエラーが発生しました。";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response) {
        errorMessage = error.response.data?.detail || error.response.data?.message || errorMessage;
      } else if (error.detail) {
        errorMessage = error.detail;
      }
      
      setError(errorMessage);
      setAnalysisStatus(null);
      addToast(errorMessage, 'error');
    } finally {
      setIsAnalyzing(false);
      setLoading(false);
    }
  };

  const saveReport = () => {
    if (!result) return;
    
    // Check if already saved
    if (history.some(h => h.id === result.id)) {
        setSavedId(result.id);
        return;
    }

    const newHistory = [result, ...history];
    setHistory(newHistory);
    localStorage.setItem('ad_analyzer_history', JSON.stringify(newHistory));
    setSavedId(result.id);
    addToast("レポートを保存しました", 'success');
  };

  const deleteReport = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('このレポートを削除してもよろしいですか？')) {
      try {
        await Api.deleteAnalysis(id);
      const newHistory = history.filter(h => h.id !== id);
      setHistory(newHistory);
      if (result?.id === id) {
          setResult(null);
        setSavedId(null);
      }
      addToast("レポートを削除しました", 'info');
      } catch (error: any) {
        addToast("削除に失敗しました", 'error');
      }
    }
  };

  const loadReport = (report: AIAnalysisResult) => {
    setResult(report);
    setSavedId(report.id); // It's a saved report
    setShowHistory(false); // Close drawer
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!result) return;
    
    // 変数をtryブロックの外で定義（エラーハンドリングで使用するため）
    let reportElement: HTMLElement | null = null;
    let elementsToHide: NodeListOf<Element> | null = null;
    let originalDisplayValues: string[] = [];
    let styleModifications: Array<{ element: HTMLElement; originalStyles: { [key: string]: string } }> = [];
    
    try {
      // レポートコンテンツの要素を取得
      reportElement = document.getElementById('analysis-report-content') as HTMLElement;
      if (!reportElement) {
        throw new Error('レポート要素が見つかりません');
      }
      
      addToast('PDFを生成中です...', 'info');
      
      // PDF生成時に非表示にする要素を取得
      elementsToHide = reportElement.querySelectorAll('.pdf-exclude');
      originalDisplayValues = [];
      
      // 要素を非表示にする
      elementsToHide.forEach((el) => {
        const htmlEl = el as HTMLElement;
        originalDisplayValues.push(htmlEl.style.display);
        htmlEl.style.display = 'none';
      });
      
      // PDF生成用のスタイルを適用
      styleModifications = [];
      
      // パフォーマンス分析セクションのカードを最適化
      const performanceCards = reportElement.querySelectorAll('#performance-analysis-section .bg-blue-50, #performance-analysis-section .bg-green-50, #performance-analysis-section .bg-red-50, #performance-analysis-section .bg-purple-50, #performance-analysis-section .bg-yellow-50, #performance-analysis-section .bg-indigo-50, #performance-analysis-section .bg-pink-50');
      performanceCards.forEach((card) => {
        const htmlCard = card as HTMLElement;
        const originalStyles = {
          padding: htmlCard.style.padding,
          minWidth: htmlCard.style.minWidth,
          overflow: htmlCard.style.overflow,
          wordBreak: htmlCard.style.wordBreak,
          overflowWrap: htmlCard.style.overflowWrap,
        };
        styleModifications.push({ element: htmlCard, originalStyles });
        
        // PDF生成用のスタイルを適用
        htmlCard.style.padding = '8px';
        htmlCard.style.minWidth = '0';
        htmlCard.style.overflow = 'visible';
        htmlCard.style.wordBreak = 'break-word';
        htmlCard.style.overflowWrap = 'break-word';
      });
      
      // カード内のテキスト要素を最適化
      const cardTexts = reportElement.querySelectorAll('#performance-analysis-section .text-xs, #performance-analysis-section .text-lg, #performance-analysis-section .text-sm');
      cardTexts.forEach((text) => {
        const htmlText = text as HTMLElement;
        const originalStyles = {
          whiteSpace: htmlText.style.whiteSpace,
          overflow: htmlText.style.overflow,
          textOverflow: htmlText.style.textOverflow,
          wordBreak: htmlText.style.wordBreak,
          overflowWrap: htmlText.style.overflowWrap,
        };
        styleModifications.push({ element: htmlText, originalStyles });
        
        // truncateクラスの効果を無効化
        htmlText.style.whiteSpace = 'normal';
        htmlText.style.overflow = 'visible';
        htmlText.style.textOverflow = 'clip';
        htmlText.style.wordBreak = 'break-word';
        htmlText.style.overflowWrap = 'break-word';
      });
      
      // 改善提案セクションのカードを最適化
      const recommendationCards = reportElement.querySelectorAll('#recommendations-section > div > div');
      recommendationCards.forEach((card) => {
        const htmlCard = card as HTMLElement;
        if (htmlCard.classList.contains('border')) {
          const originalStyles = {
            padding: htmlCard.style.padding,
            minHeight: htmlCard.style.minHeight,
            display: htmlCard.style.display,
            flexDirection: htmlCard.style.flexDirection,
          };
          styleModifications.push({ element: htmlCard, originalStyles });
          
          // PDF生成用のスタイルを適用
          htmlCard.style.padding = '12px';
          htmlCard.style.minHeight = 'auto';
        }
      });
      
      // 改善提案のグリッドレイアウトを最適化
      const recommendationsGrid = reportElement.querySelector('#recommendations-section > div');
      if (recommendationsGrid) {
        const htmlGrid = recommendationsGrid as HTMLElement;
        const originalStyles = {
          gridTemplateColumns: htmlGrid.style.gridTemplateColumns,
          gap: htmlGrid.style.gap,
        };
        styleModifications.push({ element: htmlGrid, originalStyles });
        
        // PDF生成用のスタイルを適用
        htmlGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        htmlGrid.style.gap = '12px';
      }
      
      // パフォーマンス分析のグリッドレイアウトを最適化
      const performanceGrids = reportElement.querySelectorAll('#performance-analysis-section .grid');
      performanceGrids.forEach((grid) => {
        const htmlGrid = grid as HTMLElement;
        const originalStyles = {
          gridTemplateColumns: htmlGrid.style.gridTemplateColumns,
          gap: htmlGrid.style.gap,
        };
        styleModifications.push({ element: htmlGrid, originalStyles });
        
        // PDF生成用のスタイルを適用（列数を調整）
        const currentCols = htmlGrid.classList.contains('lg:grid-cols-6') ? 6 : 
                           htmlGrid.classList.contains('lg:grid-cols-5') ? 5 : 3;
        htmlGrid.style.gridTemplateColumns = `repeat(${Math.min(currentCols, 3)}, 1fr)`;
        htmlGrid.style.gap = '8px';
      });
      
      // 主要課題の評価（高、中など）を中央揃えに最適化
      const issueSeverityBadges = reportElement.querySelectorAll('#issues-section .flex-shrink-0.w-12');
      issueSeverityBadges.forEach((badge) => {
        const htmlBadge = badge as HTMLElement;
        const originalStyles = {
          display: htmlBadge.style.display,
          alignItems: htmlBadge.style.alignItems,
          justifyContent: htmlBadge.style.justifyContent,
          lineHeight: htmlBadge.style.lineHeight,
          paddingTop: htmlBadge.style.paddingTop,
          paddingBottom: htmlBadge.style.paddingBottom,
          transform: htmlBadge.style.transform,
        };
        styleModifications.push({ element: htmlBadge, originalStyles });
        
        // PDF生成用のスタイルを適用（テキストを2ピクセル上にずらして中央に配置）
        htmlBadge.style.display = 'flex';
        htmlBadge.style.alignItems = 'center';
        htmlBadge.style.justifyContent = 'center';
        htmlBadge.style.lineHeight = '1';
        htmlBadge.style.paddingTop = '2px';
        htmlBadge.style.paddingBottom = '4px';
        htmlBadge.style.transform = 'translateY(-2px)';
      });
      
      // アクションプランの番号（１、２、３など）を中央揃えに最適化
      const actionStepBadges = reportElement.querySelectorAll('#action-plan-section .rounded-full.w-8.h-8');
      actionStepBadges.forEach((badge) => {
        const htmlBadge = badge as HTMLElement;
        const originalStyles = {
          display: htmlBadge.style.display,
          alignItems: htmlBadge.style.alignItems,
          justifyContent: htmlBadge.style.justifyContent,
          lineHeight: htmlBadge.style.lineHeight,
          paddingTop: htmlBadge.style.paddingTop,
          paddingBottom: htmlBadge.style.paddingBottom,
          transform: htmlBadge.style.transform,
        };
        styleModifications.push({ element: htmlBadge, originalStyles });
        
        // PDF生成用のスタイルを適用（テキストを2ピクセル上にずらして中央に配置）
        htmlBadge.style.display = 'flex';
        htmlBadge.style.alignItems = 'center';
        htmlBadge.style.justifyContent = 'center';
        htmlBadge.style.lineHeight = '1';
        htmlBadge.style.paddingTop = '0px';
        htmlBadge.style.paddingBottom = '2px';
        htmlBadge.style.transform = 'translateY(-2px)';
      });
      
      // 改善提案詳細のカテゴリ（楕円）を最適化
      const recommendationCategories = reportElement.querySelectorAll('#recommendations-section .inline-flex.items-center.rounded-full');
      recommendationCategories.forEach((category) => {
        const htmlCategory = category as HTMLElement;
        const originalStyles = {
          padding: htmlCategory.style.padding,
          paddingLeft: htmlCategory.style.paddingLeft,
          paddingRight: htmlCategory.style.paddingRight,
          paddingTop: htmlCategory.style.paddingTop,
          paddingBottom: htmlCategory.style.paddingBottom,
          whiteSpace: htmlCategory.style.whiteSpace,
          overflow: htmlCategory.style.overflow,
          textOverflow: htmlCategory.style.textOverflow,
          maxWidth: htmlCategory.style.maxWidth,
          fontSize: htmlCategory.style.fontSize,
          lineHeight: htmlCategory.style.lineHeight,
          transform: htmlCategory.style.transform,
        };
        styleModifications.push({ element: htmlCategory, originalStyles });
        
        // PDF生成用のスタイルを適用（テキストを2ピクセル上にずらして中央に配置）
        htmlCategory.style.padding = '3px 8px';
        htmlCategory.style.paddingLeft = '8px';
        htmlCategory.style.paddingRight = '8px';
        htmlCategory.style.paddingTop = '3px';
        htmlCategory.style.paddingBottom = '5px';
        htmlCategory.style.whiteSpace = 'nowrap';
        htmlCategory.style.overflow = 'hidden';
        htmlCategory.style.textOverflow = 'ellipsis';
        htmlCategory.style.maxWidth = '100%';
        htmlCategory.style.fontSize = '11px';
        htmlCategory.style.lineHeight = '1.2';
        htmlCategory.style.transform = 'translateY(-2px)';
      });
      
      // フォントが読み込まれるまで待つ
      await new Promise(resolve => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            setTimeout(resolve, 500);
          });
              } else {
          setTimeout(resolve, 1000);
        }
      });
      
      // html2canvasでスクリーンショットを撮る
      const canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
        foreignObjectRendering: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: reportElement.scrollWidth,
        windowHeight: reportElement.scrollHeight,
      });
      
      // キャンバスを画像データに変換
      const imgData = canvas.toDataURL('image/jpeg', 0.90);
      
      // PDFのサイズを設定（A4）
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      
      // A4サイズ（mm）
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // マージン（上下左右2mm）
      const margin = 2;
      const contentWidth = pdfWidth - (margin * 2);
      const contentHeight = pdfHeight - (margin * 2);
      
      // 画像のサイズを計算（アスペクト比を保持）
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const imgAspectRatio = imgWidth / imgHeight;
      
      // PDFに収まるサイズに調整
      let finalWidth = contentWidth;
      let finalHeight = contentWidth / imgAspectRatio;
      
      // 高さがPDFの高さを超える場合は、高さ基準で調整
      if (finalHeight > contentHeight) {
        finalHeight = contentHeight;
        finalWidth = contentHeight * imgAspectRatio;
      }
      
      // 中央揃えのためのX座標
      const x = (pdfWidth - finalWidth) / 2;
      const y = margin;
      
      // PDFに画像を追加
      pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
      
      // PDFを保存
      const filename = `分析レポート_${formatDateJST(new Date(result.date))}.pdf`;
      pdf.save(filename);
      
      // 非表示にした要素を元に戻す
      elementsToHide.forEach((el, index) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.display = originalDisplayValues[index] || '';
      });
      
      // スタイルを元に戻す
      styleModifications.forEach(({ element, originalStyles }) => {
        Object.keys(originalStyles).forEach((key) => {
          element.style[key as any] = originalStyles[key] || '';
        });
      });
      
      addToast('PDFレポートをダウンロードしました', 'success');
    } catch (error: any) {
      console.error('PDF生成エラー:', error);
      
      // エラー時も非表示にした要素とスタイルを元に戻す
      if (reportElement && elementsToHide) {
        elementsToHide.forEach((el, index) => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.display = originalDisplayValues[index] || '';
        });
      }
      
      // スタイルも元に戻す
      if (styleModifications) {
        styleModifications.forEach(({ element, originalStyles }) => {
          Object.keys(originalStyles).forEach((key) => {
            element.style[key as any] = originalStyles[key] || '';
              });
            });
          }
      
      addToast(error.message || 'PDF生成に失敗しました', 'error');
    }
  };

  if (error) {
     return (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-6">
                <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">エラーが発生しました</h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400 max-w-md mx-auto">{error}</p>
            <div className="mt-8">
                <Button onClick={runAnalysis} variant="secondary" icon={<RefreshCw size={16}/>}>再試行</Button>
            </div>
        </div>
     )
  }

  // Show analysis status if analyzing
  if (isAnalyzing && analysisStatus) {
    return (
      <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-indigo-50 dark:bg-indigo-900/30 mb-6">
          <RefreshCw className="h-10 w-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">AI分析実行中</h3>
        <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          {analysisStatus}
        </p>
        <div className="mt-6">
          <div className="w-64 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-indigo-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // Initial State (No result, not loading)
  if (!result && !loading && !isAnalyzing) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-indigo-50 dark:bg-indigo-900/30 mb-6">
            <Lightbulb className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">AI分析を開始</h3>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            最新のデータをAIが多角的に分析します。<br/>
            パフォーマンスの課題特定、具体的な改善提案、アクションプランを数秒で生成します。
          </p>
          
          {/* Date Range Selection */}
          <div className="mt-8 max-w-md mx-auto space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  開始日
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  終了日
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            
            {/* Campaign Selection */}
            {availableCampaigns.length > 0 && (
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                キャンペーン（オプション）
              </label>
              <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
              >
                <option value="">全体分析</option>
                {availableCampaigns.map((campaign) => (
                  <option key={campaign} value={campaign}>
                    {campaign}
                  </option>
                ))}
              </select>
            </div>
            )}
          
            <Button 
              onClick={runAnalysis} 
              variant="primary" 
              icon={<TrendingUp size={16}/>}
              className="w-full"
            >
              AI分析を実行
            </Button>
          </div>
        </div>

        {/* History Sidebar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 no-print">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center">
              <Archive className="mr-2" size={18}/> 保存済みレポート
            </h3>
            <button onClick={() => setShowHistory(!showHistory)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full">
              {showHistory ? <X size={20} className="text-gray-500"/> : <ChevronRight size={20} className="text-gray-500"/>}
            </button>
          </div>
          
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {history.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Archive size={40} className="mx-auto mb-3 opacity-50"/>
                <p className="text-sm">保存されたレポートはありません</p>
              </div>
            ) : (
              history.slice(0, 10).map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => loadReport(item)}
                  className="p-3 rounded-lg border cursor-pointer transition-all relative group bg-white border-gray-200 hover:border-indigo-300 hover:shadow-md dark:bg-gray-800 dark:border-gray-700"
                >
                  <div className="flex justify-between items-start mb-2">
                                <div className="flex-1">
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                        {new Date(item.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Star size={12} className="text-yellow-400 fill-current mr-1"/>
                      <span className="text-xs font-bold dark:text-gray-200">{item.overall_rating}</span>
                    </div>
                  </div>
                  {item.campaign_name && (
                    <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">
                      {item.campaign_name}
                                        </p>
                                    )}
                  {!item.campaign_name && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">全体分析</p>
                  )}
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 mb-2">
                    {item.overall_comment}
                  </p>
                  <div className="flex justify-between items-center text-xs text-gray-400">
                    <span>{new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <button 
                      onClick={(e) => deleteReport(e, item.id)}
                      className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      title="削除"
                    >
                      <Trash2 size={14}/>
                    </button>
                                    </div>
                                </div>
              ))
            )}
                            </div>
                        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">AIがデータを分析中...</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">数千件のレコードをスキャンし、インサイトを抽出しています</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 relative animate-fade-in">
      
      {/* Main Content - PDF生成用のIDを追加 */}
      <div id="analysis-report-content" className="flex-1 space-y-8 print:space-y-6 min-w-0">
        {/* Header / Score */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 avoid-break transition-colors analysis-section">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center flex-wrap gap-2">
                 分析レポート：生成日時： {new Date(result.date).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}
                 {savedId && <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded border border-green-200 dark:border-green-800">保存済み</span>}
              </h2>
              {(() => {
                // 期間情報を取得（raw_data.periodから、またはstateから）
                const periodStart = result.raw_data?.period?.start_date || startDate;
                const periodEnd = result.raw_data?.period?.end_date || endDate;
                
                if (periodStart || periodEnd) {
                  return (
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">
                      対象期間： {periodStart ? new Date(periodStart).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      }) : '指定なし'} ～ {periodEnd ? new Date(periodEnd).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      }) : '指定なし'}
                    </p>
                  );
                }
                return null;
              })()}
              {(result as any).campaign_name && (
                <p className="text-base font-medium text-indigo-600 dark:text-indigo-400 mt-1">
                  キャンペーン: {(result as any).campaign_name}
                </p>
              )}
              {!(result as any).campaign_name && (
                <p className="text-base font-medium text-indigo-600 dark:text-indigo-400 mt-1">
                  全体分析
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-4 md:mt-0 no-print pdf-exclude">
              <Button 
                variant={savedId ? "secondary" : "primary"} 
                icon={savedId ? <CheckSquare size={16}/> : <Save size={16} />} 
                onClick={saveReport}
                disabled={!!savedId}
              >
                {savedId ? '保存済み' : 'レポートを保存'}
              </Button>
              <Button variant="outline" icon={<Printer size={16} />} onClick={handlePrint}>印刷</Button>
              <Button variant="outline" icon={<Download size={16} />} onClick={handleDownloadPDF}>PDFダウンロード</Button>
              <Button variant="secondary" icon={<Archive size={16} />} onClick={() => setShowHistory(!showHistory)}>
                 履歴 ({history.length})
              </Button>
              <Button variant="outline" icon={<RefreshCw size={16} />} onClick={runAnalysis}>再分析</Button>
            </div>
          </div>

          <div className="flex items-center p-6 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 rounded-xl print:border print:border-gray-200">
            <div className="flex-shrink-0 text-center px-4 border-r border-indigo-100 dark:border-indigo-800" style={{ paddingBottom: '4px' }}>
              <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mb-1">総合評価</div>
              <div className="flex items-center justify-center gap-1" style={{ overflow: 'visible', minWidth: '120px', paddingBottom: '2px', paddingTop: '2px' }}>
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-6 h-6 flex-shrink-0 ${i < result.overall_rating ? 'text-yellow-400 fill-current' : 'text-gray-300 dark:text-gray-600'}`}
                    style={{ width: '24px', height: '24px', minWidth: '24px', minHeight: '24px', overflow: 'visible', marginBottom: '2px' }}
                  />
                ))}
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{result.overall_rating}/5</div>
            </div>
            <div className="ml-6 flex-1">
              <p className="text-gray-800 dark:text-gray-200 leading-relaxed font-medium">"{result.overall_comment}"</p>
            </div>
          </div>
        </div>

        <div id="issues-action-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:block print:space-y-6">
          {/* Issues */}
          <div id="issues-section" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 avoid-break transition-colors" style={{ 
            border: '1px solid #e5e7eb',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#e5e7eb',
            borderRadius: '0.75rem',
            boxSizing: 'border-box'
          }}>
            <div className="flex items-center mb-6">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 mr-3 print:border print:border-red-200">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">主要課題</h3>
            </div>
            <div className="space-y-4">
              {result.issues && result.issues.length > 0 ? (
                result.issues.map((issue, idx) => (
                  <div key={idx} className="flex p-4 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors avoid-break">
                    <div className={`flex-shrink-0 w-12 text-xs font-bold py-1 px-2 rounded text-center h-fit ${
                      issue.severity === '高' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' : issue.severity === '中' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                    }`}>
                      {issue.severity}
                    </div>
                    <div className="ml-4">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{issue.issue}</h4>
                      {issue.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{issue.description}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">課題はありません</p>
              )}
            </div>
          </div>

          {/* Action Plan */}
          <div id="action-plan-section" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 avoid-break transition-colors" style={{ 
            border: '1px solid #e5e7eb',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#e5e7eb',
            borderRadius: '0.75rem',
            boxSizing: 'border-box'
          }}>
            <div className="flex items-center mb-6">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400 mr-3 print:border print:border-indigo-200">
                <CheckSquare size={20} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">アクションプラン</h3>
            </div>
            <div className="space-y-4">
              {result.action_plan && result.action_plan.length > 0 ? (
                result.action_plan.map((action, idx) => (
                  <div key={idx} className="flex p-4 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors avoid-break">
                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center font-bold text-sm mr-3">
                      {action.step}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{action.action}</h4>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                        {action.timeline && (
                          <span className="flex items-center">
                            <Clock size={12} className="mr-1" />
                            {action.timeline}
                          </span>
                        )}
                        {action.responsible && (
                          <span className="flex items-center">
                            <span className="mr-1">担当:</span>
                            {action.responsible}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">アクションプランはありません</p>
              )}
            </div>
          </div>
        </div>

        {/* Performance Analysis */}
        <div id="performance-analysis-section" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 avoid-break transition-colors performance-detail-section">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 mr-3 print:border print:border-blue-200">
              <TrendingUp size={20} />
              </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">詳細パフォーマンス分析</h3>
            </div>
            
          {/* Calculate performance data from data prop (same as Dashboard) */}
          {(() => {
            // Filter data by analysis period and campaign (same logic as Dashboard)
            const analysisStartDate = result.raw_data?.period?.start_date || startDate;
            const analysisEndDate = result.raw_data?.period?.end_date || endDate;
            const analysisCampaign = result.campaign_name || selectedCampaign;
            
            // Filter data based on analysis period and campaign
            const filteredAnalysisData = data.filter(d => {
              const inDateRange = (!analysisStartDate || d.date >= analysisStartDate) && 
                                  (!analysisEndDate || d.date <= analysisEndDate);
              const matchesCampaign = !analysisCampaign || d.campaign_name === analysisCampaign;
              return inDateRange && matchesCampaign;
            });
            
            // Calculate totals (same as Dashboard)
            const totalImpressions = filteredAnalysisData.reduce((acc, curr) => acc + curr.impressions, 0);
            const totalClicks = filteredAnalysisData.reduce((acc, curr) => acc + curr.clicks, 0);
            const totalCost = filteredAnalysisData.reduce((acc, curr) => acc + curr.cost, 0);
            const totalConversions = filteredAnalysisData.reduce((acc, curr) => acc + curr.conversions, 0);
            const totalValue = filteredAnalysisData.reduce((acc, curr) => acc + curr.conversion_value, 0);
            const totalReach = filteredAnalysisData.reduce((acc, curr) => acc + (curr.reach || 0), 0);
            const totalEngagements = filteredAnalysisData.reduce((acc, curr) => acc + (curr.engagements || 0), 0);
            const totalLinkClicks = filteredAnalysisData.reduce((acc, curr) => acc + (curr.link_clicks || 0), 0);
            const totalLandingPageViews = filteredAnalysisData.reduce((acc, curr) => acc + (curr.landing_page_views || 0), 0);
            
            // Calculate averages (same as Dashboard)
            const avgRoas = totalCost > 0 ? (totalValue / totalCost * 100) : 0;
            const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
            const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
            const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
            const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
            const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
            const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
            const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;
            
            return (
              <>
          {/* Totals - 全体サマリー */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">全体サマリー</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 print:grid-cols-3 print:gap-2">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 print:p-2 border border-blue-200 dark:border-blue-800 min-w-0 overflow-hidden">
                <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium truncate">インプレッション</div>
                <div className="text-lg print:text-sm font-bold text-blue-700 dark:text-blue-300 break-words leading-tight">
                  {totalImpressions.toLocaleString()}
                    </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 print:p-2 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
                <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium truncate">クリック数</div>
                <div className="text-lg print:text-sm font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                  {totalClicks.toLocaleString()}
                    </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 print:p-2 border border-red-200 dark:border-red-800 min-w-0 overflow-hidden">
                <div className="text-xs text-red-600 dark:text-red-400 mb-1 font-medium truncate">費用</div>
                <div className="text-lg print:text-sm font-bold text-red-700 dark:text-red-300 break-words leading-tight">
                  ¥{totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 print:p-2 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">コンバージョン</div>
                <div className="text-lg print:text-sm font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                  {totalConversions.toLocaleString()}
                    </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 print:p-2 border border-yellow-200 dark:border-yellow-800 min-w-0 overflow-hidden">
                <div className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-medium truncate">コンバージョン価値</div>
                <div className="text-lg print:text-sm font-bold text-yellow-700 dark:text-yellow-300 break-words leading-tight">
                  ¥{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
                </div>
              </div>

            {/* Averages - 計算指標（パフォーマンス指標） */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">計算指標（パフォーマンス指標）</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:grid-cols-3 print:gap-2">
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 print:p-2 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">ROAS</div>
                    <div className="text-lg print:text-sm font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                  {avgRoas.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">費用対効果</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 print:p-2 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CTR</div>
                    <div className="text-lg print:text-sm font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                  {ctr.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">クリック率</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 print:p-2 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CVR</div>
                    <div className="text-lg print:text-sm font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                  {cvr.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">コンバージョン率</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 print:p-2 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPC</div>
                    <div className="text-lg print:text-sm font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                  ¥{cpc.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">クリック単価</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 print:p-2 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPA</div>
                    <div className="text-lg print:text-sm font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                  ¥{avgCpa.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">獲得単価</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 print:p-2 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPM</div>
                    <div className="text-lg print:text-sm font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                  ¥{cpm.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">インプレッション単価</div>
                  </div>
                </div>
              </div>

            {/* リーチ・エンゲージメント指標 */}
          {(totalReach > 0 || frequency > 0 || engagementRate > 0 || totalLinkClicks > 0 || totalLandingPageViews > 0) && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">リーチ・エンゲージメント指標</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 print:grid-cols-3 print:gap-2">
                {totalReach > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 print:p-2 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                      <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">リーチ数</div>
                      <div className="text-lg print:text-sm font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                      {totalReach.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                    </div>
                  )}
                {frequency > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 print:p-2 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                      <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">フリークエンシー</div>
                      <div className="text-lg print:text-sm font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                      {frequency.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                    </div>
                  )}
                {engagementRate > 0 && (
                    <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 print:p-2 border border-pink-200 dark:border-pink-800 min-w-0 overflow-hidden">
                      <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-medium truncate">エンゲージメント率</div>
                      <div className="text-lg print:text-sm font-bold text-pink-700 dark:text-pink-300 break-words leading-tight">
                      {engagementRate.toFixed(2)}%
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                    </div>
                  )}
                {totalLinkClicks > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 print:p-2 border border-blue-200 dark:border-blue-800 min-w-0 overflow-hidden">
                      <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium truncate">リンククリック数</div>
                      <div className="text-lg print:text-sm font-bold text-blue-700 dark:text-blue-300 break-words leading-tight">
                      {totalLinkClicks.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                    </div>
                  )}
                {totalLandingPageViews > 0 && (
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 print:p-2 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
                      <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium truncate">LPビュー数</div>
                      <div className="text-lg print:text-sm font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                      {totalLandingPageViews.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                    </div>
                  )}
                </div>
              </div>
            )}
              </>
            );
          })()}
          </div>

        {/* Recommendations */}
        <div id="recommendations-section" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 avoid-break transition-colors" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <div className="flex items-center mb-6">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-yellow-600 dark:text-yellow-400 mr-3 print:border print:border-yellow-200">
              <Lightbulb size={20} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">改善提案詳細</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2">
            {result.recommendations && result.recommendations.length > 0 ? (
              result.recommendations.map((rec, idx) => (
                <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-md transition-shadow relative overflow-hidden group avoid-break">
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity no-print">
                    <TrendingUp size={64} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  {rec.category && (
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 mb-3 print:border print:border-indigo-200">
                      {rec.category}
                    </div>
                  )}
                  <h4 className="text-base font-bold text-gray-900 dark:text-white mb-2">{rec.title}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 min-h-[40px]">{rec.description}</p>
                  
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">期待効果</span>
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">{rec.expected_impact}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 dark:text-gray-400">難易度</span>
                      <div className="flex">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className={`w-2 h-2 rounded-full mx-0.5 ${i < (rec.difficulty || 3) ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-gray-200 dark:bg-gray-600'}`}></div>
                        ))}
                      </div>
                    </div>
                </div>
              </div>
              ))
            ) : (
              <div className="col-span-full">
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">特筆すべき改善提案はありません。</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History Sidebar/Overlay */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 z-40 w-full md:w-96 bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 transform transition-transform duration-300 animate-slide-in-right flex flex-col no-print">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center">
                    <Archive className="mr-2" size={18}/> 保存済みレポート
                </h3>
                <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full">
                    <X size={20} className="text-gray-500"/>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                        <Archive size={40} className="mx-auto mb-3 opacity-50"/>
                        <p className="text-sm">保存されたレポートはありません</p>
                    </div>
                ) : (
                    history.map((item) => (
                        <div 
                            key={item.id} 
                            onClick={() => loadReport(item)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all relative group ${
                                item.id === result?.id 
                                    ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800 ring-1 ring-indigo-500' 
                                    : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-md dark:bg-gray-800 dark:border-gray-700'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1">
                                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                        {new Date(item.date).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex items-center">
                                    <Star size={12} className="text-yellow-400 fill-current mr-1"/>
                                    <span className="text-xs font-bold dark:text-gray-200">{item.overall_rating}</span>
                                </div>
                            </div>
                            {item.campaign_name && (
                                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">
                                    {item.campaign_name}
                                </p>
                            )}
                            {!item.campaign_name && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">全体分析</p>
                            )}
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 mb-2">
                                {item.overall_comment}
                            </p>
                            <div className="flex justify-between items-center text-xs text-gray-400">
                                <span>{new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                <button 
                                    onClick={(e) => deleteReport(e, item.id)}
                                    className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                    title="削除"
                                >
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      )}
    </div>
  );
};













