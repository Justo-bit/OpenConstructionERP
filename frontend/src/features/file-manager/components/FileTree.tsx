/** Left-pane category list for the file manager. */

import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon, Layout, Box, Pencil, Folder, Tag, FileBarChart, PenTool } from 'lucide-react';
import clsx from 'clsx';
import type { FileTreeNode, FileKind } from '../types';

const KIND_ICONS: Record<FileKind, typeof FileText> = {
  document: FileText,
  photo: ImageIcon,
  sheet: Layout,
  bim_model: Box,
  dwg_drawing: Pencil,
  takeoff: Tag,
  report: FileBarChart,
  markup: PenTool,
};

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  isLoading?: boolean;
}

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function FileTree({ nodes, selectedId, onSelect, isLoading }: FileTreeProps) {
  const { t } = useTranslation();

  const totalCount = nodes.reduce((acc, n) => acc + n.file_count, 0);
  const totalBytes = nodes.reduce((acc, n) => acc + n.total_bytes, 0);

  return (
    <aside className="w-60 shrink-0 border-r border-border-light bg-surface-secondary/40 overflow-y-auto">
      <div className="px-3 pt-3 pb-2">
        <div className="text-2xs font-medium uppercase tracking-wider text-content-tertiary px-2 mb-1">
          {t('files.tree.title', { defaultValue: 'Categories' })}
        </div>

        <button
          type="button"
          onClick={() => onSelect(null)}
          className={clsx(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
            selectedId === null
              ? 'bg-oe-blue/10 text-oe-blue font-medium'
              : 'text-content-secondary hover:bg-surface-secondary',
          )}
        >
          <Folder size={14} className="shrink-0" />
          <span className="flex-1 truncate">
            {t('files.tree.all', { defaultValue: 'All files' })}
          </span>
          <span className="text-2xs text-content-tertiary tabular-nums">{totalCount}</span>
        </button>
      </div>

      <ul className="px-3 pb-4 space-y-0.5">
        {nodes.map((node) => {
          // Strip any legacy "category:" prefix from older backends.
          const kind = node.id.replace(/^category:/, '') as FileKind;
          const Icon = KIND_ICONS[kind] ?? Folder;
          const isActive = selectedId === kind;
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect(kind)}
                className={clsx(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
                  isActive
                    ? 'bg-oe-blue/10 text-oe-blue font-medium'
                    : 'text-content-secondary hover:bg-surface-secondary',
                )}
                title={node.physical_path ?? undefined}
              >
                <Icon size={14} className="shrink-0" />
                <span className="flex-1 truncate">{node.label}</span>
                <span className="text-2xs text-content-tertiary tabular-nums shrink-0">
                  {node.file_count}
                </span>
              </button>
              {node.total_bytes > 0 && (
                <div className="pl-8 pr-2 text-[10px] text-content-quaternary tabular-nums">
                  {fmtBytes(node.total_bytes)}
                </div>
              )}
            </li>
          );
        })}
        {!isLoading && nodes.length === 0 && (
          <li className="px-2 py-3 text-xs text-content-tertiary">
            {t('files.tree.empty', { defaultValue: 'No files yet.' })}
          </li>
        )}
      </ul>

      {totalBytes > 0 && (
        <div className="px-5 pb-4 text-[10px] text-content-quaternary border-t border-border-light pt-3">
          {t('files.tree.total', { defaultValue: 'Total' })}: {fmtBytes(totalBytes)}
        </div>
      )}
    </aside>
  );
}
