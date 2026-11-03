import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { OVERSEER_ROLES, type Role } from './lib/types';
import { AccountPage } from './pages/Account';
import { ActivityPage } from './pages/Activity';
import { CalendarPage } from './pages/Calendar';
import { ChatPage } from './pages/Chat';
import { ClientsPage } from './pages/Clients';
import { DashboardPage } from './pages/Dashboard';
import { LoginPage } from './pages/Login';
import { ReportsPage } from './pages/Reports';
import { TaskDetailPage } from './pages/TaskDetail';
import { TasksPage } from './pages/Tasks';
import { TeamsPage } from './pages/Teams';
import { UsersPage } from './pages/Users';

function RequireAuth({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <p className="p-8 text-center text-sm text-slate-400">Loading…</p>;
    if (!user) return <Navigate to="/login" replace />;
    return children;
}

function RoleOnly({ roles, children }: { roles: Role[]; children: ReactNode }) {
    const { is } = useAuth();
    return is(...roles) ? children : <Navigate to="/" replace />;
}

const OVERSEERS: Role[] = OVERSEER_ROLES;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        element={
                            <RequireAuth>
                                <Layout />
                            </RequireAuth>
                        }
                    >
                        <Route index element={<DashboardPage />} />
                        <Route path="tasks" element={<TasksPage />} />
                        <Route path="tasks/:id" element={<TaskDetailPage />} />
                        <Route path="calendar" element={<CalendarPage />} />
                        <Route path="chat" element={<ChatPage />} />
                        <Route path="chat/:id" element={<ChatPage />} />
                        <Route path="clients" element={<RoleOnly roles={OVERSEERS}><ClientsPage /></RoleOnly>} />
                        <Route path="teams" element={<RoleOnly roles={OVERSEERS}><TeamsPage /></RoleOnly>} />
                        <Route path="users" element={<RoleOnly roles={['ADMIN']}><UsersPage /></RoleOnly>} />
                        <Route path="activity" element={<RoleOnly roles={OVERSEERS}><ActivityPage /></RoleOnly>} />
                        <Route path="reports" element={<RoleOnly roles={OVERSEERS}><ReportsPage /></RoleOnly>} />
                        <Route path="account" element={<AccountPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    </StrictMode>,
);
