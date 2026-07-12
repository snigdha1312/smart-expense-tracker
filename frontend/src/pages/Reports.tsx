import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../utils/api';
import { 
  FileText, Download, Loader2, AlertCircle, Calendar, Play, RefreshCw, CheckCircle2 
} from 'lucide-react';

interface ReportItem {
  id: number;
  month: string; // YYYY-MM-DD
  total_income: string;
  total_expense: string;
  pdf_file: string;
  generated_at: string;
}

export default function Reports() {
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [generatingMonth, setGeneratingMonth] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch all historical reports
  const { data: reports = [], isLoading, refetch } = useQuery<ReportItem[]>({
    queryKey: ['reports'],
    queryFn: async () => {
      const res = await api.get('/api/reports/');
      return res.data;
    }
  });

  // Polling logic when a report is being generated
  useEffect(() => {
    let intervalId: any;
    if (generatingMonth) {
      intervalId = setInterval(async () => {
        const { data: updatedReports } = await refetch();
        if (updatedReports) {
          const exists = updatedReports.some(r => r.month.startsWith(generatingMonth));
          if (exists) {
            setGeneratingMonth(null);
            setSuccessMessage(`Monthly report for ${generatingMonth} generated successfully!`);
            setTimeout(() => setSuccessMessage(null), 5000);
          }
        }
      }, 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [generatingMonth, refetch]);

  // Mutation to request report generation
  const generateMutation = useMutation({
    mutationFn: async (month: string) => {
      const res = await api.post(`/api/reports/generate/`, { month });
      return res.data;
    },
    onSuccess: (_, month) => {
      setGeneratingMonth(month);
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error || 'Failed to trigger report generation.');
    }
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMonth) return;
    generateMutation.mutate(selectedMonth);
  };

  const handleDownload = async (reportId: number, monthVal: string) => {
    try {
      const res = await api.get(`/api/reports/${reportId}/download/`, {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Get readable filename e.g. report_2026-06.pdf
      const cleanMonth = monthVal.substring(0, 7);
      link.setAttribute('download', `financial_report_${cleanMonth}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report PDF', err);
      setErrorMessage('Failed to download report PDF file.');
    }
  };

  const formatMonthName = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: string) => {
    const val = parseFloat(amount);
    return isNaN(val) ? '$0.00' : `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <FileText className="h-8 w-8 text-emerald-400" />
          Monthly Reports
        </h1>
        <p className="text-gray-400 mt-2">
          Compile your income, expenses, category breakdowns, and budget limits into structured PDF reports.
        </p>
      </div>

      {/* Grid: Generator Form & Generating state */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Generate Card */}
        <div className="md:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-400" />
            Generate New Report
          </h2>
          
          <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label htmlFor="month" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Select Report Month
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="month"
                  id="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  required
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={generateMutation.isPending || !!generatingMonth}
              className="w-full sm:w-auto px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
            >
              {generateMutation.isPending || !!generatingMonth ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 fill-slate-950" />
                  Generate Now
                </>
              )}
            </button>
          </form>

          {/* Feedback Messages */}
          {generatingMonth && (
            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              <div>
                <p className="font-semibold">Generation In Progress</p>
                <p className="text-xs text-emerald-400/80">
                  Aggregating metrics and rendering PDF report for {formatMonthName(generatingMonth)}. Please wait...
                </p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <p className="font-medium text-sm">{successMessage}</p>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <p className="font-medium text-sm">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Informative Side Card */}
        <div className="bg-gradient-to-br from-emerald-950/20 to-cyan-950/20 border border-emerald-500/10 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">Automated Reports</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Every user receives an automated report compile on the 1st of each month detailing metrics from the previous period. You can also generate ad-hoc summaries for active months.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800/40 text-xs text-gray-500">
            Powered by Celery Beat scheduler & WeasyPrint PDF layout engine.
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white mb-4">Past Reports Archive</h2>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <FileText className="h-12 w-12 mx-auto text-slate-700 mb-3" />
            <p className="text-gray-400 font-medium">No reports generated yet</p>
            <p className="text-xs text-gray-600 mt-1">Select a month above to manually generate your first report.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Income</th>
                  <th className="py-3 px-4">Expenses</th>
                  <th className="py-3 px-4">Savings Rate</th>
                  <th className="py-3 px-4">Generated At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {reports.map((report) => {
                  const inc = parseFloat(report.total_income) || 0;
                  const exp = parseFloat(report.total_expense) || 0;
                  const net = inc - exp;
                  const rate = inc > 0 ? (net / inc) * 100 : 0;
                  
                  return (
                    <tr key={report.id} className="hover:bg-slate-800/20 transition-colors text-sm text-gray-300">
                      <td className="py-4 px-4 font-semibold text-white">
                        {formatMonthName(report.month.substring(0, 7))}
                      </td>
                      <td className="py-4 px-4 text-emerald-400">
                        {formatCurrency(report.total_income)}
                      </td>
                      <td className="py-4 px-4 text-rose-400">
                        {formatCurrency(report.total_expense)}
                      </td>
                      <td className="py-4 px-4 font-mono">
                        {Math.max(0, Math.round(rate))}%
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-500">
                        {new Date(report.generated_at).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => handleDownload(report.id, report.month)}
                          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
