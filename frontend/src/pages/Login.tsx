import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail || 
        err.response?.data?.non_field_errors?.[0] || 
        'Invalid email or password.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center relative overflow-hidden px-4 sm:px-6">
      {/* Decorative blurred background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full z-10">
        {/* Branding header */}
        <div className="text-center mb-8">
          <span className="text-4xl">💸</span>
          <h2 className="text-3xl font-extrabold mt-3 tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Smart Expense Tracker
          </h2>
          <p className="text-slate-400 mt-2 text-sm">
            Sign in to manage your budget and analyze transactions.
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <h3 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
            <LogIn className="h-5 w-5 text-emerald-400" />
            <span>Welcome Back</span>
          </h3>

          {error && (
            <div className="p-4 mb-5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm transition-all focus:ring-1 focus:ring-slate-800 text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm transition-all focus:ring-1 focus:ring-slate-800 text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 text-slate-950 text-sm font-semibold tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800/60 text-center text-xs text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-emerald-400 hover:underline font-medium">
              Create an Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
