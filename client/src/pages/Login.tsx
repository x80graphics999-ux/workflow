import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Button, ErrorText, errorMessage, Field } from '../components/ui';
import { useAuth } from '../lib/auth';

export function LoginPage() {
    const { user, login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    if (user) return <Navigate to="/" replace />;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
            await login(email, password);
        } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
        }
    };

    return (
        <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-100 via-brand-50 to-white px-4">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex flex-col items-center gap-3">
                    <img src="/logo.png" alt="FixIT Consul-Tech" className="h-16 w-auto" />
                    <span className="text-sm font-semibold tracking-[0.2em] text-brand-700 uppercase">FixFlow</span>
                </div>
                <form onSubmit={submit} className="card space-y-4 border-t-4 border-t-brand-600 p-6">
                    <div>
                        <h1 className="text-lg font-semibold">Sign in</h1>
                        <p className="text-sm text-slate-500">Use the account your administrator created for you.</p>
                    </div>
                    <Field label="Email">
                        <input className="input" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
                    </Field>
                    <Field label="Password">
                        <input
                            className="input"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    <Button type="submit" className="w-full" disabled={busy}>
                        {busy ? 'Signing in…' : 'Sign in'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
