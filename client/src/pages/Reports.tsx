import { useState } from 'react';
import { ClientTimeTable } from '../components/ClientTimeTable';
import { TaskTable } from '../components/TaskTable';
import { Button, Card, ErrorText, errorMessage, Field, Icon, Loading, PageHeader, Stat } from '../components/ui';
import { download, query, useApi } from '../lib/api';
import { formatDuration, STATUS_LABEL } from '../lib/format';
import type { Client, Project, TaskSummary, User } from '../lib/types';

function monthStart() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function ReportsPage() {
    const [filters, setFilters] = useState({
        from: monthStart(),
        to: '',
        assigneeId: '',
        clientId: '',
        projectId: '',
        status: '',
    });
    const [error, setError] = useState<string>();
    const [exporting, setExporting] = useState(false);
    const { data: users } = useApi<User[]>('/users');
    const { data: clients } = useApi<Client[]>('/clients');
    const { data: projects } = useApi<Project[]>('/projects');
    const { data: tasks } = useApi<TaskSummary[]>(`/tasks${query(filters)}`);

    const set = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
    const total = (tasks ?? []).reduce((n, t) => n + t.totalSeconds, 0);
    const completed = (tasks ?? []).filter((t) => t.status === 'COMPLETED').length;

    const exportExcel = async () => {
        setExporting(true);
        setError(undefined);
        try {
            await download(`/reports/tasks.xlsx${query(filters)}`, 'fixflow-report.xlsx');
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setExporting(false);
        }
    };

    return (
        <>
            <PageHeader
                title="Reports"
                subtitle="Tasks with dates, descriptions, assignees and time spent. The Excel file also includes the full assignment history."
                actions={
                    <Button onClick={exportExcel} disabled={exporting}>
                        <Icon name="download" /> {exporting ? 'Preparing…' : 'Download Excel'}
                    </Button>
                }
            />
            <ErrorText>{error}</ErrorText>
            <Card className="mb-6">
                <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
                    <Field label="Assigned from">
                        <input type="date" className="input" value={filters.from} onChange={(e) => set('from', e.target.value)} />
                    </Field>
                    <Field label="To">
                        <input type="date" className="input" value={filters.to} onChange={(e) => set('to', e.target.value)} />
                    </Field>
                    <Field label="Person">
                        <select className="input" value={filters.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
                            <option value="">Everyone</option>
                            {users?.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Client">
                        <select className="input" value={filters.clientId} onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value, projectId: '' }))}>
                            <option value="">All clients</option>
                            {clients?.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Project">
                        <select className="input" value={filters.projectId} onChange={(e) => set('projectId', e.target.value)}>
                            <option value="">All projects</option>
                            {projects
                                ?.filter((p) => !filters.clientId || p.clientId === filters.clientId)
                                .map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                        </select>
                    </Field>
                    <Field label="Status">
                        <select className="input" value={filters.status} onChange={(e) => set('status', e.target.value)}>
                            <option value="">Any status</option>
                            {Object.entries(STATUS_LABEL).map(([v, l]) => (
                                <option key={v} value={v}>
                                    {l}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
            </Card>
            <div className="mb-6 grid grid-cols-3 gap-3">
                <Stat label="Tasks" value={tasks?.length ?? '—'} />
                <Stat label="Completed" value={completed} tone="emerald" />
                <Stat label="Time spent" value={formatDuration(total)} tone="brand" />
            </div>
            <Card title="Time by client and project" className="mb-6">
                {!tasks ? <Loading /> : <ClientTimeTable tasks={tasks} />}
            </Card>
            <Card title="Preview">{!tasks ? <Loading /> : <TaskTable tasks={tasks} empty="No tasks in this range." />}</Card>
        </>
    );
}
