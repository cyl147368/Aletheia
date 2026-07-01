import { useCallback, useEffect, useState } from 'react';
import { createStation, deleteStation, importStations, listStations, updateStation, type Station } from '../api';

const inputCls = 'input-base w-full';
const inputMonoCls = `${inputCls} font-mono text-xs`;

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
    setEditingId(null);
    setShowAddForm(false);
    setFormName('');
    setFormUrl('');
    setFormOfficialUrl('');
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
    setFormOfficialUrl(station.official_url ?? '');
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
          official_url: formOfficialUrl.trim() || null,
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
          official_url: formOfficialUrl.trim() || null,
          api_key: formKey.trim(),
          schedule_enabled: formScheduleEnabled,
          schedule_interval_hours: formInterval,
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
      let items: {
        name: string;
        base_url: string;
        official_url?: string | null;
        api_key: string;
        schedule_enabled?: boolean;
        schedule_interval_hours?: number;
      }[];
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
      const imported = await importStations(items.map((item) => ({
        ...item,
        schedule_enabled: item.schedule_enabled ?? formScheduleEnabled,
        schedule_interval_hours: item.schedule_interval_hours ?? formInterval,
      })));
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

  const copyKey = async (station: Station) => {
    await navigator.clipboard.writeText(station.api_key);
    alert(`已复制「${station.name}」的 API Key`);
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <header className="page-header">
          <div>
            <div className="eyebrow">Manage</div>
            <h1 className="page-title">站点管理</h1>
            <p className="page-subtitle">维护中转站地址、密钥和定时探测间隔。</p>
          </div>
          <button type="button" onClick={openAdd} className="btn-primary">添加站点</button>
        </header>

        <div className="mb-5 flex w-fit gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          {(['list', 'import'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-1.5 text-[12px] font-bold transition ${
                activeTab === tab ? 'bg-[var(--surface-3)] text-[var(--ink)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
              }`}
            >
              {tab === 'list' ? '站点列表' : '批量导入'}
            </button>
          ))}
        </div>

        {activeTab === 'list' ? (
          <section className="panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">名称</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">地址</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Key</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">定时</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {stations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-[13px] text-[var(--ink-faint)]">
                      还没有添加中转站。
                    </td>
                  </tr>
                ) : stations.map((station) => (
                  <tr key={station.id} className="border-t transition hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-5 py-4 text-[13px] font-bold text-[var(--ink)]">{station.name}</td>
                    <td className="px-5 py-4">
                      <div className="max-w-[280px] truncate font-mono text-[11px] text-[var(--ink-dim)]" title={station.base_url}>{station.base_url}</div>
                      {station.official_url && (
                        <a href={station.official_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[11px] font-semibold text-[var(--accent-light)]">官网</a>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <button type="button" onClick={() => copyKey(station)} disabled={!station.api_key} className="btn-ghost min-h-0 px-2 py-1 text-[10px]">
                        复制 Key
                      </button>
                      <div className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">{station.api_key_masked}</div>
                    </td>
                    <td className="px-5 py-4">
                      {station.schedule_enabled ? (
                        <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">每 {station.schedule_interval_hours}h</span>
                      ) : (
                        <span className="text-[12px] text-[var(--ink-faint)]">关闭</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" onClick={() => openEdit(station)} className="text-[12px] font-bold text-[var(--ink-dim)] transition hover:text-[var(--accent-light)]">编辑</button>
                      <button type="button" onClick={() => handleDelete(station)} className="ml-4 text-[12px] font-bold text-[var(--bad-light)] transition hover:opacity-80">删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="panel p-5">
            <div className="mb-4">
              <h2 className="section-title">批量导入</h2>
              <p className="mt-2 text-[13px] leading-6 text-[var(--ink-dim)]">
                粘贴 JSON 数组，字段包含 <code className="font-mono text-[12px] text-[var(--ink)]">name</code>、
                <code className="font-mono text-[12px] text-[var(--ink)]">base_url</code>、
                <code className="font-mono text-[12px] text-[var(--ink)]">api_key</code>。
              </p>
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={11}
              className="w-full rounded-lg border px-3 py-3 font-mono text-[12px] leading-6 outline-none transition focus:border-[var(--accent)]"
              style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink-dim)' }}
              placeholder='[{"name":"站点名称","base_url":"https://api.example.com","api_key":"sk-xxx"}]'
            />
            <button type="button" onClick={handleImport} disabled={importing || !importText.trim()} className="btn-primary mt-4 w-full">
              {importing ? '导入中...' : '导入'}
            </button>
            {importMsg && (
              <p className="mt-3 text-[12px]" style={{ color: importMsg.includes('失败') || importMsg.includes('错误') ? 'var(--bad-light)' : 'var(--ok-light)' }}>
                {importMsg}
              </p>
            )}
          </section>
        )}
      </div>

      {isFormOpen && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content panel p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="eyebrow">{editingId ? 'Edit' : 'New'}</div>
                <h2 className="mt-1 text-[18px] font-bold text-[var(--ink)]">{editingId ? '编辑站点' : '添加站点'}</h2>
              </div>
              <button type="button" onClick={resetForm} className="btn-ghost px-3">关闭</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--ink-dim)]">名称</span>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputCls} placeholder="我的中转站" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--ink-dim)]">Base URL</span>
                <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} className={inputMonoCls} placeholder="https://api.example.com" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--ink-dim)]">官网链接</span>
                <input value={formOfficialUrl} onChange={(e) => setFormOfficialUrl(e.target.value)} className={inputMonoCls} placeholder="https://example.com" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--ink-dim)]">
                  API Key {editingId && <span className="font-normal text-[var(--ink-faint)]">(留空不修改)</span>}
                </span>
                <input value={formKey} onChange={(e) => setFormKey(e.target.value)} type="password" className={inputMonoCls} placeholder={editingId ? '********' : 'sk-...'} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--ink-dim)]">定时探测间隔（小时）</span>
                <input type="number" min={1} max={168} value={formInterval} onChange={(e) => setFormInterval(Number(e.target.value))} className={inputCls} />
              </label>
            </div>
            <div className="mt-5 flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--line)' }}>
              <label className="inline-flex items-center gap-2 text-[12px] text-[var(--ink-dim)]">
                <input type="checkbox" checked={formScheduleEnabled} onChange={(e) => setFormScheduleEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                启用定时探测
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={resetForm} className="btn-ghost">取消</button>
                <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
