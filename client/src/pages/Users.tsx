import { useState, type FormEvent } from 'react';
import { Avatar, Badge, Button, Card, ErrorText, errorMessage, Field, Icon, Loading, Modal, PageHeader } from '../components/ui';
import { api, useApi } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDate, ROLE_LABEL } from '../lib/format';
import { isManagerRole, type Role, type Team, type User } from '../lib/types';

export function UsersPage() {
    const me = useMe();
    const { data: users, reload } = useApi<User[]>('/users');
    const { data: teams } = useApi<Team[]>('/teams');
    const [editing, setEditing] = useState<User | 'new' | null>(null);
    const [resetting, setResetting] = useState<User | null>(null);
    const [deleting, setDeleting] = useState<User | null>(null);
    const [roleFilter, setRoleFilter] = useState<Role | ''>('');

    const list = (users ?? []).filter((u) => !roleFilter || u.role === roleFilter);

    return (
        <>
            <PageHeader
                title="Users"
                subtitle="Create accounts, set roles, reset passwords and delete users"
                actions={
                    <Button onClick={() => setEditing('new')}>
                        <Icon name="plus" /> New user
                    </Button>
                }
            />
            <Card>
                <div className="border-b border-slate-100 p-3">
                    <select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')}>
                        <option value="">All roles</option>
                        {Object.entries(ROLE_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>
                                {l}
                            </option>
                        ))}
                    </select>
                </div>
                {!users ? (
                    <Loading />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Team</th>
                                    <th>Created</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((u) => (
                                    <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <Avatar user={u} size="sm" />
                                                <div className="min-w-0">
                                                    <span className="font-medium">{u.name}</span>
                                                    {!u.active && <Badge className="ml-2">Disabled</Badge>}
                                                    <div className="text-xs text-slate-500">{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{ROLE_LABEL[u.role]}</td>
                                        <td>{u.team?.name ?? '—'}</td>
                                        <td className="whitespace-nowrap text-slate-500">{formatDate(u.createdAt)}</td>
                                        <td className="text-right whitespace-nowrap">
                                            <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                                                Edit
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
                                                Reset password
                                            </Button>
                                            {u.id !== me.id && (
                                                <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(u)}>
                                                    Delete
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
            {editing && (
                <UserForm
                    user={editing === 'new' ? undefined : editing}
                    isSelf={editing !== 'new' && editing.id === me.id}
                    teams={teams ?? []}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                />
            )}
            {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
            {deleting && (
                <DeleteUser
                    user={deleting}
                    candidates={(users ?? []).filter((u) => u.active && u.id !== deleting.id)}
                    defaultHeirId={me.id}
                    onClose={() => setDeleting(null)}
                    onDeleted={() => {
                        setDeleting(null);
                        reload();
                    }}
                />
            )}
        </>
    );
}

function UserForm({ user, isSelf, teams, onClose, onSaved }: { user?: User; isSelf: boolean; teams: Team[]; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState({
        name: user?.name ?? '',
        email: user?.email ?? '',
        role: user?.role ?? ('ACCOUNTS_EXECUTIVE' as Role),
        teamId: user?.teamId ?? '',
        password: '',
        active: user?.active ?? true,
    });
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const { password, ...rest } = form;
            const body = { ...rest, teamId: form.teamId || null };
            if (user) await api(`/users/${user.id}`, { method: 'PATCH', body });
            else await api('/users', { body: { ...body, password } });
            onSaved();
        } catch (err) {
            setError(errorMessage(err));
            setSaving(false);
        }
    };

    return (
        <Modal title={user ? `Edit ${user.name}` : 'New user'} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <Field label="Full name">
                    <input className="input" required autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Email">
                    <input className="input" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Role">
                        <select className="input" value={form.role} disabled={isSelf} onChange={(e) => set('role', e.target.value as Role)}>
                            {Object.entries(ROLE_LABEL).map(([v, l]) => (
                                <option key={v} value={v}>
                                    {l}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Team" hint={isManagerRole(form.role) ? 'Managers are linked to teams on the Teams page' : undefined}>
                        <select className="input" value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
                            <option value="">No team</option>
                            {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                {!user && (
                    <Field label="Initial password" hint="At least 8 characters. Share it securely with the user.">
                        <input className="input" type="text" required minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} />
                    </Field>
                )}
                {user && !isSelf && (
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                        Account active (disabled users cannot sign in)
                    </label>
                )}
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Saving…' : user ? 'Save' : 'Create user'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function DeleteUser({
    user,
    candidates,
    defaultHeirId,
    onClose,
    onDeleted,
}: {
    user: User;
    candidates: User[];
    defaultHeirId: string;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [heirId, setHeirId] = useState(defaultHeirId);
    const [error, setError] = useState<string>();
    const [deleting, setDeleting] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setDeleting(true);
        setError(undefined);
        try {
            await api(`/users/${user.id}`, { method: 'DELETE', body: { transferToId: heirId } });
            onDeleted();
        } catch (err) {
            setError(errorMessage(err));
            setDeleting(false);
        }
    };

    return (
        <Modal title={`Delete ${user.name}`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-slate-600">
                    {user.name} ({user.email}) will no longer be able to sign in. This cannot be undone. To block access temporarily, disable the account
                    under Edit instead.
                </p>
                <Field label="Hand their work over to" hint="Their tasks, time logs, issues, files and schedules move to this person.">
                    <select className="input" required value={heirId} onChange={(e) => setHeirId(e.target.value)}>
                        {candidates.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.name} · {ROLE_LABEL[u.role]}
                            </option>
                        ))}
                    </select>
                </Field>
                <p className="text-sm text-slate-600">Their notifications, chat messages and direct conversations are deleted.</p>
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="danger" disabled={deleting || !heirId}>
                        {deleting ? 'Deleting…' : 'Delete user'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function ResetPassword({ user, onClose }: { user: User; onClose: () => void }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();
    const [done, setDone] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            await api(`/users/${user.id}/reset-password`, { body: { password } });
            setDone(true);
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <Modal title={`Reset password · ${user.name}`} onClose={onClose}>
            {done ? (
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">The password was changed. {user.name} has been notified.</p>
                    <div className="flex justify-end">
                        <Button onClick={onClose}>Done</Button>
                    </div>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-4">
                    <Field label="New password" hint="At least 8 characters">
                        <input className="input" type="text" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit">Reset password</Button>
                    </div>
                </form>
            )}
        </Modal>
    );
}
