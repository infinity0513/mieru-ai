import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, User, Bot, Loader2, Sparkles, Minimize2, Maximize2, Mic, MicOff, Volume2, Trash2, StopCircle } from 'lucide-react';
import { CampaignData, ChatMessage } from '../types';
import { Api } from '../services/api';
import { Button } from './ui/Button';

interface ChatAssistantProps {
  data: CampaignData[];
}

// Extend window interface for SpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const SUGGESTIONS = [
  "📈 ROASの低いキャンペーンは？",
  "💰 CPAを下げるための改善策は？",
  "📊 選択した期間のパフォーマンス概要",
  "🚨 AI異常検知モニター"
];

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'こんにちは！AIアシスタントです。広告データについて何でも質問してください。音声入力も可能です。',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice Recognition State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // TTS State
  const [isSpeaking, setIsSpeaking] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, isMinimized]);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ja-JP';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInputText(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setInputText('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      if (isSpeaking) {
        setIsSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.volume = 1;
      utterance.rate = 1.2; // Slightly faster
      
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSend = async (textToSend: string = inputText) => {
    if (!textToSend.trim() || isLoading) return;

    // Stop listening if active
    if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const history = messages.filter(m => m.id !== 'welcome'); 
      const responseText = await Api.chatWithData(userMessage.text, history, data);
      
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: 'すみません、エラーが発生しました。もう一度お試しください。',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
      if(confirm('会話履歴を消去しますか？')) {
          setMessages([{
              id: 'welcome',
              role: 'model',
              text: '会話をリセットしました。新たな質問をどうぞ！',
              timestamp: new Date()
          }]);
          window.speechSynthesis.cancel();
          setIsSpeaking(false);
      }
  };

  if (!isOpen) {
    return (
      <button
        id="ai-chat-trigger"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 group no-print"
        aria-label="AIチャットを開く"
      >
        <MessageCircle size={28} />
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
          AI
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed z-50 transition-all duration-300 no-print ${
      isMinimized 
        ? 'bottom-6 right-6 w-72 h-14 rounded-lg' 
        : 'bottom-6 right-6 w-80 sm:w-96 h-[500px] sm:h-[600px] rounded-2xl'
    } bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden ring-1 ring-black/5`}>
      
      {/* Header */}
      <div 
        className="bg-indigo-600 dark:bg-indigo-800 text-white p-3 flex justify-between items-center cursor-pointer select-none"
        onClick={() => !isMinimized && setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center space-x-2">
          <Sparkles size={18} className="text-yellow-300 animate-pulse" />
          <h3 className="font-bold text-sm">AI データアシスタント</h3>
        </div>
        <div className="flex items-center space-x-1">
          {!isMinimized && (
              <button
                onClick={(e) => { e.stopPropagation(); clearHistory(); }}
                className="p-1.5 hover:bg-indigo-500 rounded text-white/80 hover:text-white transition-colors"
                title="履歴をクリア"
              >
                <Trash2 size={14} />
              </button>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
            className="p-1 hover:bg-indigo-500 rounded text-white/80 hover:text-white transition-colors"
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
            className="p-1 hover:bg-indigo-500 rounded text-white/80 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900 scroll-smooth">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex items-start ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === 'user' 
                    ? 'bg-gray-200 dark:bg-gray-700 ml-2' 
                    : 'bg-indigo-100 dark:bg-indigo-900/50 mr-2'
                }`}>
                  {msg.role === 'user' ? <User size={16} className="text-gray-600 dark:text-gray-300" /> : <Bot size={16} className="text-indigo-600 dark:text-indigo-400" />}
                </div>
                <div className={`max-w-[75%] p-3 rounded-lg text-sm shadow-sm relative group ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  
                  {/* TTS Button for Bot Messages */}
                  {msg.role === 'model' && (
                      <button 
                        onClick={() => speakText(msg.text)}
                        className={`absolute -bottom-6 left-0 p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100 ${isSpeaking ? 'text-indigo-600 opacity-100' : ''}`}
                        title="読み上げ"
                      >
                          {isSpeaking ? <StopCircle size={14} className="animate-pulse"/> : <Volume2 size={14}/>}
                      </button>
                  )}
                </div>
              </div>
            ))}
            
            {/* Suggestion Chips */}
            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === 'model' && (
                <div className="flex flex-wrap gap-2 mt-4 px-2">
                    {SUGGESTIONS.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => handleSend(s)}
                            className="text-xs bg-white dark:bg-gray-800 border border-indigo-100 dark:border-gray-700 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors shadow-sm text-left"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {isLoading && (
              <div className="flex items-start">
                 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 mr-2 flex items-center justify-center">
                    <Bot size={16} className="text-indigo-600 dark:text-indigo-400" />
                 </div>
                 <div className="bg-white dark:bg-gray-800 p-3 rounded-lg rounded-tl-none border border-gray-100 dark:border-gray-700 shadow-sm flex items-center space-x-2">
                    <Loader2 size={16} className="animate-spin text-indigo-500" />
                    <span className="text-xs text-gray-500">AI思考中...</span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
            <div className={`flex items-end space-x-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 border transition-colors ${isListening ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-200 dark:border-gray-600 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500'}`}>
              
              {/* Mic Button */}
              {('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`flex-shrink-0 p-1.5 rounded-full transition-colors mb-1 ${
                        isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={isListening ? "音声入力停止" : "音声入力開始"}
                  >
                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
              )}

              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={3}
                placeholder={isListening ? "お話しください..." : "質問を入力..."}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-900 dark:text-white placeholder-gray-400 min-w-0 resize-none overflow-y-auto"
                disabled={isLoading}
                style={{ minHeight: '60px', maxHeight: '120px' }}
              />
              
              <button 
                onClick={() => handleSend()}
                disabled={!inputText.trim() || isLoading}
                className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white p-1.5 rounded-md transition-colors mb-1"
                title="送信"
              >
                <Send size={16} />
              </button>
            </div>
            
            <div className="mt-2 flex justify-between items-center text-xs text-gray-400 dark:text-gray-500 px-1">
                <span>AIは不正確な情報を生成する可能性があります</span>
                {isListening && <span className="text-red-500 font-medium animate-pulse">● 録音中</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};