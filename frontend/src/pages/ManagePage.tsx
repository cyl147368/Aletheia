import { useCallback, useEffect, useState } from 'react';
import { createStation, deleteStation, importStations, listStations, updateStation, type Station } from '../api';

const inputCls = 'h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/20';

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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-faint)]">Stations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">站点管理</h1>
          <p className="mt-1 text-sm text-[var(--ink-dim)]">配置中转站地址、密钥和定时探测间隔，共 {stations.length} 个。</p>
        </div>
        <button
          onClick={openAdd}
          className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[#04110f] transition hover:brightness-110"
        >
          + 添加站点
        </button>
      </header>

      {isFormOpen && (
        <section className="panel rounded-lg overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">{editingId ? '编辑站点' : '添加站点'}</h2>
            <button onClick={resetForm} className="px-2 py-1 text-sm text-[var(--ink-dim)] transition hover:text-[var(--ink)]">关闭</button>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <label className="text-sm">
              <span className="mb-2 block font-medium text-[var(--ink-dim)]">名称</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={inputCls}
                placeholder="我的中转站"
              />
            </label>
            <label className="text-sm">
              <span className="mb-2 block font-medium text-[var(--ink-dim)]">Base URL</span>
              <input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder="https://api.example.com"
              />
            </label>
            <label className="text-sm">
              <span className="mb-2 block font-medium text-[var(--ink-dim)]">官网链接</span>
              <input
                value={formOfficialUrl}
                onChange={(e) => setFormOfficialUrl(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder="https://example.com"
              />
            </label>
            <label className="text-sm">
              <span className="mb-2 block font-medium text-[var(--ink-dim)]">
                API Key {editingId && <span className="font-normal text-[var(--ink-faint)]">(留空不修改)</span>}
              </span>
              <input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                type="password"
                className={`${inputCls} font-mono`}
                placeholder={editingId ? '********' : 'sk-...'}
              />
            </label>
            <label className="text-sm">
              <span className="mb-2 block font-medium text-[var(--ink-dim)]">定时探测间隔（小时）</span>
              <input
                type="number"
                min={1}
                max={168}
                value={formInterval}
                onChange={(e) => setFormInterval(Number(e.target.value))}
                className={inputCls}
              />
            </label>
          </div>
          <div className="flex flex-col gap-4 border-t border-[var(--line)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-dim)]">
              <input
                type="checkbox"
                checked={formScheduleEnabled}
                onChange={(e) => setFormScheduleEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--line)] bg-[var(--surface-2)] text-[var(--accent)]"
              />
              启用定时探测
            </label>
            <div className="flex gap-2">
              <button
                onClick={resetForm}
                className="h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--ink-dim)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-9 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[#04110f] transition hover:brightness-110 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="panel rounded-lg overflow-x-auto">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">站点列表</h2>
            <span className="font-mono text-xs text-[var(--ink-faint)]">{stations.length} rows</span>
          </div>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[var(--surface-2)]/50 text-xs font-semibold text-[var(--ink-faint)]">
              <tr>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">地址</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">定时</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {stations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center text-sm text-[var(--ink-faint)]">
                    还没有添加中转站，点击“添加站点”开始。
                  </td>
                </tr>
              ) : (
                stations.map((station) => (
                  <tr key={station.id} className="border-t border-[var(--line-soft)] transition hover:bg-[var(--surface-2)]/40">
                    <td className="px-4 py-3 font-medium text-[var(--ink)]">{station.name}</td>
                    <td className="max-w-md px-4 py-3 font-mono text-xs text-[var(--ink-dim)]">
                      <div className="truncate" title={station.base_url}>{station.base_url}</div>
                      {station.official_url && (
                        <a
                          href={station.official_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex text-[11px] font-medium text-[var(--accent)] transition hover:brightness-125"
                        >
                          官网
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copyKey(station)}
                        disabled={!station.api_key}
                        className="rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--ink-dim)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40"
                      >
                        复制 Key
                      </button>
                      <div className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">{station.api_key_masked}</div>
                    </td>
                    <td className="px-4 py-3">
                      {station.schedule_enabled ? (
                        <span className="inline-flex rounded border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-2 py-1 text-xs font-medium text-[var(--ok)]">
                          每 {station.schedule_interval_hours}h
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink-faint)]">关闭</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(station)} className="mr-3 text-sm font-medium text-[var(--ink-dim)] transition hover:text-[var(--accent)]">
                        编辑
                      </button>
                      <button onClick={() => handleDelete(station)} className="text-sm font-medium text-[var(--bad)]/80 transition hover:text-[var(--bad)]">
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="panel rounded-lg">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">批量导入</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-dim)]">粘贴 JSON 数组，字段包含 name、base_url、api_key，可选 official_url、schedule_enabled、schedule_interval_hours。</p>
          </div>
          <div className="p-4">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-3 font-mono text-xs leading-5 text-[var(--ink-dim)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder='[{"name":"站点名称","base_url":"https://api.example.com","official_url":"https://example.com","api_key":"sk-xxx"}]'
            />
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="mt-3 h-9 w-full rounded-md bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--ink)] ring-1 ring-inset ring-[var(--line)] transition hover:bg-[var(--surface)] disabled:opacity-50"
            >
              {importing ? '导入中...' : '导入'}
            </button>
            {importMsg && (
              <p className={`mt-3 text-sm ${importMsg.includes('失败') || importMsg.includes('错误') ? 'text-[var(--bad)]' : 'text-[var(--ok)]'}`}>
                {importMsg}
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
