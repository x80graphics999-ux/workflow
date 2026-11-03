import { Fragment } from 'react';
import { formatDuration, isRunning, liveSeconds } from '../lib/format';
import type { TaskSummary } from '../lib/types';
import { Empty } from './ui';
import { useTicker } from './TaskTable';

interface Totals {
    tasks: number;
    completed: number;
    seconds: number;
}

interface ClientGroup extends Totals {
    id: string;
    name: string;
    projects: Map<string, Totals & { name: string }>;
}

const NO_CLIENT = '__none__';
const NO_PROJECT = '__none__';

function add(t: Totals, task: TaskSummary, seconds: number) {
    t.tasks += 1;
    if (task.status === 'COMPLETED') t.completed += 1;
    t.seconds += seconds;
}

/** Time spent per client, with a row for each of its projects. Built from the filtered task list. */
export function ClientTimeTable({ tasks }: { tasks: TaskSummary[] }) {
    const now = useTicker(tasks.some(isRunning));

    const groups = new Map<string, ClientGroup>();
    for (const task of tasks) {
        const seconds = liveSeconds(task, now);
        const clientKey = task.client?.id ?? NO_CLIENT;
        let group = groups.get(clientKey);
        if (!group) {
            group = { id: clientKey, name: task.client?.name ?? 'No client', tasks: 0, completed: 0, seconds: 0, projects: new Map() };
            groups.set(clientKey, group);
        }
        add(group, task, seconds);

        const projectKey = task.project?.id ?? NO_PROJECT;
        let project = group.projects.get(projectKey);
        if (!project) {
            project = { name: task.project?.name ?? 'No project', tasks: 0, completed: 0, seconds: 0 };
            group.projects.set(projectKey, project);
        }
        add(project, task, seconds);
    }

    // Biggest time first; "No client" always last.
    const rows = [...groups.values()].sort((a, b) => (a.id === NO_CLIENT ? 1 : b.id === NO_CLIENT ? -1 : b.seconds - a.seconds));
    if (rows.length === 0) return <Empty>No tasks in this range.</Empty>;

    return (
        <div className="overflow-x-auto">
            <table className="table">
                <thead>
                    <tr>
                        <th>Client / project</th>
                        <th className="text-right">Tasks</th>
                        <th className="text-right">Completed</th>
                        <th className="text-right">Time</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((c) => {
                        const projects = [...c.projects.entries()].sort(([ak, a], [bk, b]) =>
                            ak === NO_PROJECT ? 1 : bk === NO_PROJECT ? -1 : b.seconds - a.seconds,
                        );
                        // A client whose tasks all lack a project needs no sub-row.
                        const showProjects = !(projects.length === 1 && projects[0][0] === NO_PROJECT);
                        return (
                            <Fragment key={c.id}>
                                <tr className="bg-slate-50/60">
                                    <td className="font-semibold text-slate-800">{c.name}</td>
                                    <td className="text-right tabular-nums">{c.tasks}</td>
                                    <td className="text-right tabular-nums">{c.completed}</td>
                                    <td className="text-right font-semibold tabular-nums">{formatDuration(c.seconds)}</td>
                                </tr>
                                {showProjects &&
                                    projects.map(([key, p]) => (
                                        <tr key={`${c.id}-${key}`}>
                                            <td className="pl-8 text-slate-600">{p.name}</td>
                                            <td className="text-right tabular-nums text-slate-600">{p.tasks}</td>
                                            <td className="text-right tabular-nums text-slate-600">{p.completed}</td>
                                            <td className="text-right tabular-nums text-slate-600">{formatDuration(p.seconds)}</td>
                                        </tr>
                                    ))}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
