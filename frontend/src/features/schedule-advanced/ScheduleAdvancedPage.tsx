import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Calendar,
  LayoutGrid,
  Clock,
  ClipboardCheck,
  AlertCircle,
  GitBranch,
  Plus,
  Check,
  ArrowUpCircle,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  EmptyState,
  Breadcrumb,
  SkeletonTable,
  WideModal,
} from '@/shared/ui';
import { DateDisplay } from '@/shared/ui/DateDisplay';
import { useToastStore } from '@/stores/useToastStore';
import { getErrorMessage } from '@/shared/lib/api';
import { projectsApi } from '@/features/projects/api';
import {
  listMasterSchedules,
  createMasterSchedule,
  listPhasePlans,
  pullPhase,
  startPhase,
  completePhase,
  listLookAheads,
  createLookAhead,
  publishLookAhead,
  listConstraints,
  clearConstraint,
  escalateConstraint,
  deleteConstraint,
  listWeeklyPlans,
  createWeeklyPlan,
  commitWeeklyPlan,
  closeWeeklyPlan,
  listCommitments,
  listBaselines,
  captureBaseline,
  baselineDelta,
  type MasterSchedule,
  type PhasePlan,
  type PhaseStatus,
  type LookAheadPlan,
  type Constraint,
  type ConstraintStatus,
  type WeeklyWorkPlan,
  type WeeklyStatus,
  type Commitment,
  type CommitmentStatus,
  type Baseline,
  type BaselineDeltaEntry,
} from './api';

type Tab =
  | 'master'
  | 'phases'
  | 'look_ahead'
  | 'weekly'
  | 'constraints'
  | 'baselines';

const PHASE_VARIANT: Record<PhaseStatus, 'neutral' | 'blue' | 'success' | 'warning'> = {
  in_planning: 'neutral',
  pulled: 'blue',
  active: 'warning',
  completed: 'success',
};

const CONSTRAINT_VARIANT: Record<
  ConstraintStatus,
  'neutral' | 'blue' | 'success' | 'warning' | 'error'
> = {
  open: 'warning',
  in_progress: 'blue',
  cleared: 'success',
  escalated: 'error',
  cannot_clear: 'error',
};

const COMMITMENT_VARIANT: Record<
  CommitmentStatus,
  'neutral' | 'blue' | 'success' | 'warning' | 'error'
> = {
  planned: 'neutral',
  committed: 'blue',
  in_progress: 'warning',
  completed: 'success',
  at_risk: 'warning',
  missed: 'error',
};

const WEEKLY_VARIANT: Record<WeeklyStatus, 'neutral' | 'blue' | 'success' | 'warning'> = {
  draft: 'neutral',
  committed: 'blue',
  in_progress: 'warning',
  closed: 'success',
};

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue';

const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

/* ── helpers ─────────────────────────────────────────────────────────── */

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function pctNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return 0;
  // Backend returns 0-1 or 0-100 depending on impl — normalize to 0-100
  return n > 1 ? n : n * 100;
}

/* ── Page ────────────────────────────────────────────────────────────── */

