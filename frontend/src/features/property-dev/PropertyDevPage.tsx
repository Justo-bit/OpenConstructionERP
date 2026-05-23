import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Building2,
  Grid3X3,
  Home,
  Users,
  Key,
  ShieldAlert,
  Plus,
  Search,
  Loader2,
  Check,
  Clock,
  AlertOctagon,
  Pencil,
  Globe2,
  LayoutDashboard,
  Wallet,
  ArrowRight,
  FileSignature,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  EmptyState,
  Breadcrumb,
  SkeletonTable,
  SideDrawer,
  ActivityFeed,
} from '@/shared/ui';
import {
  WideModal,
  WideModalSection,
  WideModalField,
} from '@/shared/ui/WideModal';
import { MoneyDisplay } from '@/shared/ui/MoneyDisplay';
import { DateDisplay } from '@/shared/ui/DateDisplay';
import { PipelineBanner } from './PipelineBanner';
import { useToastStore } from '@/stores/useToastStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { getErrorMessage, apiGet } from '@/shared/lib/api';
import { EditBuyerModal } from './EditBuyerModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import type { PropDevDocType } from './api';
import {
  listDevelopments,
  createDevelopment,
  getDevelopmentDashboard,
  listPlots,
  createPlot,
  reservePlot,
  listHouseTypes,
  createHouseType,
  fetchHouseTypes,
  createHouseTypeCatalogue,
  type HouseTypeCatalogueEntry,
  listVariants,
  listBuyers,
  createBuyer,
  contractBuyer,
  listSelections,
  listHandovers,
  createHandover,
  deleteHandover,
  completeHandover,
  listWarrantyClaims,
  createWarrantyClaim,
  acceptWarrantyClaim,
  rejectWarrantyClaim,
  closeWarrantyClaim,
  warrantyClaimPdfUrl,
  type Buyer,
  type BuyerStatus,
  type Development,
  type Handover,
  type HouseType,
  type Plot,
  type PlotStatus,
  type WarrantyCategory,
  type WarrantyClaim,
  type WarrantySeverity,
  type WarrantyStatus,
} from './api';

type Tab =
  | 'overview'
  | 'developments'
  | 'plots'
  | 'house_types'
  | 'buyers'
  | 'handovers'
  | 'warranty';

const PLOT_STATUS_VARIANT: Record<PlotStatus, 'neutral' | 'blue' | 'success' | 'warning' | 'error'> = {
  planned: 'neutral',
  reserved: 'warning',
  under_construction: 'blue',
  ready: 'blue',
  sold: 'success',
  handed_over: 'success',
};

const PLOT_STATUS_COLOR: Record<PlotStatus, string> = {
  planned: 'bg-slate-200 text-slate-700 border-slate-300',
  reserved: 'bg-amber-100 text-amber-800 border-amber-300',
  under_construction: 'bg-sky-100 text-sky-800 border-sky-300',
  ready: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  sold: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  handed_over: 'bg-emerald-200 text-emerald-900 border-emerald-400',
};

const BUYER_STAGE_ORDER: BuyerStatus[] = ['lead', 'reserved', 'contracted', 'completed'];
const BUYER_VARIANT: Record<BuyerStatus, 'neutral' | 'blue' | 'success' | 'warning' | 'error'> = {
  lead: 'neutral',
  reserved: 'warning',
  contracted: 'blue',
  completed: 'success',
  cancelled: 'error',
};

const WARRANTY_VARIANT: Record<WarrantyStatus, 'neutral' | 'blue' | 'success' | 'warning' | 'error'> = {
  raised: 'warning',
  under_review: 'blue',
  accepted: 'success',
  rejected: 'error',
  closed: 'neutral',
};

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue';

interface ProjectStub {
  id: string;
  name: string;
}

function listProjectsLite(): Promise<ProjectStub[]> {
  return apiGet<ProjectStub[]>('/v1/projects/?limit=200').catch(
    () => [] as ProjectStub[],
  );
}
// labelCls is still used by a couple of small inline modals (e.g.
// BuyerContract date-pair) that were not migrated to WideModal because
// they're tiny confirmation panels rather than full forms.
const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

/* ─── helpers ─── */

