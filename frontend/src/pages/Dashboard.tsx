import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { 
  Calendar, RefreshCw, BarChart2, PieChart, TrendingUp,
  Brain, Sparkles, Loader2, AlertCircle, Lightbulb
} from 'lucide-react';

import CategoryBreakdownChart from '../components/CategoryBreakdownChart';
import TrendChart from '../components/TrendChart';
import BudgetVsActualChart from '../components/BudgetVsActualChart';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  // Query 1: Category Breakdown
  const { 
    data: breakdown = [], 
    isLoading: isBreakdownLoading,
    refetch: refetchBreakdown
  } = useQuery({
    queryKey: ['categoryBreakdown', selectedMonth],
    queryFn: async () => {
      const res = await api.get(`/api/analytics/category-breakdown/?month=${selectedMonth}`);
      return res.data;
    }
  });

  // Query 2: Budget vs Actual
  const { 
    data: budgetVsActual = [], 
    isLoading: isBudgetLoading,
    refetch: refetchBudget
  } = useQuery({
    queryKey: ['analyticsBudgetVsActual', selectedMonth],
    queryFn: async () => {
      const res = await api.get(`/api/analytics/budget-vs-actual/?month=${selectedMonth}`);
      return res.data;
    }
  });

  // Query 3: Trend (N=6 months)
  const { 
    data: trend = [], 
    isLoading: isTrendLoading,
    refetch: refetchTrend
  } = useQuery({
    queryKey: ['analyticsTrend'],
    queryFn: async () => {
      const res = await api.get('/api/analytics/trend/?months=6');
      return res.data;
    }
  });

  // Query 4: AI Insights
  const { 
    data: insightsData = { status: 'generating', insights: [], cooldown_seconds: 0 }, 
    isLoading: isInsightsLoading,
    refetch: refetchInsights
  } = useQuery({
    queryKey: ['aiInsights', selectedMonth],
    queryFn: async () => {
      const res = await api.get(`/api/insights/?month=${selectedMonth}`);
      return res.data;
    },
    refetchInterval: (query) => {
      return query.state.data?.status === 'generating' ? 2000 : false;
    }
  });

  const [cooldown, setCooldown] = useState(0);

  // Sync cooldown from API response
  useEffect(() => {
    if (insightsData?.cooldown_seconds) {
      setCooldown(insightsData.cooldown_seconds);
    }
  }, [insightsData]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1050);
      return () => clearTimeout(timer);
    }
    return;
  }, [cooldown]);

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/insights/', { month: selectedMonth });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiInsights', selectedMonth] });
    },
    onError: (err: any) => {
      if (err.response?.status === 429) {
        const secs = err.response.data?.cooldown_seconds || 3600;
        setCooldown(secs);
      }
    }
  });

  const handleRefresh = () => {
    refetchBreakdown();
    refetchBudget();
    refetchTrend();
    refetchInsights();
  };

  const isAnyLoading = isBreakdownLoading || isBudgetLoading || isTrendLoading;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-900 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">
            Visual aggregation of your spending distribution and budgeting performance.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Charts"
          >
            <RefreshCw className={`h-4 w-4 ${isAnyLoading ? 'animate-spin' : ''}`} />
          </button>

          <div className="relative flex-grow sm:flex-grow-0">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Calendar className="h-4 w-4" />
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-200 outline-none focus:border-slate-700 w-full"
            />
          </div>
        </div>
      </div>

      {/* AI Financial Insights Section */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-850/60 pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400 animate-pulse" />
            <h3 className="text-base font-bold text-white">AI Financial Insights</h3>
          </div>
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending || cooldown > 0 || insightsData?.status === 'generating'}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {regenerateMutation.isPending || insightsData?.status === 'generating' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing...
              </>
            ) : cooldown > 0 ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Cooldown: {Math.floor(cooldown / 60)}m {cooldown % 60}s
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Regenerate
              </>
            )}
          </button>
        </div>

        {isInsightsLoading || insightsData?.status === 'generating' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-28 bg-slate-950/60 border border-slate-850 rounded-xl animate-pulse flex items-center justify-center text-xs text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500 mr-2" />
              Generating spending insights...
            </div>
            <div className="h-28 bg-slate-950/60 border border-slate-850 rounded-xl animate-pulse hidden md:flex items-center justify-center text-xs text-gray-500" />
            <div className="h-28 bg-slate-950/60 border border-slate-850 rounded-xl animate-pulse hidden md:flex items-center justify-center text-xs text-gray-500" />
          </div>
        ) : !insightsData?.insights || insightsData.insights.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            No insights available. Click Regenerate to compile spending metrics.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {insightsData.insights.map((insight: any, idx: number) => {
              let bg = "bg-sky-950/20 border-sky-500/20 text-sky-300";
              let Icon = Lightbulb;
              if (insight.type === 'warning') {
                bg = "bg-rose-950/20 border-rose-500/20 text-rose-300";
                Icon = AlertCircle;
              } else if (insight.type === 'success') {
                bg = "bg-emerald-950/20 border-emerald-500/20 text-emerald-300";
                Icon = Sparkles;
              }
              return (
                <div key={idx} className={`p-4 rounded-xl border ${bg} transition-all hover:scale-[1.01] duration-200 flex items-start gap-3`}>
                  <div className="mt-0.5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white mb-1">{insight.title}</h4>
                    <p className="text-xs text-gray-300 leading-relaxed">{insight.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Charts Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Category Breakdown Card */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-850/60 pb-3">
            <PieChart className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Category Breakdown</h3>
          </div>
          {isBreakdownLoading ? (
            <ChartSkeleton type="pie" />
          ) : (
            <CategoryBreakdownChart data={breakdown} />
          )}
        </div>

        {/* Budget vs Actual Card */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-850/60 pb-3">
            <BarChart2 className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Budget vs Actual</h3>
          </div>
          {isBudgetLoading ? (
            <ChartSkeleton type="bar" />
          ) : (
            <BudgetVsActualChart data={budgetVsActual} />
          )}
        </div>

      </div>

      {/* Trend Analysis Card (Full Width) */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-850/60 pb-3">
          <TrendingUp className="h-5 w-5 text-indigo-400" />
          <h3 className="text-base font-bold text-white">Income vs Expense Trend (Last 6 Months)</h3>
        </div>
        {isTrendLoading ? (
          <ChartSkeleton type="line" />
        ) : (
          <TrendChart data={trend} />
        )}
      </div>

    </div>
  );
}

/* --- Pulse Loading Skeleton Sub-component --- */
interface ChartSkeletonProps {
  type: 'pie' | 'line' | 'bar';
}

function ChartSkeleton({ type }: ChartSkeletonProps) {
  return (
    <div className="h-[300px] w-full flex flex-col justify-between items-center p-4 animate-pulse">
      {type === 'pie' ? (
        <div className="flex flex-col items-center justify-center space-y-6 w-full h-full">
          {/* Circular donut chart skeleton */}
          <div className="h-36 w-36 rounded-full border-8 border-slate-850 flex items-center justify-center" />
          {/* Legend items skeletons */}
          <div className="flex justify-center gap-4 w-full">
            <div className="h-2 w-12 bg-slate-850 rounded-full" />
            <div className="h-2 w-16 bg-slate-850 rounded-full" />
            <div className="h-2 w-10 bg-slate-850 rounded-full" />
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col justify-between">
          {/* Grid lines skeletons */}
          <div className="space-y-4 w-full flex-grow pt-4">
            <div className="h-0.5 bg-slate-850/30 w-full" />
            <div className="h-0.5 bg-slate-850/30 w-full" />
            <div className="h-0.5 bg-slate-850/30 w-full" />
            <div className="h-0.5 bg-slate-850/30 w-full" />
          </div>
          {/* Bottom axis line and labels */}
          <div className="border-t border-slate-800 pt-3 flex justify-between px-6 w-full">
            <div className="h-2.5 w-8 bg-slate-850 rounded-full" />
            <div className="h-2.5 w-8 bg-slate-850 rounded-full" />
            <div className="h-2.5 w-8 bg-slate-850 rounded-full" />
            <div className="h-2.5 w-8 bg-slate-850 rounded-full" />
            <div className="h-2.5 w-8 bg-slate-850 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}
