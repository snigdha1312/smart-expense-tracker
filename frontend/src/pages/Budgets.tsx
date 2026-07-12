import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { 
  PiggyBank, Calendar, Plus, Edit3, Trash2, Loader2, AlertCircle, Check, X, Info 
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
}

interface BudgetSummaryItem {
  id: number;
  category_id: number;
  category_name: string;
  category_color: string;
  limit_amount: string;
  spent_amount: string;
  percentage_used: number;
  is_over_budget: boolean;
}

export default function Budgets() {
  const queryClient = useQueryClient();
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formCategory, setFormCategory] = useState('');
  const [formLimit, setFormLimit] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch Categories for budget dropdown
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/api/categories/');
      return res.data;
    }
  });

  // Fetch Budget Summary
  const { data: summary = [], isLoading } = useQuery<BudgetSummaryItem[]>({
    queryKey: ['budgetsSummary', selectedMonth],
    queryFn: async () => {
      const res = await api.get(`/api/budgets/summary/?month=${selectedMonth}`);
      return res.data;
    }
  });

  // Create Budget Mutation
  const createMutation = useMutation({
    mutationFn: async (budget: any) => {
      const res = await api.post('/api/budgets/', budget);
      return res.data;
    },
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['budgetsSummary'] });
    },
    onError: (err: any) => {
      setValidationError(err.response?.data?.detail || 'Failed to create budget.');
    }
  });

  // Update Budget Mutation
  const updateMutation = useMutation({
    mutationFn: async (budget: any) => {
      const res = await api.put(`/api/budgets/${budget.id}/`, budget);
      return res.data;
    },
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['budgetsSummary'] });
    },
    onError: (err: any) => {
      setValidationError(err.response?.data?.detail || 'Failed to update budget.');
    }
  });

  // Delete Budget Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/budgets/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetsSummary'] });
    },
    onError: () => {
      alert('Failed to delete budget.');
    }
  });

  const openSetModal = (item?: BudgetSummaryItem) => {
    setValidationError(null);
    if (item) {
      // Edit existing
      setFormCategory(item.category_id.toString());
      setFormLimit(item.limit_amount);
    } else {
      // New budget
      setFormCategory(categories[0]?.id?.toString() || '');
      setFormLimit('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormCategory('');
    setFormLimit('');
    setValidationError(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const limitVal = parseFloat(formLimit);
    if (isNaN(limitVal) || limitVal <= 0) {
      setValidationError('Budget limit must be a positive number.');
      return;
    }

    if (!formCategory) {
      setValidationError('Please select a category.');
      return;
    }

    const catId = parseInt(formCategory);
    
    // Check if a budget already exists for this category in the summary list
    const existing = summary.find(item => item.category_id === catId);

    // Save as YYYY-MM-01 format
    const budgetMonthDate = `${selectedMonth}-01`;

    const payload = {
      category: catId,
      limit_amount: formLimit,
      month: budgetMonthDate
    };

    if (existing) {
      updateMutation.mutate({ ...payload, id: existing.id });
    } else {
      createMutation.mutate(payload);
    }
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-rose-500';
    if (percentage >= 80) return 'bg-amber-500';
    return 'bg-emerald-500';
  };



  const getTextColor = (percentage: number) => {
    if (percentage >= 100) return 'text-rose-400';
    if (percentage >= 80) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-900 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Budgets</h2>
          <p className="text-slate-400 text-sm mt-1">
            Establish and track spending targets per category.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
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
          <button
            onClick={() => openSetModal()}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-slate-950 font-semibold text-sm transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-emerald-500/10 flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Set Budget</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      ) : summary.length === 0 ? (
        <div className="bg-slate-900/20 border border-slate-800/60 rounded-2xl p-12 text-center space-y-4 max-w-lg mx-auto">
          <PiggyBank className="h-12 w-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No Budgets Defined</h3>
          <p className="text-slate-400 text-sm">
            You haven't set any budgets for {selectedMonth} yet. Setting budgets helps you avoid overspending.
          </p>
          <button
            onClick={() => openSetModal()}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-sm font-semibold transition-all cursor-pointer"
          >
            Set Your First Budget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {summary.map((item) => {
            const percentageClamped = Math.min(item.percentage_used, 100);
            return (
              <div
                key={item.id}
                className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl hover:border-slate-750 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.category_color }}
                      />
                      <h4 className="text-lg font-bold text-white">{item.category_name}</h4>
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">Budget for {selectedMonth}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openSetModal(item)}
                      className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                      title="Edit Budget"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(item.id)}
                      className="p-1.5 rounded bg-slate-950 border border-slate-900 hover:border-rose-900/60 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                      title="Delete Budget"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">
                      Spent <strong className="text-slate-200">${parseFloat(item.spent_amount).toFixed(2)}</strong> of ${parseFloat(item.limit_amount).toFixed(2)}
                    </span>
                    <span className={`font-mono font-bold ${getTextColor(item.percentage_used)}`}>
                      {item.percentage_used.toFixed(1)}%
                    </span>
                  </div>

                  {/* Progress Bar Container */}
                  <div className="h-3.5 w-full bg-slate-950 border border-slate-850 rounded-full overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(item.percentage_used)}`}
                      style={{ width: `${percentageClamped}%` }}
                    />
                  </div>
                </div>

                {/* Status Warning pill */}
                {item.percentage_used >= 100 ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-950/20 border border-rose-500/25 text-[10px] font-bold text-rose-400 uppercase tracking-wider w-fit">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Over Budget by ${(parseFloat(item.spent_amount) - parseFloat(item.limit_amount)).toFixed(2)}</span>
                  </div>
                ) : item.percentage_used >= 80 ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-950/20 border border-amber-500/25 text-[10px] font-bold text-amber-400 uppercase tracking-wider w-fit">
                    <Info className="h-3.5 w-3.5" />
                    <span>Close to limit (80%+)</span>
                  </div>
                ) : null}

              </div>
            );
          })}
        </div>
      )}

      {/* Set / Edit Budget Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden relative z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-850 px-6 py-4">
              <h3 className="text-lg font-bold text-white">
                Set Monthly Budget
              </h3>
              <button onClick={closeModal} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit}>
              <div className="px-6 py-5 space-y-4">
                
                {validationError && (
                  <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-850 flex items-center justify-between text-xs text-slate-400">
                  <span>Target Month:</span>
                  <strong className="text-slate-200 font-mono">{selectedMonth}</strong>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    required
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-300 outline-none text-sm focus:border-slate-700"
                  >
                    <option value="" disabled>Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Limit Amount */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Monthly Limit ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formLimit}
                    onChange={(e) => setFormLimit(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-100 outline-none text-sm focus:border-slate-700"
                  />
                </div>

              </div>

              {/* Form Footer Buttons */}
              <div className="px-6 py-4 border-t border-slate-850 bg-slate-950/40 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 text-slate-950 text-xs font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Save</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
