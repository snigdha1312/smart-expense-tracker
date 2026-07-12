import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Activity, Database, Cpu, Layers, RefreshCw, AlertCircle, CheckCircle2, 
  Loader2, Server, LogOut, Wallet, Tag, ShieldCheck, PiggyBank, LayoutDashboard, Upload, FileText
} from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import TransactionList from './pages/TransactionList';
import CategoryManager from './pages/CategoryManager';
import Budgets from './pages/Budgets';
import Dashboard from './pages/Dashboard';
import ImportTransactions from './pages/ImportTransactions';
import ReceiptUpload from './pages/ReceiptUpload';
import Reports from './pages/Reports';

// Initialize React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Application Routes */}
            <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<TransactionList />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="categories" element={<CategoryManager />} />
              <Route path="receipts" element={<ReceiptUpload />} />
              <Route path="reports" element={<Reports />} />
              <Route path="import" element={<ImportTransactions />} />
              <Route path="diagnostics" element={<DiagnosticsDashboard />} />
            </Route>

            {/* Redirect unknown routes */}
            <Route path="*" element={<NavigateToHome />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function NavigateToHome() {
  return <Link to="/" className="text-emerald-400 p-8 block text-center">Page not found. Return Home</Link>;
}

/* --- Premium Layout Wrapping Dashboard Views --- */
function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/transactions', label: 'Transactions', icon: Wallet },
    { path: '/budgets', label: 'Budgets', icon: PiggyBank },
    { path: '/categories', label: 'Categories', icon: Tag },
    { path: '/receipts', label: 'Scan Receipt', icon: Upload },
    { path: '/reports', label: 'Reports', icon: FileText },
    { path: '/import', label: 'Import CSV', icon: Database },
    { path: '/diagnostics', label: 'System Health', icon: ShieldCheck },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      {/* Decorative blurred background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          <div className="flex items-center space-x-3">
            <span className="text-2xl">💸</span>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Smart Expense Tracker
            </h1>
          </div>

          <div className="flex items-center space-x-5">
            {user && (
              <div className="hidden sm:flex items-center space-x-2 border-r border-slate-800 pr-5">
                <div className="h-8 w-8 rounded-full bg-slate-900 border border-slate-850 flex items-center justify-center font-bold text-xs text-emerald-400 uppercase">
                  {user.name ? user.name[0] : user.email[0]}
                </div>
                <span className="text-sm font-medium text-slate-300">{user.name || user.email}</span>
              </div>
            )}
            
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-900 hover:border-slate-800 hover:text-white transition-all text-xs font-semibold text-slate-400 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>

        </div>
      </header>

      {/* Dashboard Sub-Header Navigation Tabs */}
      <div className="bg-slate-950/40 border-b border-slate-900/60 sticky top-[69px] z-40 backdrop-blur-sm px-6">
        <div className="max-w-7xl mx-auto flex space-x-1 py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                  active
                    ? 'bg-slate-900 text-emerald-400 border-slate-800 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content Workspace */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8">
        <div className="animate-in fade-in duration-300">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<TransactionList />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="categories" element={<CategoryManager />} />
            <Route path="receipts" element={<ReceiptUpload />} />
            <Route path="reports" element={<Reports />} />
            <Route path="import" element={<ImportTransactions />} />
            <Route path="diagnostics" element={<DiagnosticsDashboard />} />
          </Routes>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900/80 bg-slate-950 py-5 text-center text-xs text-slate-600">
        <p>&copy; 2026 Smart Expense Tracker. All rights reserved.</p>
      </footer>
    </div>
  );
}