function toNumber(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diff = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

/* ─── Page ─── */

export function PropertyDevPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedDevId, setSelectedDevId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [activePlotId, setActivePlotId] = useState<string | null>(null);
  const [activeBuyerId, setActiveBuyerId] = useState<string | null>(null);

  const developmentsQ = useQuery({
    queryKey: ['propdev', 'developments'],
    queryFn: () => listDevelopments({ limit: 100 }),
  });
  const developments = developmentsQ.data ?? [];

  useEffect(() => {
    if (!selectedDevId && developments.length > 0) {
      const first = developments[0];
      if (first) setSelectedDevId(first.id);
    }
  }, [developments, selectedDevId]);

  const plotsQ = useQuery({
    queryKey: ['propdev', 'plots', selectedDevId],
    queryFn: () => listPlots({ development_id: selectedDevId, limit: 500 }),
    // Handovers + Warranty tabs both need the plot list (HandoversTab filters
    // candidate plots; WarrantyTab joins claims to plot context). Without
    // 'handovers' / 'warranty' here those tabs rendered as if there were no
    // plots at all — root cause of "Handovers вообще не работает".
    // The Buyers tab also needs plots now (new ``Plot`` column resolves
    // ``buyer.plot_id`` against this list).
    enabled:
      !!selectedDevId &&
      (tab === 'plots' ||
        tab === 'developments' ||
        tab === 'handovers' ||
        tab === 'warranty' ||
        tab === 'buyers'),
  });
  const houseTypesQ = useQuery({
    queryKey: ['propdev', 'house-types', selectedDevId],
    queryFn: () => listHouseTypes(selectedDevId),
    enabled: !!selectedDevId && (tab === 'house_types' || tab === 'plots'),
  });
  const buyersQ = useQuery({
    queryKey: ['propdev', 'buyers', selectedDevId],
    queryFn: () => listBuyers({ development_id: selectedDevId, limit: 500 }),
    enabled: !!selectedDevId && (tab === 'buyers' || tab === 'handovers' || tab === 'warranty'),
  });

  const allPlots = plotsQ.data ?? [];
  const allBuyers = buyersQ.data ?? [];

  const filteredBuyers = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return allBuyers;
    return allBuyers.filter(
      (b) =>
        (b.full_name || '').toLowerCase().includes(s) ||
        (b.email || '').toLowerCase().includes(s),
    );
  }, [allBuyers, search]);

  const isLoading =
    developmentsQ.isLoading ||
    (tab === 'plots' && plotsQ.isLoading) ||
    (tab === 'house_types' && houseTypesQ.isLoading) ||
    (tab === 'buyers' && buyersQ.isLoading);

  // A failed list query must NOT fall through to the "nothing here yet"
  // empty state — that hides real backend/permission failures behind a
  // success-looking screen. Surface it with a retry instead.
  const activeQuery =
    tab === 'plots'
      ? plotsQ
      : tab === 'house_types'
        ? houseTypesQ
        : tab === 'buyers' || tab === 'handovers' || tab === 'warranty'
          ? buyersQ
          : developmentsQ;
  const loadError =
    developmentsQ.isError
      ? developmentsQ.error
      : activeQuery.isError
        ? activeQuery.error
        : null;

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: t('propdev.title', { defaultValue: 'Property Development' }) },
        ]}
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-content-primary">
            {t('propdev.title', { defaultValue: 'Property Development' })}
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {t('propdev.subtitle', {
              defaultValue:
                'Developments, plots, buyer journeys, handovers and warranty claims.',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            icon={<LayoutDashboard size={14} />}
            onClick={() => navigate('/property-dev/dashboards')}
            aria-label={t('propdev.open_dashboards', {
              defaultValue: 'Open analytics dashboards',
            })}
          >
            {t('propdev.dashboards_short', { defaultValue: 'Dashboards' })}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => {
              // From the overview tab, opening the primary CTA falls
              // through to creating a development — the natural first
              // step for a brand-new tenant. From every other tab the
              // CTA matches the entity that tab edits.
              if (tab === 'overview' || tab === 'handovers' || tab === 'warranty') {
                // overview/handovers/warranty don't have their own
                // create-modal; route the user to the developments tab
                // and open the creator there.
                setTab('developments');
              }
              setCreateOpen(true);
            }}
          >
            {tab === 'overview'
              ? t('propdev.new_development', { defaultValue: 'New Development' })
              : tab === 'developments'
                ? t('propdev.new_development', { defaultValue: 'New Development' })
                : tab === 'plots'
                  ? t('propdev.new_plot', { defaultValue: 'New Plot' })
                  : tab === 'house_types'
                    ? t('propdev.new_house_type', { defaultValue: 'New House Type' })
                    : tab === 'buyers'
                      ? t('propdev.new_buyer', { defaultValue: 'New Buyer' })
                      : t('propdev.new_development', { defaultValue: 'New Development' })}
          </Button>
        </div>
      </div>

      <PipelineBanner
        intro={t('propdev.pipeline_intro', {
          defaultValue:
            'Residential sales pipeline: lay out a development of plots and house types, take buyers from lead → reservation → contract → handover, then service warranty claims. Contract values feed Finance.',
        })}
        steps={[
          {
            label: t('propdev.step_dev', { defaultValue: 'Development' }),
            current: true,
          },
          { label: t('propdev.step_buyers', { defaultValue: 'Buyers' }) },
          {
            label: t('propdev.step_contracts', { defaultValue: 'Contracts' }),
            to: '/contracts',
          },
          {
            label: t('propdev.step_finance', { defaultValue: 'Finance' }),
            to: '/finance',
          },
        ]}
      />

      {/* Tabs */}
      <div className="border-b border-border-light">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {(
            [
              { id: 'overview', label: t('propdev.overview', { defaultValue: 'Overview' }), icon: LayoutDashboard },
              { id: 'developments', label: t('propdev.developments', { defaultValue: 'Developments' }), icon: Building2 },
              { id: 'plots', label: t('propdev.plots', { defaultValue: 'Plots' }), icon: Grid3X3 },
              { id: 'house_types', label: t('propdev.house_types', { defaultValue: 'House Types' }), icon: Home },
              { id: 'buyers', label: t('propdev.buyers', { defaultValue: 'Buyers' }), icon: Users },
              { id: 'handovers', label: t('propdev.handovers', { defaultValue: 'Handovers' }), icon: Key },
              { id: 'warranty', label: t('propdev.warranty', { defaultValue: 'Warranty Claims' }), icon: ShieldAlert },
            ] as { id: Tab; label: string; icon: React.ElementType }[]
          ).map((tabItem) => {
            const Icon = tabItem.icon;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => {
                  setTab(tabItem.id);
                  setSearch('');
                }}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  tab === tabItem.id
                    ? 'border-oe-blue text-oe-blue'
                    : 'border-transparent text-content-secondary hover:text-content-primary',
                )}
              >
                <Icon size={14} />
                {tabItem.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Filters */}
      {tab !== 'developments' && tab !== 'overview' && developments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedDevId}
            onChange={(e) => setSelectedDevId(e.target.value)}
            className={clsx(inputCls, 'max-w-[320px]')}
          >
            {developments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name || t('propdev.untitled', { defaultValue: 'Untitled' })}
              </option>
            ))}
          </select>
          {tab === 'buyers' && (
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary"
              />
              <input
                type="text"
                placeholder={t('common.search', { defaultValue: 'Search…' })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={clsx(inputCls, 'pl-8')}
              />
            </div>
          )}
          {selectedDevId && (
            <button
              type="button"
              onClick={() =>
                // Pass the development id on the query string in addition to
                // the path param so deep-links surviving redirects (e.g. via
                // the global Geo Hub) can still resolve the focus context.
                navigate(
                  `/property-dev/developments/${selectedDevId}/geo?development=${encodeURIComponent(selectedDevId)}`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-border-light bg-surface-primary px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-secondary hover:text-oe-blue focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
              title={t('geo_hub.view_on_map', { defaultValue: 'View on map' })}
              aria-label={t('geo_hub.view_on_map', { defaultValue: 'View on map' })}
              data-testid="propdev-view-on-map"
            >
              <Globe2 size={13} />
              {t('geo_hub.view_on_map', { defaultValue: 'View on map' })}
            </button>
          )}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <Card padding="md"><SkeletonTable rows={6} columns={4} /></Card>
      ) : loadError ? (
        <Card padding="md">
          <EmptyState
            icon={<AlertOctagon size={22} />}
            title={t('propdev.load_error', {
              defaultValue: 'Could not load property data',
            })}
            description={getErrorMessage(loadError)}
            action={{
              label: t('common.retry', { defaultValue: 'Retry' }),
              onClick: () => {
                developmentsQ.refetch();
                activeQuery.refetch();
              },
            }}
          />
        </Card>
      ) : tab === 'overview' ? (
        <OverviewTab
          developments={developments}
          onJumpToDevelopment={(id) => {
            setSelectedDevId(id);
            setTab('plots');
          }}
          onJumpTo={(target) => setTab(target)}
          onCreate={() => {
            setTab('developments');
            setCreateOpen(true);
          }}
        />
      ) : tab === 'developments' ? (
        <DevelopmentsGrid
          rows={developments}
          onSelect={(id) => {
            setSelectedDevId(id);
            setTab('plots');
          }}
          onCreate={() => setCreateOpen(true)}
        />
      ) : tab === 'plots' ? (
        <PlotsTab
          plots={allPlots}
          houseTypes={houseTypesQ.data ?? []}
          onSelect={(id) => setActivePlotId(id)}
          onCreate={() => setCreateOpen(true)}
        />
      ) : tab === 'house_types' ? (
        <HouseTypesTab
          rows={houseTypesQ.data ?? []}
          onCreate={() => setCreateOpen(true)}
        />
      ) : tab === 'buyers' ? (
        <BuyersTab
          rows={filteredBuyers}
          plots={allPlots}
          onSelect={(id) => setActiveBuyerId(id)}
          onCreate={() => setCreateOpen(true)}
        />
      ) : tab === 'handovers' ? (
        <HandoversTab plots={allPlots} buyers={allBuyers} />
      ) : (
        <WarrantyTab
          buyers={allBuyers}
          plots={allPlots}
          developmentId={selectedDevId}
        />
      )}


      {/* Plot detail */}
      {activePlotId && (
        <PlotDetailDrawer
          plotId={activePlotId}
          plots={allPlots}
          houseTypes={houseTypesQ.data ?? []}
          onClose={() => setActivePlotId(null)}
        />
      )}

      {/* Buyer detail */}
      {activeBuyerId && (
        <BuyerDetailDrawer
          buyerId={activeBuyerId}
          buyers={allBuyers}
          plots={allPlots}
          developmentId={selectedDevId}
          onClose={() => setActiveBuyerId(null)}
        />
      )}

      {/* Create modal */}
      {createOpen && (
        <CreateModal
          kind={tab}
          developmentId={selectedDevId}
          developments={developments}
          houseTypes={houseTypesQ.data ?? []}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Overview tab — at-a-glance landing dashboard ─── */

/**
 * Aggregates dashboard tiles across every development so a new visitor
 * lands on something useful instead of an empty grid. Each tile is
 * clickable and jumps to the relevant sub-tab. Recent activity is
 * sourced from the cross-module ``/api/v1/activity`` endpoint via
 * ``ActivityFeed``.
 *
 * The aggregate fetches happen in parallel via separate ``useQuery``
 * hooks per development. We cap at 12 developments to keep the network
 * fan-out predictable; tenants with more should narrow via the
 * Developments tab. ``staleTime: 60_000`` matches DashboardsHub.
 */
function OverviewTab({
  developments,
  onJumpTo,
  onJumpToDevelopment,
  onCreate,
}: {
  developments: Development[];
  onJumpTo: (tab: Tab) => void;
  onJumpToDevelopment: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (developments.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<Building2 size={22} />}
          title={t('propdev.empty_developments', {
            defaultValue: 'No developments yet',
          })}
          description={t('propdev.empty_developments_desc', {
            defaultValue:
              'Create your first development to start tracking plots, buyers and handovers.',
          })}
          action={{
            label: t('propdev.new_development', {
              defaultValue: 'New Development',
            }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <OverviewKpiRow
        developments={developments.slice(0, 12)}
        onJumpTo={onJumpTo}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card padding="md" className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-content-primary">
              {t('propdev.recent_activity', {
                defaultValue: 'Recent activity',
              })}
            </h3>
            <Badge variant="neutral">
              {t('propdev.last_n', { defaultValue: 'Last {{n}}', n: 10 })}
            </Badge>
          </div>
          <ActivityFeed limit={10} />
        </Card>

        <Card padding="md">
          <h3 className="mb-3 text-sm font-semibold text-content-primary">
            {t('propdev.quick_links', { defaultValue: 'Quick links' })}
          </h3>
          <ul className="space-y-2">
            <li>
              <button
                type="button"
                onClick={() => navigate('/property-dev/dashboards')}
                className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-sm text-left hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
              >
                <span className="flex items-center gap-2">
                  <LayoutDashboard
                    size={14}
                    className="text-content-tertiary group-hover:text-oe-blue"
                  />
                  <span>
                    {t('propdev.dashboards_link', {
                      defaultValue: 'Analytics dashboards',
                    })}
                  </span>
                </span>
                <ArrowRight
                  size={13}
                  className="text-content-tertiary group-hover:text-oe-blue"
                />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onJumpTo('buyers')}
                className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-sm text-left hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
              >
                <span className="flex items-center gap-2">
                  <Users
                    size={14}
                    className="text-content-tertiary group-hover:text-oe-blue"
                  />
                  <span>
                    {t('propdev.buyers_pipeline', {
                      defaultValue: 'Buyers pipeline',
                    })}
                  </span>
                </span>
                <ArrowRight
                  size={13}
                  className="text-content-tertiary group-hover:text-oe-blue"
                />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onJumpTo('handovers')}
                className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-sm text-left hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
              >
                <span className="flex items-center gap-2">
                  <Key
                    size={14}
                    className="text-content-tertiary group-hover:text-oe-blue"
                  />
                  <span>
                    {t('propdev.handovers_short', {
                      defaultValue: 'Upcoming handovers',
                    })}
                  </span>
                </span>
                <ArrowRight
                  size={13}
                  className="text-content-tertiary group-hover:text-oe-blue"
                />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onJumpTo('warranty')}
                className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-sm text-left hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
              >
                <span className="flex items-center gap-2">
                  <ShieldAlert
                    size={14}
                    className="text-content-tertiary group-hover:text-oe-blue"
                  />
                  <span>
                    {t('propdev.warranty_short', {
                      defaultValue: 'Warranty claims',
                    })}
                  </span>
                </span>
                <ArrowRight
                  size={13}
                  className="text-content-tertiary group-hover:text-oe-blue"
                />
              </button>
            </li>
          </ul>
        </Card>
      </div>

      <Card padding="none">
        <div className="px-4 py-3 border-b border-border-light flex items-center justify-between">
          <h3 className="text-sm font-semibold text-content-primary">
            {t('propdev.developments_snapshot', {
              defaultValue: 'Developments snapshot',
            })}
          </h3>
          <button
            type="button"
            onClick={() => onJumpTo('developments')}
            className="text-xs text-oe-blue hover:underline focus:outline-none focus:ring-2 focus:ring-oe-blue/40 rounded"
          >
            {t('propdev.view_all', { defaultValue: 'View all' })} →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">
                  {t('propdev.development', { defaultValue: 'Development' })}
                </th>
                <th className="px-4 py-2.5 text-left">
                  {t('propdev.phase', { defaultValue: 'Phase' })}
                </th>
                <th className="px-4 py-2.5 text-right">
                  {t('propdev.sold_pct', { defaultValue: 'Sold %' })}
                </th>
                <th className="px-4 py-2.5 text-right">
                  {t('propdev.contracted', { defaultValue: 'Contracted' })}
                </th>
                <th className="px-4 py-2.5 text-right">
                  {t('propdev.open_snags', { defaultValue: 'Open snags' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {developments.slice(0, 12).map((d) => (
                <OverviewDevRow
                  key={d.id}
                  dev={d}
                  onSelect={() => onJumpToDevelopment(d.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * Row for the overview snapshot table. Pulls the per-development
 * dashboard so KPIs stay live. Loading state is a thin shimmer rather
 * than a full skeleton — the row is only ~24px tall.
 */
function OverviewDevRow({
  dev,
  onSelect,
}: {
  dev: Development;
  onSelect: () => void;
}) {
  const dashQ = useQuery({
    queryKey: ['propdev', 'dashboard', dev.id],
    queryFn: () => getDevelopmentDashboard(dev.id),
    staleTime: 60_000,
  });
  const dash = dashQ.data;
  const total = dash?.total_plots ?? dev.total_plots ?? 0;
  const sold =
    dash != null
      ? (dash.plots_by_status['sold'] ?? 0) +
        (dash.plots_by_status['handed_over'] ?? 0)
      : 0;
  const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
  return (
    <tr
      onClick={onSelect}
      className="border-t border-border-light hover:bg-surface-secondary cursor-pointer focus-within:bg-surface-secondary"
    >
      <td className="px-4 py-2">
        <div className="font-medium">{dev.name || dev.code}</div>
        <div className="text-xs font-mono text-content-tertiary">{dev.code}</div>
      </td>
      <td className="px-4 py-2 text-xs uppercase">
        <Badge
          variant={
            dev.status === 'active'
              ? 'success'
              : dev.status === 'paused'
                ? 'warning'
                : 'neutral'
          }
        >
          {dev.sales_phase}
        </Badge>
      </td>
      <td className="px-4 py-2 text-right">
        <span className="inline-flex items-center gap-2">
          <span className="font-medium tabular-nums">{pct}%</span>
          <span className="hidden sm:inline-block h-1.5 w-16 overflow-hidden rounded-full bg-surface-secondary">
            <span
              className="block h-full bg-oe-blue"
              style={{ width: `${pct}%` }}
            />
          </span>
        </span>
      </td>
      <td className="px-4 py-2 text-right font-medium">
        {dashQ.isLoading ? (
          <span className="inline-block h-3 w-16 rounded bg-surface-secondary animate-pulse" />
        ) : dash ? (
          <MoneyDisplay
            amount={toNumber(dash.contracted_value)}
            currency={undefined}
          />
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {dashQ.isLoading ? '—' : dash ? dash.open_snags : '—'}
      </td>
    </tr>
  );
}

/**
 * Top row of KPI tiles. Aggregates per-development dashboards in
 * parallel. While any dashboard is still loading the tile shows a dash
 * rather than a transient 0 (which would read as truth).
 *
 * The ``dashQs`` array is built via a stable ``.map`` over the
 * ``developments`` slice passed in from the parent. React-Query keys
 * encode the development id so the hook order is stable across
 * renders — but the linter still flags rules-of-hooks; we suppress
 * narrowly because the invariant (stable key order keyed by ``dev.id``
 * across renders) is what the rule actually enforces.
 */
function OverviewKpiRow({
  developments,
  onJumpTo,
}: {
  developments: Development[];
  onJumpTo: (tab: Tab) => void;
}) {
  const { t } = useTranslation();
  const dashQs = developments.map((d) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['propdev', 'dashboard', d.id],
      queryFn: () => getDevelopmentDashboard(d.id),
      staleTime: 60_000,
    }),
  );
  const allLoaded = dashQs.every((q) => !q.isLoading);
  const anyError = dashQs.some((q) => q.isError);

  const dataFingerprint = dashQs.map((q) => q.dataUpdatedAt).join(',');
  const totals = useMemo(() => {
    let availablePlots = 0;
    let openLeads = 0;
    let pendingReservations = 0;
    let openSnags = 0;
    let openWarranty = 0;
    let scheduledHandovers = 0;
    let contracted = 0;
    for (const q of dashQs) {
      const d = q.data;
      if (!d) continue;
      availablePlots +=
        (d.plots_by_status['planned'] ?? 0) +
        (d.plots_by_status['ready'] ?? 0) +
        (d.plots_by_status['under_construction'] ?? 0);
      openLeads += d.buyers_by_status['lead'] ?? 0;
      pendingReservations += d.buyers_by_status['reserved'] ?? 0;
      openSnags += d.open_snags ?? 0;
      openWarranty += d.open_warranty_claims ?? 0;
      scheduledHandovers += d.scheduled_handovers ?? 0;
      contracted += toNumber(d.contracted_value);
    }
    return {
      availablePlots,
      openLeads,
      pendingReservations,
      openSnags,
      openWarranty,
      scheduledHandovers,
      contracted,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataFingerprint]);

  const dashOrDash = (n: number) => (allLoaded ? n : '—');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiTile
        icon={<Users size={14} />}
        label={t('propdev.kpi_open_leads', { defaultValue: 'Open leads' })}
        value={dashOrDash(totals.openLeads)}
        onClick={() => onJumpTo('buyers')}
        accent="neutral"
        loading={!allLoaded}
        error={anyError}
      />
      <KpiTile
        icon={<FileSignature size={14} />}
        label={t('propdev.kpi_reservations', { defaultValue: 'Reservations' })}
        value={dashOrDash(totals.pendingReservations)}
        onClick={() => onJumpTo('buyers')}
        accent="warning"
        loading={!allLoaded}
        error={anyError}
      />
      <KpiTile
        icon={<Grid3X3 size={14} />}
        label={t('propdev.kpi_available_plots', {
          defaultValue: 'Available plots',
        })}
        value={dashOrDash(totals.availablePlots)}
        onClick={() => onJumpTo('plots')}
        accent="success"
        loading={!allLoaded}
        error={anyError}
      />
      <KpiTile
        icon={<Key size={14} />}
        label={t('propdev.kpi_handovers', {
          defaultValue: 'Scheduled handovers',
        })}
        value={dashOrDash(totals.scheduledHandovers)}
        onClick={() => onJumpTo('handovers')}
        accent="blue"
        loading={!allLoaded}
        error={anyError}
      />
      <KpiTile
        icon={<ShieldAlert size={14} />}
        label={t('propdev.kpi_warranty', { defaultValue: 'Open warranty' })}
        value={dashOrDash(totals.openWarranty)}
        onClick={() => onJumpTo('warranty')}
        accent={totals.openWarranty > 0 ? 'error' : 'neutral'}
        loading={!allLoaded}
        error={anyError}
      />
      <KpiTile
        icon={<Wallet size={14} />}
        label={t('propdev.kpi_contracted', {
          defaultValue: 'Contracted value',
        })}
        value={
          allLoaded ? (
            <MoneyDisplay amount={totals.contracted} currency={undefined} />
          ) : (
            '—'
          )
        }
        onClick={() => onJumpTo('buyers')}
        accent="blue"
        loading={!allLoaded}
        error={anyError}
      />
    </div>
  );
}

/**
 * Small reusable KPI tile. Renders as a button so keyboard nav reaches
 * every tile; ``aria-label`` mirrors the label/value pair so screen
 * readers announce "Open leads, 12" rather than just "12".
 */
function KpiTile({
  icon,
  label,
  value,
  onClick,
  accent,
  loading,
  error,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
  accent?: 'neutral' | 'success' | 'warning' | 'error' | 'blue';
  loading?: boolean;
  error?: boolean;
}) {
  const valueText =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const accentRing: Record<NonNullable<typeof accent>, string> = {
    neutral: 'hover:border-content-secondary',
    blue: 'hover:border-oe-blue',
    success: 'hover:border-emerald-500',
    warning: 'hover:border-amber-500',
    error: 'hover:border-rose-500',
  };
  const iconColor: Record<NonNullable<typeof accent>, string> = {
    neutral: 'text-content-secondary',
    blue: 'text-oe-blue',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    error: 'text-rose-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={valueText ? `${label}: ${valueText}` : label}
      className={clsx(
        'group rounded-xl border border-border-light bg-surface-primary p-3 text-left transition-all',
        'focus:outline-none focus:ring-2 focus:ring-oe-blue/40',
        onClick && 'cursor-pointer',
        accent && accentRing[accent],
        'min-h-[88px] flex flex-col justify-between',
      )}
    >
      <div className="flex items-center justify-between text-xs text-content-tertiary">
        <span
          className={clsx(
            'flex items-center gap-1.5',
            accent && iconColor[accent],
          )}
        >
          {icon}
          <span className="line-clamp-1">{label}</span>
        </span>
        {error && (
          <AlertOctagon
            size={11}
            className="text-rose-500 shrink-0"
            aria-label="error"
          />
        )}
      </div>
      <div className="mt-2 text-xl font-semibold text-content-primary leading-none">
        {loading ? (
          <span className="inline-block h-5 w-12 rounded bg-surface-secondary animate-pulse" />
        ) : (
          value
        )}
      </div>
    </button>
  );
}

/* ─── Developments grid ─── */

function DevelopmentsGrid({
  rows,
  onSelect,
  onCreate,
}: {
  rows: Development[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<Building2 size={22} />}
          title={t('propdev.empty_developments', { defaultValue: 'No developments yet' })}
          description={t('propdev.empty_developments_desc', {
            defaultValue: 'Create your first development to start tracking plots, buyers and handovers.',
          })}
          action={{
            label: t('propdev.new_development', { defaultValue: 'New Development' }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((d) => (
        <DevelopmentCard key={d.id} dev={d} onSelect={onSelect} />
      ))}
    </div>
  );
}

function DevelopmentCard({
  dev,
  onSelect,
}: {
  dev: Development;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dashQ = useQuery({
    queryKey: ['propdev', 'dashboard', dev.id],
    queryFn: () => getDevelopmentDashboard(dev.id),
    staleTime: 60_000,
  });
  const dash = dashQ.data;
  const sold = dash
    ? (dash.plots_by_status['sold'] ?? 0) + (dash.plots_by_status['handed_over'] ?? 0)
    : 0;
  const total = dash?.total_plots ?? dev.total_plots ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0;
  // Use a card-with-footer layout: the main body navigates to the
  // plots tab for this development (primary CTA), while the small
  // footer carries a secondary "Open dashboards" deep link. Footer
  // ``stopPropagation`` prevents bubbling up into the body's onClick.
  return (
    <Card padding="md" hoverable>
      <button
        type="button"
        onClick={() => onSelect(dev.id)}
        className="text-left w-full focus:outline-none"
        aria-label={t('propdev.open_development_aria', {
          defaultValue: 'Open development {{name}}',
          name: dev.name || dev.code,
        })}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className="font-semibold text-content-primary truncate"
              title={dev.name || dev.code}
            >
              {dev.name || dev.code}
            </h3>
            <p className="mt-0.5 text-xs font-mono text-content-tertiary">
              {dev.code}
            </p>
          </div>
          <Badge
            variant={
              dev.status === 'active'
                ? 'success'
                : dev.status === 'paused'
                  ? 'warning'
                  : 'neutral'
            }
            dot
          >
            {dev.sales_phase}
          </Badge>
        </div>
        {dev.location_address && (
          <p className="mt-1 text-xs text-content-secondary line-clamp-1">
            {dev.location_address}
          </p>
        )}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
            <span>
              {t('propdev.plots_sold', {
                defaultValue: '{{sold}}/{{total}} plots sold',
                sold,
                total,
              })}
            </span>
            <span className="font-medium tabular-nums">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
            <div
              className="h-full bg-oe-blue transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {dash && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-content-tertiary">
                {t('propdev.contracted', { defaultValue: 'Contracted' })}
              </p>
              <p className="font-medium">
                <MoneyDisplay
                  amount={toNumber(dash.contracted_value)}
                  currency={undefined}
                />
              </p>
            </div>
            <div>
              <p className="text-content-tertiary">
                {t('propdev.open_snags', { defaultValue: 'Open snags' })}
              </p>
              <p className="font-medium">{dash.open_snags}</p>
            </div>
          </div>
        )}
      </button>
      <div className="mt-3 -mx-3 -mb-3 border-t border-border-light bg-surface-secondary/40 px-3 py-2 flex items-center justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/property-dev/dashboards');
          }}
          className="inline-flex items-center gap-1 rounded text-content-tertiary hover:text-oe-blue focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
          aria-label={t('propdev.open_dashboards_for', {
            defaultValue: 'Open analytics dashboards',
          })}
        >
          <LayoutDashboard size={12} />
          {t('propdev.dashboards_short', { defaultValue: 'Dashboards' })}
        </button>
      </div>
    </Card>
  );
}

/* ─── Plots tab — grid view ─── */

function PlotsTab({
  plots,
  houseTypes,
  onSelect,
  onCreate,
}: {
  plots: Plot[];
  houseTypes: HouseType[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  if (plots.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<Grid3X3 size={22} />}
          title={t('propdev.empty_plots', { defaultValue: 'No plots' })}
          description={t('propdev.empty_plots_desc', {
            defaultValue: 'Add plots to the selected development to start the sales pipeline.',
          })}
          action={{
            label: t('propdev.new_plot', { defaultValue: 'New Plot' }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }
  const htMap = new Map(houseTypes.map((h) => [h.id, h]));
  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center gap-3 text-xs text-content-secondary mb-3">
        {(Object.keys(PLOT_STATUS_COLOR) as PlotStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={clsx('h-3 w-3 rounded-sm border', PLOT_STATUS_COLOR[s])} />
            {s}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
        {plots.map((p) => {
          const ht = p.house_type_id ? htMap.get(p.house_type_id) : null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={clsx(
                'flex flex-col items-center justify-center rounded-md border-2 px-1 py-2 text-center transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-oe-blue',
                PLOT_STATUS_COLOR[p.status],
              )}
              title={`${p.plot_number} — ${p.status}`}
            >
              <span className="text-xs font-semibold leading-none">{p.plot_number}</span>
              {ht && <span className="mt-0.5 text-[10px] opacity-80">{ht.code}</span>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ─── House Types tab ─── */

function HouseTypesTab({
  rows,
  onCreate,
}: {
  rows: HouseType[];
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<Home size={22} />}
          title={t('propdev.empty_house_types', { defaultValue: 'No house types' })}
          description={t('propdev.empty_house_types_desc', {
            defaultValue: 'Define reusable house types (semi, detached, terrace) with base prices.',
          })}
          action={{
            label: t('propdev.new_house_type', { defaultValue: 'New House Type' }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((h) => (
        <HouseTypeCard key={h.id} ht={h} />
      ))}
    </div>
  );
}

function HouseTypeCard({ ht }: { ht: HouseType }) {
  const { t } = useTranslation();
  const variantsQ = useQuery({
    queryKey: ['propdev', 'variants', ht.id],
    queryFn: () => listVariants(ht.id),
    staleTime: 60_000,
  });
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-content-primary truncate" title={ht.name || ht.code}>
            {ht.name || ht.code}
          </h3>
          <p className="mt-0.5 text-xs font-mono text-content-tertiary">{ht.code}</p>
        </div>
        <Badge variant="blue">{ht.bedrooms} BR</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-content-tertiary">{t('propdev.area', { defaultValue: 'Area' })}</p>
          <p className="font-medium">{toNumber(ht.total_area_m2).toFixed(1)} m²</p>
        </div>
        <div>
          <p className="text-content-tertiary">{t('propdev.levels', { defaultValue: 'Levels' })}</p>
          <p className="font-medium">{ht.levels}</p>
        </div>
        <div>
          <p className="text-content-tertiary">{t('propdev.base_price', { defaultValue: 'Base price' })}</p>
          <p className="font-medium">
            <MoneyDisplay amount={toNumber(ht.base_price)} currency={ht.currency || undefined} />
          </p>
        </div>
      </div>
      {variantsQ.data && variantsQ.data.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-content-tertiary mb-1">
            {t('propdev.variants', { defaultValue: 'Variants' })}
          </p>
          <div className="flex flex-wrap gap-1">
            {variantsQ.data.map((v) => (
              <Badge key={v.id} variant="neutral">
                {v.code} ({toNumber(v.modifier_pct) > 0 ? '+' : ''}
                {toNumber(v.modifier_pct).toFixed(1)}%)
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Buyers tab ─── */

/**
 * Buyer table with a stage-summary chipbar on top. The chipbar
 * counts buyers by status so the user gets a funnel view at a
 * glance even before scrolling the table. Clicking a chip filters
 * the table to that stage; clicking again clears.
 *
 * The table also gained:
 *  - A ``Plot`` column (plot_id resolved against the plots list)
 *  - Sticky header for long lists
 *  - Aria-sort affordance on the freeze-deadline column (sorted by
 *    deadline asc when present — overdue first)
 *  - Empty-filter fallback when a chip filter zeroes the result
 */
function BuyersTab({
  rows,
  plots,
  onSelect,
  onCreate,
}: {
  rows: Buyer[];
  plots: Plot[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const [stageFilter, setStageFilter] = useState<BuyerStatus | null>(null);
  const plotMap = useMemo(
    () => new Map(plots.map((p) => [p.id, p])),
    [plots],
  );
  const summary = useMemo(() => {
    const out: Record<BuyerStatus, number> = {
      lead: 0,
      reserved: 0,
      contracted: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const b of rows) out[b.status] = (out[b.status] ?? 0) + 1;
    return out;
  }, [rows]);
  const filteredRows = useMemo(() => {
    const filtered = stageFilter
      ? rows.filter((r) => r.status === stageFilter)
      : rows;
    // Sort: rows with a freeze deadline come first (closest deadline
    // → most urgent), then everything else by newest contract or
    // creation date. Stable so identical timestamps preserve order.
    return [...filtered].sort((a, b) => {
      const aFd = a.freeze_deadline ? new Date(a.freeze_deadline).getTime() : Infinity;
      const bFd = b.freeze_deadline ? new Date(b.freeze_deadline).getTime() : Infinity;
      return aFd - bFd;
    });
  }, [rows, stageFilter]);

  if (rows.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<Users size={22} />}
          title={t('propdev.empty_buyers', { defaultValue: 'No buyers yet' })}
          description={t('propdev.empty_buyers_desc', {
            defaultValue:
              'Register leads, track contracts and configure buyer selections.',
          })}
          action={{
            label: t('propdev.new_buyer', { defaultValue: 'New Buyer' }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stage funnel chipbar — clicking toggles the filter. */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label={t('propdev.stage_filter', {
          defaultValue: 'Filter buyers by stage',
        })}
      >
        {(BUYER_STAGE_ORDER as BuyerStatus[]).map((s) => {
          const active = stageFilter === s;
          const count = summary[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStageFilter(active ? null : s)}
              aria-pressed={active}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-oe-blue/40',
                active
                  ? 'border-oe-blue bg-oe-blue/10 text-oe-blue'
                  : 'border-border-light bg-surface-primary text-content-secondary hover:border-oe-blue hover:text-oe-blue',
              )}
            >
              <Badge variant={BUYER_VARIANT[s]} dot>
                {t(`propdev.stage_${s}`, {
                  defaultValue: s.charAt(0).toUpperCase() + s.slice(1),
                })}
              </Badge>
              <span className="font-mono tabular-nums text-content-tertiary">
                {count}
              </span>
            </button>
          );
        })}
        {stageFilter != null && (
          <button
            type="button"
            onClick={() => setStageFilter(null)}
            className="text-xs text-content-tertiary hover:text-oe-blue focus:outline-none focus:ring-2 focus:ring-oe-blue/40 rounded"
          >
            {t('common.clear', { defaultValue: 'Clear' })}
          </button>
        )}
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left">
                  {t('propdev.buyer', { defaultValue: 'Buyer' })}
                </th>
                <th className="px-4 py-2.5 text-left">
                  {t('propdev.email', { defaultValue: 'Email' })}
                </th>
                <th className="px-4 py-2.5 text-left">
                  {t('propdev.plot', { defaultValue: 'Plot' })}
                </th>
                <th className="px-4 py-2.5 text-left">
                  {t('propdev.stage', { defaultValue: 'Stage' })}
                </th>
                <th className="px-4 py-2.5 text-right">
                  {t('propdev.contract_value', { defaultValue: 'Contract' })}
                </th>
                <th
                  className="px-4 py-2.5 text-left"
                  aria-sort="ascending"
                >
                  {t('propdev.freeze_deadline', { defaultValue: 'Freeze' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-content-tertiary"
                  >
                    {t('propdev.no_buyers_for_stage', {
                      defaultValue: 'No buyers in this stage.',
                    })}
                  </td>
                </tr>
              ) : (
                filteredRows.map((b) => {
                  const days = daysUntil(b.freeze_deadline);
                  const plot = b.plot_id ? plotMap.get(b.plot_id) : null;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelect(b.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(b.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={t('propdev.open_buyer_aria', {
                        defaultValue: 'Open buyer {{name}}',
                        name: b.full_name || b.email || b.id,
                      })}
                      className="border-t border-border-light hover:bg-surface-secondary cursor-pointer focus:bg-surface-secondary focus:outline-none focus:ring-1 focus:ring-oe-blue/40"
                    >
                      <td className="px-4 py-2 font-medium">
                        {b.full_name || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-content-secondary">
                        {b.email}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {plot ? (
                          <span className="inline-flex items-center gap-1 font-mono text-content-secondary">
                            {plot.plot_number}
                          </span>
                        ) : (
                          <span className="text-content-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={BUYER_VARIANT[b.status]} dot>
                          {t(`propdev.stage_${b.status}`, {
                            defaultValue:
                              b.status.charAt(0).toUpperCase() +
                              b.status.slice(1),
                          })}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <MoneyDisplay
                          amount={toNumber(b.contract_value)}
                          currency={b.currency || undefined}
                        />
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {b.freeze_deadline ? (
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1',
                              days != null && days < 7
                                ? 'text-rose-600 font-medium'
                                : 'text-content-secondary',
                            )}
                          >
                            <Clock size={11} aria-hidden="true" />
                            {days != null ? (
                              days > 0 ? (
                                t('propdev.in_days', {
                                  defaultValue: 'in {{n}}d',
                                  n: days,
                                })
                              ) : (
                                t('propdev.overdue_days', {
                                  defaultValue: '{{n}}d overdue',
                                  n: Math.abs(days),
                                })
                              )
                            ) : (
                              <DateDisplay value={b.freeze_deadline} />
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ─── Handovers tab ─── */

function HandoversTab({ plots, buyers }: { plots: Plot[]; buyers: Buyer[] }) {
  const { t } = useTranslation();
  // Plots eligible for handover: anything past 'planned'. We intentionally
  // include reserved + under_construction so users can SCHEDULE a future
  // handover before the plot is physically ready (real-world workflow).
  const candidatePlots = plots.filter((p) =>
    ['reserved', 'under_construction', 'ready', 'sold', 'handed_over'].includes(p.status),
  );
  if (plots.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<Key size={22} />}
          title={t('propdev.empty_handovers_no_plots', {
            defaultValue: 'No plots in this development yet',
          })}
          description={t('propdev.empty_handovers_no_plots_desc', {
            defaultValue:
              'Create plots first (under the Plots tab) — handovers are scheduled per plot once a buyer is assigned.',
          })}
        />
      </Card>
    );
  }
  if (candidatePlots.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<Key size={22} />}
          title={t('propdev.empty_handovers', { defaultValue: 'No handovers scheduled' })}
          description={t('propdev.empty_handovers_desc', {
            defaultValue:
              'Handovers appear here once plots leave "planned" status. Move a plot to reserved or further and schedule its handover here.',
          })}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {candidatePlots.map((p) => {
        const buyer = buyers.find((b) => b.plot_id === p.id);
        return <HandoverPlotRow key={p.id} plot={p} buyer={buyer} />;
      })}
    </div>
  );
}

function HandoverPlotRow({ plot, buyer }: { plot: Plot; buyer: Buyer | undefined }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const handoversQ = useQuery({
    queryKey: ['propdev', 'handovers', plot.id],
    queryFn: () => listHandovers(plot.id),
    staleTime: 60_000,
  });
  const handovers = handoversQ.data ?? [];

  const [docModal, setDocModal] = useState<{
    type: PropDevDocType;
    handoverId?: string;
    contractId?: string;
  } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');

  const handoverId = handovers[0]?.id;

  const createMu = useMutation({
    mutationFn: () =>
      createHandover({
        plot_id: plot.id,
        scheduled_at: scheduledAt || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      addToast({
        type: 'success',
        title: t('propdev.handover_scheduled', { defaultValue: 'Handover scheduled' }),
      });
      qc.invalidateQueries({ queryKey: ['propdev', 'handovers', plot.id] });
      setScheduleOpen(false);
      setScheduledAt('');
      setNotes('');
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  const deleteMu = useMutation({
    mutationFn: (id: string) => deleteHandover(id),
    onSuccess: () => {
      addToast({
        type: 'success',
        title: t('propdev.handover_deleted', { defaultValue: 'Handover removed' }),
      });
      qc.invalidateQueries({ queryKey: ['propdev', 'handovers', plot.id] });
      qc.invalidateQueries({ queryKey: ['propdev', 'plots'] });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {t('propdev.plot_n', { defaultValue: 'Plot {{n}}', n: plot.plot_number })}
          </p>
          <p className="text-xs text-content-tertiary">
            {buyer ? buyer.full_name : t('propdev.no_buyer', { defaultValue: 'No buyer assigned' })}
          </p>
        </div>
        <Badge variant={PLOT_STATUS_VARIANT[plot.status]} dot>{plot.status}</Badge>
      </div>
      {handoversQ.isLoading ? (
        <p className="mt-2 text-xs text-content-tertiary">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : handovers.length === 0 ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-content-tertiary">
            {t('propdev.no_handovers', { defaultValue: 'No handover scheduled yet.' })}
          </p>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={12} />}
            onClick={() => setScheduleOpen(true)}
          >
            {t('propdev.schedule_handover', { defaultValue: 'Schedule handover' })}
          </Button>
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {handovers.map((h: Handover) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              {h.completed_at ? (
                <Badge variant="success" dot>
                  {t('propdev.completed', { defaultValue: 'Completed' })}
                </Badge>
              ) : (
                <Badge variant="warning" dot>
                  {t('propdev.scheduled', { defaultValue: 'Scheduled' })}
                </Badge>
              )}
              <span className="text-content-secondary">
                {h.scheduled_at ? <DateDisplay value={h.scheduled_at} /> : '—'}
              </span>
              {h.completed_at && (
                <span className="text-content-tertiary">
                  → <DateDisplay value={h.completed_at} />
                </span>
              )}
              {h.snag_count_at_handover > 0 && (
                <span className="text-amber-600">
                  · {h.snag_count_at_handover} {t('propdev.snags', { defaultValue: 'snags' })}
                </span>
              )}
              {!h.completed_at && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setCompleteOpen(h.id)}
                >
                  {t('propdev.mark_completed', { defaultValue: 'Mark completed' })}
                </Button>
              )}
              {!h.completed_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        t('propdev.confirm_delete_handover', {
                          defaultValue:
                            'Delete this scheduled handover? Linked snags will cascade.',
                        }),
                      )
                    ) {
                      deleteMu.mutate(h.id);
                    }
                  }}
                  disabled={deleteMu.isPending}
                >
                  {t('common.delete', { defaultValue: 'Delete' })}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Document-generation actions (R6 follow-up). Only shown when a
          handover record exists — that's the trigger for all three docs. */}
      {handoverId && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setDocModal({ type: 'handover_certificate', handoverId })
            }
          >
            {t('propdev.documents.generate_handover_certificate', {
              defaultValue: 'Generate handover certificate',
            })}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setDocModal({ type: 'warranty_certificate', handoverId })
            }
          >
            {t('propdev.documents.generate_warranty_certificate', {
              defaultValue: 'Generate warranty certificate',
            })}
          </Button>
        </div>
      )}
      {scheduleOpen && (
        <WideModal
          open
          onClose={() => setScheduleOpen(false)}
          title={t('propdev.schedule_handover', {
            defaultValue: 'Schedule handover',
          })}
          size="md"
          busy={createMu.isPending}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setScheduleOpen(false)}
                disabled={createMu.isPending}
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button
                variant="primary"
                onClick={() => createMu.mutate()}
                loading={createMu.isPending}
                icon={<Plus size={14} />}
              >
                {t('propdev.schedule_handover', {
                  defaultValue: 'Schedule handover',
                })}
              </Button>
            </>
          }
        >
          <WideModalSection columns={2}>
            <WideModalField
              label={t('propdev.scheduled_date', { defaultValue: 'Scheduled date' })}
              span={2}
            >
              <input
                type="date"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={inputCls}
              />
            </WideModalField>
            <WideModalField
              label={t('propdev.notes', { defaultValue: 'Notes' })}
              span={2}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCls}
                rows={3}
              />
            </WideModalField>
          </WideModalSection>
        </WideModal>
      )}
      {completeOpen && (
        <CompleteHandoverModal
          handoverId={completeOpen}
          plotId={plot.id}
          onClose={() => setCompleteOpen(null)}
        />
      )}
      {docModal && (
        <DocumentPreviewModal
          open
          onClose={() => setDocModal(null)}
          docType={docModal.type}
          handoverId={docModal.handoverId}
          contractId={docModal.contractId}
        />
      )}
    </Card>
  );
}

function CompleteHandoverModal({
  handoverId,
  plotId,
  onClose,
}: {
  handoverId: string;
  plotId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    completed_at: today,
    customer_signature_ref: '',
    keys_handed_over_at: today,
    final_check_passed: true,
    snag_count_at_handover: 0,
    notes: '',
  });
  const mu = useMutation({
    mutationFn: () =>
      completeHandover(handoverId, {
        completed_at: form.completed_at,
        customer_signature_ref: form.customer_signature_ref.trim(),
        keys_handed_over_at: form.keys_handed_over_at || undefined,
        final_check_passed: form.final_check_passed,
        snag_count_at_handover: Number(form.snag_count_at_handover) || 0,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      addToast({
        type: 'success',
        title: t('propdev.handover_completed', {
          defaultValue: 'Handover marked complete',
        }),
      });
      qc.invalidateQueries({ queryKey: ['propdev', 'handovers', plotId] });
      qc.invalidateQueries({ queryKey: ['propdev', 'plots'] });
      qc.invalidateQueries({ queryKey: ['propdev', 'buyers'] });
      onClose();
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  const canSubmit =
    !!form.completed_at && form.customer_signature_ref.trim().length > 0;
  return (
    <WideModal
      open
      onClose={onClose}
      title={t('propdev.complete_handover', {
        defaultValue: 'Complete handover',
      })}
      size="lg"
      busy={mu.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mu.isPending}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            onClick={() => mu.mutate()}
            loading={mu.isPending}
            disabled={!canSubmit}
            icon={<Check size={14} />}
          >
            {t('propdev.confirm_completion', {
              defaultValue: 'Confirm completion',
            })}
          </Button>
        </>
      }
    >
      <WideModalSection columns={2}>
        <WideModalField
          label={t('propdev.completed_at', { defaultValue: 'Completed at' })}
          required
        >
          <input
            type="date"
            value={form.completed_at}
            onChange={(e) => setForm({ ...form, completed_at: e.target.value })}
            className={inputCls}
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.keys_handed_over_at', {
            defaultValue: 'Keys handed over at',
          })}
        >
          <input
            type="date"
            value={form.keys_handed_over_at}
            onChange={(e) =>
              setForm({ ...form, keys_handed_over_at: e.target.value })
            }
            className={inputCls}
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.customer_signature_ref', {
            defaultValue: 'Customer signature ref',
          })}
          required
          span={2}
        >
          <input
            value={form.customer_signature_ref}
            onChange={(e) =>
              setForm({ ...form, customer_signature_ref: e.target.value })
            }
            className={inputCls}
            placeholder="SIG-2026-001 / DocuSign envelope id"
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.snag_count_at_handover', {
            defaultValue: 'Snag count at handover',
          })}
        >
          <input
            type="number"
            min={0}
            value={form.snag_count_at_handover}
            onChange={(e) =>
              setForm({
                ...form,
                snag_count_at_handover: Number(e.target.value) || 0,
              })
            }
            className={inputCls}
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.final_check_passed', {
            defaultValue: 'Final check passed',
          })}
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.final_check_passed}
              onChange={(e) =>
                setForm({ ...form, final_check_passed: e.target.checked })
              }
            />
            <span>
              {t('propdev.final_check_passed_help', {
                defaultValue:
                  'All required handover docs delivered & sign-off complete',
              })}
            </span>
          </label>
        </WideModalField>
        <WideModalField
          label={t('propdev.notes', { defaultValue: 'Notes' })}
          span={2}
        >
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={inputCls}
            rows={3}
          />
        </WideModalField>
      </WideModalSection>
    </WideModal>
  );
}

/* ─── Warranty tab ─── */

function WarrantyTab({
  buyers,
  plots,
  developmentId,
}: {
  buyers: Buyer[];
  plots: Plot[];
  developmentId: string;
}) {
  const { t } = useTranslation();
  const [filterBuyerId, setFilterBuyerId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);

  // Development-wide listing by default so the page always shows
  // something useful as soon as the user lands on it. The buyer
  // dropdown lets them narrow the slice without losing context.
  const claimsQ = useQuery({
    queryKey: [
      'propdev',
      'warranty',
      developmentId,
      filterBuyerId,
      filterStatus,
      filterSeverity,
    ],
    queryFn: () =>
      filterBuyerId
        ? listWarrantyClaims({
            buyer_id: filterBuyerId,
            status: filterStatus || undefined,
          })
        : listWarrantyClaims({
            development_id: developmentId,
            status: filterStatus || undefined,
            severity: filterSeverity || undefined,
          }),
    enabled: !!developmentId,
  });
  const claims = claimsQ.data ?? [];
  const plotMap = new Map(plots.map((p) => [p.id, p]));
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const action = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: 'accept' | 'reject' | 'close' }) => {
      if (kind === 'accept') return acceptWarrantyClaim(id);
      if (kind === 'reject') return rejectWarrantyClaim(id);
      return closeWarrantyClaim(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propdev', 'warranty'] });
      addToast({
        type: 'success',
        title: t('propdev.warranty_updated', { defaultValue: 'Claim updated' }),
      });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  if (!developmentId) {
    return (
      <Card padding="md">
        <EmptyState
          icon={<ShieldAlert size={22} />}
          title={t('propdev.warranty.pick_dev_title', {
            defaultValue: 'Pick a development first',
          })}
          description={t('propdev.warranty.pick_dev_desc', {
            defaultValue:
              'Warranty claims are listed per development — pick one from the Developments tab to see its open claims.',
          })}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-content-tertiary">
            <span className="block mb-1">
              {t('propdev.warranty.filter_buyer', { defaultValue: 'Buyer' })}
            </span>
            <select
              value={filterBuyerId}
              onChange={(e) => setFilterBuyerId(e.target.value)}
              className={clsx(inputCls, 'max-w-[260px]')}
            >
              <option value="">
                {t('propdev.warranty.filter_all_buyers', {
                  defaultValue: 'All buyers',
                })}
              </option>
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.full_name} — {b.email}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-content-tertiary">
            <span className="block mb-1">
              {t('propdev.warranty.filter_status', { defaultValue: 'Status' })}
            </span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={clsx(inputCls, 'max-w-[180px]')}
            >
              <option value="">{t('propdev.warranty.filter_all', { defaultValue: 'All' })}</option>
              <option value="raised">{t('propdev.warranty.status_raised', { defaultValue: 'Raised' })}</option>
              <option value="under_review">{t('propdev.warranty.status_under_review', { defaultValue: 'Under review' })}</option>
              <option value="accepted">{t('propdev.warranty.status_accepted', { defaultValue: 'Accepted' })}</option>
              <option value="rejected">{t('propdev.warranty.status_rejected', { defaultValue: 'Rejected' })}</option>
              <option value="closed">{t('propdev.warranty.status_closed', { defaultValue: 'Closed' })}</option>
            </select>
          </label>
          {!filterBuyerId && (
            <label className="text-xs text-content-tertiary">
              <span className="block mb-1">
                {t('propdev.warranty.filter_severity', {
                  defaultValue: 'Severity',
                })}
              </span>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className={clsx(inputCls, 'max-w-[160px]')}
              >
                <option value="">{t('propdev.warranty.filter_all', { defaultValue: 'All' })}</option>
                <option value="minor">{t('propdev.warranty.severity_minor', { defaultValue: 'Minor' })}</option>
                <option value="major">{t('propdev.warranty.severity_major', { defaultValue: 'Major' })}</option>
                <option value="critical">{t('propdev.warranty.severity_critical', { defaultValue: 'Critical' })}</option>
              </select>
            </label>
          )}
        </div>
        <Button
          variant="primary"
          onClick={() => setCreateOpen(true)}
          disabled={buyers.length === 0 || plots.length === 0}
        >
          <Plus size={14} className="mr-1" />
          {t('propdev.warranty.new_claim', { defaultValue: 'New claim' })}
        </Button>
      </div>

      {claimsQ.isLoading ? (
        <Card padding="md">
          <SkeletonTable rows={3} columns={6} />
        </Card>
      ) : claims.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<ShieldAlert size={22} />}
            title={t('propdev.warranty.empty_title', {
              defaultValue: 'No warranty claims',
            })}
            description={t('propdev.warranty.empty_desc', {
              defaultValue:
                'No claims match the current filters. Use "New claim" to raise one for a buyer.',
            })}
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">{t('propdev.plot', { defaultValue: 'Plot' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('propdev.warranty.buyer', { defaultValue: 'Buyer' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('propdev.category', { defaultValue: 'Category' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('propdev.warranty.severity', { defaultValue: 'Severity' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('propdev.description', { defaultValue: 'Description' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('propdev.status', { defaultValue: 'Status' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('propdev.warranty.in_warranty', { defaultValue: 'In warranty' })}</th>
                  <th className="px-4 py-2.5 text-right">{t('common.actions', { defaultValue: 'Actions' })}</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c: WarrantyClaim) => {
                  const plot = plotMap.get(c.plot_id);
                  const buyer = buyerMap.get(c.buyer_id);
                  return (
                    <tr key={c.id} className="border-t border-border-light">
                      <td className="px-4 py-2 text-xs">{plot?.plot_number ?? '—'}</td>
                      <td className="px-4 py-2 text-xs">{buyer?.full_name ?? '—'}</td>
                      <td className="px-4 py-2 text-xs uppercase">{c.category}</td>
                      <td className="px-4 py-2 text-xs uppercase">
                        <Badge
                          variant={
                            c.severity === 'critical'
                              ? 'error'
                              : c.severity === 'major'
                                ? 'warning'
                                : 'neutral'
                          }
                          dot
                        >
                          {c.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 max-w-[320px] truncate" title={c.description}>
                        {c.description}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={WARRANTY_VARIANT[c.status]} dot>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {c.is_in_warranty ? (
                          <Badge variant="success" dot>
                            {t('propdev.warranty.in_warranty_yes', { defaultValue: 'Yes' })}
                          </Badge>
                        ) : (
                          <span className="text-content-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-1 items-center">
                          <a
                            href={warrantyClaimPdfUrl(c.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-oe-blue hover:underline px-2 py-1"
                            title={t('propdev.warranty.pdf', { defaultValue: 'Download PDF' })}
                          >
                            PDF
                          </a>
                          {c.status === 'raised' && (
                            <>
                              <Button variant="secondary" onClick={() => action.mutate({ id: c.id, kind: 'accept' })}>
                                {t('propdev.accept', { defaultValue: 'Accept' })}
                              </Button>
                              <Button variant="ghost" onClick={() => action.mutate({ id: c.id, kind: 'reject' })}>
                                {t('propdev.reject', { defaultValue: 'Reject' })}
                              </Button>
                            </>
                          )}
                          {(c.status === 'accepted' || c.status === 'under_review') && (
                            <Button variant="secondary" onClick={() => action.mutate({ id: c.id, kind: 'close' })}>
                              {t('propdev.close', { defaultValue: 'Close' })}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && (
        <CreateWarrantyClaimModal
          buyers={buyers}
          plots={plots}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ['propdev', 'warranty'] });
          }}
        />
      )}
    </div>
  );
}

function CreateWarrantyClaimModal({
  buyers,
  plots,
  onClose,
  onCreated,
}: {
  buyers: Buyer[];
  plots: Plot[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [form, setForm] = useState<{
    buyer_id: string;
    plot_id: string;
    category: WarrantyCategory;
    severity: WarrantySeverity;
    description: string;
    sla_deadline: string;
  }>({
    buyer_id: buyers[0]?.id ?? '',
    plot_id: '',
    category: 'defect',
    severity: 'minor',
    description: '',
    sla_deadline: '',
  });

  const buyer = buyers.find((b) => b.id === form.buyer_id);
  const buyerPlots =
    buyer?.plot_id
      ? plots.filter((p) => p.id === buyer.plot_id)
      : plots;

  useEffect(() => {
    if (!form.plot_id && buyer?.plot_id) {
      setForm((f) => ({ ...f, plot_id: buyer.plot_id ?? '' }));
    }
  }, [form.plot_id, buyer?.plot_id]);

  const mut = useMutation({
    mutationFn: () =>
      createWarrantyClaim({
        buyer_id: form.buyer_id,
        plot_id: form.plot_id,
        category: form.category,
        severity: form.severity,
        description: form.description,
        sla_deadline: form.sla_deadline || null,
      }),
    onSuccess: () => {
      addToast({
        type: 'success',
        title: t('propdev.warranty.created', { defaultValue: 'Claim created' }),
      });
      onCreated();
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  const canSubmit =
    !!form.buyer_id &&
    !!form.plot_id &&
    form.description.trim().length > 0 &&
    !mut.isPending;

  return (
    <WideModal
      open
      onClose={onClose}
      title={t('propdev.warranty.new_claim', { defaultValue: 'New claim' })}
    >
      <div className="space-y-3 p-5">
        <label className="block text-sm">
          <span className="block mb-1 text-content-secondary">
            {t('propdev.warranty.buyer', { defaultValue: 'Buyer' })}
          </span>
          <select
            value={form.buyer_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, buyer_id: e.target.value, plot_id: '' }))
            }
            className={clsx(inputCls, 'w-full')}
          >
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.full_name} — {b.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-content-secondary">
            {t('propdev.warranty.plot', { defaultValue: 'Plot' })}
          </span>
          <select
            value={form.plot_id}
            onChange={(e) => setForm((f) => ({ ...f, plot_id: e.target.value }))}
            className={clsx(inputCls, 'w-full')}
          >
            <option value="">
              {t('propdev.warranty.pick_plot', { defaultValue: 'Pick a plot…' })}
            </option>
            {buyerPlots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.plot_number}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block mb-1 text-content-secondary">
              {t('propdev.category', { defaultValue: 'Category' })}
            </span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as WarrantyCategory,
                }))
              }
              className={clsx(inputCls, 'w-full')}
            >
              <option value="defect">{t('propdev.warranty.cat_defect', { defaultValue: 'Defect' })}</option>
              <option value="structural">{t('propdev.warranty.cat_structural', { defaultValue: 'Structural' })}</option>
              <option value="cosmetic">{t('propdev.warranty.cat_cosmetic', { defaultValue: 'Cosmetic' })}</option>
              <option value="mep">{t('propdev.warranty.cat_mep', { defaultValue: 'MEP' })}</option>
              <option value="service">{t('propdev.warranty.cat_service', { defaultValue: 'Service' })}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="block mb-1 text-content-secondary">
              {t('propdev.warranty.severity', { defaultValue: 'Severity' })}
            </span>
            <select
              value={form.severity}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  severity: e.target.value as WarrantySeverity,
                }))
              }
              className={clsx(inputCls, 'w-full')}
            >
              <option value="minor">{t('propdev.warranty.severity_minor', { defaultValue: 'Minor' })}</option>
              <option value="major">{t('propdev.warranty.severity_major', { defaultValue: 'Major' })}</option>
              <option value="critical">{t('propdev.warranty.severity_critical', { defaultValue: 'Critical' })}</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="block mb-1 text-content-secondary">
            {t('propdev.description', { defaultValue: 'Description' })}
          </span>
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={4}
            className={clsx(inputCls, 'w-full')}
            placeholder={t('propdev.warranty.describe', {
              defaultValue: 'Describe the defect, observed symptoms, location…',
            })}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-content-secondary">
            {t('propdev.warranty.sla_deadline', { defaultValue: 'SLA deadline (optional)' })}
          </span>
          <input
            type="date"
            value={form.sla_deadline}
            onChange={(e) =>
              setForm((f) => ({ ...f, sla_deadline: e.target.value }))
            }
            className={clsx(inputCls, 'w-full max-w-[220px]')}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            onClick={() => mut.mutate()}
            disabled={!canSubmit}
          >
            {mut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : (
              <Plus size={14} className="mr-1" />
            )}
            {t('propdev.warranty.file_claim', { defaultValue: 'File claim' })}
          </Button>
        </div>
      </div>
    </WideModal>
  );
}

/* ─── Plot detail drawer ─── */

function PlotDetailDrawer({
  plotId,
  plots,
  houseTypes,
  onClose,
}: {
  plotId: string;
  plots: Plot[];
  houseTypes: HouseType[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const plot = plots.find((p) => p.id === plotId);
  const ht = plot?.house_type_id ? houseTypes.find((h) => h.id === plot.house_type_id) : null;
  // SideDrawer owns the Escape handler + portal + focus trap + body
  // scroll lock + ``role=dialog`` chrome. Returning ``open={false}`` if
  // the plot has not resolved yet keeps the unmount path clean — when
  // the buyers/plots query refetches behind an open drawer and the row
  // briefly disappears, the drawer drops back to the closed state
  // gracefully instead of throwing inside the render tree (R6
  // insertBefore regression).
  return (
    <SideDrawer
      open={!!plot}
      onClose={onClose}
      widthClass="max-w-lg"
      aria-labelledby="propdev-plot-drawer-title"
      title={
        plot
          ? t('propdev.plot_n', { defaultValue: 'Plot {{n}}', n: plot.plot_number })
          : ''
      }
    >
      {plot && (
        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <Badge variant={PLOT_STATUS_VARIANT[plot.status]} dot>{plot.status}</Badge>
            <span className="text-xs text-content-tertiary">
              {Math.round(toNumber(plot.construction_status_percent))}% {t('propdev.built', { defaultValue: 'built' })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label={t('propdev.house_type', { defaultValue: 'House Type' })} value={ht?.name || ht?.code || '—'} />
            <Field label={t('propdev.area', { defaultValue: 'Area' })} value={`${toNumber(plot.area_m2).toFixed(1)} m²`} />
            <Field label={t('propdev.orientation', { defaultValue: 'Orientation' })} value={plot.orientation || '—'} />
            <Field
              label={t('propdev.garden', { defaultValue: 'Garden' })}
              value={plot.garden_area_m2 != null ? `${toNumber(plot.garden_area_m2).toFixed(1)} m²` : '—'}
            />
            <Field
              label={t('propdev.base_price', { defaultValue: 'Base price' })}
              value={<MoneyDisplay amount={toNumber(plot.price_base)} currency={plot.currency || undefined} />}
            />
            <Field
              label={t('propdev.reserved_until', { defaultValue: 'Reserved until' })}
              value={plot.reservation_deadline ? <DateDisplay value={plot.reservation_deadline} /> : '—'}
            />
          </div>
          {plot.status === 'planned' && (
            <ReserveBlock plotId={plot.id} onSuccess={onClose} />
          )}
        </div>
      )}
    </SideDrawer>
  );
}

function ReserveBlock({ plotId, onSuccess }: { plotId: string; onSuccess: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    reservation_deadline: todayIso(30),
  });
  const mut = useMutation({
    mutationFn: () => reservePlot(plotId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propdev', 'plots'] });
      qc.invalidateQueries({ queryKey: ['propdev', 'buyers'] });
      addToast({ type: 'success', title: t('propdev.plot_reserved', { defaultValue: 'Plot reserved' }) });
      onSuccess();
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  return (
    <Card padding="sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary mb-2">
        {t('propdev.reserve_plot', { defaultValue: 'Reserve plot' })}
      </p>
      <div className="space-y-2">
        <input
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder={t('propdev.full_name', { defaultValue: 'Full name' })}
          className={inputCls}
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder={t('propdev.email', { defaultValue: 'Email' })}
          className={inputCls}
        />
        <input
          type="date"
          value={form.reservation_deadline}
          onChange={(e) => setForm({ ...form, reservation_deadline: e.target.value })}
          className={inputCls}
        />
        <Button
          variant="primary"
          icon={mut.isPending ? <Loader2 size={14} /> : <Check size={14} />}
          loading={mut.isPending}
          onClick={() => mut.mutate()}
          disabled={!form.full_name || !form.email}
        >
          {t('propdev.reserve', { defaultValue: 'Reserve' })}
        </Button>
      </div>
    </Card>
  );
}

/* ─── Buyer detail drawer with stage progression ─── */

function BuyerDetailDrawer({
  buyerId,
  buyers,
  plots,
  developmentId,
  onClose,
}: {
  buyerId: string;
  buyers: Buyer[];
  plots: Plot[];
  developmentId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Role-gated edit affordance. The backend ``property_dev.update``
  // permission resolves to EDITOR+ via the central permission registry —
  // mirror that gate here so viewers don't even see the button.
  // Mirrors the check used in /admin/permissions and elsewhere; admins,
  // managers and editors get write access.
  const userRole = useAuthStore((s) => s.userRole);
  const canEdit = useMemo(() => {
    if (!userRole) return false;
    const normalized = userRole.toLowerCase();
    return ['admin', 'superuser', 'owner', 'manager', 'editor'].includes(normalized);
  }, [userRole]);
  const [editOpen, setEditOpen] = useState(false);
  const buyer = buyers.find((b) => b.id === buyerId);
  const plot = buyer?.plot_id ? plots.find((p) => p.id === buyer.plot_id) : null;
  const selectionsQ = useQuery({
    queryKey: ['propdev', 'selections', buyerId],
    queryFn: () => listSelections(buyerId),
    enabled: !!buyer,
  });
  const items = selectionsQ.data ?? [];
  const freezeDays = daysUntil(buyer?.freeze_deadline);
  // SideDrawer owns Escape; suppress it via ``busy`` while the
  // EditBuyerModal is open so its own Escape handler can close the
  // nested modal without also collapsing the drawer underneath. The
  // EditBuyerModal still attaches its handler at capture phase so it
  // wins the race for the keystroke.
  const headerActions = canEdit ? (
    <button
      type="button"
      onClick={() => setEditOpen(true)}
      className="inline-flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs font-medium text-content-secondary hover:bg-surface-secondary hover:text-content-primary"
      data-testid="open-edit-buyer"
    >
      <Pencil size={12} />
      {t('propdev.edit_buyer', { defaultValue: 'Edit' })}
    </button>
  ) : null;
  return (
    <SideDrawer
      open={!!buyer}
      onClose={onClose}
      widthClass="max-w-xl"
      busy={editOpen}
      aria-labelledby="propdev-buyer-drawer-title"
      title={buyer ? buyer.full_name || buyer.email : ''}
      subtitle={buyer?.email}
      headerActions={headerActions}
    >
      {buyer && (
        <>
          {editOpen && (
            <EditBuyerModal
              open={editOpen}
              buyer={buyer}
              plots={plots}
              developmentId={developmentId}
              onClose={() => setEditOpen(false)}
            />
          )}
          <div className="space-y-4 p-5">
          <StageProgress current={buyer.status} />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field
              label={t('propdev.plot', { defaultValue: 'Plot' })}
              value={plot ? plot.plot_number : '—'}
            />
            <Field
              label={t('propdev.contract_value', { defaultValue: 'Contract' })}
              value={
                <MoneyDisplay
                  amount={toNumber(buyer.contract_value)}
                  currency={buyer.currency || undefined}
                />
              }
            />
            <Field
              label={t('propdev.signed', { defaultValue: 'Signed' })}
              value={buyer.contract_signed_at ? <DateDisplay value={buyer.contract_signed_at} /> : '—'}
            />
            <Field
              label={t('propdev.deposit', { defaultValue: 'Deposit' })}
              value={buyer.deposit_paid_at ? <DateDisplay value={buyer.deposit_paid_at} /> : '—'}
            />
          </div>

          {buyer.freeze_deadline && freezeDays != null && (
            <Card padding="sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                    {t('propdev.freeze_deadline', { defaultValue: 'Freeze deadline' })}
                  </p>
                  <p className="mt-0.5 text-sm">
                    <DateDisplay value={buyer.freeze_deadline} />
                  </p>
                </div>
                <div className={clsx(
                  'rounded-lg px-3 py-2 text-center',
                  freezeDays < 0
                    ? 'bg-rose-100 text-rose-800'
                    : freezeDays < 7
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-sky-100 text-sky-800',
                )}>
                  <p className="text-2xl font-semibold leading-none">
                    {Math.abs(freezeDays)}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide">
                    {freezeDays < 0
                      ? t('propdev.days_overdue', { defaultValue: 'days overdue' })
                      : t('propdev.days_left', { defaultValue: 'days left' })}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary mb-2">
              {t('propdev.selections', { defaultValue: 'Buyer selections' })}
            </p>
            {selectionsQ.isLoading ? (
              <SkeletonTable rows={2} columns={3} />
            ) : items.length === 0 ? (
              <p className="text-sm text-content-tertiary">
                {t('propdev.no_selections', { defaultValue: 'No selections recorded yet.' })}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded border border-border-light px-3 py-2 text-sm">
                    <span>
                      <Badge variant={s.status === 'locked' ? 'success' : 'neutral'}>{s.status}</Badge>
                      <span className="ml-2 text-content-secondary text-xs">
                        <DateDisplay value={s.created_at} />
                      </span>
                    </span>
                    <span className="font-medium">
                      <MoneyDisplay amount={toNumber(s.total_options_value)} currency={buyer.currency || undefined} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cross-module quick-links — the buyer record sits at the
              centre of a small graph (plot ↔ contract ↔ finance ↔
              handover). Surface that graph as a stack of links so the
              user can jump across modules without leaving the drawer.
              Each link uses ``react-router`` so the SPA navigates
              client-side. */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary mb-2">
              {t('propdev.related', { defaultValue: 'Related records' })}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {plot && (
                <li>
                  <Link
                    to={`/property-dev/developments/${developmentId}/geo?plot=${encodeURIComponent(plot.id)}`}
                    className="group flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-xs hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
                  >
                    <span className="flex items-center gap-2">
                      <Grid3X3
                        size={12}
                        className="text-content-tertiary group-hover:text-oe-blue"
                      />
                      <span>
                        {t('propdev.view_plot_on_map', {
                          defaultValue: 'Plot {{n}} on map',
                          n: plot.plot_number,
                        })}
                      </span>
                    </span>
                    <ArrowRight
                      size={11}
                      className="text-content-tertiary group-hover:text-oe-blue"
                    />
                  </Link>
                </li>
              )}
              <li>
                <Link
                  to="/finance"
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-xs hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
                >
                  <span className="flex items-center gap-2">
                    <Wallet
                      size={12}
                      className="text-content-tertiary group-hover:text-oe-blue"
                    />
                    <span>
                      {t('propdev.view_finance', {
                        defaultValue: 'Finance & payments',
                      })}
                    </span>
                  </span>
                  <ArrowRight
                    size={11}
                    className="text-content-tertiary group-hover:text-oe-blue"
                  />
                </Link>
              </li>
              <li>
                <Link
                  to="/contracts"
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-xs hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
                >
                  <span className="flex items-center gap-2">
                    <FileSignature
                      size={12}
                      className="text-content-tertiary group-hover:text-oe-blue"
                    />
                    <span>
                      {t('propdev.view_contracts', {
                        defaultValue: 'Sales contracts',
                      })}
                    </span>
                  </span>
                  <ArrowRight
                    size={11}
                    className="text-content-tertiary group-hover:text-oe-blue"
                  />
                </Link>
              </li>
              <li>
                <Link
                  to="/crm"
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-xs hover:border-oe-blue hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-oe-blue/40"
                >
                  <span className="flex items-center gap-2">
                    <Users
                      size={12}
                      className="text-content-tertiary group-hover:text-oe-blue"
                    />
                    <span>
                      {t('propdev.view_crm', {
                        defaultValue: 'Open in CRM',
                      })}
                    </span>
                  </span>
                  <ArrowRight
                    size={11}
                    className="text-content-tertiary group-hover:text-oe-blue"
                  />
                </Link>
              </li>
            </ul>
          </div>

          {buyer.status === 'reserved' && (
            <ContractBuyerBlock buyer={buyer} />
          )}
        </div>
        </>
      )}
    </SideDrawer>
  );
}

function StageProgress({ current }: { current: BuyerStatus }) {
  const { t } = useTranslation();
  const labels: Record<BuyerStatus, string> = {
    lead: t('propdev.stage_lead', { defaultValue: 'Lead' }),
    reserved: t('propdev.stage_reserved', { defaultValue: 'Reserved' }),
    contracted: t('propdev.stage_contracted', { defaultValue: 'Contracted' }),
    completed: t('propdev.stage_handover', { defaultValue: 'Handover' }),
    cancelled: t('propdev.stage_cancelled', { defaultValue: 'Cancelled' }),
  };
  if (current === 'cancelled') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-800">
        {labels.cancelled}
      </div>
    );
  }
  const idx = BUYER_STAGE_ORDER.indexOf(current);
  return (
    <div className="flex items-center justify-between gap-1">
      {BUYER_STAGE_ORDER.map((s, i) => {
        const active = i <= idx;
        const reached = i < idx;
        return (
          <div key={s} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold',
                active
                  ? 'border-oe-blue bg-oe-blue text-white'
                  : 'border-border bg-surface-primary text-content-tertiary',
              )}>
                {reached ? <Check size={12} /> : i + 1}
              </div>
              <span className={clsx(
                'mt-1 text-[10px] uppercase tracking-wide truncate max-w-full',
                active ? 'text-content-primary font-medium' : 'text-content-tertiary',
              )}>
                {labels[s]}
              </span>
            </div>
            {i < BUYER_STAGE_ORDER.length - 1 && (
              <div className={clsx(
                'h-0.5 flex-1 -mt-4',
                i < idx ? 'bg-oe-blue' : 'bg-border',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContractBuyerBlock({ buyer }: { buyer: Buyer }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const prefCurrency = usePreferencesStore((s) => s.currency);
  const [form, setForm] = useState({
    contract_value: String(toNumber(buyer.contract_value)),
    currency: buyer.currency || prefCurrency,
    contract_signed_at: todayIso(),
    freeze_deadline: todayIso(60),
  });
  const mut = useMutation({
    mutationFn: () =>
      contractBuyer(buyer.id, {
        contract_value: Number(form.contract_value) || 0,
        currency: form.currency,
        contract_signed_at: form.contract_signed_at,
        freeze_deadline: form.freeze_deadline,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propdev', 'buyers'] });
      addToast({ type: 'success', title: t('propdev.contract_signed', { defaultValue: 'Contract signed' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  return (
    <Card padding="sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary mb-2">
        {t('propdev.sign_contract', { defaultValue: 'Sign contract' })}
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            value={form.contract_value}
            onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
            placeholder={t('propdev.contract_value', { defaultValue: 'Contract value' })}
            className={inputCls}
          />
          <input
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            placeholder={prefCurrency}
            className={inputCls}
            maxLength={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{t('propdev.signed', { defaultValue: 'Signed' })}</label>
            <input
              type="date"
              value={form.contract_signed_at}
              onChange={(e) => setForm({ ...form, contract_signed_at: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t('propdev.freeze_deadline', { defaultValue: 'Freeze deadline' })}</label>
            <input
              type="date"
              value={form.freeze_deadline}
              onChange={(e) => setForm({ ...form, freeze_deadline: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
        <Button
          variant="primary"
          icon={mut.isPending ? <Loader2 size={14} /> : <Check size={14} />}
          loading={mut.isPending}
          onClick={() => mut.mutate()}
        >
          {t('propdev.contract', { defaultValue: 'Contract' })}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-content-primary">{value}</p>
    </div>
  );
}

/* ─── Create modal ─── */

function CreateModal({
  kind,
  developmentId,
  developments,
  houseTypes,
  onClose,
}: {
  kind: Tab;
  developmentId: string;
  developments: Development[];
  houseTypes: HouseType[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const prefCurrency = usePreferencesStore((s) => s.currency);
  const [busy, setBusy] = useState(false);

  const projectsQ = useQuery({
    queryKey: ['propdev', 'projects-lite'],
    queryFn: listProjectsLite,
    enabled: kind === 'developments',
    staleTime: 60_000,
  });
  const projectOptions = projectsQ.data ?? [];

  const [devForm, setDevForm] = useState({
    project_id: '',
    code: '',
    name: '',
    total_plots: 0,
  });
  // Plot form. development_id is implicit (taken from the page's
  // selected development at submit time) — the picker UI was removed
  // because the user already chooses a development at the top of the
  // page, and forcing them to re-pick it inside every create form is a
  // friction the user explicitly called out.
  const [plotForm, setPlotForm] = useState({
    plot_number: '',
    house_type_id: '',
    house_type_label: '',
    status: 'planned' as PlotStatus,
    // Position
    level_in_block: '',
    position_on_floor: '',
    // Dimensions
    area_m2: '0',
    balcony_area_m2: '',
    garden_area_m2: '',
    storage_area_m2: '',
    bedrooms: '0',
    bathrooms: '0',
    parking_spaces: '0',
    // Orientation / view
    orientation: '',
    view_type: '',
    sun_exposure_hours: '',
    // Pricing
    price_base: '0',
    currency: prefCurrency,
  });
  const [htForm, setHtForm] = useState({
    development_id: developmentId,
    code: '',
    name: '',
    bedrooms: 3,
    total_area_m2: '120',
    base_price: '0',
    currency: prefCurrency,
  });
  const [buyerForm, setBuyerForm] = useState({
    development_id: developmentId,
    full_name: '',
    email: '',
    phone: '',
  });

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === 'developments') {
        if (!devForm.project_id) throw new Error('Project ID required');
        if (!devForm.code) throw new Error('Code required');
        await createDevelopment({
          project_id: devForm.project_id,
          code: devForm.code,
          name: devForm.name,
          total_plots: devForm.total_plots,
        });
        addToast({ type: 'success', title: t('propdev.development_created', { defaultValue: 'Development created' }) });
        qc.invalidateQueries({ queryKey: ['propdev', 'developments'] });
      } else if (kind === 'plots') {
        // development_id is taken from the page-level selection (the
        // user picks a development at the top of the page; we do not
        // ask them to pick it again here).
        if (!developmentId) {
          throw new Error(
            t('propdev.select_development_first', {
              defaultValue: 'Select a development at the top of the page first.',
            }),
          );
        }
        if (!plotForm.plot_number) {
          throw new Error(
            t('propdev.plot_number_required', {
              defaultValue: 'Plot number is required.',
            }),
          );
        }
        // Only send optional fields when the user actually entered
        // something. An empty string in a numeric input would otherwise
        // serialize as 0 and overwrite the model default (e.g.
        // "no balcony" vs "0 m² balcony"). For numeric fields with a
        // 0 default (bedrooms etc.) we keep sending 0 so the explicit
        // zero round-trips.
        const optNum = (v: string): number | undefined => {
          const trimmed = v.trim();
          if (!trimmed) return undefined;
          const n = Number(trimmed);
          return Number.isFinite(n) ? n : undefined;
        };
        const optStr = (v: string): string | undefined => {
          const trimmed = v.trim();
          return trimmed ? trimmed : undefined;
        };
        await createPlot({
          development_id: developmentId,
          plot_number: plotForm.plot_number,
          house_type_id: plotForm.house_type_id || undefined,
          house_type_label: optStr(plotForm.house_type_label),
          status: plotForm.status,
          level_in_block: optNum(plotForm.level_in_block),
          position_on_floor: optStr(plotForm.position_on_floor),
          orientation: optStr(plotForm.orientation),
          view_type: optStr(plotForm.view_type),
          area_m2: Number(plotForm.area_m2) || 0,
          balcony_area_m2: optNum(plotForm.balcony_area_m2),
          garden_area_m2: optNum(plotForm.garden_area_m2),
          storage_area_m2: optNum(plotForm.storage_area_m2),
          bedrooms: Number(plotForm.bedrooms) || 0,
          bathrooms: Number(plotForm.bathrooms) || 0,
          parking_spaces: Number(plotForm.parking_spaces) || 0,
          sun_exposure_hours: optNum(plotForm.sun_exposure_hours),
          price_base: Number(plotForm.price_base) || 0,
          currency: plotForm.currency,
        });
        addToast({ type: 'success', title: t('propdev.plot_created', { defaultValue: 'Plot created' }) });
        qc.invalidateQueries({ queryKey: ['propdev', 'plots'] });
      } else if (kind === 'house_types') {
        if (!htForm.development_id) throw new Error('Development required');
        if (!htForm.code) throw new Error('Code required');
        await createHouseType({
          development_id: htForm.development_id,
          code: htForm.code,
          name: htForm.name,
          bedrooms: htForm.bedrooms,
          total_area_m2: Number(htForm.total_area_m2) || 0,
          base_price: Number(htForm.base_price) || 0,
          currency: htForm.currency,
        });
        addToast({ type: 'success', title: t('propdev.house_type_created', { defaultValue: 'House type created' }) });
        qc.invalidateQueries({ queryKey: ['propdev', 'house-types'] });
      } else if (kind === 'buyers') {
        if (!buyerForm.development_id) throw new Error('Development required');
        if (!buyerForm.email) throw new Error('Email required');
        await createBuyer({
          development_id: buyerForm.development_id,
          full_name: buyerForm.full_name,
          email: buyerForm.email,
          phone: buyerForm.phone || undefined,
        });
        addToast({ type: 'success', title: t('propdev.buyer_created', { defaultValue: 'Buyer created' }) });
        qc.invalidateQueries({ queryKey: ['propdev', 'buyers'] });
      } else {
        throw new Error('Not supported');
      }
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const title =
    kind === 'developments'
      ? t('propdev.new_development', { defaultValue: 'New Development' })
      : kind === 'plots'
        ? t('propdev.new_plot', { defaultValue: 'New Plot' })
        : kind === 'house_types'
          ? t('propdev.new_house_type', { defaultValue: 'New House Type' })
          : kind === 'buyers'
            ? t('propdev.new_buyer', { defaultValue: 'New Buyer' })
            : t('common.create', { defaultValue: 'Create' });

  // house_types uses a triplet (bedrooms/area/base_price); xl gives it
  // room. The other variants have ≤ 4 short fields, lg is enough.
  // plots form has 5 sections (ID / position / dimensions / view /
  // pricing) so it wants the same xl width as house_types.
  const size = kind === 'house_types' || kind === 'plots' ? 'xl' : 'lg';

  return (
    <WideModal
      open
      onClose={onClose}
      title={title}
      size={size}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            icon={busy ? <Loader2 size={14} /> : <Plus size={14} />}
          >
            {t('common.create', { defaultValue: 'Create' })}
          </Button>
        </>
      }
    >
      {kind === 'developments' && (
        <WideModalSection columns={2}>
          <WideModalField
            label={t('propdev.project', { defaultValue: 'Project' })}
            required
            span={2}
          >
            <select
              value={devForm.project_id}
              onChange={(e) => setDevForm({ ...devForm, project_id: e.target.value })}
              className={inputCls}
            >
              <option value="">
                — {t('common.select', { defaultValue: 'Select' })} —
              </option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </WideModalField>
          <WideModalField
            label={t('propdev.code', { defaultValue: 'Code' })}
            required
          >
            <input
              value={devForm.code}
              onChange={(e) => setDevForm({ ...devForm, code: e.target.value })}
              className={inputCls}
              placeholder="DEV-001"
            />
          </WideModalField>
          <WideModalField label={t('propdev.name', { defaultValue: 'Name' })}>
            <input
              value={devForm.name}
              onChange={(e) => setDevForm({ ...devForm, name: e.target.value })}
              className={inputCls}
            />
          </WideModalField>
          <WideModalField
            label={t('propdev.total_plots', { defaultValue: 'Total plots' })}
            span={2}
          >
            <input
              type="number"
              value={devForm.total_plots}
              onChange={(e) =>
                setDevForm({ ...devForm, total_plots: Number(e.target.value) || 0 })
              }
              className={inputCls}
              min={0}
            />
          </WideModalField>
        </WideModalSection>
      )}
      {kind === 'plots' && (
        <PlotFormBody
          plotForm={plotForm}
          setPlotForm={setPlotForm}
          houseTypes={houseTypes}
          activeDevelopment={developments.find((d) => d.id === developmentId)}
          hasDevelopment={!!developmentId}
        />
      )}
      {kind === 'house_types' && (
        <WideModalSection columns={3}>
          <WideModalField
            label={t('propdev.code', { defaultValue: 'Code' })}
            required
          >
            <input
              value={htForm.code}
              onChange={(e) => setHtForm({ ...htForm, code: e.target.value })}
              className={inputCls}
              placeholder="TYPE-A"
            />
          </WideModalField>
          <WideModalField
            label={t('propdev.name', { defaultValue: 'Name' })}
            span={2}
          >
            <input
              value={htForm.name}
              onChange={(e) => setHtForm({ ...htForm, name: e.target.value })}
              className={inputCls}
            />
          </WideModalField>
          <WideModalField
            label={t('propdev.bedrooms', { defaultValue: 'Bedrooms' })}
          >
            <input
              type="number"
              value={htForm.bedrooms}
              onChange={(e) => setHtForm({ ...htForm, bedrooms: Number(e.target.value) || 0 })}
              className={inputCls}
            />
          </WideModalField>
          <WideModalField label={t('propdev.area', { defaultValue: 'Area' })}>
            <input
              type="number"
              value={htForm.total_area_m2}
              onChange={(e) => setHtForm({ ...htForm, total_area_m2: e.target.value })}
              className={inputCls}
            />
          </WideModalField>
          <WideModalField
            label={t('propdev.base_price', { defaultValue: 'Base price' })}
          >
            <input
              type="number"
              value={htForm.base_price}
              onChange={(e) => setHtForm({ ...htForm, base_price: e.target.value })}
              className={inputCls}
            />
          </WideModalField>
        </WideModalSection>
      )}
      {kind === 'buyers' && (
        <WideModalSection columns={2}>
          <WideModalField
            label={t('propdev.full_name', { defaultValue: 'Full name' })}
            span={2}
          >
            <input
              value={buyerForm.full_name}
              onChange={(e) => setBuyerForm({ ...buyerForm, full_name: e.target.value })}
              className={inputCls}
            />
          </WideModalField>
          <WideModalField
            label={t('propdev.email', { defaultValue: 'Email' })}
            required
          >
            <input
              type="email"
              value={buyerForm.email}
              onChange={(e) => setBuyerForm({ ...buyerForm, email: e.target.value })}
              className={inputCls}
            />
          </WideModalField>
          <WideModalField label={t('propdev.phone', { defaultValue: 'Phone' })}>
            <input
              value={buyerForm.phone}
              onChange={(e) => setBuyerForm({ ...buyerForm, phone: e.target.value })}
              className={inputCls}
            />
          </WideModalField>
        </WideModalSection>
      )}
    </WideModal>
  );
}

/* ─── Plot create form body ─── */

// Shape of the plot create form. Kept inline (instead of API-shape) so
// every numeric/text input stays a string until submit — empty strings
// matter for "no value" vs "explicit zero".
interface PlotFormState {
  plot_number: string;
  house_type_id: string;
  house_type_label: string;
  status: PlotStatus;
  level_in_block: string;
  position_on_floor: string;
  area_m2: string;
  balcony_area_m2: string;
  garden_area_m2: string;
  storage_area_m2: string;
  bedrooms: string;
  bathrooms: string;
  parking_spaces: string;
  orientation: string;
  view_type: string;
  sun_exposure_hours: string;
  price_base: string;
  currency: string;
}

const PLOT_ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const PLOT_VIEW_TYPES = [
  'sea',
  'mountain',
  'garden',
  'courtyard',
  'street',
  'park',
  'forest',
  'lake',
  'river',
  'city',
  'other',
] as const;
const PLOT_STATUSES: PlotStatus[] = [
  'planned',
  'reserved',
  'under_construction',
  'ready',
  'sold',
  'handed_over',
];

function PlotFormBody({
  plotForm,
  setPlotForm,
  houseTypes,
  activeDevelopment,
  hasDevelopment,
}: {
  plotForm: PlotFormState;
  setPlotForm: React.Dispatch<React.SetStateAction<PlotFormState>>;
  houseTypes: HouseType[];
  activeDevelopment: Development | undefined;
  hasDevelopment: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const set = <K extends keyof PlotFormState>(
    key: K,
    value: PlotFormState[K],
  ) => setPlotForm((prev) => ({ ...prev, [key]: value }));

  // House-type catalogue picker — country-scoped presets + tenant
  // entries. The dropdown is populated by /property-dev/house-type-catalogue
  // and the catalogue entry name is mirrored into ``house_type_label`` so
  // the existing Plot.house_type_label column persists the choice
  // without needing a schema change.
  const projectId = activeDevelopment?.project_id;
  const devCountry =
    ((activeDevelopment?.metadata as Record<string, unknown> | undefined)
      ?.country_code as string | undefined) ?? '';
  const [catalogueCountry, setCatalogueCountry] = useState<string>(devCountry);
  useEffect(() => {
    setCatalogueCountry(devCountry);
  }, [devCountry]);

  const catalogueQ = useQuery({
    queryKey: [
      'propdev',
      'house-type-catalogue',
      catalogueCountry || 'all',
      projectId || 'none',
    ],
    queryFn: () =>
      fetchHouseTypes(catalogueCountry || undefined, projectId || undefined),
    staleTime: 60_000,
  });
  const catalogue: HouseTypeCatalogueEntry[] = catalogueQ.data ?? [];

  const [addingNewType, setAddingNewType] = useState(false);
  const [newTypeForm, setNewTypeForm] = useState({ code: '', name: '' });
  const [creatingType, setCreatingType] = useState(false);

  const submitNewType = async () => {
    if (!projectId) {
      addToast({
        type: 'error',
        title: t('property_dev.house_type.no_project_for_new_type', {
          defaultValue:
            'Select a development tied to a project before creating a custom house type.',
        }),
      });
      return;
    }
    const code = newTypeForm.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
    const name = newTypeForm.name.trim();
    if (!code || !name) {
      addToast({
        type: 'error',
        title: t('property_dev.house_type.code_and_name_required', {
          defaultValue: 'Both code and name are required.',
        }),
      });
      return;
    }
    setCreatingType(true);
    try {
      const created = await createHouseTypeCatalogue({
        project_id: projectId,
        country_code: catalogueCountry || null,
        code,
        name,
      });
      addToast({
        type: 'success',
        title: t('property_dev.house_type.created', {
          defaultValue: 'House type added',
        }),
      });
      await qc.invalidateQueries({
        queryKey: ['propdev', 'house-type-catalogue'],
      });
      // Auto-select the new entry — mirror its name into the label
      // field which is what the backend persists for catalogue picks.
      set('house_type_label', created.name);
      setAddingNewType(false);
      setNewTypeForm({ code: '', name: '' });
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setCreatingType(false);
    }
  };

  const COUNTRY_OPTIONS: Array<{ value: string; label: string }> = [
    {
      value: '',
      label: t('property_dev.house_type.country_all', {
        defaultValue: 'All countries',
      }),
    },
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

  return (
    <>
      {/* Context banner: confirms which development the plot will be
        attached to, removing the need for an in-form picker. */}
      {hasDevelopment ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-content-tertiary">
            {t('propdev.development', { defaultValue: 'Development' })}
          </span>
          <span className="font-medium text-content-primary">
            {activeDevelopment
              ? `${activeDevelopment.code}${activeDevelopment.name ? ` — ${activeDevelopment.name}` : ''}`
              : t('propdev.unknown_development', { defaultValue: 'Selected development' })}
          </span>
        </div>
      ) : (
        <div
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          role="alert"
        >
          {t('propdev.select_development_first', {
            defaultValue: 'Select a development at the top of the page first.',
          })}
        </div>
      )}

      {/* Identification */}
      <WideModalSection
        columns={2}
        title={t('propdev.plot.section_id', { defaultValue: 'Identification' })}
      >
        <WideModalField
          label={t('propdev.plot_number', { defaultValue: 'Plot number' })}
          required
        >
          <input
            value={plotForm.plot_number}
            onChange={(e) => set('plot_number', e.target.value)}
            className={inputCls}
            placeholder="P-001"
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.status', { defaultValue: 'Status' })}
        >
          <select
            value={plotForm.status}
            onChange={(e) => set('status', e.target.value as PlotStatus)}
            className={inputCls}
          >
            {PLOT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`propdev.plot.status.${s}`, { defaultValue: s.replace('_', ' ') })}
              </option>
            ))}
          </select>
        </WideModalField>
        <WideModalField
          label={t('propdev.house_type', { defaultValue: 'House type' })}
        >
          <select
            value={plotForm.house_type_id}
            onChange={(e) => set('house_type_id', e.target.value)}
            className={inputCls}
          >
            <option value="">— {t('common.none', { defaultValue: 'None' })} —</option>
            {houseTypes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.code} — {h.name}
              </option>
            ))}
          </select>
        </WideModalField>
        <WideModalField
          label={t('property_dev.house_type.title', {
            defaultValue: 'House type (catalogue)',
          })}
          hint={t('property_dev.house_type.picker_hint', {
            defaultValue:
              'Pick a country preset or create your own. The label is stored on the plot.',
          })}
          span={2}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <select
                value={catalogueCountry}
                onChange={(e) => setCatalogueCountry(e.target.value)}
                className={clsx(inputCls, 'max-w-[200px]')}
                aria-label={t('property_dev.house_type.country_label', {
                  defaultValue: 'Country',
                })}
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.value || '_all_'} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={plotForm.house_type_label}
                onChange={(e) => set('house_type_label', e.target.value)}
                className={clsx(inputCls, 'min-w-[200px] flex-1')}
              >
                <option value="">
                  — {t('property_dev.house_type.none', { defaultValue: 'None' })} —
                </option>
                {catalogue.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.is_preset ? '★ ' : ''}
                    {c.name}
                    {c.country_code ? ` (${c.country_code})` : ''}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={12} />}
                onClick={() => setAddingNewType((v) => !v)}
                disabled={!projectId}
                title={
                  projectId
                    ? undefined
                    : t('property_dev.house_type.no_project_for_new_type', {
                        defaultValue:
                          'Select a development tied to a project before creating a custom house type.',
                      })
                }
              >
                {t('property_dev.house_type.add_new', {
                  defaultValue: 'Add new...',
                })}
              </Button>
            </div>
            {addingNewType && (
              <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>
                      {t('property_dev.house_type.code_label', {
                        defaultValue: 'Code',
                      })}
                    </label>
                    <input
                      value={newTypeForm.code}
                      onChange={(e) =>
                        setNewTypeForm((s) => ({ ...s, code: e.target.value }))
                      }
                      className={inputCls}
                      placeholder="MY_TOWNHOUSE"
                      maxLength={40}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      {t('property_dev.house_type.name_label', {
                        defaultValue: 'Display name',
                      })}
                    </label>
                    <input
                      value={newTypeForm.name}
                      onChange={(e) =>
                        setNewTypeForm((s) => ({ ...s, name: e.target.value }))
                      }
                      className={inputCls}
                      placeholder={t('property_dev.house_type.name_placeholder', {
                        defaultValue: 'e.g. Modern Townhouse',
                      })}
                      maxLength={120}
                    />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={submitNewType}
                    loading={creatingType}
                    disabled={creatingType}
                  >
                    {t('property_dev.house_type.save', {
                      defaultValue: 'Save & select',
                    })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddingNewType(false);
                      setNewTypeForm({ code: '', name: '' });
                    }}
                    disabled={creatingType}
                  >
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </WideModalField>
      </WideModalSection>

      {/* Position inside block */}
      <WideModalSection
        columns={2}
        title={t('propdev.plot.section_position', { defaultValue: 'Position' })}
        description={t('propdev.plot.section_position_desc', {
          defaultValue:
            'Floor and position on the floor plan. Block linkage can be set later.',
        })}
      >
        <WideModalField
          label={t('propdev.plot.level_in_block', { defaultValue: 'Floor / level' })}
        >
          <input
            type="number"
            value={plotForm.level_in_block}
            onChange={(e) => set('level_in_block', e.target.value)}
            className={inputCls}
            placeholder="0"
            min={-10}
            max={200}
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.position_on_floor', {
            defaultValue: 'Position on floor',
          })}
          hint={t('propdev.plot.position_on_floor_hint', {
            defaultValue: 'e.g. NE corner, unit A, left wing',
          })}
        >
          <input
            value={plotForm.position_on_floor}
            onChange={(e) => set('position_on_floor', e.target.value)}
            className={inputCls}
            maxLength={40}
          />
        </WideModalField>
      </WideModalSection>

      {/* Dimensions & layout */}
      <WideModalSection
        columns={3}
        title={t('propdev.plot.section_dimensions', {
          defaultValue: 'Dimensions & layout',
        })}
      >
        <WideModalField
          label={t('propdev.plot.area_m2', { defaultValue: 'Area (m²)' })}
        >
          <input
            type="number"
            value={plotForm.area_m2}
            onChange={(e) => set('area_m2', e.target.value)}
            className={inputCls}
            min={0}
            step="0.01"
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.balcony_area_m2', {
            defaultValue: 'Balcony (m²)',
          })}
        >
          <input
            type="number"
            value={plotForm.balcony_area_m2}
            onChange={(e) => set('balcony_area_m2', e.target.value)}
            className={inputCls}
            min={0}
            step="0.01"
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.garden_area_m2', {
            defaultValue: 'Garden (m²)',
          })}
        >
          <input
            type="number"
            value={plotForm.garden_area_m2}
            onChange={(e) => set('garden_area_m2', e.target.value)}
            className={inputCls}
            min={0}
            step="0.01"
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.storage_area_m2', {
            defaultValue: 'Storage unit (m²)',
          })}
          hint={t('propdev.plot.storage_area_m2_hint', {
            defaultValue: 'Leave blank if no storage is included.',
          })}
        >
          <input
            type="number"
            value={plotForm.storage_area_m2}
            onChange={(e) => set('storage_area_m2', e.target.value)}
            className={inputCls}
            min={0}
            step="0.01"
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.bedrooms', { defaultValue: 'Bedrooms' })}
        >
          <input
            type="number"
            value={plotForm.bedrooms}
            onChange={(e) => set('bedrooms', e.target.value)}
            className={inputCls}
            min={0}
            max={20}
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.bathrooms', { defaultValue: 'Bathrooms' })}
        >
          <input
            type="number"
            value={plotForm.bathrooms}
            onChange={(e) => set('bathrooms', e.target.value)}
            className={inputCls}
            min={0}
            max={20}
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.parking_spaces', {
            defaultValue: 'Parking spaces',
          })}
        >
          <input
            type="number"
            value={plotForm.parking_spaces}
            onChange={(e) => set('parking_spaces', e.target.value)}
            className={inputCls}
            min={0}
            max={20}
          />
        </WideModalField>
      </WideModalSection>

      {/* Orientation / view */}
      <WideModalSection
        columns={3}
        title={t('propdev.plot.section_view', {
          defaultValue: 'Orientation & view',
        })}
      >
        <WideModalField
          label={t('propdev.plot.orientation', { defaultValue: 'Orientation' })}
          hint={t('propdev.plot.orientation_hint', {
            defaultValue: 'Compass direction the main façade faces.',
          })}
        >
          <select
            value={plotForm.orientation}
            onChange={(e) => set('orientation', e.target.value)}
            className={inputCls}
          >
            <option value="">— {t('common.none', { defaultValue: 'None' })} —</option>
            {PLOT_ORIENTATIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.view_type', { defaultValue: 'View type' })}
        >
          <select
            value={plotForm.view_type}
            onChange={(e) => set('view_type', e.target.value)}
            className={inputCls}
          >
            <option value="">— {t('common.none', { defaultValue: 'None' })} —</option>
            {PLOT_VIEW_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`propdev.plot.view.${v}`, { defaultValue: v })}
              </option>
            ))}
          </select>
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.sun_exposure_hours', {
            defaultValue: 'Sun exposure (h / day)',
          })}
        >
          <input
            type="number"
            value={plotForm.sun_exposure_hours}
            onChange={(e) => set('sun_exposure_hours', e.target.value)}
            className={inputCls}
            min={0}
            max={24}
            step="0.1"
          />
        </WideModalField>
      </WideModalSection>

      {/* Pricing */}
      <WideModalSection
        columns={2}
        title={t('propdev.plot.section_pricing', { defaultValue: 'Pricing' })}
      >
        <WideModalField
          label={t('propdev.base_price', { defaultValue: 'Base price' })}
        >
          <input
            type="number"
            value={plotForm.price_base}
            onChange={(e) => set('price_base', e.target.value)}
            className={inputCls}
            min={0}
            step="0.01"
          />
        </WideModalField>
        <WideModalField
          label={t('propdev.plot.currency', { defaultValue: 'Currency' })}
        >
          <input
            value={plotForm.currency}
            onChange={(e) =>
              set('currency', e.target.value.toUpperCase().slice(0, 3))
            }
            className={inputCls}
            maxLength={3}
            placeholder="EUR"
          />
        </WideModalField>
      </WideModalSection>
    </>
  );
}
