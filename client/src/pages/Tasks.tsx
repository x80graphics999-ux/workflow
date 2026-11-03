import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { TaskForm } from '../components/TaskForm';
import { TaskTable } from '../components/TaskTable';
import { Button, Card, cx, Icon, Loading, PageHeader } from '../components/ui';
import { query, useApi } from '../lib/api';
import { useMe } from '../lib/auth';
import { STATUS_LABEL } from '../lib/format';
import { isStaffRole, type Client, type TaskStatus, type TaskSummary, type User } from '../lib/types';

const TABS: (TaskStatus | '')[] = ['', 'NEW', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];

export function TasksPage() {
    const me = useMe();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState(params.get('q') ?? '');

    const isEmployee = isStaffRole(me.role);
    const status = params.get('status') ?? '';
    const assigneeId = params.get('assigneeId') ?? '';
    const clientId = params.get('clientId') ?? '';
    const mine = params.get('mine') ?? '';

    const { data: tasks, reload } = useApi<TaskSummary[]>(
        `/tasks${query({ status, assigneeId, clientId, mine, q: params.get('q') })}`,
    );
    const { data: people } = useApi<User[]>(isEmployee ? null : '/users');
    const { data: clients } = useApi<Client[]>(isEmployee ? null : '/clients');

    const update = (key: string, value: string) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        setParams(next, { replace: true });
    };

    return (
        <>
            <PageHeader
                title={isEmployee ? 'My tasks' : 'Tasks'}
                subtitle={isEmployee ? 'Everything assigned to you' : 'Tasks you assigned and tasks of people you oversee'}
                actions={
                    !isEmployee && (
                        <Button onClick={() => setCreating(true)}>
                            <Icon name="plus" /> Assign task
                        </Button>
                    )
                }
            />
            <Card>
                <div className="flex flex-col gap-3 border-b border-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex gap-1 overflow-x-auto">
                        {TABS.map((s) => (
                            <button
                                key={s || 'all'}
                                onClick={() => update('status', s)}
                                className={cx(
                                    'rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                                    status === s ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50',
                                )}
                            >
                                {s ? STATUS_LABEL[s] : 'All'}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                update('q', search.trim());
                            }}
                        >
                            <input className="input w-48" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
                        </form>
                        {!isEmployee && (
                            <>
                                <select className="input w-auto" value={assigneeId} onChange={(e) => update('assigneeId', e.target.value)}>
                                    <option value="">Everyone</option>
                                    {people?.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                                <select className="input w-auto" value={clientId} onChange={(e) => update('clientId', e.target.value)}>
                                    <option value="">All clients</option>
                                    {clients?.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}
                    </div>
                </div>
                {!tasks ? <Loading /> : <TaskTable tasks={tasks} showAssignee={!isEmployee} empty="No tasks match these filters." />}
            </Card>
            {creating && (
                <TaskForm
                    defaultAssigneeId={assigneeId}
                    onClose={() => setCreating(false)}
                    onSaved={(id) => {
                        setCreating(false);
                        reload();
                        navigate(`/tasks/${id}`);
                    }}
                />
            )}
        </>
    );
}
