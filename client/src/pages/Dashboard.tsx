import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { TaskForm } from '../components/TaskForm';
import { TaskTable } from '../components/TaskTable';
import { Badge, Button, Card, cx, Empty, Icon, Loading, PageHeader, Stat } from '../components/ui';
import { useApi } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDateTime, formatDuration, ROLE_LABEL, timeAgo } from '../lib/format';
import { isManagerRole, isStaffRole, type ActivityItem, type Dashboard, type TaskSummary } from '../lib/types';

export function DashboardPage() {
    const me = useMe();
    const { data, error, reload } = useApi<Dashboard>('/dashboard');
    const [assigning, setAssigning] = useState(false);
    const navigate = useNavigate();

    const isEmployee = isStaffRole(me.role);
    const title =
        me.role === 'ADMIN' ? 'Organization overview' : isManagerRole(me.role) ? 'Team performance' : me.role === 'TEAM_LEAD' ? 'Team progress' : 'My tasks';

    return (
        <>
            <PageHeader
                title={title}
                subtitle={`Welcome back, ${me.name.split(' ')[0]}`}
                actions={
                    !isEmployee && (
                        <>
                            <Button variant="secondary" onClick={() => navigate('/reports')}>
                                <Icon name="download" /> Export Excel
                            </Button>
                            <Button onClick={() => setAssigning(true)}>
                                <Icon name="plus" /> Assign task
                            </Button>
                        </>
                    )
                }
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {!data ? (
                <Loading />
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        <Stat label="New" value={data.counts.NEW} tone="sky" />
                        <Stat label="In progress" value={data.counts.IN_PROGRESS} tone="amber" />
                        <Stat label="Blocked" value={data.counts.BLOCKED} tone="rose" />
                        <Stat label="Completed" value={data.counts.COMPLETED} tone="emerald" />
                        <Stat label={isEmployee ? 'My time logged' : 'Time logged'} value={formatDuration(data.totalSeconds)} tone="brand" />
                    </div>
                    {isEmployee ? <EmployeeBoard data={data} /> : <OverseerBoard data={data} />}
                </div>
            )}
            {assigning && (
                <TaskForm
                    onClose={() => setAssigning(false)}
                    onSaved={() => {
                        setAssigning(false);
                        reload();
                    }}
                />
            )}
        </>
    );
}

function EmployeeBoard({ data }: { data: Dashboard }) {
    const now = Date.now();
    const open = data.mine.filter((t) => t.status !== 'COMPLETED');
    // "Upcoming" = not started yet and due more than a day from now.
    const upcoming = open.filter((t) => t.status === 'NEW' && t.dueDate && new Date(t.dueDate).getTime() > now + 86400000);
    const fresh = open.filter((t) => t.status === 'NEW' && !upcoming.includes(t));
    const active = open.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'BLOCKED');
    const done = data.mine
        .filter((t) => t.status === 'COMPLETED')
        .sort((a, b) => +new Date(b.completedAt ?? 0) - +new Date(a.completedAt ?? 0))
        .slice(0, 10);

    return (
        <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
                <Card title={`New & pending · ${fresh.length}`}>
                    <TaskTable tasks={fresh} showAssignee={false} empty="No new tasks. Nice!" />
                </Card>
                <Card title={`In progress · ${active.length}`}>
                    <TaskTable tasks={active} showAssignee={false} empty="Nothing in progress. Start a task to track your time." />
                </Card>
                <Card title="Recently completed">
                    <TaskTable tasks={done} showAssignee={false} empty="Completed tasks will appear here." />
                </Card>
            </div>
            <div className="space-y-6">
                <UpcomingCard tasks={upcoming} schedules={data.upcomingSchedules} />
                <ActivityCard items={data.recentActivity} />
            </div>
        </div>
    );
}

