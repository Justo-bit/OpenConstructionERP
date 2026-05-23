/**
 * House-type catalogue settings.
 *
 * CRUD over user-created entries in /property-dev/house-type-catalogue/.
 * Presets are listed read-only (no edit / delete) so the operator can see
 * the full inventory but can't accidentally wipe shipped defaults.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Globe2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  SkeletonTable,
} from '@/shared/ui';
import {
  WideModal,
  WideModalField,
  WideModalSection,
} from '@/shared/ui/WideModal';
import { useToastStore } from '@/stores/useToastStore';
import { getErrorMessage, apiGet } from '@/shared/lib/api';
import {
  createHouseTypeCatalogue,
  deleteHouseTypeCatalogue,
  fetchHouseTypes,
  updateHouseTypeCatalogue,
  type HouseTypeCatalogueEntry,
} from './api';

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue';
const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

interface ProjectStub {
  id: string;
  name: string;
}

function listProjectsLite(): Promise<ProjectStub[]> {
  return apiGet<ProjectStub[]>('/v1/projects/?limit=200').catch(
    () => [] as ProjectStub[],
  );
}

const COUNTRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All / global' },
  { value: 'DE', label: 'Deutschland (DE)' },
  { value: 'US', label: 'United States (US)' },
  { value: 'UK', label: 'United Kingdom (UK)' },
  { value: 'RU', label: 'Россия (RU)' },
  { value: 'TR', label: 'Türkiye (TR)' },
  { value: 'FR', label: 'France (FR)' },
  { value: 'ES', label: 'España (ES)' },
  { value: 'IT', label: 'Italia (IT)' },
  { value: 'PL', label: 'Polska (PL)' },
  { value: 'JP', label: '日本 (JP)' },
  { value: 'CN', label: '中国 (CN)' },
  { value: 'SA', label: 'السعودية (SA)' },
];

export function HouseTypeSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const [filterCountry, setFilterCountry] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HouseTypeCatalogueEntry | null>(null);

  const projectsQ = useQuery({
    queryKey: ['propdev', 'house-type-settings', 'projects-lite'],
    queryFn: listProjectsLite,
    staleTime: 60_000,
  });
  const projects = projectsQ.data ?? [];

  const listQ = useQuery({
    queryKey: [
      'propdev',
      'house-type-catalogue',
      filterCountry || 'all',
      filterProject || 'none',
    ],
    queryFn: () =>
      fetchHouseTypes(filterCountry || undefined, filterProject || undefined),
  });
  const rows = listQ.data ?? [];

  const presets = useMemo(() => rows.filter((r) => r.is_preset), [rows]);
  const customs = useMemo(() => rows.filter((r) => !r.is_preset), [rows]);

  const deleteMu = useMutation({
    mutationFn: (id: string) => deleteHouseTypeCatalogue(id),
    onSuccess: () => {
      addToast({
        type: 'success',
        title: t('property_dev.house_type.deleted', {
          defaultValue: 'House type deleted',
        }),
      });
      qc.invalidateQueries({ queryKey: ['propdev', 'house-type-catalogue'] });
    },
    onError: (err) => {
      addToast({ type: 'error', title: getErrorMessage(err) });
    },
  });

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: t('nav.settings', { defaultValue: 'Settings' }) },
          {
            label: t('nav.property_dev', { defaultValue: 'Property Development' }),
            to: '/property-dev',
          },
          {
            label: t('property_dev.house_type.settings_title', {
              defaultValue: 'House types',
            }),
          },
        ]}
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-content-primary">
              {t('property_dev.house_type.settings_title', {
                defaultValue: 'House type catalogue',
              })}
            </h1>
            <p className="mt-0.5 text-xs text-content-tertiary">
              {t('property_dev.house_type.settings_desc', {
                defaultValue:
                  'Country-scoped presets plus your custom entries. Presets are read-only; custom entries are scoped to one project.',
              })}
            </p>
          </div>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            disabled={projects.length === 0}
          >
            {t('property_dev.house_type.new', { defaultValue: 'New house type' })}
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              <Globe2 size={12} className="mr-1 inline" />
              {t('property_dev.house_type.country_label', {
                defaultValue: 'Country',
              })}
            </label>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className={inputCls}
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value || '_all_'} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              <Building2 size={12} className="mr-1 inline" />
              {t('property_dev.house_type.project_filter_label', {
                defaultValue: 'Project (for custom entries)',
              })}
            </label>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className={inputCls}
            >
              <option value="">
                — {t('common.none', { defaultValue: 'None' })} —
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {listQ.isLoading ? (
        <SkeletonTable rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('property_dev.house_type.empty_title', {
            defaultValue: 'No house types found',
          })}
          description={t('property_dev.house_type.empty_desc', {
            defaultValue:
              'Pick a country, or create your first custom house type.',
          })}
        />
      ) : (
        <>
          {customs.length > 0 && (
            <Card className="overflow-hidden">
              <header className="border-b border-border-light bg-surface-secondary px-4 py-2">
                <h2 className="text-sm font-semibold text-content-primary">
                  {t('property_dev.house_type.custom_section', {
                    defaultValue: 'Your custom entries',
                  })}
                </h2>
              </header>
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary text-xs uppercase text-content-tertiary">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      {t('property_dev.house_type.code_label', { defaultValue: 'Code' })}
                    </th>
                    <th className="px-3 py-2 text-left">
                      {t('property_dev.house_type.name_label', { defaultValue: 'Name' })}
                    </th>
                    <th className="px-3 py-2 text-left">
                      {t('property_dev.house_type.country_label', {
                        defaultValue: 'Country',
                      })}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t('common.actions', { defaultValue: 'Actions' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customs.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-t border-border-light"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-content-secondary">
                        {entry.code}
                      </td>
                      <td className="px-3 py-2 text-content-primary">{entry.name}</td>
                      <td className="px-3 py-2">
                        {entry.country_code ? (
                          <Badge variant="blue">{entry.country_code}</Badge>
                        ) : (
                          <span className="text-content-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil size={12} />}
                            onClick={() => {
                              setEditing(entry);
                              setModalOpen(true);
                            }}
                          >
                            {t('common.edit', { defaultValue: 'Edit' })}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 size={12} />}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('property_dev.house_type.confirm_delete', {
                                    defaultValue:
                                      'Delete this house type? Plots already using it keep their stored label.',
                                  }),
                                )
                              ) {
                                deleteMu.mutate(entry.id);
                              }
                            }}
                          >
                            {t('common.delete', { defaultValue: 'Delete' })}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Card className="overflow-hidden">
            <header className="border-b border-border-light bg-surface-secondary px-4 py-2">
              <h2 className="text-sm font-semibold text-content-primary">
                {t('property_dev.house_type.preset_section', {
                  defaultValue: 'Shipped presets (read-only)',
                })}
              </h2>
            </header>
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs uppercase text-content-tertiary">
                <tr>
                  <th className="px-3 py-2 text-left">
                    {t('property_dev.house_type.code_label', { defaultValue: 'Code' })}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t('property_dev.house_type.name_label', { defaultValue: 'Name' })}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t('property_dev.house_type.country_label', {
                      defaultValue: 'Country',
                    })}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t('property_dev.house_type.area_typical_label', {
                      defaultValue: 'Typical m²',
                    })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {presets.map((entry) => (
                  <tr key={entry.id} className="border-t border-border-light">
                    <td className="px-3 py-2 font-mono text-xs text-content-secondary">
                      {entry.code}
                    </td>
                    <td className="px-3 py-2 text-content-primary">{entry.name}</td>
                    <td className="px-3 py-2">
                      {entry.country_code ? (
                        <Badge variant="neutral">{entry.country_code}</Badge>
                      ) : (
                        <span className="text-content-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-content-secondary">
                      {entry.area_typical_m2 ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {modalOpen && (
        <EditModal
          entry={editing}
          projects={projects}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  entry,
  projects,
  onClose,
}: {
  entry: HouseTypeCatalogueEntry | null;
  projects: ProjectStub[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    project_id: entry?.project_id ?? projects[0]?.id ?? '',
    country_code: entry?.country_code ?? '',
    code: entry?.code ?? '',
    name: entry?.name ?? '',
    description: entry?.description ?? '',
    area_typical_m2: entry?.area_typical_m2 ?? '',
    floors_typical: entry?.floors_typical?.toString() ?? '',
  });

  const isEdit = entry !== null;

  const submit = async () => {
    setBusy(true);
    try {
      if (isEdit) {
        await updateHouseTypeCatalogue(entry!.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          country_code: form.country_code || null,
          area_typical_m2: form.area_typical_m2
            ? Number(form.area_typical_m2)
            : null,
          floors_typical: form.floors_typical
            ? Number(form.floors_typical)
            : null,
        });
        addToast({
          type: 'success',
          title: t('property_dev.house_type.updated', {
            defaultValue: 'House type updated',
          }),
        });
      } else {
        if (!form.project_id) {
          throw new Error(
            t('property_dev.house_type.project_required', {
              defaultValue: 'Project is required.',
            }),
          );
        }
        const code = form.code
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '_');
        if (!code || !form.name.trim()) {
          throw new Error(
            t('property_dev.house_type.code_and_name_required', {
              defaultValue: 'Both code and name are required.',
            }),
          );
        }
        await createHouseTypeCatalogue({
          project_id: form.project_id,
          country_code: form.country_code || null,
          code,
          name: form.name.trim(),
          description: form.description.trim() || null,
          area_typical_m2: form.area_typical_m2
            ? Number(form.area_typical_m2)
            : null,
          floors_typical: form.floors_typical
            ? Number(form.floors_typical)
            : null,
        });
        addToast({
          type: 'success',
          title: t('property_dev.house_type.created', {
            defaultValue: 'House type added',
          }),
        });
      }
      await qc.invalidateQueries({
        queryKey: ['propdev', 'house-type-catalogue'],
      });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WideModal
      open
      onClose={onClose}
      title={
        isEdit
          ? t('property_dev.house_type.edit_title', {
              defaultValue: 'Edit house type',
            })
          : t('property_dev.house_type.new', { defaultValue: 'New house type' })
      }
      size="lg"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </>
      }
    >
      <WideModalSection columns={2}>
        {!isEdit && (
          <WideModalField
            label={t('property_dev.house_type.project_label', {
              defaultValue: 'Project',
            })}
            required
            span={2}
          >
            <select
              value={form.project_id}
              onChange={(e) =>
                setForm((s) => ({ ...s, project_id: e.target.value }))
              }
              className={inputCls}
            >
              <option value="">
                — {t('common.select', { defaultValue: 'Select' })} —
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </WideModalField>
        )}
        {!isEdit && (
          <WideModalField
            label={t('property_dev.house_type.code_label', {
              defaultValue: 'Code',
            })}
            required
          >
            <input
              value={form.code}
              onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
              className={inputCls}
              placeholder="MY_TOWNHOUSE"
              maxLength={40}
            />
          </WideModalField>
        )}
        <WideModalField
          label={t('property_dev.house_type.country_label', {
            defaultValue: 'Country',
          })}
          span={isEdit ? 2 : 1}
        >
          <select
            value={form.country_code}
            onChange={(e) =>
              setForm((s) => ({ ...s, country_code: e.target.value }))
            }
            className={inputCls}
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value || '_all_'} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </WideModalField>
        <WideModalField
          label={t('property_dev.house_type.name_label', {
            defaultValue: 'Display name',
          })}
          required
          span={2}
        >
          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            className={inputCls}
            maxLength={120}
          />
        </WideModalField>
        <WideModalField
          label={t('property_dev.house_type.description_label', {
            defaultValue: 'Description',
          })}
          span={2}
        >
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((s) => ({ ...s, description: e.target.value }))
            }
            className={inputCls}
            rows={3}
          />
        </WideModalField>
        <WideModalField
          label={t('property_dev.house_type.area_typical_label', {
            defaultValue: 'Typical area (m²)',
          })}
        >
          <input
            type="number"
            value={form.area_typical_m2}
            onChange={(e) =>
              setForm((s) => ({ ...s, area_typical_m2: e.target.value }))
            }
            className={inputCls}
            min={0}
            step="0.01"
          />
        </WideModalField>
        <WideModalField
          label={t('property_dev.house_type.floors_typical_label', {
            defaultValue: 'Typical floors',
          })}
        >
          <input
            type="number"
            value={form.floors_typical}
            onChange={(e) =>
              setForm((s) => ({ ...s, floors_typical: e.target.value }))
            }
            className={inputCls}
            min={0}
            max={200}
          />
        </WideModalField>
      </WideModalSection>
    </WideModal>
  );
}
