import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, Empty, ErrorText, errorMessage, Field, Icon, Loading, Modal, PageHeader } from '../components/ui';
import { api, uploadFiles, useApi } from '../lib/api';
import { useMe } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';
import { isManagerRole, type Client, type Project, type User } from '../lib/types';
import { AttachmentList } from './TaskDetail';

type Editing = { kind: 'client'; item?: Client } | { kind: 'project'; item?: Project; clientId?: string };

export function ClientsPage() {
    const me = useMe();
    const isAdmin = me.role === 'ADMIN';
    const { data: clients, reload: reloadClients } = useApi<Client[]>('/clients');
    const { data: projects, reload: reloadProjects } = useApi<Project[]>('/projects');
    const { data: users } = useApi<User[]>(isAdmin ? '/users' : null);
    const [editing, setEditing] = useState<Editing | null>(null);

    const reload = () => {
        reloadClients();
        reloadProjects();
    };
    const managers = (users ?? []).filter((u) => u.active && (isManagerRole(u.role) || u.role === 'TEAM_LEAD'));
    const unassigned = (projects ?? []).filter((p) => !p.clientId || !clients?.some((c) => c.id === p.clientId));

    if (!clients || !projects) return <Loading />;

    return (
        <>
            <PageHeader
                title="Clients & projects"
                subtitle={isAdmin ? 'Create clients and projects, assign them to managers and attach documents' : 'Clients and projects assigned to you'}
                actions={
                    isAdmin && (
                        <>
                            <Button variant="secondary" onClick={() => setEditing({ kind: 'project' })}>
                                <Icon name="plus" /> Project
                            </Button>
                            <Button onClick={() => setEditing({ kind: 'client' })}>
                                <Icon name="plus" /> Client
                            </Button>
                        </>
                    )
                }
            />
            {clients.length === 0 && projects.length === 0 && (
                <Card>
                    <Empty>{isAdmin ? 'No clients yet.' : 'No clients or projects have been assigned to you yet.'}</Empty>
                </Card>
            )}
            <div className="space-y-6">
                {clients.map((c) => (
                    <Card
                        key={c.id}
                        title={
                            <span>
                                {c.name}
                                <span className="ml-2 font-normal text-slate-400">· Manager: {c.manager?.name ?? 'unassigned'}</span>
                            </span>
                        }
                        actions={
                            <div className="flex gap-1">
                                <Link to={`/tasks?clientId=${c.id}`} className="px-2 py-1 text-xs font-medium text-brand-600 hover:underline">
                                    {c._count.tasks} tasks
                                </Link>
                                {isAdmin && (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => setEditing({ kind: 'project', clientId: c.id })}>
                                            Add project
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setEditing({ kind: 'client', item: c })}>
                                            Edit
                                        </Button>
                                    </>
                                )}
                            </div>
                        }
                    >
                        {c.description && <p className="px-4 pt-3 text-sm text-slate-600">{c.description}</p>}
                        <Documents files={c.attachments} target={{ clientId: c.id }} canEdit={isAdmin} onChange={reload} />
                        <ProjectList projects={projects.filter((p) => p.clientId === c.id)} isAdmin={isAdmin} onEdit={(p) => setEditing({ kind: 'project', item: p })} onChange={reload} />
                    </Card>
                ))}
                {unassigned.length > 0 && (
                    <Card title="Projects without a client">
                        <ProjectList projects={unassigned} isAdmin={isAdmin} onEdit={(p) => setEditing({ kind: 'project', item: p })} onChange={reload} />
                    </Card>
                )}
            </div>
            {editing && (
                <EntityForm
                    editing={editing}
                    clients={clients}
                    managers={managers}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                />
            )}
        </>
    );
}

function ProjectList({ projects, isAdmin, onEdit, onChange }: { projects: Project[]; isAdmin: boolean; onEdit: (p: Project) => void; onChange: () => void }) {
    if (projects.length === 0) return null;
    return (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {projects.map((p) => (
                <li key={p.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <p className="text-sm font-medium text-slate-800">{p.name}</p>
                            <p className="text-xs text-slate-500">
                                Manager: {p.manager?.name ?? 'unassigned'} · {p._count.tasks} tasks
                            </p>
                            {p.description && <p className="mt-1 text-sm text-slate-600">{p.description}</p>}
                        </div>
                        {isAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>
                                Edit
                            </Button>
                        )}
                    </div>
                    <Documents files={p.attachments} target={{ projectId: p.id }} canEdit={isAdmin} onChange={onChange} compact />
                </li>
            ))}
        </ul>
    );
}

function Documents({
    files,
    target,
    canEdit,
    onChange,
    compact,
}: {
    files: Client['attachments'];
    target: { clientId?: string; projectId?: string };
    canEdit: boolean;
    onChange: () => void;
    compact?: boolean;
}) {
    const [error, setError] = useState<string>();
    if (files.length === 0 && !canEdit) return null;

    const upload = async (list: FileList | null) => {
        if (!list?.length) return;
        try {
            await uploadFiles([...list], target);
            onChange();
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <div className={compact ? 'mt-2 -mx-4' : 'pb-2'}>
            {files.length > 0 && <AttachmentList files={files} onChange={canEdit ? onChange : undefined} />}
            {canEdit && (
                <label className="mx-4 mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                    <Icon name="paperclip" className="size-3.5" /> Attach documents
                    <input type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
                </label>
            )}
            {error && <div className="mx-4 mt-2"><ErrorText>{error}</ErrorText></div>}
        </div>
    );
}

function EntityForm({
    editing,
    clients,
    managers,
    onClose,
    onSaved,
}: {
    editing: Editing;
    clients: Client[];
    managers: User[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const item = editing.item;
    const [form, setForm] = useState({
        name: item?.name ?? '',
        description: item?.description ?? '',
        managerId: item?.managerId ?? '',
        clientId: editing.kind === 'project' ? (editing.item?.clientId ?? editing.clientId ?? '') : '',
    });
    const [files, setFiles] = useState<File[]>([]);
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);
    const label = editing.kind === 'client' ? 'client' : 'project';
    const path = editing.kind === 'client' ? '/clients' : '/projects';

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const body = {
                name: form.name,
                description: form.description,
                managerId: form.managerId || null,
                ...(editing.kind === 'project' ? { clientId: form.clientId || null } : {}),
            };
            const saved = item
                ? await api<{ id: string }>(`${path}/${item.id}`, { method: 'PUT', body })
                : await api<{ id: string }>(path, { body });
            await uploadFiles(files, editing.kind === 'client' ? { clientId: saved.id } : { projectId: saved.id });
            onSaved();
        } catch (err) {
            setError(errorMessage(err));
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!item || !confirm(`Delete ${label} ${item.name}? Its tasks are kept.`)) return;
        await api(`${path}/${item.id}`, { method: 'DELETE' });
        onSaved();
    };

    return (
        <Modal title={item ? `Edit ${label}` : `New ${label}`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <Field label="Name">
                    <input className="input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                {editing.kind === 'project' && (
                    <Field label="Client">
                        <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                            <option value="">No client</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
                <Field label="Assigned to" hint="The manager or team lead responsible. They are notified.">
                    <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                        <option value="">Unassigned</option>
                        {managers.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.name} · {ROLE_LABEL[u.role]}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Description">
                    <textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <Field label="Documents">
                    <input
                        type="file"
                        multiple
                        className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
                        onChange={(e) => setFiles([...(e.target.files ?? [])])}
                    />
                </Field>
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-between gap-2">
                    {item ? (
                        <Button variant="ghost" className="text-rose-600" onClick={remove}>
                            Delete
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
