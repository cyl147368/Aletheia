import { useEffect, useState, useCallback } from 'react';
import { listStations, createStation, updateStation, deleteStation, importStations, type Station } from '../api';

export default function ManagePage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formScheduleEnabled, setFormScheduleEnabled] = useState(true);
  const [formInterval, setFormInterval] = useState(6);
  const [saving, setSaving] = useState(false);

  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const fetchStations = useCallback(async () => {
    const s = await listStations();
    setStations(s);
  }, []);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  const resetForm = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormName('');
    setFormUrl('');
    setFormKey('');
    setFormScheduleEnabled(true);
    setFormInterval(6);
  };

  const openAdd = () => {
    resetForm();
    setShowAddForm(true);
  };

  const openEdit = (s: Station) => {
    setEditingId(s.id);
    setShowAddForm(false);
    setFormName(s.name);
    setFormUrl(s.base_url);
    setFormKey('');
    setFormScheduleEnabled(s.schedule_enabled);
    setFormInterval(s.schedule_interval_hours);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) {
      alert('名称和地址不能为空');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // 编辑模式
        const updates: Record<string, unknown> = {
          name: formName.trim(),
          base_url: formUrl.trim(),
          schedule_enabled: formScheduleEnabled,
          schedule_interval_hours: formInterval,
        };
        if (formKey.trim()) {
          updates.api_key = formKey.trim();
        }
        await updateStation(editingId, updates);
      } else {
        // 新增模式
        if (!formKey.trim()) {
          alert('新增站点时 API Key 不能为空');
          return;
        }
        await createStation({
          name: formName.trim(),
          base_url: formUrl.trim(),
          api_key: formKey.trim(),
        });
      }
      resetForm();
      await fetchStations();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`保存失败: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Station) => {
    if (!confirm(`确定删除「${s.name}」？其所有探测记录也会被删除。`)) return;
    await deleteStation(s.id);
    await fetchStations();
  };

  const handleImport = async () => {
    setImporting(true);
    setImportMsg('');
    try {
      let items: { name: string; base_url: string; api_key: string }[];
      try {
        items = JSON.parse(importText);
      } catch {
        setImportMsg('JSON 格式错误');
        return;
      }
      if (!Array.isArray(items)) {
        setImportMsg('必须是 JSON 数组');
        return;
      }
      const imported = await importStations(items);
      setImportMsg(`成功导入 ${imported} 个中转站`);
      setImportText('');
      await fetchStations();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportMsg(`导入失败: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const isFormOpen = showAddForm || editingId !== null;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">站点管理</h1>
          <p className="text-sm text-slate-500 mt-1">共 {stations.length} 个中转站</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:from-blue-700 hover:to-blue-800 transition shadow-lg shadow-blue-500/25"
        >
          + 添加站点
        </button>
      </div>

      {/* 添加/编辑表单 */}
      {isFormOpen && (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              {editingId ? '编辑站点' : '添加新站点'}
            </h2>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">名称</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="我的中转站"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">Base URL</span>
              <input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="border border-slate-300 rounded-lg px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://api.example.com"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">
                API Key {editingId && <span className="text-slate-400 font-normal">(留空不修改)</span>}
              </span>
              <input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                type="password"
                className="border border-slate-300 rounded-lg px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={editingId ? '••••••••' : 'sk-...'}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">定时探测间隔（小时）</span>
              <input
                type="number"
                min={1}
                max={168}
                value={formInterval}
                onChange={(e) => setFormInterval(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm mb-5 cursor-pointer">
            <input
              type="checkbox"
              checked={formScheduleEnabled}
              onChange={(e) => setFormScheduleEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-slate-600">启用定时探测</span>
          </label>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={resetForm}
              className="bg-slate-100 text-slate-600 rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-slate-200 transition"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 批量导入 */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold mb-3 text-slate-800">批量导入</h2>
        <p className="text-xs text-slate-500 mb-3">
          粘贴 JSON 数组，格式：<code className="bg-slate-100 px-1.5 py-0.5 rounded">[{"{"}"name": "...", "base_url": "...", "api_key": "..."{"}"}]</code>
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={4}
          className="w-full border border-slate-300 rounded-lg px-4 py-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          placeholder='[{"name": "站点名称", "base_url": "https://api.example.com", "api_key": "sk-xxx"}]'
        />
        <button
          onClick={handleImport}
          disabled={importing || !importText.trim()}
          className="bg-slate-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {importing ? '导入中...' : '导入'}
        </button>
        {importMsg && (
          <p className={`text-sm mt-3 ${importMsg.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>
            {importMsg}
          </p>
        )}
      </div>

      {/* 站点列表 */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-5 py-4 font-semibold text-slate-600">名称</th>
              <th className="px-5 py-4 font-semibold text-slate-600">地址</th>
              <th className="px-5 py-4 font-semibold text-slate-600">定时</th>
              <th className="px-5 py-4 font-semibold text-slate-600 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-slate-400">
                  还没有添加中转站，点击上方「添加站点」按钮开始
                </td>
              </tr>
            ) : (
              stations.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition">
                  <td className="px-5 py-4 font-medium text-slate-900">{s.name}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">{s.base_url}</td>
                  <td className="px-5 py-4">
                    {s.schedule_enabled ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        每{s.schedule_interval_hours}h
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">关闭</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => openEdit(s)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium mr-4"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="text-sm text-red-500 hover:text-red-700 font-medium"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}