/* --- Infrastructure Health Diagnostics Component --- */
function DiagnosticsDashboard() {
  interface ServiceStatus {
    status: 'healthy' | 'unhealthy' | 'loading' | 'untested';
    message: string;
  }

  interface HealthData {
    status: string;
    services: {
      django: ServiceStatus;
      database: ServiceStatus;
      redis: ServiceStatus;
      celery: ServiceStatus;
    };
  }

  const [health, setHealth] = useState<HealthData>({
    status: 'untested',
    services: {
      django: { status: 'untested', message: 'Not checked yet' },
      database: { status: 'untested', message: 'Not checked yet' },
      redis: { status: 'untested', message: 'Not checked yet' },
      celery: { status: 'untested', message: 'Not checked yet' },
    },
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.get(`${apiUrl}/api/health/`);
      setHealth(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
      setHealth({
        status: 'unhealthy',
        services: {
          django: { status: 'unhealthy', message: 'Backend server is offline or unreachable.' },
          database: { status: 'unhealthy', message: 'Cannot verify (backend offline).' },
          redis: { status: 'unhealthy', message: 'Cannot verify (backend offline).' },
          celery: { status: 'unhealthy', message: 'Cannot verify (backend offline).' },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-400 bg-emerald-950/30 border-emerald-500/30';
      case 'unhealthy':
        return 'text-rose-400 bg-rose-950/30 border-rose-500/30';
      case 'loading':
        return 'text-amber-400 bg-amber-950/30 border-amber-500/30';
      default:
        return 'text-slate-400 bg-slate-900/50 border-slate-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-6 w-6 text-emerald-400" />;
      case 'unhealthy':
        return <AlertCircle className="h-6 w-6 text-rose-400" />;
      case 'loading':
        return <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />;
      default:
        return <Activity className="h-6 w-6 text-slate-400" />;
    }
  };

  const overallHealthy = health.status === 'healthy';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 tracking-wider uppercase">
          System Diagnostics
        </span>
        <h2 className="text-3xl font-extrabold mt-3 tracking-tight">Infrastructure Status</h2>
        <p className="text-slate-400 mt-2 max-w-xl mx-auto text-sm">
          Displays the live connection status of Django, PostgreSQL, Redis, and Celery background workers.
        </p>
      </div>

      <div className={`p-4 rounded-xl border mb-8 transition-all flex items-center justify-between ${
        overallHealthy 
          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
          : error 
            ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
            : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
      }`}>
        <div className="flex items-center space-x-3">
          {overallHealthy ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-400" />
          )}
          <span className="font-medium text-sm">
            {overallHealthy 
              ? 'All systems functional and connected.' 
              : error 
                ? `Backend server connection issue: ${error}`
                : 'Some system dependencies are not ready.'
            }
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={checkHealth}
            disabled={loading}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span>Check</span>
          </button>
          <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-black/30 font-mono">
            {health.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        <div className={`p-6 rounded-2xl border transition-all ${getStatusColor(health.services.django.status)}`}>
          <div className="flex items-start justify-between">
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
              <Server className="h-6 w-6 text-indigo-400" />
            </div>
            {getStatusIcon(health.services.django.status)}
          </div>
          <h3 className="text-lg font-bold mt-4 text-white">Django REST API</h3>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">port: 8000</p>
          <p className="text-sm mt-3 leading-relaxed text-slate-300">{health.services.django.message}</p>
        </div>

        <div className={`p-6 rounded-2xl border transition-all ${getStatusColor(health.services.database.status)}`}>
          <div className="flex items-start justify-between">
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
              <Database className="h-6 w-6 text-cyan-400" />
            </div>
            {getStatusIcon(health.services.database.status)}
          </div>
          <h3 className="text-lg font-bold mt-4 text-white">PostgreSQL</h3>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">port: 5432</p>
          <p className="text-sm mt-3 leading-relaxed text-slate-300">{health.services.database.message}</p>
        </div>

        <div className={`p-6 rounded-2xl border transition-all ${getStatusColor(health.services.redis.status)}`}>
          <div className="flex items-start justify-between">
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
              <Layers className="h-6 w-6 text-rose-400" />
            </div>
            {getStatusIcon(health.services.redis.status)}
          </div>
          <h3 className="text-lg font-bold mt-4 text-white">Redis Broker</h3>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">port: 6379</p>
          <p className="text-sm mt-3 leading-relaxed text-slate-300">{health.services.redis.message}</p>
        </div>

        <div className={`p-6 rounded-2xl border transition-all ${getStatusColor(health.services.celery.status)}`}>
          <div className="flex items-start justify-between">
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
              <Cpu className="h-6 w-6 text-emerald-400" />
            </div>
            {getStatusIcon(health.services.celery.status)}
          </div>
          <h3 className="text-lg font-bold mt-4 text-white">Celery Workers</h3>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">async runner</p>
          <p className="text-sm mt-3 leading-relaxed text-slate-300">{health.services.celery.message}</p>
        </div>

      </div>
    </div>
  );
}
