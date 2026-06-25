import { useEffect, useState, useCallback } from 'react';
import { listStations, createStation, updateStation, deleteStation, importStations, type Station } from '../api';

export default function ManagePage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [editing, setEditing] = useState<Station | null>(null);
  const [adding, setAdding] = useState(false);

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
    setEditing(null);
    setAdding(false);
    setFormName('');
    setFormUrl('');
    setFormKey('');
    setFormScheduleEnabled(true);
    setFormInterval(6);
  };

  const openAdd = () => {
    resetForm();
    setAdding(true);
  };

  const openEdit = (s: Station) => {
    setEditing(s);
    setAdding(false);
    setFormName(s.name);
    setFormUrl(s.base_url);
    setFormKey('');
    setFormScheduleEnabled(s.schedule_enabled);
    setFormInterval(s.schedule_interval_hours);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        base_url: formUrl.trim(),
        api_key: formKey.trim(),
      };
      const updates: Record<string, unknown> = {
        name: formName.trim(),
        base_url: formUrl.trim(),
        schedule_enabled: formScheduleEnabled,
        schedule_interval_hours: formInterval,
      };
      if (formKey.trim()) {
        updates.api_key = formKey.trim();
      }

      if (editing) {
        await updateStation(editing.id, updates);
      } else if (adding) {
        await createStation(body);
      }
      resetForm();
      await fetchStations();
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

  const showForm = adding || editing;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">站点管理</h1>
        <button onClick={openAdd} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-800 transition">
          + 添加站点
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-slate-800">
            {editing ? '编辑' : '添加'}中转站
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              名称
              <input value={formName} onChange={(e) => setFormName(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Base URL
              <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm font-mono" placeholder="https://api.example.com" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              API Key{editing ? '（留空不修改）' : ''}
              <input value={formKey} onChange={(e) => setFormKey(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm font-mono" placeholder={editing ? '留空不修改' : 'sk-...'} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              定时探测间隔（小时）
              <input type="number" min={1} max={168} value={formInterval} onChange={(e) => setFormInterval(Number(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={formScheduleEnabled} onChange={(e) => setFormScheduleEnabled(e.target.checked)} />
            启用定时探测
          </label>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={resetForm}
              className="bg-slate-100 text-slate-600 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
              取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-slate-800">批量导入</h2>
        <p className="text-xs text-slate-500 mb-3">
          粘贴 JSON 数组：[{'{'}"name": "站点名", "base_url": "https://...", "api_key": "sk-..."{'}'}, ...]
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={5}
          className="w-full border rounded-lg px-3 py-2 text-xs font-mono mb-2"
          placeholder='[{"name": "我的中转站", "base_url": "https://api.example.com", "api_key": "sk-..."}]'
        />
        <button onClick={handleImport} disabled={importing}
          className="bg-slate-700 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-600 disabled:opacity-50">
          {importing ? '导入中...' : '导入'}
        </button>
        {importMsg && <p className={`text-xs mt-2 ${importMsg.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>{importMsg}</p>}
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-left">
              <th className="px-4 py-3 font-medium text-slate-500">名称</th>
              <th className="px-4 py-3 font-medium text-slate-500">地址</th>
              <th className="px-4 py-3 font-medium text-slate-500">定时</th>
              <th className="px-4 py-3 font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((s) => (
              <tr key={s.id} className="border-b hover:bg-slate-50 transition">
                <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.base_url}</td>
                <td className="px-4 py-3 text-xs">
                  {s.schedule_enabled ? `每${s.schedule_interval_hours}h` : '—'}
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(s)}
                    className="text-xs text-blue-600 hover:text-blue-800">编辑</button>
                  <button onClick={() => handleDelete(s)}
                    className="text-xs text-red-500 hover:text-red-700">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}