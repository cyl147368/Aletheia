import { useCallback, useEffect, useState } from 'react';
import { createStation, deleteStation, importStations, listStations, updateStation, type Station } from '../api';

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
    setStations(await listStations());
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

  const openEdit = (station: Station) => {
    setEditingId(station.id);
    setShowAddForm(false);
    setFormName(station.name);
    setFormUrl(station.base_url);
    setFormKey('');
    setFormScheduleEnabled(station.schedule_enabled);
    setFormInterval(station.schedule_interval_hours);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) {
      alert('名称和地址不能为空');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updates: Record<string, unknown> = {
          name: formName.trim(),
          base_url: formUrl.trim(),
          schedule_enabled: formScheduleEnabled,
          schedule_interval_hours: formInterval,
        };
        if (formKey.trim()) updates.api_key = formKey.trim();
        await updateStation(editingId, updates);
      } else {
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

  const handleDelete = async (station: Station) => {
    if (!confirm(`确定删除「${station.name}」？其所有探测记录也会被删除。`)) return;
    await deleteStation(station.id);
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
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stations</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">站点管理</h1>
          <p className="mt-1 text-sm text-slate-500">配置中转站地址、密钥和定时探测间隔，共 {stations.length} 个。</p>
        </div>
        <button
          onClick={openAdd}
          className="h-10 bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          添加站点
        </button>
      </header>

      {isFormOpen && (
        <section className="border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">{editingId ? '编辑站点' : '添加站点'}</h2>
            <button onClick={resetForm} className="px-2 py-1 text-sm text-slate-500 hover:text-slate-950">关闭</button>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <label className="text-sm">
              <span className="mb-2 block font-medium text-slate-700">名称</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
                placeholder="我的中转站"
              />
            </label>
            <label className="text-sm">
              <span className="mb-2 block font-medium text-slate-700">Base URL</span>
              <input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="h-10 w-full border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
                placeholder="https://api.example.com"
              />
            </label>
            <label className="text-sm">
              <span className="mb-2 block font-medium text-slate-700">
                API Key {editingId && <span className="font-normal text-slate-400">(留空不修改)</span>}
              </span>
              <input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                type="password"
                className="h-10 w-full border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
                placeholder={editingId ? '********' : 'sk-...'}
              />
            </label>
            <label className="text-sm">
              <span className="mb-2 block font-medium text-slate-700">定时探测间隔</span>
              <input
                type="number"
                min={1}
                max={168}
                value={formInterval}
                onChange={(e) => setFormInterval(Number(e.target.value))}
                className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>
          <div className="flex flex-col gap-4 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formScheduleEnabled}
                onChange={(e) => setFormScheduleEnabled(e.target.checked)}
                className="h-4 w-4 border-slate-300 text-slate-950"
              />
              启用定时探测
            </label>
            <div className="flex gap-2">
              <button
                onClick={resetForm}
                className="h-9 border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-9 bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">站点列表</h2>
            <span className="text-xs text-slate-400">{stations.length} rows</span>
          </div>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">地址</th>
                <th className="px-4 py-3">定时</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {stations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-14 text-center text-sm text-slate-400">
                    还没有添加中转站，点击“添加站点”开始。
                  </td>
                </tr>
              ) : (
                stations.map((station) => (
                  <tr key={station.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-950">{station.name}</td>
                    <td className="max-w-md px-4 py-3 font-mono text-xs text-slate-500">
                      <div className="truncate" title={station.base_url}>{station.base_url}</div>
                    </td>
                    <td className="px-4 py-3">
                      {station.schedule_enabled ? (
                        <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          每 {station.schedule_interval_hours}h
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">关闭</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(station)} className="mr-3 text-sm font-medium text-slate-700 hover:text-slate-950">
                        编辑
                      </button>
                      <button onClick={() => handleDelete(station)} className="text-sm font-medium text-rose-600 hover:text-rose-700">
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">批量导入</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">粘贴 JSON 数组，字段包含 name、base_url、api_key。</p>
          </div>
          <div className="p-4">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="w-full border border-slate-300 bg-white px-3 py-3 font-mono text-xs leading-5 text-slate-800 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
              placeholder='[{"name":"站点名称","base_url":"https://api.example.com","api_key":"sk-xxx"}]'
            />
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="mt-3 h-9 w-full bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {importing ? '导入中...' : '导入'}
            </button>
            {importMsg && (
              <p className={`mt-3 text-sm ${importMsg.includes('失败') || importMsg.includes('错误') ? 'text-rose-600' : 'text-emerald-700'}`}>
                {importMsg}
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
