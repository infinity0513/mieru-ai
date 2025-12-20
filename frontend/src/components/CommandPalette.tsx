import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronRight, Command, X, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react';

export interface CommandAction {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  perform: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandAction[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(lowerQuery) || 
      cmd.group.toLowerCase().includes(lowerQuery)
    );
  }, [query, commands]);

  // Group commands for display
  const groupedCommands = useMemo(() => {
    const groups: { [key: string]: CommandAction[] } = {};
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.group]) {
        groups[cmd.group] = [];
      }
      groups[cmd.group].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
        setQuery('');
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          filteredCommands[selectedIndex].perform();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
        const activeItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto pt-[20vh] px-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative mx-auto max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl ring-1 ring-black/5 overflow-hidden animate-fade-in-down transform transition-all">
        {/* Search Input */}
        <div className="relative border-b border-gray-100 dark:border-gray-800">
          <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
            placeholder="コマンドを入力... (例: 分析, 設定, テーマ)"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="absolute right-3 top-3 hidden sm:flex items-center space-x-1">
             <kbd className="hidden sm:inline-block rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Esc</kbd>
          </div>
        </div>

        {/* Command List */}
        <div 
            ref={listRef}
            className="max-h-[60vh] overflow-y-auto py-2 scroll-smooth"
        >
          {filteredCommands.length === 0 ? (
            <div className="py-14 text-center sm:py-20">
              <Command className="mx-auto h-6 w-6 text-gray-400 dark:text-gray-600" />
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">コマンドが見つかりません。</p>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([group, groupCommands]: [string, CommandAction[]]) => (
                <div key={group}>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/50">
                        {group}
                    </div>
                    {groupCommands.map((cmd) => {
                        // Find the absolute index of this command in the filtered list for highlighting
                        const absoluteIndex = filteredCommands.indexOf(cmd);
                        const isSelected = absoluteIndex === selectedIndex;

                        return (
                            <div
                                key={cmd.id}
                                data-index={absoluteIndex}
                                onClick={() => { cmd.perform(); onClose(); }}
                                onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                                className={`cursor-pointer px-4 py-3 flex items-center justify-between transition-colors ${
                                    isSelected 
                                        ? 'bg-indigo-600 text-white' 
                                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`}
                            >
                                <div className="flex items-center">
                                    <div className={`mr-3 p-1 rounded-md ${isSelected ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                                        {cmd.icon || <ChevronRight size={16} />}
                                    </div>
                                    <span className="text-sm font-medium">{cmd.label}</span>
                                </div>
                                {isSelected && (
                                    <CornerDownLeft size={16} className="text-indigo-200" />
                                )}
                            </div>
                        );
                    })}
                </div>
            ))
          )}
        </div>
        
        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                    <ArrowUp size={12} />
                    <ArrowDown size={12} />
                    <span>移動</span>
                </div>
                <div className="flex items-center gap-1">
                    <CornerDownLeft size={12} />
                    <span>選択</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};