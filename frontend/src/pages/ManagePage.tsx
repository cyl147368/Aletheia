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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-7 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div>
          <h1 className="text-[16px] font-bold tracking-tight text-[var(--ink)]">站点管理</h1>
          <p className="text-[11px] mt-0.5 text-[var(--ink-faint)]">配置中转站地址、密钥和定时探测间隔</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition hover:brightness-110"
          style={{ background: 'var(--accent)', border: 'none' }}
        >
          + 添加站点
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-7">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'var(--surface)' }}>
          {(['list', 'import'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition ${activeTab === tab ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'}`}
              style={activeTab === tab ? { background: 'var(--surface-3)' } : {}}
            >
              {tab === 'list' ? '站点列表' : '批量导入'}
            </button>
          ))}
        </div>

        {activeTab === 'list' ? (
          /* Station table */
          <div className="panel overflow-hidden">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">名称</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">地址</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">Key</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">定时</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)] text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {stations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-[13px] text-[var(--ink-faint)]">
                      还没有添加中转站，点击"添加站点"开始。
                    </td>
                  </tr>
                ) : (
                  stations.map((station) => (
                    <tr key={station.id} className="border-t transition hover:bg-[var(--surface)]" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-5 py-3.5 font-semibold text-[13px] text-[var(--ink)]">{station.name}</td>
                      <td className="px-5 py-3.5">
                        <div className="font-mono text-[11px] text-[var(--ink-dim)] truncate max-w-[240px]" title={station.base_url}>{station.base_url}</div>
                        {station.official_url && (
                          <a href={station.official_url} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-[var(--accent-light)] transition hover:brightness-125">官网</a>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => copyKey(station)}
                          disabled={!station.api_key}
                          className="rounded-md border px-2 py-0.5 text-[10px] transition hover:border-[var(--accent)] hover:text-[var(--accent-light)] disabled:opacity-40"
                          style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-faint)', background: 'transparent' }}
                        >
                          复制 Key
                        </button>
                        <div className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">{station.api_key_masked}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        {station.schedule_enabled ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--ok-dim)', color: 'var(--ok-light)' }}>
                            每 {station.schedule_interval_hours}h
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--ink-faint)]">关闭</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => openEdit(station)} className="text-[11px] font-medium text-[var(--ink-dim)] transition hover:text-[var(--accent-light)]">编辑</button>
                        <button onClick={() => handleDelete(station)} className="ml-3 text-[11px] font-medium transition hover:text-[var(--bad-light)]" style={{ color: 'var(--bad-light)', opacity: 0.7 }}>删除</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Import panel */
          <div className="panel p-5">
            <p className="text-[12px] leading-relaxed mb-4" style={{ color: 'var(--ink-dim)' }}>
              粘贴 JSON 数组，字段包含 <code className="font-mono text-[11px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-2)' }}>name</code>、
              <code className="font-mono text-[11px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-2)' }}>base_url</code>、
              <code className="font-mono text-[11px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-2)' }}>api_key</code>，
              可选 official_url、schedule_enabled、schedule_interval_hours。
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="w-full rounded-lg border px-3 py-3 font-mono text-[11px] leading-relaxed outline-none transition focus:border-[var(--accent)]"
              style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink-dim)', boxShadow: 'none' }}
              placeholder='[{"name":"站点名称","base_url":"https://api.example.com","api_key":"sk-xxx"}]'
            />
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="mt-3 h-9 w-full rounded-lg border text-[12px] font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent-light)] disabled:opacity-50"
              style={{ borderColor: 'var(--line-soft)', color: 'var(--ink)', background: 'var(--surface-2)' }}
            >
              {importing ? '导入中...' : '导入'}
            </button>
            {importMsg && (
              <p className="mt-3 text-[12px]" style={{ color: importMsg.includes('失败') || importMsg.includes('错误') ? 'var(--bad-light)' : 'var(--ok-light)' }}>
                {importMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Modal form */}
      {isFormOpen && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content panel p-6 w-full max-w-[520px] mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">{editingId ? '编辑站点' : '添加站点'}</h2>
              <button onClick={resetForm} className="w-7 h-7 rounded-md border flex items-center justify-center text-xs transition hover:text-[var(--ink)]" style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-faint)', background: 'transparent' }}>✕</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--ink-dim)]">名称</span>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputCls} placeholder="我的中转站" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--ink-dim)]">Base URL</span>
                <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} className={inputMonoCls} placeholder="https://api.example.com" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--ink-dim)]">官网链接</span>
                <input value={formOfficialUrl} onChange={(e) => setFormOfficialUrl(e.target.value)} className={inputMonoCls} placeholder="https://example.com" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--ink-dim)]">
                  API Key {editingId && <span className="font-normal text-[var(--ink-faint)]">(留空不修改)</span>}
                </span>
                <input value={formKey} onChange={(e) => setFormKey(e.target.value)} type="password" className={inputMonoCls} placeholder={editingId ? '********' : 'sk-...'} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--ink-dim)]">定时探测间隔（小时）</span>
                <input type="number" min={1} max={168} value={formInterval} onChange={(e) => setFormInterval(Number(e.target.value))} className={inputCls} />
              </label>
            </div>
            <div className="flex flex-col gap-4 border-t mt-5 pt-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--line)' }}>
              <label className="inline-flex items-center gap-2 text-[12px] text-[var(--ink-dim)]">
                <input type="checkbox" checked={formScheduleEnabled} onChange={(e) => setFormScheduleEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                启用定时探测
              </label>
              <div className="flex gap-2">
                <button onClick={resetForm} className="rounded-lg border px-4 py-2 text-[12px] font-medium transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]" style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-dim)', background: 'transparent' }}>取消</button>
                <button onClick={handleSave} disabled={saving} className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50" style={{ background: 'var(--accent)', border: 'none' }}>
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
