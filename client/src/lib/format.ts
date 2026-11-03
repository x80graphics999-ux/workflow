import type { Priority, Role, TaskStatus, TaskSummary } from './types';

export const ROLE_LABEL: Record<Role, string> = {
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    ASSISTANT_MANAGER: 'Assistant Manager',
    TEAM_LEAD: 'Team Lead',
    SENIOR_ACCOUNTS_EXECUTIVE: 'Senior Accounts Executive',
    ACCOUNTS_EXECUTIVE: 'Accounts Executive',
    INTERN: 'Intern',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
    NEW: 'New',
    IN_PROGRESS: 'In progress',
    BLOCKED: 'Blocked',
    COMPLETED: 'Completed',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
};

export function formatDuration(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function formatClock(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function formatDate(value: string | Date | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function timeAgo(value: string | Date) {
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
    return formatDate(value);
}

export function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Total time including a timer that is still running. */
export function liveSeconds(task: Pick<TaskSummary, 'totalSeconds' | 'timeLogs'>, now = Date.now()) {
    const running = task.timeLogs.find((l) => !l.endedAt);
    if (!running) return task.totalSeconds;
    return task.totalSeconds + Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000));
}

export const isRunning = (task: Pick<TaskSummary, 'timeLogs'>) => task.timeLogs.some((l) => !l.endedAt);

export const isOverdue = (task: Pick<TaskSummary, 'dueDate' | 'status'>) =>
    !!task.dueDate && task.status !== 'COMPLETED' && new Date(task.dueDate) < new Date();

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(date: Date | string | null | undefined) {
    if (!date) return '';
    const d = new Date(date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
