import { useState, type FormEvent } from 'react';
import { api, MAX_UPLOAD_MB, uploadFiles, useApi } from '../lib/api';
import { PRIORITY_LABEL, ROLE_LABEL, toLocalInput } from '../lib/format';
import type { AssignableUser, Client, Priority, Project, TaskSummary } from '../lib/types';
import { Button, ErrorText, errorMessage, Field, Modal } from './ui';

/** Create a task (with attachments) or edit an existing one. */
export function TaskForm({
    task,
    defaultAssigneeId,
    onClose,
    onSaved,
}: {
    task?: TaskSummary;
    defaultAssigneeId?: string;
    onClose: () => void;
    onSaved: (id: string) => void;
}) {
    const { data: people } = useApi<AssignableUser[]>('/users/assignable');
    const { data: clients } = useApi<Client[]>('/clients');
    const { data: projects } = useApi<Project[]>('/projects');

    const [form, setForm] = useState({
        title: task?.title ?? '',
        description: task?.description ?? '',
        notes: task?.notes ?? '',
        assigneeId: task?.assigneeId ?? defaultAssigneeId ?? '',
        priority: (task?.priority ?? 'MEDIUM') as Priority,
        dueDate: toLocalInput(task?.dueDate),
        clientId: task?.clientId ?? '',
        projectId: task?.projectId ?? '',
    });
    const [files, setFiles] = useState<File[]>([]);
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

    // Editing keeps the current assignee selectable even if they're outside the picker's scope.
    const options = [...(people ?? [])];
    if (task && !options.some((p) => p.id === task.assigneeId)) {
        options.unshift({ id: task.assigneeId, name: task.assignee.name, role: 'EMPLOYEE', teamId: null });
    }
    const visibleProjects = (projects ?? []).filter((p) => !form.clientId || p.clientId === form.clientId);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const body = {
                ...form,
                dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
                clientId: form.clientId || null,
                projectId: form.projectId || null,
            };
            const saved = task
                ? await api<{ id: string }>(`/tasks/${task.id}`, { method: 'PATCH', body })
                : await api<{ id: string }>('/tasks', { body });
            await uploadFiles(files, { taskId: saved.id });
            onSaved(saved.id);
        } catch (err) {
            setError(errorMessage(err));
            setSaving(false);
        }
    };

    return (
        <Modal title={task ? 'Edit task' : 'Assign a new task'} onClose={onClose} wide>
            <form onSubmit={submit} className="space-y-4">
                <Field label="Title">
                    <input className="input" required autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Assign to">
                        <select className="input" required value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
                            <option value="">Choose a person…</option>
                            {options.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} · {ROLE_LABEL[p.role]}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Priority">
                            <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
                                {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Due">
                            <input type="datetime-local" className="input" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
                        </Field>
                    </div>
                    <Field label="Client">
                        <select
                            className="input"
                            value={form.clientId}
                            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, projectId: '' }))}
                        >
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
                            {visibleProjects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <Field label="Description">
                    <textarea className="input min-h-24" value={form.description} onChange={(e) => set('description', e.target.value)} />
                </Field>
                <Field label="Notes for the assignee">
                    <textarea className="input min-h-16" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
                <Field label={task ? 'Add attachments' : 'Attachments'} hint={`Up to 10 files, ${MAX_UPLOAD_MB} MB each`}>
                    <input
                        type="file"
                        multiple
                        className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                        onChange={(e) => setFiles([...(e.target.files ?? [])])}
                    />
                </Field>
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Saving…' : task ? 'Save changes' : 'Assign task'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
