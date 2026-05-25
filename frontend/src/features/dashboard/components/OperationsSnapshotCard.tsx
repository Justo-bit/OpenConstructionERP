/**
 * OperationsSnapshotCard — consolidates the 9 "operations" wave-2 widgets
 * (BOQ Summary, Validation, Clash, Critical Path, Top Risks, HSE,
 * Procurement, Budget Variance, Change Orders) into a single card with
 * a 3-column grid of compact tiles.
 *
 * Pre-2026-05-25 those nine widgets each rendered as full-width empty
 * cards on fresh installs, which looked broken — nine "no data yet"
 * placeholders stacked vertically. This card replaces them with one
 * tight overview: per-tile name + key metric (or em-dash when empty)
 * + click-through to the relevant module. Data lights up automatically
 * as projects acquire BOQs / clashes / change orders / etc.
 *
 * Data comes from the shared ``DashboardRollupContext`` — same payload
 * the individual widgets consumed, no extra HTTP.
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  GitBranch,
  ShieldAlert,
  HardHat,
  ShoppingCart,
  Wallet,
  ClipboardList,
  Cog,
  CheckSquare,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, Skeleton } from '@/shared/ui';
import { useDashboardRollupContext } from '../context/DashboardRollupContext';

interface ProjectRef {
  id: string;
  name: string;
  currency: string;
}

function fmtMoney(value: string | number | null | undefined, currency: string): string {
  if (value == null) return `${currency} 0`;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return `${currency} 0`;
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0, notation: n >= 100000 ? 'compact' : 'standard' })}`;
}

interface Tile {
  key: string;
  icon: React.ReactNode;
  title: string;
  value: string;
  href: string;
  empty: boolean;
}

export function OperationsSnapshotCard({ projects }: { projects?: ProjectRef[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const fallbackCurrency = projects?.[0]?.currency ?? 'EUR';

  const dash = '—';
  const iconCls = 'text-content-tertiary';

  const boq = byWidget('boq_summary');
  const validation = byWidget('validation_score');
  const clash = byWidget('clash_health');
  const schedule = byWidget('schedule_critical');
  const risk = byWidget('risk_top');
  const hse = byWidget('hse_scorecard');
  const proc = byWidget('procurement_pipeline');
  const budget = byWidget('budget_variance');
  const co = byWidget('change_orders');

  const tiles: Tile[] = [
    {
      key: 'boq',
      icon: <FileSpreadsheet size={14} className={iconCls} />,
      title: t('dashboard.layout.w_boq_summary', { defaultValue: 'BOQ Summary' }),
      value: !boq || boq.total_boqs === 0
        ? dash
        : `${boq.total_boqs} · ${fmtMoney(boq.total_value_eur, fallbackCurrency)}`,
      href: '/boq',
      empty: !boq || boq.total_boqs === 0,
    },
    {
      key: 'validation',
      icon: <CheckSquare size={14} className={iconCls} />,
      title: t('dashboard.layout.w_validation', { defaultValue: 'Validation Health' }),
      value: !validation || (validation.passed + validation.warnings + validation.errors) === 0
        ? dash
        : `${validation.passed} / ${validation.warnings} / ${validation.errors}`,
      href: '/validation',
      empty: !validation || (validation.passed + validation.warnings + validation.errors) === 0,
    },
    {
      key: 'clash',
      icon: <Cog size={14} className={iconCls} />,
      title: t('dashboard.layout.w_clash', { defaultValue: 'Clash Health' }),
      value: !clash || clash.total === 0
        ? dash
        : t('dashboard.snapshot_clash_v', {
            defaultValue: '{{open}} open · {{high}} high',
            open: clash.total,
            high: clash.high,
          }),
      href: '/clash',
      empty: !clash || clash.total === 0,
    },
    {
      key: 'schedule',
      icon: <GitBranch size={14} className={iconCls} />,
      title: t('dashboard.layout.w_schedule', { defaultValue: 'Critical Path' }),
      value: !schedule || schedule.top.length === 0
        ? dash
        : t('dashboard.snapshot_schedule_v', {
            defaultValue: '{{n}} at risk',
            n: schedule.top.length,
          }),
      href: '/schedule',
      empty: !schedule || schedule.top.length === 0,
    },
    {
      key: 'risk',
      icon: <ShieldAlert size={14} className={iconCls} />,
      title: t('dashboard.layout.w_risk', { defaultValue: 'Top Risks' }),
      value: !risk || risk.top.length === 0
        ? dash
        : t('dashboard.snapshot_risk_v', {
            defaultValue: '{{n}} risks · top {{s}}',
            n: risk.top.length,
            s: Math.round(risk.top[0]?.score ?? 0),
          }),
      href: '/risk-register',
      empty: !risk || risk.top.length === 0,
    },
    {
      key: 'hse',
      icon: <HardHat size={14} className={iconCls} />,
      title: t('dashboard.layout.w_hse', { defaultValue: 'HSE Scorecard' }),
      value: !hse || hse.total === 0
        ? dash
        : t('dashboard.snapshot_hse_v', {
            defaultValue: '{{n}} in 30d · LTI {{d}}d',
            n: hse.last_30d,
            d: hse.days_since_last ?? 0,
          }),
      href: '/hse',
      empty: !hse || hse.total === 0,
    },
    {
      key: 'procurement',
      icon: <ShoppingCart size={14} className={iconCls} />,
      title: t('dashboard.layout.w_procurement', { defaultValue: 'Procurement' }),
      value: !proc || (proc.rfqs_pending + proc.pos_issued + proc.pos_received) === 0
        ? dash
        : t('dashboard.snapshot_proc_v', {
            defaultValue: '{{r}} RFQ · {{p}} PO',
            r: proc.rfqs_pending,
            p: proc.pos_issued,
          }),
      href: '/procurement',
      empty: !proc || (proc.rfqs_pending + proc.pos_issued + proc.pos_received) === 0,
    },
    {
      key: 'budget',
      icon: <Wallet size={14} className={iconCls} />,
      title: t('dashboard.layout.w_budget', { defaultValue: 'Budget Variance' }),
      value: !budget || budget.top_over.length === 0
        ? dash
        : t('dashboard.snapshot_budget_v', {
            defaultValue: '{{n}} over · +{{p}}%',
            n: budget.top_over.length,
            p: budget.top_over[0]?.pct ?? 0,
          }),
      href: '/finance',
      empty: !budget || budget.top_over.length === 0,
    },
    {
      key: 'co',
      icon: <ClipboardList size={14} className={iconCls} />,
      title: t('dashboard.layout.w_changeorders', { defaultValue: 'Change Orders' }),
      value: !co || co.open_count === 0
        ? dash
        : `${co.open_count} · ${fmtMoney(co.total_impact, co.currency ?? fallbackCurrency)}`,
      href: '/change-orders',
      empty: !co || co.open_count === 0,
    },
  ];

  return (
    <div className="animate-card-in" style={{ animationDelay: '160ms' }}>
      <Card>
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-sm font-semibold text-content-primary">
            {t('dashboard.snapshot_title', { defaultValue: 'Operations snapshot' })}
          </h3>
          <p className="text-2xs text-content-tertiary">
            {t('dashboard.snapshot_subtitle', {
              defaultValue:
                'Health across nine operations modules — empty tiles light up as data lands.',
            })}
          </p>
        </div>
        <CardContent>
          {isLoading && tiles.every((tl) => tl.empty) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} height={56} rounded="md" />
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tiles.map((tile) => (
                <li key={tile.key}>
                  <button
                    type="button"
                    onClick={() => navigate(tile.href)}
                    className="group flex w-full items-center gap-2.5 rounded-md border border-border-light bg-surface-secondary/40 px-3 py-2 text-left transition-colors hover:bg-surface-secondary hover:border-border-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-elevated">
                      {tile.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-content-primary">
                        {tile.title}
                      </span>
                      <span
                        className={`block truncate text-2xs tabular-nums ${
                          tile.empty
                            ? 'text-content-quaternary'
                            : 'text-content-secondary'
                        }`}
                      >
                        {tile.value}
                      </span>
                    </span>
                    <ArrowRight
                      size={12}
                      className="text-content-quaternary group-hover:text-content-secondary transition-colors"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