function OverseerBoard({ data }: { data: Dashboard }) {
    const me = useMe();
    const myOpen = data.mine.filter((t) => t.status !== 'COMPLETED');

    return (
        <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
                <Card title={me.role === 'ADMIN' ? 'Everyone' : 'My team'}>
                    {data.team.length === 0 ? (
                        <Empty>{me.role === 'ADMIN' ? 'Create users to get started.' : 'No one is assigned to your team yet.'}</Empty>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Person</th>
                                        <th className="text-right">New</th>
                                        <th className="text-right">In progress</th>
                                        <th className="text-right">Blocked</th>
                                        <th className="text-right">Done</th>
                                        <th className="text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.team.map((p) => (
                                        <tr key={p.id}>
                                            <td className="whitespace-nowrap">
                                                <Link to={`/tasks?assigneeId=${p.id}`} className="font-medium hover:text-brand-600">
                                                    {p.name}
                                                </Link>
                                                {p.working && <Badge className="ml-2 bg-emerald-50 text-emerald-700 ring-emerald-200">Working now</Badge>}
                                                <div className="text-xs text-slate-400">
                                                    {ROLE_LABEL[p.role]}
                                                    {p.team ? ` · ${p.team.name}` : ''}
                                                </div>
                                            </td>
                                            <td className="text-right tabular-nums">{p.new}</td>
                                            <td className="text-right tabular-nums">{p.inProgress}</td>
                                            <td className={cx('text-right tabular-nums', p.blocked > 0 && 'font-semibold text-rose-600')}>{p.blocked}</td>
                                            <td className="text-right tabular-nums">{p.completed}</td>
                                            <td className="text-right whitespace-nowrap tabular-nums">{formatDuration(p.totalSeconds)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
                <Card title={`Open issues · ${data.openIssues.length}`}>
                    {data.openIssues.length === 0 ? (
                        <Empty>No blockers reported.</Empty>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {data.openIssues.map((i) => (
                                <li key={i.id} className="px-4 py-3">
                                    <Link to={`/tasks/${i.task.id}`} className="text-sm font-medium hover:text-brand-600">
                                        {i.task.title}
                                    </Link>
                                    <p className="mt-0.5 text-sm text-slate-600">{i.description}</p>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {i.reporter.name} · {timeAgo(i.createdAt)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
                {myOpen.length > 0 && (
                    <Card title="Assigned to me">
                        <TaskTable tasks={myOpen} showAssignee={false} />
                    </Card>
                )}
            </div>
            <div className="space-y-6">
                <UpcomingCard tasks={data.upcomingTasks} schedules={data.upcomingSchedules} />
                <ActivityCard items={data.recentActivity} />
            </div>
        </div>
    );
}

function UpcomingCard({ tasks, schedules }: { tasks: TaskSummary[]; schedules: Dashboard['upcomingSchedules'] }) {
    const items = [
        ...tasks.map((t) => ({ key: t.id, date: t.dueDate!, title: t.title, to: `/tasks/${t.id}`, meta: `Due · ${t.assignee.name}`, recurring: false })),
        ...schedules.map((s) => ({
            key: s.id,
            date: s.nextRunAt!,
            title: s.title,
            to: '/calendar',
            meta: `${s.ruleText}${s.assignee ? ` · ${s.assignee.name}` : s.recipientTeam ? ` · ${s.recipientTeam.name}` : ''}`,
            recurring: s.frequency !== 'ONCE',
        })),
    ].sort((a, b) => +new Date(a.date) - +new Date(b.date));

    return (
        <Card title="Upcoming" actions={<Link to="/calendar" className="text-xs font-medium text-brand-600 hover:underline">Calendar</Link>}>
            {items.length === 0 ? (
                <Empty>Nothing scheduled.</Empty>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {items.slice(0, 10).map((i) => (
                        <li key={i.key}>
                            <Link to={i.to} className="flex gap-3 px-4 py-2.5 hover:bg-slate-50">
                                <span className="w-14 shrink-0 text-xs font-medium text-slate-500">{formatDateTime(i.date).split(',')[0]}</span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                                        {i.recurring && <Icon name="repeat" className="size-3.5 text-brand-500" />}
                                        <span className="truncate">{i.title}</span>
                                    </span>
                                    <span className="block truncate text-xs text-slate-500">{i.meta}</span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

export function ActivityCard({ items }: { items: ActivityItem[] }) {
    return (
        <Card title="Recent activity">
            {items.length === 0 ? (
                <Empty>No activity yet.</Empty>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {items.map((a) => (
                        <li key={a.id} className="px-4 py-2.5">
                            <p className="text-sm text-slate-700">
                                {a.task ? (
                                    <Link to={`/tasks/${a.task.id}`} className="hover:text-brand-600">
                                        {a.message}
                                    </Link>
                                ) : (
                                    a.message
                                )}
                            </p>
                            <p className="text-xs text-slate-400">{timeAgo(a.createdAt)}</p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