export function ScheduleAdvancedPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('master');
  const [projectId, setProjectId] = useState<string>('');
  const [masterId, setMasterId] = useState<string>('');
  const [lookAheadId, setLookAheadId] = useState<string>('');
  const [weekPlanId, setWeekPlanId] = useState<string>('');
  const [constraintFilter, setConstraintFilter] = useState<string>('');
  const [createMaster, setCreateMaster] = useState(false);
  const [createWeek, setCreateWeek] = useState(false);
  const [createLA, setCreateLA] = useState(false);
  const [createBaselineOpen, setCreateBaselineOpen] = useState(false);

  const projectsQ = useQuery({
    queryKey: ['projects-list-for-schedule'],
    queryFn: () => projectsApi.list(),
  });

  // Auto-select first project once loaded
  useEffect(() => {
    if (!projectId && projectsQ.data && projectsQ.data.length > 0) {
      const first = projectsQ.data[0];
      if (first) setProjectId(first.id);
    }
  }, [projectId, projectsQ.data]);

  const masterQ = useQuery({
    queryKey: ['schedule-advanced', 'master', projectId],
    queryFn: () => listMasterSchedules({ project_id: projectId, limit: 100 }),
    enabled: !!projectId,
  });

  // Auto-select first master once loaded
  useEffect(() => {
    if (!masterId && masterQ.data && masterQ.data.length > 0) {
      const first = masterQ.data[0];
      if (first) setMasterId(first.id);
    }
  }, [masterId, masterQ.data]);

  const phasesQ = useQuery({
    queryKey: ['schedule-advanced', 'phases', masterId],
    queryFn: () => listPhasePlans(masterId),
    enabled: !!masterId && tab === 'phases',
  });

  const lookAheadsQ = useQuery({
    queryKey: ['schedule-advanced', 'look-aheads', masterId],
    queryFn: () => listLookAheads(masterId),
    enabled: !!masterId && (tab === 'look_ahead' || tab === 'constraints'),
  });

  useEffect(() => {
    if (
      !lookAheadId &&
      lookAheadsQ.data &&
      lookAheadsQ.data.length > 0
    ) {
      const first = lookAheadsQ.data[0];
      if (first) setLookAheadId(first.id);
    }
  }, [lookAheadId, lookAheadsQ.data]);

  const constraintsQ = useQuery({
    queryKey: ['schedule-advanced', 'constraints', lookAheadId],
    queryFn: () => listConstraints(lookAheadId),
    enabled: !!lookAheadId && tab === 'constraints',
  });

  const weeklyQ = useQuery({
    queryKey: ['schedule-advanced', 'weekly', masterId],
    queryFn: () => listWeeklyPlans(masterId, 52),
    enabled: !!masterId && tab === 'weekly',
  });

  useEffect(() => {
    if (!weekPlanId && weeklyQ.data && weeklyQ.data.length > 0) {
      const first = weeklyQ.data[0];
      if (first) setWeekPlanId(first.id);
    }
  }, [weekPlanId, weeklyQ.data]);

  const commitmentsQ = useQuery({
    queryKey: ['schedule-advanced', 'commitments', weekPlanId],
    queryFn: () => listCommitments(weekPlanId),
    enabled: !!weekPlanId && tab === 'weekly',
  });

  const baselinesQ = useQuery({
    queryKey: ['schedule-advanced', 'baselines', masterId],
    queryFn: () => listBaselines(masterId),
    enabled: !!masterId && tab === 'baselines',
  });

  const filteredConstraints = useMemo(() => {
    const items = constraintsQ.data ?? [];
    if (!constraintFilter) return items;
    return items.filter((c) => c.status === constraintFilter);
  }, [constraintsQ.data, constraintFilter]);

  const currentMaster: MasterSchedule | undefined = useMemo(
    () => (masterQ.data ?? []).find((m) => m.id === masterId),
    [masterQ.data, masterId],
  );

  const currentWeek: WeeklyWorkPlan | undefined = useMemo(
    () => (weeklyQ.data ?? []).find((w) => w.id === weekPlanId),
    [weeklyQ.data, weekPlanId],
  );

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          {
            label: t('schedule_advanced.title', {
              defaultValue: 'Last Planner / CPM',
            }),
          },
        ]}
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-content-primary">
            {t('schedule_advanced.title', { defaultValue: 'Last Planner / CPM' })}
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {t('schedule_advanced.subtitle', {
              defaultValue:
                'Pull-planning, lookaheads, weekly commitments, constraints and baselines.',
            })}
          </p>
        </div>
        {projectsQ.data && projectsQ.data.length > 0 && (
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setMasterId('');
              setLookAheadId('');
              setWeekPlanId('');
            }}
            className={clsx(inputCls, 'max-w-xs')}
          >
            {projectsQ.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border-light">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {(
            [
              { id: 'master', label: t('schedule_advanced.tab_master', { defaultValue: 'Master' }), icon: Calendar },
              { id: 'phases', label: t('schedule_advanced.tab_phases', { defaultValue: 'Phase Plans' }), icon: LayoutGrid },
              { id: 'look_ahead', label: t('schedule_advanced.tab_look_ahead', { defaultValue: 'Look-Ahead' }), icon: Clock },
              { id: 'weekly', label: t('schedule_advanced.tab_weekly', { defaultValue: 'Weekly Plan' }), icon: ClipboardCheck },
              { id: 'constraints', label: t('schedule_advanced.tab_constraints', { defaultValue: 'Constraints' }), icon: AlertCircle },
              { id: 'baselines', label: t('schedule_advanced.tab_baselines', { defaultValue: 'Baselines' }), icon: GitBranch },
            ] as { id: Tab; label: string; icon: React.ElementType }[]
          ).map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setTab(it.id)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  tab === it.id
                    ? 'border-oe-blue text-oe-blue'
                    : 'border-transparent text-content-secondary hover:text-content-primary',
                )}
              >
                <Icon size={14} />
                {it.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Empty state when no project */}
      {!projectId ? (
        <Card>
          {projectsQ.isLoading ? (
            <SkeletonTable rows={6} columns={3} />
          ) : (
            <EmptyState
              icon={<Calendar size={22} />}
              title={t('schedule_advanced.no_project', { defaultValue: 'No project selected' })}
              description={t('schedule_advanced.no_project_desc', {
                defaultValue: 'Create a project first to start pull-planning.',
              })}
            />
          )}
        </Card>
      ) : tab === 'master' ? (
        <MasterTab
          masters={masterQ.data ?? []}
          loading={masterQ.isLoading}
          masterId={masterId}
          onSelect={setMasterId}
          onCreate={() => setCreateMaster(true)}
          current={currentMaster}
        />
      ) : !masterId ? (
        <Card>
          <EmptyState
            icon={<Calendar size={22} />}
            title={t('schedule_advanced.no_master', { defaultValue: 'No master schedule yet' })}
            description={t('schedule_advanced.no_master_desc', {
              defaultValue: 'Create a master schedule on the Master tab first.',
            })}
            action={{
              label: t('schedule_advanced.create_master', { defaultValue: 'Create Master' }),
              onClick: () => {
                setTab('master');
                setCreateMaster(true);
              },
            }}
          />
        </Card>
      ) : tab === 'phases' ? (
        <PhasesTab
          phases={phasesQ.data ?? []}
          loading={phasesQ.isLoading}
          masterId={masterId}
        />
      ) : tab === 'look_ahead' ? (
        <LookAheadTab
          lookAheads={lookAheadsQ.data ?? []}
          loading={lookAheadsQ.isLoading}
          lookAheadId={lookAheadId}
          onSelect={setLookAheadId}
          onCreate={() => setCreateLA(true)}
        />
      ) : tab === 'weekly' ? (
        <WeeklyTab
          plans={weeklyQ.data ?? []}
          loading={weeklyQ.isLoading}
          weekPlanId={weekPlanId}
          onSelect={setWeekPlanId}
          commitments={commitmentsQ.data ?? []}
          commitmentsLoading={commitmentsQ.isLoading}
          currentWeek={currentWeek}
          onCreate={() => setCreateWeek(true)}
        />
      ) : tab === 'constraints' ? (
        <ConstraintsTab
          lookAheads={lookAheadsQ.data ?? []}
          lookAheadId={lookAheadId}
          onSelectLA={setLookAheadId}
          constraints={filteredConstraints}
          loading={constraintsQ.isLoading}
          filter={constraintFilter}
          onFilter={setConstraintFilter}
        />
      ) : (
        <BaselinesTab
          baselines={baselinesQ.data ?? []}
          loading={baselinesQ.isLoading}
          onCapture={() => setCreateBaselineOpen(true)}
        />
      )}

      {/* Modals */}
      {createMaster && projectId && (
        <CreateMasterModal
          projectId={projectId}
          onClose={() => setCreateMaster(false)}
        />
      )}
      {createWeek && masterId && (
        <CreateWeeklyModal
          masterId={masterId}
          onClose={() => setCreateWeek(false)}
        />
      )}
      {createLA && masterId && (
        <CreateLookAheadModal
          masterId={masterId}
          onClose={() => setCreateLA(false)}
        />
      )}
      {createBaselineOpen && masterId && (
        <CreateBaselineModal
          masterId={masterId}
          onClose={() => setCreateBaselineOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Master tab ──────────────────────────────────────────────────────── */

function MasterTab({
  masters,
  loading,
  masterId,
  onSelect,
  onCreate,
  current,
}: {
  masters: MasterSchedule[];
  loading: boolean;
  masterId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  current: MasterSchedule | undefined;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Card padding="md">
        <SkeletonTable rows={4} columns={3} />
      </Card>
    );
  }
  if (masters.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Calendar size={22} />}
          title={t('schedule_advanced.no_master_yet', { defaultValue: 'No master schedule yet' })}
          description={t('schedule_advanced.no_master_yet_desc', {
            defaultValue: 'A master schedule anchors all pull-plans and lookaheads.',
          })}
          action={{
            label: t('schedule_advanced.create_master', { defaultValue: 'Create Master' }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={onCreate}
        >
          {t('schedule_advanced.create_master', { defaultValue: 'Create Master' })}
        </Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">{t('common.name', { defaultValue: 'Name' })}</th>
                <th className="px-4 py-2.5 text-left">{t('schedule_advanced.planned_start', { defaultValue: 'Planned start' })}</th>
                <th className="px-4 py-2.5 text-left">{t('schedule_advanced.planned_finish', { defaultValue: 'Planned finish' })}</th>
                <th className="px-4 py-2.5 text-left">{t('common.status', { defaultValue: 'Status' })}</th>
              </tr>
            </thead>
            <tbody>
              {masters.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={clsx(
                    'border-t border-border-light hover:bg-surface-secondary cursor-pointer',
                    m.id === masterId && 'bg-oe-blue-subtle/30',
                  )}
                >
                  <td className="px-4 py-2 font-medium">{m.name}</td>
                  <td className="px-4 py-2 text-content-secondary text-xs">
                    {m.planned_start ? <DateDisplay value={m.planned_start} /> : '—'}
                  </td>
                  <td className="px-4 py-2 text-content-secondary text-xs">
                    {m.planned_finish ? <DateDisplay value={m.planned_finish} /> : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={m.status === 'active' ? 'success' : 'neutral'} dot>
                      {m.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {current && (
        <Card padding="md">
          <h3 className="text-base font-semibold mb-3">
            {t('schedule_advanced.summary', { defaultValue: 'Summary' })}
          </h3>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat
              label={t('schedule_advanced.planned_start', { defaultValue: 'Planned start' })}
              value={current.planned_start ? <DateDisplay value={current.planned_start} /> : '—'}
            />
            <Stat
              label={t('schedule_advanced.planned_finish', { defaultValue: 'Planned finish' })}
              value={current.planned_finish ? <DateDisplay value={current.planned_finish} /> : '—'}
            />
            <Stat
              label={t('schedule_advanced.baseline_date', { defaultValue: 'Baseline date' })}
              value={current.baseline_date ? <DateDisplay value={current.baseline_date} /> : '—'}
            />
            <Stat
              label={t('common.status', { defaultValue: 'Status' })}
              value={<Badge variant={current.status === 'active' ? 'success' : 'neutral'} dot>{current.status}</Badge>}
            />
          </dl>
          {current.notes && (
            <p className="mt-4 text-sm text-content-secondary whitespace-pre-wrap">
              {current.notes}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-content-tertiary">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-content-primary">{value}</dd>
    </div>
  );
}

/* ── Phase plans tab ─────────────────────────────────────────────────── */

function PhasesTab({
  phases,
  loading,
  masterId,
}: {
  phases: PhasePlan[];
  loading: boolean;
  masterId: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const pullMut = useMutation({
    mutationFn: (id: string) => pullPhase(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'phases', masterId] });
      addToast({ type: 'success', title: t('schedule_advanced.phase_pulled', { defaultValue: 'Phase pulled' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  const startMut = useMutation({
    mutationFn: (id: string) => startPhase(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'phases', masterId] });
      addToast({ type: 'success', title: t('schedule_advanced.phase_started', { defaultValue: 'Phase started' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  const completeMut = useMutation({
    mutationFn: (id: string) => completePhase(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'phases', masterId] });
      addToast({ type: 'success', title: t('schedule_advanced.phase_completed', { defaultValue: 'Phase completed' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  if (loading) {
    return (
      <Card padding="md">
        <SkeletonTable rows={4} columns={4} />
      </Card>
    );
  }

  if (phases.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<LayoutGrid size={22} />}
          title={t('schedule_advanced.no_phases', { defaultValue: 'No phase plans yet' })}
          description={t('schedule_advanced.no_phases_desc', {
            defaultValue: 'Phase plans group commitments by milestone target.',
          })}
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {phases.map((p) => {
        const colorClass =
          p.pulled_status === 'completed'
            ? 'border-semantic-success/30 bg-semantic-success-bg/40'
            : p.pulled_status === 'active'
              ? 'border-semantic-warning/40 bg-semantic-warning-bg/40'
              : p.pulled_status === 'pulled'
                ? 'border-oe-blue/30 bg-oe-blue-subtle/30'
                : 'border-border-light bg-surface-secondary/40';
        return (
          <Card
            key={p.id}
            padding="md"
            className={clsx('border', colorClass)}
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold truncate" title={p.name}>
                {p.name}
              </h4>
              <Badge variant={PHASE_VARIANT[p.pulled_status]} dot>
                {p.pulled_status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-content-tertiary">
              {p.planned_start && p.planned_finish
                ? `${p.planned_start} → ${p.planned_finish}`
                : '—'}
            </p>
            {p.notes && (
              <p className="mt-2 text-xs text-content-secondary line-clamp-3">
                {p.notes}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.pulled_status === 'in_planning' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => pullMut.mutate(p.id)}
                  loading={pullMut.isPending}
                >
                  {t('schedule_advanced.pull', { defaultValue: 'Pull' })}
                </Button>
              )}
              {p.pulled_status === 'pulled' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => startMut.mutate(p.id)}
                  loading={startMut.isPending}
                >
                  {t('schedule_advanced.start', { defaultValue: 'Start' })}
                </Button>
              )}
              {p.pulled_status === 'active' && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Check size={12} />}
                  onClick={() => completeMut.mutate(p.id)}
                  loading={completeMut.isPending}
                >
                  {t('schedule_advanced.complete', { defaultValue: 'Complete' })}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Look-ahead tab ──────────────────────────────────────────────────── */

function LookAheadTab({
  lookAheads,
  loading,
  lookAheadId,
  onSelect,
  onCreate,
}: {
  lookAheads: LookAheadPlan[];
  loading: boolean;
  lookAheadId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const publishMut = useMutation({
    mutationFn: (id: string) => publishLookAhead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'look-aheads'] });
      addToast({ type: 'success', title: t('schedule_advanced.la_published', { defaultValue: 'Look-ahead published' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  if (loading) {
    return (
      <Card padding="md">
        <SkeletonTable rows={4} columns={5} />
      </Card>
    );
  }

  if (lookAheads.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Clock size={22} />}
          title={t('schedule_advanced.no_la', { defaultValue: 'No look-ahead plans yet' })}
          description={t('schedule_advanced.no_la_desc', {
            defaultValue: 'Look-aheads roll a 6-week window for constraint clearing.',
          })}
          action={{
            label: t('schedule_advanced.create_la', { defaultValue: 'Create Look-Ahead' }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={onCreate}
        >
          {t('schedule_advanced.create_la', { defaultValue: 'Create Look-Ahead' })}
        </Button>
      </div>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">{t('schedule_advanced.period_start', { defaultValue: 'Start' })}</th>
                <th className="px-4 py-2.5 text-left">{t('schedule_advanced.period_end', { defaultValue: 'End' })}</th>
                <th className="px-4 py-2.5 text-left">{t('schedule_advanced.weeks', { defaultValue: 'Weeks' })}</th>
                <th className="px-4 py-2.5 text-left">{t('common.status', { defaultValue: 'Status' })}</th>
                <th className="px-4 py-2.5 text-right">{t('common.actions', { defaultValue: 'Actions' })}</th>
              </tr>
            </thead>
            <tbody>
              {lookAheads.map((la) => (
                <tr
                  key={la.id}
                  onClick={() => onSelect(la.id)}
                  className={clsx(
                    'border-t border-border-light hover:bg-surface-secondary cursor-pointer',
                    la.id === lookAheadId && 'bg-oe-blue-subtle/30',
                  )}
                >
                  <td className="px-4 py-2 text-xs text-content-secondary">
                    <DateDisplay value={la.period_start} />
                  </td>
                  <td className="px-4 py-2 text-xs text-content-secondary">
                    <DateDisplay value={la.period_end} />
                  </td>
                  <td className="px-4 py-2 text-xs text-content-secondary">
                    {la.window_weeks}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        la.status === 'published'
                          ? 'success'
                          : la.status === 'reviewed'
                            ? 'blue'
                            : 'neutral'
                      }
                      dot
                    >
                      {la.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {la.status !== 'published' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          publishMut.mutate(la.id);
                        }}
                      >
                        {t('schedule_advanced.publish', { defaultValue: 'Publish' })}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Weekly plan tab ─────────────────────────────────────────────────── */

function WeeklyTab({
  plans,
  loading,
  weekPlanId,
  onSelect,
  commitments,
  commitmentsLoading,
  currentWeek,
  onCreate,
}: {
  plans: WeeklyWorkPlan[];
  loading: boolean;
  weekPlanId: string;
  onSelect: (id: string) => void;
  commitments: Commitment[];
  commitmentsLoading: boolean;
  currentWeek: WeeklyWorkPlan | undefined;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const commitMut = useMutation({
    mutationFn: (id: string) => commitWeeklyPlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'weekly'] });
      addToast({ type: 'success', title: t('schedule_advanced.week_committed', { defaultValue: 'Week committed' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  const closeMut = useMutation({
    mutationFn: (id: string) => closeWeeklyPlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'weekly'] });
      addToast({ type: 'success', title: t('schedule_advanced.week_closed', { defaultValue: 'Week closed' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  if (loading) {
    return (
      <Card padding="md">
        <SkeletonTable rows={4} columns={5} />
      </Card>
    );
  }

  if (plans.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ClipboardCheck size={22} />}
          title={t('schedule_advanced.no_weekly', { defaultValue: 'No weekly plans yet' })}
          description={t('schedule_advanced.no_weekly_desc', {
            defaultValue: 'Weekly work plans capture the commitments due this week.',
          })}
          action={{
            label: t('schedule_advanced.create_weekly', { defaultValue: 'Create Weekly Plan' }),
            onClick: onCreate,
          }}
        />
      </Card>
    );
  }

  const ppc = pctNumber(currentWeek?.ppc_percent);
  const completed = commitments.filter((c) => c.status === 'completed').length;
  const missed = commitments.filter((c) => c.status === 'missed').length;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-4">
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={onCreate}
          >
            {t('schedule_advanced.create_weekly', { defaultValue: 'Create Weekly Plan' })}
          </Button>
        </div>

        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">{t('schedule_advanced.week_start', { defaultValue: 'Week start' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('schedule_advanced.week_end', { defaultValue: 'Week end' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('common.status', { defaultValue: 'Status' })}</th>
                  <th className="px-4 py-2.5 text-right">{t('schedule_advanced.ppc', { defaultValue: 'PPC' })}</th>
                  <th className="px-4 py-2.5 text-right">{t('common.actions', { defaultValue: 'Actions' })}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((w) => (
                  <tr
                    key={w.id}
                    onClick={() => onSelect(w.id)}
                    className={clsx(
                      'border-t border-border-light hover:bg-surface-secondary cursor-pointer',
                      w.id === weekPlanId && 'bg-oe-blue-subtle/30',
                    )}
                  >
                    <td className="px-4 py-2 text-xs text-content-secondary">
                      <DateDisplay value={w.week_start_date} />
                    </td>
                    <td className="px-4 py-2 text-xs text-content-secondary">
                      <DateDisplay value={w.week_end_date} />
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={WEEKLY_VARIANT[w.status]} dot>
                        {w.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {pctNumber(w.ppc_percent).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2 text-right">
                      {w.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            commitMut.mutate(w.id);
                          }}
                        >
                          {t('schedule_advanced.commit', { defaultValue: 'Commit' })}
                        </Button>
                      )}
                      {(w.status === 'committed' || w.status === 'in_progress') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeMut.mutate(w.id);
                          }}
                        >
                          {t('schedule_advanced.close', { defaultValue: 'Close' })}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {weekPlanId && (
          <Card padding="none">
            <div className="border-b border-border-light px-4 py-2.5 bg-surface-secondary/50">
              <h3 className="text-sm font-semibold">
                {t('schedule_advanced.commitments', { defaultValue: 'Commitments' })}
              </h3>
            </div>
            {commitmentsLoading ? (
              <div className="p-4">
                <SkeletonTable rows={4} columns={4} />
              </div>
            ) : commitments.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck size={20} />}
                title={t('schedule_advanced.no_commitments', { defaultValue: 'No commitments' })}
                description={t('schedule_advanced.no_commitments_desc', {
                  defaultValue: 'Add commitments to this week to track progress.',
                })}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">{t('schedule_advanced.crew', { defaultValue: 'Crew' })}</th>
                      <th className="px-4 py-2 text-right">{t('schedule_advanced.promised', { defaultValue: 'Promised' })}</th>
                      <th className="px-4 py-2 text-right">{t('schedule_advanced.actual', { defaultValue: 'Actual' })}</th>
                      <th className="px-4 py-2 text-left">{t('common.status', { defaultValue: 'Status' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitments.map((c) => (
                      <tr key={c.id} className="border-t border-border-light">
                        <td className="px-4 py-2 truncate max-w-[200px]">
                          {c.worker_or_crew || '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {String(c.promised_qty)} {c.unit}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {c.actual_qty != null ? String(c.actual_qty) : '—'}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={COMMITMENT_VARIANT[c.status]} dot>
                            {c.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      <Card padding="md" className="h-fit">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-content-secondary mb-3">
          {t('schedule_advanced.ppc_title', { defaultValue: 'Percent Plan Complete' })}
        </h3>
        <div className="flex flex-col items-center justify-center py-6">
          <div className="text-5xl font-bold text-oe-blue">
            {ppc.toFixed(0)}%
          </div>
          <div className="mt-3 h-2 w-full max-w-[200px] rounded-full bg-surface-secondary overflow-hidden">
            <div
              className="h-full bg-oe-blue transition-all"
              style={{ width: `${Math.min(ppc, 100)}%` }}
            />
          </div>
          <p className="mt-4 text-xs text-content-tertiary">
            {t('schedule_advanced.this_week', { defaultValue: 'This week' })}
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-2xs uppercase tracking-wide text-content-tertiary">
              {t('schedule_advanced.total', { defaultValue: 'Total' })}
            </dt>
            <dd className="text-base font-semibold">{commitments.length}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-wide text-content-tertiary">
              {t('schedule_advanced.completed', { defaultValue: 'Completed' })}
            </dt>
            <dd className="text-base font-semibold text-semantic-success">{completed}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-wide text-content-tertiary">
              {t('schedule_advanced.missed', { defaultValue: 'Missed' })}
            </dt>
            <dd className="text-base font-semibold text-semantic-error">{missed}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

/* ── Constraints tab ─────────────────────────────────────────────────── */

function ConstraintsTab({
  lookAheads,
  lookAheadId,
  onSelectLA,
  constraints,
  loading,
  filter,
  onFilter,
}: {
  lookAheads: LookAheadPlan[];
  lookAheadId: string;
  onSelectLA: (id: string) => void;
  constraints: Constraint[];
  loading: boolean;
  filter: string;
  onFilter: (s: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const clearMut = useMutation({
    mutationFn: (id: string) => clearConstraint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'constraints'] });
      addToast({ type: 'success', title: t('schedule_advanced.constraint_cleared', { defaultValue: 'Constraint cleared' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  const escalateMut = useMutation({
    mutationFn: (id: string) => escalateConstraint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'constraints'] });
      addToast({ type: 'success', title: t('schedule_advanced.constraint_escalated', { defaultValue: 'Constraint escalated' }) });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteConstraint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'constraints'] });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  if (lookAheads.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<AlertCircle size={22} />}
          title={t('schedule_advanced.no_la_for_constraints', { defaultValue: 'No look-aheads' })}
          description={t('schedule_advanced.no_la_for_constraints_desc', {
            defaultValue: 'Constraints belong to a look-ahead — create one first.',
          })}
        />
      </Card>
    );
  }

  const openCount = constraints.filter((c) => c.status === 'open').length;
  const clearedCount = constraints.filter((c) => c.status === 'cleared').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={lookAheadId}
          onChange={(e) => onSelectLA(e.target.value)}
          className={clsx(inputCls, 'max-w-[260px]')}
        >
          {lookAheads.map((la) => (
            <option key={la.id} value={la.id}>
              {la.period_start} → {la.period_end}
            </option>
          ))}
        </select>
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          className={clsx(inputCls, 'max-w-[180px]')}
        >
          <option value="">
            {t('common.all_statuses', { defaultValue: 'All statuses' })}
          </option>
          {(['open', 'in_progress', 'cleared', 'escalated', 'cannot_clear'] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 ml-auto text-xs">
          <span className="rounded-md bg-semantic-warning-bg px-2 py-1 text-[#b45309]">
            {t('schedule_advanced.open_count', { count: openCount, defaultValue: '{{count}} open' })}
          </span>
          <span className="rounded-md bg-semantic-success-bg px-2 py-1 text-semantic-success">
            {t('schedule_advanced.cleared_count', { count: clearedCount, defaultValue: '{{count}} cleared' })}
          </span>
        </div>
      </div>

      <Card padding="none">
        {loading ? (
          <div className="p-4">
            <SkeletonTable rows={6} columns={5} />
          </div>
        ) : constraints.length === 0 ? (
          <EmptyState
            icon={<AlertCircle size={22} />}
            title={t('schedule_advanced.no_constraints', { defaultValue: 'No constraints' })}
            description={t('schedule_advanced.no_constraints_desc', {
              defaultValue: 'Add constraints from the look-ahead detail view.',
            })}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">{t('schedule_advanced.type', { defaultValue: 'Type' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('common.description', { defaultValue: 'Description' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('schedule_advanced.target_clear', { defaultValue: 'Target clear' })}</th>
                  <th className="px-4 py-2.5 text-left">{t('common.status', { defaultValue: 'Status' })}</th>
                  <th className="px-4 py-2.5 text-right">{t('common.actions', { defaultValue: 'Actions' })}</th>
                </tr>
              </thead>
              <tbody>
                {constraints.map((c) => (
                  <tr key={c.id} className="border-t border-border-light hover:bg-surface-secondary">
                    <td className="px-4 py-2 text-xs text-content-secondary">
                      {c.constraint_type}
                    </td>
                    <td className="px-4 py-2 truncate max-w-[360px]">
                      {c.description || '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-content-secondary">
                      {c.target_clear_date ? <DateDisplay value={c.target_clear_date} /> : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={CONSTRAINT_VARIANT[c.status]} dot>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        {c.status !== 'cleared' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Check size={12} />}
                            onClick={() => clearMut.mutate(c.id)}
                            aria-label={t('schedule_advanced.clear', { defaultValue: 'Clear' })}
                          >
                            {t('schedule_advanced.clear', { defaultValue: 'Clear' })}
                          </Button>
                        )}
                        {c.status === 'open' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<ArrowUpCircle size={12} />}
                            onClick={() => escalateMut.mutate(c.id)}
                            aria-label={t('schedule_advanced.escalate', { defaultValue: 'Escalate' })}
                          />
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={12} />}
                          onClick={() => deleteMut.mutate(c.id)}
                          aria-label={t('common.delete', { defaultValue: 'Delete' })}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Baselines tab ───────────────────────────────────────────────────── */

function BaselinesTab({
  baselines,
  loading,
  onCapture,
}: {
  baselines: Baseline[];
  loading: boolean;
  onCapture: () => void;
}) {
  const { t } = useTranslation();
  const [compareId, setCompareId] = useState<string>('');
  const [deltaEntries, setDeltaEntries] = useState<BaselineDeltaEntry[]>([]);
  const [delaying, setDelaying] = useState(0);
  const [accelerating, setAccelerating] = useState(0);
  const [comparing, setComparing] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const compare = async (id: string) => {
    setCompareId(id);
    setComparing(true);
    try {
      const res = await baselineDelta(id, []);
      setDeltaEntries(res.entries);
      setDelaying(res.delayed_tasks);
      setAccelerating(res.accelerated_tasks);
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setComparing(false);
    }
  };

  if (loading) {
    return (
      <Card padding="md">
        <SkeletonTable rows={4} columns={4} />
      </Card>
    );
  }

  if (baselines.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<GitBranch size={22} />}
          title={t('schedule_advanced.no_baselines', { defaultValue: 'No baselines yet' })}
          description={t('schedule_advanced.no_baselines_desc', {
            defaultValue: 'Capture a baseline to track variance against today’s schedule.',
          })}
          action={{
            label: t('schedule_advanced.capture_baseline', { defaultValue: 'Capture Baseline' }),
            onClick: onCapture,
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={onCapture}
        >
          {t('schedule_advanced.capture_baseline', { defaultValue: 'Capture Baseline' })}
        </Button>
      </div>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">{t('common.name', { defaultValue: 'Name' })}</th>
                <th className="px-4 py-2.5 text-left">{t('schedule_advanced.captured_at', { defaultValue: 'Captured' })}</th>
                <th className="px-4 py-2.5 text-left">{t('common.status', { defaultValue: 'Status' })}</th>
                <th className="px-4 py-2.5 text-right">{t('schedule_advanced.delta', { defaultValue: 'Delta vs current' })}</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map((b) => (
                <tr
                  key={b.id}
                  className={clsx(
                    'border-t border-border-light hover:bg-surface-secondary',
                    b.id === compareId && 'bg-oe-blue-subtle/30',
                  )}
                >
                  <td className="px-4 py-2 font-medium">{b.name}</td>
                  <td className="px-4 py-2 text-xs text-content-secondary">
                    {b.captured_at ? <DateDisplay value={b.captured_at} /> : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        b.status === 'active'
                          ? 'success'
                          : b.status === 'superseded'
                            ? 'warning'
                            : 'neutral'
                      }
                      dot
                    >
                      {b.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => compare(b.id)}
                      loading={comparing && b.id === compareId}
                    >
                      {t('schedule_advanced.compare', { defaultValue: 'Compare' })}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {compareId && (
        <Card padding="md">
          <h3 className="text-sm font-semibold mb-3">
            {t('schedule_advanced.variance_summary', { defaultValue: 'Variance summary' })}
          </h3>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-xs uppercase tracking-wide text-content-tertiary">
                {t('schedule_advanced.tasks_total', { defaultValue: 'Total tasks' })}
              </dt>
              <dd className="text-xl font-semibold">{deltaEntries.length}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-content-tertiary">
                {t('schedule_advanced.delayed', { defaultValue: 'Delayed' })}
              </dt>
              <dd className="text-xl font-semibold text-semantic-error">{delaying}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-content-tertiary">
                {t('schedule_advanced.accelerated', { defaultValue: 'Accelerated' })}
              </dt>
              <dd className="text-xl font-semibold text-semantic-success">{accelerating}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}

/* ── Modals ──────────────────────────────────────────────────────────── */

// ModalShell is the local wrapper used by every "Create … " modal in
// the Schedule Advanced page (master schedule / weekly plan / look-ahead
// / baseline). It now delegates to the shared <WideModal> so the page
// inherits Escape handling, backdrop-click-to-close, body-scroll lock
// and the wider/cleaner layout. Callers stay unchanged.
function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  busy,
  disabled,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <WideModal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="lg"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            loading={busy}
            disabled={disabled}
          >
            {t('common.create', { defaultValue: 'Create' })}
          </Button>
        </>
      }
    >
      <div className="space-y-3">{children}</div>
    </WideModal>
  );
}

function CreateMasterModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayIso());
  const [finish, setFinish] = useState(todayIso(180));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await createMasterSchedule({
        project_id: projectId,
        name: name || 'Master Schedule',
        planned_start: start,
        planned_finish: finish,
      });
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'master', projectId] });
      addToast({ type: 'success', title: t('schedule_advanced.master_created', { defaultValue: 'Master schedule created' }) });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={t('schedule_advanced.create_master', { defaultValue: 'New master schedule' })}
      subtitle={t('schedule_advanced.create_master_subtitle', {
        defaultValue:
          'The master schedule is the top-level CPM plan for this project. Phase plans, weekly plans and look-aheads all roll up to it.',
      })}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      disabled={!name.trim()}
    >
      <div>
        <label className={labelCls}>{t('common.name', { defaultValue: 'Name' })} *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            {t('schedule_advanced.planned_start', { defaultValue: 'Planned start' })}
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>
            {t('schedule_advanced.planned_finish', { defaultValue: 'Planned finish' })}
          </label>
          <input
            type="date"
            value={finish}
            onChange={(e) => setFinish(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
    </ModalShell>
  );
}

function CreateWeeklyModal({
  masterId,
  onClose,
}: {
  masterId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso(7));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await createWeeklyPlan({
        master_schedule_id: masterId,
        week_start_date: start,
        week_end_date: end,
      });
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'weekly', masterId] });
      addToast({ type: 'success', title: t('schedule_advanced.week_created', { defaultValue: 'Weekly plan created' }) });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={t('schedule_advanced.create_weekly', { defaultValue: 'New weekly work plan' })}
      subtitle={t('schedule_advanced.create_weekly_subtitle', {
        defaultValue:
          'Last Planner® weekly plan — pick the work week you want to commit to delivering.',
      })}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            {t('schedule_advanced.week_start', { defaultValue: 'Week start' })}
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>
            {t('schedule_advanced.week_end', { defaultValue: 'Week end' })}
          </label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
    </ModalShell>
  );
}

function CreateLookAheadModal({
  masterId,
  onClose,
}: {
  masterId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso(42));
  const [weeks, setWeeks] = useState(6);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await createLookAhead({
        master_schedule_id: masterId,
        period_start: start,
        period_end: end,
        window_weeks: weeks,
      });
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'look-aheads', masterId] });
      addToast({ type: 'success', title: t('schedule_advanced.la_created', { defaultValue: 'Look-ahead created' }) });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={t('schedule_advanced.create_la', { defaultValue: 'New look-ahead plan' })}
      subtitle={t('schedule_advanced.create_la_subtitle', {
        defaultValue:
          '6-week rolling window of activities ready to be planned at the weekly level. Surfaces constraints that need clearing.',
      })}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            {t('schedule_advanced.period_start', { defaultValue: 'Period start' })}
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>
            {t('schedule_advanced.period_end', { defaultValue: 'Period end' })}
          </label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>
          {t('schedule_advanced.window_weeks', { defaultValue: 'Window (weeks)' })}
        </label>
        <input
          type="number"
          min={1}
          max={24}
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value) || 6)}
          className={inputCls}
        />
      </div>
    </ModalShell>
  );
}

function CreateBaselineModal({
  masterId,
  onClose,
}: {
  masterId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await captureBaseline({
        master_schedule_id: masterId,
        name: name || 'Baseline',
        notes,
      });
      qc.invalidateQueries({ queryKey: ['schedule-advanced', 'baselines', masterId] });
      addToast({ type: 'success', title: t('schedule_advanced.baseline_created', { defaultValue: 'Baseline captured' }) });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={t('schedule_advanced.capture_baseline', { defaultValue: 'Capture baseline' })}
      subtitle={t('schedule_advanced.capture_baseline_subtitle', {
        defaultValue:
          'Snapshot the current schedule so you can measure variance later. Pick a meaningful label, e.g. "Contract signed" or "Q2 rebaseline".',
      })}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      disabled={!name.trim()}
    >
      <div>
        <label className={labelCls}>{t('common.name', { defaultValue: 'Name' })} *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{t('common.notes', { defaultValue: 'Notes' })}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={clsx(inputCls, 'h-auto py-2')}
        />
      </div>
    </ModalShell>
  );
}
