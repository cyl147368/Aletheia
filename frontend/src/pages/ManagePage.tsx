import { useCallback, useEffect, useState } from 'react';
import { createStation, deleteStation, importStations, listStations, updateStation, type Station } from '../api';

export default function ManagePage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formOfficialUrl, setFormOfficialUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formScheduleEnabled, setFormScheduleEnabled] = useState(true);
  const [formInterval, setFormInterval] = useState(6);
  const [saving, setSaving] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('list');

  const fetchStations = useCallback(async () => {
    setStations(await listStations());
  }, []);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  const resetForm = () => {
    setEditingId(null); setShowAddForm(false);
    setFormName(''); setFormUrl(''); setFormOfficialUrl(''); setFormKey('');
    setFormScheduleEnabled(true); setFormInterval(6);
  };

  const openAdd = () => { resetForm(); setShowAddForm(true); };

  const openEdit = (station: Station) => {
    setEditingId(station.id); setShowAddForm(false);
    setFormName(station.name); setFormUrl(station.base_url);
    setFormOfficialUrl(station.official_url ?? '');
    setFormKey(''); setFormScheduleEnabled(station.schedule_enabled);
    setFormInterval(station.schedule_interval_hours);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) { alert('名称和地址不能为空'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const updates: Record<string, unknown> = {
          name: formName.trim(), base_url: formUrl.trim(),
          official_url: formOfficialUrl.trim() || null,
          schedule_enabled: formScheduleEnabled, schedule_interval_hours: formInterval,
        };
        if (formKey.trim()) updates.api_key = formKey.trim();
        await updateStation(editingId, updates);
      } else {
        if (!formKey.trim()) { alert('新增站点时 API Key 不能为空'); return; }
        await createStation({
          name: formName.trim(), base_url: formUrl.trim(),
          official_url: formOfficialUrl.trim() || null, api_key: formKey.trim(),
          schedule_enabled: formScheduleEnabled, schedule_interval_hours: formInterval,
        });
      }
      resetForm(); await fetchStations();
    } catch (e: unknown) { alert(`保存失败: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSaving(false); }
  };

  const handleDelete = async (station: Station) => {
    if (!confirm(`确定删除「${station.name}」？`)) return;
    await deleteStation(station.id); await fetchStations();
  };

  const handleImport = async () => {
    setImporting(true); setImportMsg('');
    try {
      let items: { name: string; base_url: string; official_url?: string | null; api_key: string; schedule_enabled?: boolean; schedule_interval_hours?: number }[];
      try { items = JSON.parse(importText); } catch { setImportMsg('JSON 格式错误'); return; }
      if (!Array.isArray(items)) { setImportMsg('必须是 JSON 数组'); return; }
      const imported = await importStations(items.map(item => ({
        ...item, schedule_enabled: item.schedule_enabled ?? formScheduleEnabled, schedule_interval_hours: item.schedule_interval_hours ?? formInterval,
      })));
      setImportMsg(`成功导入 ${imported} 个站点`); setImportText(''); await fetchStations();
    } catch (e: unknown) { setImportMsg(`导入失败: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setImporting(false); }
  };

  const copyKey = async (station: Station) => {
    await navigator.clipboard.writeText(station.api_key);
    alert(`已复制「${station.name}」的 Key`);
  };

  const isFormOpen = showAddForm || editingId !== null;

  return (
    <div className="page-shell">
      <div className="page-inner">

        <div className="page-header">
          <div>
            <div className="eyebrow">Manage</div>
            <h1 className="page-title">站点管理</h1>
            <p className="page-subtitle">维护站点地址、密钥和定时探测策略。</p>
          </div>
          <button onClick={openAdd} className="button-primary">添加站点</button>
        </div>

        <div className="tab-bar mb-5">
          <button onClick={() => setActiveTab('list')} className={`tab-item ${activeTab === 'list' ? 'active' : ''}`}>站点列表</button>
          <button onClick={() => setActiveTab('import')} className={`tab-item ${activeTab === 'import' ? 'active' : ''}`}>批量导入</button>
        </div>

        {activeTab === 'list' ? (
          <section className="panel station-table">
            {stations.length === 0 ? (
              <div className="px-5 py-16 text-center txt-faint text-[13px]">还没有添加站点</div>
            ) : (
              <>
                <div className="station-table-head">
                  <span>站点</span>
                  <span>地址</span>
                  <span>定时</span>
                  <span className="text-right">操作</span>
                </div>
                {stations.map(station => (
                  <div key={station.id} className="station-table-row">
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[var(--ink)]">{station.name}</div>
                      {station.official_url && (
                        <a href={station.official_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[11px] font-semibold text-[var(--accent-light)]">官网</a>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[11px] txt-dim" title={station.base_url}>{station.base_url}</div>
                    </div>
                    <div>
                      <span className={`status-pill ${station.schedule_enabled ? 'bg-ok txt-ok' : 'bg-surface-2 txt-faint'}`}>
                        {station.schedule_enabled ? `每 ${station.schedule_interval_hours}h` : '关闭'}
                      </span>
                    </div>
                    <div className="station-actions">
                      <button onClick={() => copyKey(station)} disabled={!station.api_key} className="button-ghost">复制 Key</button>
                      <button onClick={() => openEdit(station)} className="button-ghost">编辑</button>
                      <button onClick={() => handleDelete(station)} className="button-danger">删除</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        ) : (
          <section className="panel p-5">
            <div className="mb-4">
              <div className="eyebrow">Import</div>
              <h2 className="mt-1 text-[16px] font-bold text-[var(--ink)]">批量导入</h2>
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              rows={10}
              className="w-full px-3 py-3 font-mono text-[12px] leading-6"
              style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink-dim)' }}
              placeholder='[{"name":"站点名称","base_url":"https://api.example.com","api_key":"sk-xxx"}]'
            />
            <button onClick={handleImport} disabled={importing || !importText.trim()} className="button-primary mt-4 w-full">
              {importing ? '导入中...' : '导入'}
            </button>
            {importMsg && (
              <p className="mt-3 text-[12px]" style={{ color: importMsg.includes('失败') || importMsg.includes('错误') ? 'var(--bad-light)' : 'var(--ok-light)' }}>
                {importMsg}
              </p>
            )}
          </section>
        )}

        {isFormOpen && (
          <div className="modal-overlay" onClick={resetForm}>
            <div className="modal-content panel p-5" onClick={e => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="eyebrow">{editingId ? 'Edit' : 'New'}</div>
                  <h2 className="mt-1 text-[16px] font-bold text-[var(--ink)]">{editingId ? '编辑站点' : '添加站点'}</h2>
                </div>
                <button onClick={resetForm} className="button-ghost px-3">关闭</button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold txt-dim">名称</span>
                  <input value={formName} onChange={e => setFormName(e.target.value)} className="input-base" placeholder="我的站点" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold txt-dim">Base URL</span>
                  <input value={formUrl} onChange={e => setFormUrl(e.target.value)} className="input-base font-mono text-[12px]" placeholder="https://api.example.com" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold txt-dim">官网链接</span>
                  <input value={formOfficialUrl} onChange={e => setFormOfficialUrl(e.target.value)} className="input-base font-mono text-[12px]" placeholder="https://example.com" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold txt-dim">API Key {editingId && <span className="font-normal txt-faint">(留空不修改)</span>}</span>
                  <input value={formKey} onChange={e => setFormKey(e.target.value)} type="password" className="input-base font-mono text-[12px]" placeholder={editingId ? '********' : 'sk-...'} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold txt-dim">间隔（小时）</span>
                  <input type="number" min={1} max={168} value={formInterval} onChange={e => setFormInterval(Number(e.target.value))} className="input-base" />
                </label>
              </div>
              <div className="modal-divider flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-[12px] txt-dim">
                  <input type="checkbox" checked={formScheduleEnabled} onChange={e => setFormScheduleEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                  定时探测
                </label>
                <div className="flex gap-2">
                  <button onClick={resetForm} className="button-ghost">取消</button>
                  <button onClick={handleSave} disabled={saving} className="button-primary">{saving ? '保存中...' : '保存'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
