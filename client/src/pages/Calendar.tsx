import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Card, cx, Empty, ErrorText, errorMessage, Field, Icon, Modal, PageHeader, PriorityBadge } from '../components/ui';
import { api, query, useApi } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDateTime, PRIORITY_LABEL, ROLE_LABEL, toLocalInput } from '../lib/format';
import { isStaffRole, type AssignableUser, type CalendarEvent, type Client, type Priority, type Project, type Schedule, type Team, type User } from '../lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthGrid(month: Date) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function CalendarPage() {
    const me = useMe();
    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [creating, setCreating] = useState<Date | null>(null);
    const [selected, setSelected] = useState<Date>(new Date());

    const days = useMemo(() => monthGrid(month), [month]);
    const from = days[0];
    const to = new Date(days[41].getFullYear(), days[41].getMonth(), days[41].getDate(), 23, 59, 59);

    const { data: events, reload: reloadEvents } = useApi<CalendarEvent[]>(
        `/calendar${query({ from: from.toISOString(), to: to.toISOString() })}`,
    );
    const { data: schedules, reload: reloadSchedules } = useApi<Schedule[]>('/schedules');
    const reload = () => {
        reloadEvents();
        reloadSchedules();
    };

    const canSchedule = !isStaffRole(me.role);
    const eventsOn = (d: Date) => (events ?? []).filter((e) => sameDay(new Date(e.date), d));
    const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

    return (
        <>
            <PageHeader
                title="Calendar"
                subtitle="Due dates, future tasks and recurring work"
                actions={
                    canSchedule && (
                        <Button onClick={() => setCreating(selected)}>
                            <Icon name="plus" /> Schedule task
                        </Button>
                    )
                }
            />

            <div className="grid gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <h2 className="font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous month">
                                <Icon name="chevronLeft" />
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    const now = new Date();
                                    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                                    setSelected(now);
                                }}
                            >
                                Today
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next month">
                                <Icon name="chevronRight" />
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-medium text-slate-500">
                        {WEEKDAYS.map((d) => (
                            <div key={d} className="py-2">
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map((d) => {
                            const list = eventsOn(d);
                            const inMonth = d.getMonth() === month.getMonth();
                            const today = sameDay(d, new Date());
                            return (
                                <button
                                    key={d.toISOString()}
                                    onClick={() => setSelected(d)}
                                    onDoubleClick={() => canSchedule && setCreating(d)}
                                    className={cx(
                                        'min-h-16 border-r border-b border-slate-100 p-1 text-left align-top transition sm:min-h-24 sm:p-1.5',
                                        !inMonth && 'bg-slate-50/60 text-slate-400',
                                        sameDay(d, selected) && 'bg-brand-50 ring-1 ring-brand-500 ring-inset',
                                    )}
                                >
                                    <span
                                        className={cx(
                                            'inline-grid size-6 place-items-center rounded-full text-xs font-medium',
                                            today && 'bg-brand-600 text-white',
                                        )}
                                    >
                                        {d.getDate()}
                                    </span>
                                    <span className="mt-0.5 hidden space-y-0.5 sm:block">
                                        {list.slice(0, 3).map((e) => (
                                            <span
                                                key={e.id}
                                                className={cx(
                                                    'block truncate rounded px-1 py-0.5 text-[11px] leading-tight',
                                                    e.kind === 'task'
                                                        ? e.status === 'COMPLETED'
                                                            ? 'bg-emerald-50 text-emerald-700 line-through'
                                                            : 'bg-sky-50 text-sky-800'
                                                        : 'bg-violet-50 text-violet-800',
                                                )}
                                            >
                                                {e.recurring && '↻ '}
                                                {e.title}
                                            </span>
                                        ))}
                                        {list.length > 3 && <span className="block px-1 text-[11px] text-slate-500">+{list.length - 3} more</span>}
                                    </span>
                                    {list.length > 0 && (
                                        <span className="mt-1 flex gap-0.5 sm:hidden">
                                            {list.slice(0, 4).map((e) => (
                                                <span key={e.id} className={cx('size-1.5 rounded-full', e.kind === 'task' ? 'bg-sky-500' : 'bg-violet-500')} />
                                            ))}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap gap-4 px-4 py-2.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-sky-200" /> Task due
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-violet-200" /> Scheduled / recurring
                        </span>
                        {canSchedule && <span>Double-click a day to schedule on it</span>}
                    </div>
                </Card>

                <div className="space-y-6">
                    <Card title={selected.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
                        {eventsOn(selected).length === 0 ? (
                            <Empty>Nothing on this day.</Empty>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {eventsOn(selected).map((e) => (
                                    <li key={e.id} className="px-4 py-2.5">
                                        {e.kind === 'task' ? (
                                            <Link to={`/tasks/${e.taskId}`} className="text-sm font-medium hover:text-brand-600">
                                                {e.title}
                                            </Link>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-sm font-medium">
                                                {e.recurring && <Icon name="repeat" className="size-3.5 text-violet-600" />}
                                                {e.title}
                                            </span>
                                        )}
                                        <p className="text-xs text-slate-500">
                                            {new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            {e.who && ` · ${e.who}`}
                                            {e.kind === 'task' ? ' · due' : ` · ${e.ruleText}`}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                    <SchedulesCard schedules={schedules ?? []} onChange={reload} />
                </div>
            </div>

            {creating && (
                <ScheduleForm
                    day={creating}
                    onClose={() => setCreating(null)}
                    onSaved={() => {
                        setCreating(null);
                        reload();
                    }}
                />
            )}
        </>
    );
}

function SchedulesCard({ schedules, onChange }: { schedules: Schedule[]; onChange: () => void }) {
    const me = useMe();
    const run = async (fn: () => Promise<unknown>) => {
        try {
            await fn();
            onChange();
        } catch (err) {
            alert(errorMessage(err));
        }
    };

    return (
        <Card title="Scheduled & recurring">
            {schedules.length === 0 ? (
                <Empty>No scheduled work yet.</Empty>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {schedules.map((s) => {
                        const owner = me.role === 'ADMIN' || s.createdById === me.id;
                        return (
                            <li key={s.id} className={cx('px-4 py-3', !s.active && 'opacity-60')}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                                            {s.frequency !== 'ONCE' && <Icon name="repeat" className="size-3.5 text-violet-600" />}
                                            <span className="truncate">{s.title}</span>
                                        </p>
                                        <p className="text-xs text-slate-500">{s.ruleText}</p>
                                        <p className="text-xs text-slate-500">
                                            {s.assignee ? `Task for ${s.assignee.name}` : 'Reminder only'} ·{' '}
                                            {s.recipientType === 'EVERYONE' ? 'Everyone' : s.recipientTeam?.name ?? s.recipientUser?.name ?? '—'}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {s.active && s.nextRunAt ? `Next: ${formatDateTime(s.nextRunAt)}` : 'Finished or paused'} · by {s.createdBy.name}
                                        </p>
                                    </div>
                                    <PriorityBadge priority={s.priority} />
                                </div>
                                {owner && (
                                    <div className="mt-2 flex gap-3 text-xs font-medium">
                                        <button
                                            className="text-brand-600 hover:underline"
                                            onClick={() => run(() => api(`/schedules/${s.id}`, { method: 'PATCH', body: { active: !s.active } }))}
                                        >
                                            {s.active ? 'Pause' : 'Resume'}
                                        </button>
                                        <button
                                            className="text-rose-600 hover:underline"
                                            onClick={() => confirm(`Delete "${s.title}"? Tasks it already created stay.`) && run(() => api(`/schedules/${s.id}`, { method: 'DELETE' }))}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

const REMIND_OPTIONS = [
    { value: 0, label: 'No reminder' },
    { value: 15, label: '15 minutes before' },
    { value: 60, label: '1 hour before' },
    { value: 24 * 60, label: '1 day before' },
    { value: 7 * 24 * 60, label: '1 week before' },
];

function ScheduleForm({ day, onClose, onSaved }: { day: Date; onClose: () => void; onSaved: () => void }) {
    const me = useMe();
    const { data: assignable } = useApi<AssignableUser[]>('/users/assignable');
    const { data: people } = useApi<User[]>('/users');
    const { data: teams } = useApi<Team[]>('/teams');
    const { data: clients } = useApi<Client[]>('/clients');
    const { data: projects } = useApi<Project[]>('/projects');

    const start = new Date(day);
    if (sameDay(start, new Date())) start.setHours(new Date().getHours() + 1, 0, 0, 0);
    else start.setHours(9, 0, 0, 0);

    const [form, setForm] = useState({
        title: '',
        description: '',
        notes: '',
        priority: 'MEDIUM' as Priority,
        startAt: toLocalInput(start),
        frequency: 'ONCE' as Schedule['frequency'],
        interval: 1,
        weekdays: [start.getDay()],
        endAt: '',
        dueInHours: 24,
        remindMinutesBefore: 60,
        assigneeId: '',
        recipientType: 'USER' as Schedule['recipientType'],
        recipientUserId: '',
        recipientTeamId: '',
        clientId: '',
        projectId: '',
    });
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

    const unit = { ONCE: '', DAILY: 'day(s)', WEEKLY: 'week(s)', MONTHLY: 'month(s)' }[form.frequency];

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            await api('/schedules', {
                body: {
                    ...form,
                    startAt: new Date(form.startAt).toISOString(),
                    endAt: form.endAt ? new Date(`${form.endAt}T23:59:59`).toISOString() : null,
                    weekdays: form.frequency === 'WEEKLY' ? form.weekdays : [],
                    assigneeId: form.assigneeId || null,
                    recipientUserId: form.recipientUserId || null,
                    recipientTeamId: form.recipientTeamId || null,
                    clientId: form.clientId || null,
                    projectId: form.projectId || null,
                },
            });
            onSaved();
        } catch (err) {
            setError(errorMessage(err));
            setSaving(false);
        }
    };

    return (
        <Modal title="Schedule a future or recurring task" onClose={onClose} wide>
            <form onSubmit={submit} className="space-y-4">
                <Field label="Title">
                    <input className="input" required autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} />
                </Field>
                <Field label="Description">
                    <textarea className="input min-h-16" value={form.description} onChange={(e) => set('description', e.target.value)} />
                </Field>

                <fieldset className="rounded-lg border border-slate-200 p-3">
                    <legend className="px-1 text-xs font-semibold text-slate-600">When</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Starts">
                            <input type="datetime-local" className="input" required value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
                        </Field>
                        <Field label="Repeats">
                            <select className="input" value={form.frequency} onChange={(e) => set('frequency', e.target.value as Schedule['frequency'])}>
                                <option value="ONCE">Does not repeat</option>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                            </select>
                        </Field>
                        {form.frequency !== 'ONCE' && (
                            <>
                                <Field label={`Every`} hint={unit}>
                                    <input type="number" min={1} max={365} className="input" value={form.interval} onChange={(e) => set('interval', Number(e.target.value))} />
                                </Field>
                                <Field label="Ends (optional)">
                                    <input type="date" className="input" value={form.endAt} onChange={(e) => set('endAt', e.target.value)} />
                                </Field>
                            </>
                        )}
                    </div>
                    {form.frequency === 'WEEKLY' && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {WEEKDAYS.map((name, i) => {
                                const on = form.weekdays.includes(i);
                                return (
                                    <button
                                        type="button"
                                        key={name}
                                        onClick={() => set('weekdays', on ? form.weekdays.filter((d) => d !== i) : [...form.weekdays, i].sort())}
                                        className={cx(
                                            'rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                                            on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
                                        )}
                                    >
                                        {name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </fieldset>

                <fieldset className="rounded-lg border border-slate-200 p-3">
                    <legend className="px-1 text-xs font-semibold text-slate-600">Who</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Create a task for" hint="Leave empty for a calendar reminder only">
                            <select className="input" value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
                                <option value="">No task — reminder only</option>
                                {assignable?.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} · {ROLE_LABEL[p.role]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Remind">
                            <select className="input" value={form.recipientType} onChange={(e) => set('recipientType', e.target.value as Schedule['recipientType'])}>
                                <option value="USER">A specific person</option>
                                <option value="TEAM">A whole team</option>
                                <option value="EVERYONE">{me.role === 'ADMIN' ? 'Everyone' : 'Everyone I oversee'}</option>
                            </select>
                        </Field>
                        {form.recipientType === 'USER' && (
                            <Field label="Person to remind" hint={form.assigneeId ? 'Defaults to the assignee' : undefined}>
                                <select className="input" value={form.recipientUserId} onChange={(e) => set('recipientUserId', e.target.value)}>
                                    <option value="">{form.assigneeId ? 'Same as assignee' : 'Choose…'}</option>
                                    {people?.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                        {form.recipientType === 'TEAM' && (
                            <Field label="Team">
                                <select className="input" required value={form.recipientTeamId} onChange={(e) => set('recipientTeamId', e.target.value)}>
                                    <option value="">Choose…</option>
                                    {teams?.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                        <Field label="Reminder">
                            <select className="input" value={form.remindMinutesBefore} onChange={(e) => set('remindMinutesBefore', Number(e.target.value))}>
                                {REMIND_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                </fieldset>

                {form.assigneeId && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Priority">
                            <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
                                {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Due after start (hours)">
                            <input type="number" min={1} className="input" value={form.dueInHours} onChange={(e) => set('dueInHours', Number(e.target.value))} />
                        </Field>
                        <Field label="Client">
                            <select className="input" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, projectId: '' }))}>
                                <option value="">No client</option>
                                {clients?.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Project">
                            <select className="input" value={form.projectId} onChange={(e) => set('projectId', e.target.value)}>
                                <option value="">No project</option>
                                {projects
                                    ?.filter((p) => !form.clientId || p.clientId === form.clientId)
                                    .map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                            </select>
                        </Field>
                        <Field label="Notes for the assignee" className="sm:col-span-2">
                            <textarea className="input min-h-16" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                        </Field>
                    </div>
                )}

                {form.assigneeId && form.frequency !== 'ONCE' && (
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                        <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Recurring</Badge>A new task is created for the assignee at each occurrence.
                    </p>
                )}
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Saving…' : 'Schedule'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
