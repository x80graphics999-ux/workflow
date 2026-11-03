import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api, useApi } from '../lib/api';
import { useAuth, useMe } from '../lib/auth';
import { ROLE_LABEL, timeAgo } from '../lib/format';
import { OVERSEER_ROLES, type Notification, type Role } from '../lib/types';
import { Avatar, cx, Icon } from './ui';

type Section = 'tasks' | 'clients' | 'calendar' | 'activity' | 'chat';

const NAV: { to: string; label: string; icon: string; roles?: Role[]; badge?: Section }[] = [
    { to: '/', label: 'Dashboard', icon: 'home' },
    { to: '/tasks', label: 'Tasks', icon: 'tasks', badge: 'tasks' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar', badge: 'calendar' },
    { to: '/chat', label: 'Chat', icon: 'chat', badge: 'chat' },
    { to: '/clients', label: 'Clients & projects', icon: 'briefcase', roles: OVERSEER_ROLES, badge: 'clients' },
    { to: '/teams', label: 'Teams', icon: 'team', roles: OVERSEER_ROLES },
    { to: '/users', label: 'Users', icon: 'users', roles: ['ADMIN'] },
    { to: '/activity', label: 'Work history', icon: 'history', roles: OVERSEER_ROLES, badge: 'activity' },
    { to: '/reports', label: 'Reports', icon: 'report', roles: OVERSEER_ROLES },
    { to: '/account', label: 'My account', icon: 'user' },
];

export function Layout() {
    const me = useMe();
    const { logout } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();

    useEffect(() => setMenuOpen(false), [location.pathname]);

    const links = NAV.filter((n) => !n.roles || n.roles.includes(me.role));
    const counts = useNavCounts();
    const pending = links.reduce((sum, n) => sum + (n.badge ? counts[n.badge] : 0), 0);
    useMarkPageSeen(location.pathname);

    return (
        <div className="min-h-screen lg:flex">
            <aside
                className={cx(
                    'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0',
                    menuOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                <Link to="/" className="flex items-center gap-3 px-5 py-5" aria-label="TaskFlow home">
                    <img src="/logo.png" alt="FixIT Consul-Tech" className="h-9 w-auto" />
                    <span className="border-l border-slate-200 pl-3 text-sm font-semibold tracking-wide text-brand-700">TaskFlow</span>
                </Link>
                <nav className="flex-1 space-y-0.5 px-3">
                    {links.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.to === '/'}
                            className={({ isActive }) =>
                                cx(
                                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                                )
                            }
                        >
                            <Icon name={n.icon} />
                            {n.label}
                            {n.badge && <CountBadge count={counts[n.badge]} label={n.label} />}
                        </NavLink>
                    ))}
                </nav>
                <div className="border-t border-slate-100 p-4">
                    <Link to="/account" className="flex items-center gap-3 rounded-lg hover:opacity-80">
                        <Avatar user={me} />
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">{me.name}</span>
                            <span className="block truncate text-xs text-slate-500">
                                {ROLE_LABEL[me.role]}
                                {me.team ? ` · ${me.team.name}` : ''}
                            </span>
                        </span>
                    </Link>
                    <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-rose-600">
                        <Icon name="logout" /> Sign out
                    </button>
                </div>
            </aside>
            {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} />}

            <div className="min-w-0 flex-1">
                <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
                    <button
                        className="relative rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
                        onClick={() => setMenuOpen(true)}
                        aria-label={pending ? `Open menu, ${pending} new` : 'Open menu'}
                    >
                        <Icon name="menu" className="size-5" />
                        {pending > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-accent-600 ring-2 ring-white" />}
                    </button>
                    <div className="flex-1" />
                    <NotificationBell />
                </header>
                <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

/** Fired whenever notification read-state changes, so the bell and the sidebar numbers refresh together. */
const NOTIFICATIONS_CHANGED = 'notifications:changed';
const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

/** Re-runs `reload` on an interval, when the tab regains focus, and on the given window events. */
function useRefresh(reload: () => void, ms: number, events: string[]) {
    useEffect(() => {
        const id = setInterval(reload, ms);
        const all = ['focus', ...events];
        all.forEach((e) => window.addEventListener(e, reload));
        return () => {
            clearInterval(id);
            all.forEach((e) => window.removeEventListener(e, reload));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, ms, events.join()]);
}

/** New items per sidebar page: unread alerts for tasks / clients / calendar, new work history, unread chat. */
function useNavCounts(): Record<Section, number> {
    const { data, reload } = useApi<Omit<Record<Section, number>, 'chat'>>('/notifications/counts');
    const { data: chat, reload: reloadChat } = useApi<{ unread: number }>('/chat/unread');
    useRefresh(reload, 15_000, [NOTIFICATIONS_CHANGED]);
    // The chat page fires `chat:read` so its number drops without waiting for the poll.
    useRefresh(reloadChat, 15_000, ['chat:read']);
    return { tasks: 0, clients: 0, calendar: 0, activity: 0, ...data, chat: chat?.unread ?? 0 };
}

const TRACKED_PAGE = /^\/(tasks(\/[\w-]+)?|clients|calendar|activity)$/;

/** Opening a page clears its sidebar number (and the matching bell items). */
function useMarkPageSeen(pathname: string) {
    useEffect(() => {
        if (!TRACKED_PAGE.test(pathname)) return;
        api('/notifications/seen', { body: { path: pathname } })
            .then(announceNotificationsChanged)
            .catch(() => {});
    }, [pathname]);
}

function CountBadge({ count, label }: { count: number; label: string }) {
    if (count <= 0) return null;
    return (
        <span
            className="ml-auto grid min-w-5 place-items-center rounded-full bg-accent-600 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums"
            aria-label={`${count} new in ${label}`}
        >
            {count > 99 ? '99+' : count}
        </span>
    );
}

const NOTIFICATION_POLL_MS = 15_000;
const TOAST_MS = 8_000;

const desktopAlertsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

function NotificationBell() {
    const { is } = useAuth();
    const [open, setOpen] = useState(false);
    const { data, reload } = useApi<{ items: Notification[]; unread: number }>('/notifications');
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);
    const newestSeen = useRef<string | null>(null);
    const [toasts, setToasts] = useState<Notification[]>([]);
    const [ring, setRing] = useState(0);
    const [permission, setPermission] = useState(() => (desktopAlertsSupported() ? window.Notification.permission : 'denied'));

    // Poll so reminders and team activity show up without a refresh.
    useRefresh(reload, NOTIFICATION_POLL_MS, [NOTIFICATIONS_CHANGED]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const openItem = async (n: Notification) => {
        setToasts((t) => t.filter((x) => x.id !== n.id));
        if (!n.read) await api(`/notifications/${n.id}/read`, { method: 'POST' });
        announceNotificationsChanged();
        setOpen(false);
        if (n.link) navigate(n.link);
    };

    // Announce anything that arrived since the previous poll. The first load only sets the baseline.
    useEffect(() => {
        if (!data) return;
        const newest = data.items[0]?.createdAt ?? '';
        const since = newestSeen.current;
        if (since === null || newest > since) newestSeen.current = newest;
        if (since === null) return;

        const fresh = data.items.filter((n) => !n.read && n.createdAt > since);
        if (fresh.length === 0) return;
        setRing((r) => r + 1);
        announceNotificationsChanged(); // so the sidebar numbers catch up straight away
        setToasts((t) => [...fresh, ...t].slice(0, 3));
        if (document.hidden && permission === 'granted') {
            fresh.slice(0, 3).forEach((n) => {
                const alert = new window.Notification(n.title, { body: n.body, icon: '/icon-192.png', tag: n.id });
                alert.onclick = () => {
                    window.focus();
                    openItem(n);
                };
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // Unread count in the browser tab title.
    useEffect(() => {
        const base = document.title.replace(/^\(\d+\+?\) /, '');
        const unread = data?.unread ?? 0;
        document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
    }, [data?.unread]);

    const markAll = async () => {
        await api('/notifications/read-all', { method: 'POST' });
        setToasts([]);
        announceNotificationsChanged();
    };

    const enableDesktopAlerts = async () => setPermission(await window.Notification.requestPermission());

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ''}`}
            >
                <span key={ring} className={cx('block origin-top', ring > 0 && 'animate-bell')}>
                    <Icon name="bell" className="size-5" />
                </span>
                {!!data?.unread && (
                    <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-accent-600 px-1 text-[10px] leading-4 font-semibold text-white">
                        {data.unread > 99 ? '99+' : data.unread}
                    </span>
                )}
            </button>
            {open && (
                <div className="card absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                        <span className="text-sm font-semibold">Notifications</span>
                        {!!data?.unread && (
                            <button onClick={markAll} className="text-xs font-medium text-brand-600 hover:underline">
                                Mark all read
                            </button>
                        )}
                    </div>
                    {permission === 'default' && desktopAlertsSupported() && (
                        <button
                            onClick={enableDesktopAlerts}
                            className="flex w-full items-center gap-2 border-b border-slate-100 bg-brand-50 px-4 py-2 text-left text-xs font-medium text-brand-700 hover:bg-brand-100"
                        >
                            <Icon name="bell" /> Turn on desktop alerts for when this tab is in the background
                        </button>
                    )}
                    <ul className="max-h-[28rem] overflow-y-auto">
                        {data?.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">You're all caught up</li>}
                        {data?.items.map((n) => (
                            <li key={n.id}>
                                <button
                                    onClick={() => openItem(n)}
                                    className={cx('block w-full border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50', !n.read && 'bg-brand-50/50')}
                                >
                                    <span className="flex items-start gap-2">
                                        {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />}
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                                            {n.body && <span className="line-clamp-2 block text-xs text-slate-500">{n.body}</span>}
                                            <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {is(...OVERSEER_ROLES) && (
                        <Link
                            to="/activity"
                            onClick={() => setOpen(false)}
                            className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-50"
                        >
                            View full work history
                        </Link>
                    )}
                </div>
            )}
            {/* Portalled: the header's backdrop blur would otherwise trap fixed positioning. */}
            {createPortal(
                <div className="pointer-events-none fixed top-16 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
                    {toasts.map((n) => (
                        <Toast key={n.id} notification={n} onOpen={() => openItem(n)} onClose={() => setToasts((t) => t.filter((x) => x.id !== n.id))} />
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
}

function Toast({ notification: n, onOpen, onClose }: { notification: Notification; onOpen: () => void; onClose: () => void }) {
    // Keep the latest callback without restarting the timer on every parent render.
    const close = useRef(onClose);
    useEffect(() => {
        close.current = onClose;
    });
    useEffect(() => {
        const id = setTimeout(() => close.current(), TOAST_MS);
        return () => clearTimeout(id);
    }, []);

    return (
        <div className="card pointer-events-auto flex animate-toast-in items-start gap-3 border-l-4 border-l-brand-600 p-3 shadow-lg">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Icon name="bell" />
            </span>
            <button onClick={onOpen} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-semibold text-slate-800">{n.title}</span>
                {n.body && <span className="line-clamp-2 block text-xs text-slate-500">{n.body}</span>}
            </button>
            <button onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Dismiss">
                <Icon name="x" />
            </button>
        </div>
    );
}
