import React, { useState, useEffect } from 'react';
import { Building2, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { Client } from '../types';
import { useToast } from './ui/Toast';

interface ClientManagerProps {
  selectedClientId: string | null;
  onClientSelect: (clientId: string | null) => void;
}

export const ClientManager: React.FC<ClientManagerProps> = ({ selectedClientId, onClientSelect }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientDescription, setNewClientDescription] = useState('');
  const { addToast } = useToast();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await Api.getClients();
      setClients(data);
    } catch (error: any) {
      console.error('Failed to load clients:', error);
      addToast(error.message || 'クライアント一覧の取得に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newClientName.trim()) {
      addToast('会社名を入力してください', 'error');
      return;
    }

    try {
      const client = await Api.createClient(newClientName.trim(), newClientDescription.trim() || undefined);
      setClients([...clients, client]);
      setNewClientName('');
      setNewClientDescription('');
      setShowCreateModal(false);
      addToast('会社を作成しました', 'success');
      // 作成した会社を自動選択
      onClientSelect(client.id);
    } catch (error: any) {
      console.error('Failed to create client:', error);
      addToast(error.message || '会社の作成に失敗しました', 'error');
    }
  };

  const handleUpdate = async () => {
    if (!editingClient || !newClientName.trim()) {
      return;
    }

    try {
      const updated = await Api.updateClient(
        editingClient.id,
        newClientName.trim(),
        newClientDescription.trim() || undefined
      );
      setClients(clients.map(c => c.id === updated.id ? updated : c));
      setEditingClient(null);
      setNewClientName('');
      setNewClientDescription('');
      addToast('会社を更新しました', 'success');
    } catch (error: any) {
      console.error('Failed to update client:', error);
      addToast(error.message || '会社の更新に失敗しました', 'error');
    }
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm('この会社を削除しますか？関連するデータも削除されます。')) {
      return;
    }

    try {
      await Api.deleteClient(clientId);
      setClients(clients.filter(c => c.id !== clientId));
      if (selectedClientId === clientId) {
        onClientSelect(null);
      }
      addToast('会社を削除しました', 'success');
    } catch (error: any) {
      console.error('Failed to delete client:', error);
      addToast(error.message || '会社の削除に失敗しました', 'error');
    }
  };

  const startEdit = (client: Client) => {
    setEditingClient(client);
    setNewClientName(client.name);
    setNewClientDescription(client.description || '');
    setShowCreateModal(true);
  };

  const cancelEdit = () => {
    setEditingClient(null);
    setNewClientName('');
    setNewClientDescription('');
    setShowCreateModal(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">会社管理</h3>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingClient(null);
            setNewClientName('');
            setNewClientDescription('');
            setShowCreateModal(true);
          }}
          icon={<Plus size={16} />}
        >
          新規作成
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">読み込み中...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p>会社が登録されていません</p>
          <p className="text-sm mt-1">「新規作成」ボタンから会社を追加してください</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedClientId === null
                ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-400'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            onClick={() => onClientSelect(null)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">すべてのデータ</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">会社を選択しない場合</p>
              </div>
            </div>
          </div>
          {clients.map(client => (
            <div
              key={client.id}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedClientId === client.id
                  ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => onClientSelect(client.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{client.name}</p>
                  {client.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{client.description}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(client);
                    }}
                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400"
                    title="編集"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(client.id);
                    }}
                    className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                    title="削除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingClient ? '会社を編集' : '新しい会社を作成'}
              </h3>
              <button
                onClick={cancelEdit}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  会社名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="例: A社"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  説明（任意）
                </label>
                <textarea
                  value={newClientDescription}
                  onChange={(e) => setNewClientDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="会社の説明を入力（任意）"
                  rows={3}
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <Button
                  onClick={editingClient ? handleUpdate : handleCreate}
                  className="flex-1"
                  icon={editingClient ? <Check size={16} /> : <Plus size={16} />}
                >
                  {editingClient ? '更新' : '作成'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={cancelEdit}
                  className="flex-1"
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

