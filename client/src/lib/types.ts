export type Role =
    | 'ADMIN'
    | 'MANAGER'
    | 'ASSISTANT_MANAGER'
    | 'TEAM_LEAD'
    | 'SENIOR_ACCOUNTS_EXECUTIVE'
    | 'ACCOUNTS_EXECUTIVE'
    | 'INTERN';

/** Manage teams and see their teams' work. */
export const MANAGER_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER'];
/** Work only on their own tasks; cannot assign work. */
export const STAFF_ROLES: Role[] = ['SENIOR_ACCOUNTS_EXECUTIVE', 'ACCOUNTS_EXECUTIVE', 'INTERN'];
/** Roles that oversee other people's work. */
export const OVERSEER_ROLES: Role[] = ['ADMIN', ...MANAGER_ROLES, 'TEAM_LEAD'];
export const isManagerRole = (role: Role) => MANAGER_ROLES.includes(role);
export const isStaffRole = (role: Role) => STAFF_ROLES.includes(role);
export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Ref {
    id: string;
    name: string;
}

export interface Me {
    id: string;
    name: string;
    email: string;
    role: Role;
    teamId: string | null;
    team: Ref | null;
    avatarUrl: string | null;
}

export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    teamId: string | null;
    team: Ref | null;
    avatarUrl: string | null;
    createdAt: string;
}

export interface AssignableUser {
    id: string;
    name: string;
    role: Role;
    teamId: string | null;
}

export interface Team {
    id: string;
    name: string;
    description: string;
    managerId: string | null;
    manager: Ref | null;
    members: { id: string; name: string; role: Role; avatarUrl: string | null }[];
}

export interface AttachmentInfo {
    id: string;
    originalName: string;
    size: number;
    mimeType: string;
    createdAt: string;
    uploader?: Ref;
    uploaderId?: string;
}

export interface Client {
    id: string;
    name: string;
    description: string;
    managerId: string | null;
    manager: Ref | null;
    attachments: AttachmentInfo[];
    _count: { projects: number; tasks: number };
}

export interface Project {
    id: string;
    name: string;
    description: string;
    clientId: string | null;
    managerId: string | null;
    client: Ref | null;
    manager: Ref | null;
    attachments: AttachmentInfo[];
    _count: { tasks: number };
}

export interface TaskSummary {
    id: string;
    title: string;
    description: string;
    notes: string;
    status: TaskStatus;
    priority: Priority;
    dueDate: string | null;
    startedAt: string | null;
    completedAt: string | null;
    totalSeconds: number;
    finalNotes: string;
    createdAt: string;
    updatedAt: string;
    assigneeId: string;
    creatorId: string;
    clientId: string | null;
    projectId: string | null;
    assignee: Ref;
    creator: Ref;
    client: Ref | null;
    project: Ref | null;
    timeLogs: { id: string; startedAt: string; userId: string; endedAt?: string | null; seconds?: number }[];
    _count: { issues: number; attachments: number };
}

export interface Issue {
    id: string;
    description: string;
    status: 'OPEN' | 'RESOLVED';
    resolution: string;
    createdAt: string;
    resolvedAt: string | null;
    reporter: Ref;
    resolver: Ref | null;
}

export interface ActivityItem {
    id: string;
    action: string;
    message: string;
    createdAt: string;
    actor: Ref | null;
    task?: { id: string; title: string } | null;
}

export interface TaskDetail extends TaskSummary {
    team: Ref | null;
    timeLogs: { id: string; startedAt: string; endedAt: string | null; seconds: number; userId: string; user: Ref }[];
    issues: Issue[];
    attachments: (AttachmentInfo & { uploader: Ref; uploaderId: string })[];
    activities: ActivityItem[];
    canManage: boolean;
    isAssignee: boolean;
}

export interface Schedule {
    id: string;
    title: string;
    description: string;
    notes: string;
    priority: Priority;
    startAt: string;
    frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval: number;
    weekdays: string;
    endAt: string | null;
    nextRunAt: string | null;
    lastRunAt: string | null;
    active: boolean;
    recipientType: 'USER' | 'TEAM' | 'EVERYONE';
    remindMinutesBefore: number;
    createdById: string;
    createdBy: Ref;
    assignee: Ref | null;
    recipientUser: Ref | null;
    recipientTeam: Ref | null;
    client: Ref | null;
    project: Ref | null;
    ruleText: string;
}

export interface CalendarEvent {
    id: string;
    kind: 'task' | 'schedule';
    taskId?: string;
    scheduleId?: string;
    title: string;
    date: string;
    status?: TaskStatus;
    priority: Priority;
    recurring?: boolean;
    ruleText?: string;
    who: string;
}

export interface Notification {
    id: string;
    title: string;
    body: string;
    link: string | null;
    read: boolean;
    createdAt: string;
}

export interface PersonStats {
    id: string;
    name: string;
    role: Role;
    team: { name: string } | null;
    total: number;
    new: number;
    inProgress: number;
    blocked: number;
    completed: number;
    openIssues: number;
    totalSeconds: number;
    working: boolean;
}

export interface Dashboard {
    counts: Record<TaskStatus, number>;
    totalSeconds: number;
    mine: TaskSummary[];
    upcomingTasks: TaskSummary[];
    upcomingSchedules: (Schedule & { assignee: { name: string } | null; recipientTeam: { name: string } | null })[];
    openIssues: (Issue & { task: { id: string; title: string } })[];
    recentActivity: ActivityItem[];
    team: PersonStats[];
}

export interface ChatPerson {
    id: string;
    name: string;
    role: Role;
    avatarUrl: string | null;
    team?: { name: string } | null;
}

export type ChannelKind = 'PUBLIC' | 'PRIVATE' | 'DIRECT';

export interface ChannelSummary {
    id: string;
    name: string;
    description: string;
    kind: ChannelKind;
    createdById: string | null;
    lastMessageAt: string;
    memberCount: number;
    joined: boolean;
    unread: number;
    other?: ChatPerson | null;
}

export interface ChannelDetail {
    id: string;
    name: string;
    description: string;
    kind: ChannelKind;
    createdById: string | null;
    members: ChatPerson[];
    joined: boolean;
    canManage: boolean;
}

export interface ChatMessage {
    id: string;
    body: string;
    createdAt: string;
    channelId: string;
    authorId: string;
    author: ChatPerson;
}
