/** Right rail showing details of the currently-focused file. */

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Download, Mail, FolderOpen, Copy, X, FileText, Image as ImageIcon, Layout, Box, Pencil, File, PenTool, FileBarChart, Tag, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useToastStore } from '@/stores/useToastStore';
import { DateDisplay } from '@/shared/ui/DateDisplay';
import type { FileRow, FileKind } from '../types';
import { isTauri, openInOSFinder, copyToClipboard } from '../lib/tauri';
import { modulesForKind, primaryModule } from '../kindModule';

const KIND_ICON: Record<FileKind, typeof FileText> = {
  document: FileText,
  photo: ImageIcon,
  sheet: Layout,
  bim_model: Box,
  dwg_drawing: Pencil,
  takeoff: Tag,
  report: FileBarChart,
  markup: PenTool,
};

interface FilePreviewPaneProps {
  row: FileRow | null;
  onClose: () => void;
  onEmail: (row: FileRow) => void;
}

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function FilePreviewPane({ row, onClose, onEmail }: FilePreviewPaneProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [pathCopied, setPathCopied] = useState(false);

  if (!row) {
    return (
      <aside className="w-80 shrink-0 border-l border-border-light bg-surface-secondary/40 flex items-center justify-center">
        <p className="text-xs text-content-tertiary px-4 text-center">
          {t('files.preview.empty', {
            defaultValue: 'Select a file to see details.',
          })}
        </p>
      </aside>
    );
  }

  const Icon = KIND_ICON[row.kind] ?? File;
  // Primary tool for this file's extension (e.g. PDF → PDF Takeoff,
  // IFC → BIM Viewer, DWG → DWG Takeoff). Falls back to the kind's
  // default module when the extension isn't in the override map.
  const primary = primaryModule(row.kind, row.extension);
  const allModules = modulesForKind(row.kind);
  const PrimaryIcon = primary.icon;
  // `row` is narrowed by the `if (!row) return` guard above, but TS
  // doesn't carry that narrowing into nested function declarations —
  // capture it in a const so closures see the non-null type.
  const file = row;

  function navigateToModule(target: typeof primary) {
    navigate(target.route(file.project_id, file.id));
  }

  async function handleCopyPath() {
    if (!row) return;
    const ok = await copyToClipboard(row.physical_path);
    if (ok) {
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 1500);
    } else {
      addToast({
        type: 'error',
        title: t('files.toast.copy_failed', { defaultValue: 'Could not copy path' }),
      });
    }
  }

  const extras = Object.entries(row.extra ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );

  return (
    <aside className="w-80 shrink-0 border-l border-border-light bg-surface-elevated overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-border-light bg-surface-elevated">
        <span className="text-xs font-semibold text-content-primary truncate">
          {t('files.preview.title', { defaultValue: 'File details' })}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', { defaultValue: 'Close' })}
          className="flex h-6 w-6 items-center justify-center rounded text-content-tertiary hover:bg-surface-secondary hover:text-content-primary"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-center bg-surface-secondary/60 rounded-lg aspect-[4/3]">
          {row.thumbnail_url ? (
            <img
              src={row.thumbnail_url}
              alt=""
              className="max-h-full max-w-full object-contain rounded-lg"
            />
          ) : (
            <Icon size={48} strokeWidth={1.5} className="text-content-tertiary" />
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-content-primary break-words" title={row.name}>
            {row.name}
          </h3>
          <p className="mt-0.5 text-2xs text-content-tertiary">
            {fmtBytes(row.size_bytes)}
            {row.mime_type && <span className="ms-2">{row.mime_type}</span>}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          {/* Primary action — opens this file in its native module. PDFs
              go to PDF Takeoff or Documents Viewer; IFC/RVT to BIM
              Viewer; DWG to DWG Takeoff. Falls back to download below
              when the user just wants the bytes. */}
          <button
            type="button"
            onClick={() => navigateToModule(primary)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-oe-blue text-white hover:bg-oe-blue-hover transition-colors"
            title={t(primary.descriptionI18nKey, { defaultValue: primary.description })}
          >
            <PrimaryIcon size={13} strokeWidth={2.25} />
            {t('files.actions.open_in', {
              defaultValue: 'Open in {{module}}',
              module: t(primary.i18nKey, { defaultValue: primary.label }),
            })}
            <ExternalLink size={11} className="opacity-80" />
          </button>

          {/* Secondary modules — same file, different tool (e.g. a PDF
              also opens in Documents Viewer; an IFC also feeds BIM
              Rules). Skipped when there's only one possibility. */}
          {allModules.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {allModules
                .filter((m) => m.label !== primary.label)
                .map((m) => {
                  const MIcon = m.icon;
                  return (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => navigateToModule(m)}
                      className={clsx(
                        'inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10.5px] font-medium transition-colors',
                        'border border-border-light text-content-secondary',
                        'hover:border-oe-blue/40 hover:text-oe-blue hover:bg-oe-blue/5',
                      )}
                      title={t(m.descriptionI18nKey, { defaultValue: m.description })}
                    >
                      <MIcon size={10} strokeWidth={2} />
                      {t(m.i18nKey, { defaultValue: m.label })}
                    </button>
                  );
                })}
            </div>
          )}

          {row.download_url && (
            <a
              href={row.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-border-light text-content-primary hover:bg-surface-secondary transition-colors"
            >
              <Download size={13} />
              {t('files.actions.download', { defaultValue: 'Download' })}
            </a>
          )}
          <button
            type="button"
            onClick={() => onEmail(row)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-border-light text-content-primary hover:bg-surface-secondary transition-colors"
          >
            <Mail size={13} />
            {t('files.actions.email', { defaultValue: 'Email link' })}
          </button>
          {isTauri && row.physical_path && (
            <button
              type="button"
              onClick={() => openInOSFinder(row.physical_path)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-border-light text-content-primary hover:bg-surface-secondary transition-colors"
            >
              <FolderOpen size={13} />
              {t('files.actions.open_in_os', { defaultValue: 'Open in OS' })}
            </button>
          )}
        </div>

        <dl className="space-y-2 text-xs">
          <Row label={t('files.detail.kind', { defaultValue: 'Kind' })}>
            {t(`files.category.${row.kind}`, { defaultValue: row.kind })}
          </Row>
          {row.category && (
            <Row label={t('files.detail.category', { defaultValue: 'Category' })}>
              {row.category}
            </Row>
          )}
          {row.discipline && (
            <Row label={t('files.detail.discipline', { defaultValue: 'Discipline' })}>
              {row.discipline}
            </Row>
          )}
          {row.modified_at && (
            <Row label={t('files.detail.modified', { defaultValue: 'Modified' })}>
              <DateDisplay value={row.modified_at} format="datetime" />
            </Row>
          )}
          <Row label={t('files.detail.storage', { defaultValue: 'Storage' })}>
            <span className="uppercase tracking-wide text-2xs">{row.storage_backend}</span>
          </Row>
          <Row label={t('files.detail.path', { defaultValue: 'Path' })}>
            <button
              type="button"
              onClick={handleCopyPath}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-content-secondary hover:text-oe-blue text-left break-all"
              title={t('files.actions.copy_path', { defaultValue: 'Copy path' })}
            >
              <Copy size={10} className="shrink-0" />
              {pathCopied
                ? t('files.toast.copied', { defaultValue: 'Copied' })
                : row.physical_path}
            </button>
          </Row>
        </dl>

        {extras.length > 0 && (
          <div className="border-t border-border-light pt-3">
            <h4 className="text-2xs font-medium uppercase tracking-wider text-content-tertiary mb-2">
              {t('files.detail.extra', { defaultValue: 'Metadata' })}
            </h4>
            <dl className="space-y-1.5 text-xs">
              {extras.map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, ' ')}>
                  <span className="font-mono text-[11px] break-words">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </Row>
              ))}
            </dl>
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-content-quaternary">{label}</dt>
      <dd className="text-content-primary">{children}</dd>
    </div>
  );
}
