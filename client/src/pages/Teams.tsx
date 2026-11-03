import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Avatar, Button, Card, Empty, ErrorText, errorMessage, Field, Icon, Loading, Modal, PageHeader } from '../components/ui';
import { api, useApi } from '../lib/api';
import { useMe } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';
import { isManagerRole, isStaffRole, type Team, type User } from '../lib/types';

export function TeamsPage() {
    const me = useMe();
    const isAdmin = me.role === 'ADMIN';
    const { data: teams, reload } = useApi<Team[]>('/teams');
    const { data: users } = useApi<User[]>(isAdmin ? '/users' : null);
    const [editing, setEditing] = useState<Team | 'new' | null>(null);

    return (
        <>
            <PageHeader
                title="Teams"
                subtitle={isAdmin ? 'Group people into teams under a manager' : 'Teams you manage or belong to'}
                actions={
                    isAdmin && (
                        <Button onClick={() => setEditing('new')}>
                            <Icon name="plus" /> New team
                        </Button>
                    )
                }
            />
            {!teams ? (
                <Loading />
            ) : teams.length === 0 ? (
                <Card>
                    <Empty>{isAdmin ? 'No teams yet. Create one to group people under a manager.' : 'You are not assigned to any team yet.'}</Empty>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {teams.map((t) => (
                        <Card
                            key={t.id}
                            title={t.name}
                            actions={
                                isAdmin && (
                                    <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                                        Edit
                                    </Button>
                                )
                            }
                        >
                            <div className="space-y-3 p-4 text-sm">
                                {t.description && <p className="text-slate-500">{t.description}</p>}
                                <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
                                    <dt className="text-slate-500">Manager</dt>
                                    <dd className="font-medium">{t.manager?.name ?? '—'}</dd>
                                </dl>
                                <div>
                                    <p className="label">Members · {t.members.length}</p>
                                    <ul className="flex flex-wrap gap-1.5">
                                        {t.members.map((m) => (
                                            <li key={m.id}>
                                                <Link
                                                    to={`/tasks?assigneeId=${m.id}`}
                                                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pr-2.5 pl-0.5 text-xs text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                                                >
                                                    <Avatar user={m} size="xs" />
                                                    {m.name}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
            {editing && users && (
                <TeamForm
                    team={editing === 'new' ? undefined : editing}
                    users={users}
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

function TeamForm({ team, users, onClose, onSaved }: { team?: Team; users: User[]; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState({
        name: team?.name ?? '',
        description: team?.description ?? '',
        managerId: team?.managerId ?? '',
        memberIds: team?.members.map((m) => m.id) ?? [],
    });
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);

    const active = users.filter((u) => u.active);
    const managers = active.filter((u) => isManagerRole(u.role));
    const memberCandidates = active.filter((u) => isStaffRole(u.role) || u.role === 'TEAM_LEAD');

    const toggle = (id: string) =>
        setForm((f) => ({ ...f, memberIds: f.memberIds.includes(id) ? f.memberIds.filter((m) => m !== id) : [...f.memberIds, id] }));

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const body = { ...form, managerId: form.managerId || null };
            if (team) await api(`/teams/${team.id}`, { method: 'PUT', body });
            else await api('/teams', { body });
            onSaved();
        } catch (err) {
            setError(errorMessage(err));
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!team || !confirm(`Delete team ${team.name}? Members stay but lose their team.`)) return;
        await api(`/teams/${team.id}`, { method: 'DELETE' });
        onSaved();
    };

    return (
        <Modal title={team ? `Edit ${team.name}` : 'New team'} onClose={onClose} wide>
            <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Team name">
                        <input className="input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label="Description">
                        <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </Field>
                    <Field label="Manager">
                        <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                            <option value="">No manager</option>
                            {managers.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <div>
                    <p className="label">Members</p>
                    <div className="grid max-h-60 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                        {memberCandidates.map((u) => (
                            <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                                <input type="checkbox" checked={form.memberIds.includes(u.id)} onChange={() => toggle(u.id)} />
                                <span>
                                    {u.name}
                                    <span className="ml-1 text-xs text-slate-400">
                                        {ROLE_LABEL[u.role]}
                                        {u.team && u.team.id !== team?.id ? ` · in ${u.team.name}` : ''}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Adding someone who is in another team moves them to this one.</p>
                </div>
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-between gap-2">
                    {team ? (
                        <Button variant="ghost" className="text-rose-600" onClick={remove}>
                            Delete team
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : 'Save team'}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
