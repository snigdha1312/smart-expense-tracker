import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { 
  Plus, Calendar, Filter, ArrowUpDown, ChevronLeft, ChevronRight, 
  Trash2, Edit3, Loader2, AlertCircle, Check, X, Tag, Download
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
}

interface Transaction {
  id: number;
  category: number;
  category_details: Category;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  date: string;
  description: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  created_at: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export default function TransactionList() {
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  
  // States for query parameters
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ordering, setOrdering] = useState('-date');

  // Form states for Add/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [formCategory, setFormCategory] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDescription, setFormDescription] = useState('');
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurrenceRule, setFormRecurrenceRule] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch Categories for filters and form dropdown
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/api/categories/');
      return res.data;
    }
  });

  // Fetch Transactions with pagination, filters, and ordering
  const { data, isLoading, isPlaceholderData } = useQuery<PaginatedResponse<Transaction>>({
    queryKey: ['transactions', page, categoryFilter, typeFilter, startDate, endDate, ordering],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        ordering,
      });
      if (categoryFilter) params.append('category', categoryFilter);
      if (typeFilter) params.append('type', typeFilter);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const res = await api.get(`/api/transactions/?${params.toString()}`);
      return res.data;
    },
    placeholderData: (previousData) => previousData,
  });

  // Create transaction mutation
  const createMutation = useMutation({
    mutationFn: async (tx: any) => {
      const res = await api.post('/api/transactions/', tx);
      return res.data;
    },
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err: any) => {
      setValidationError(err.response?.data?.amount?.[0] || err.response?.data?.detail || 'Failed to create transaction.');
    }
  });

  // Update transaction mutation
  const updateMutation = useMutation({
    mutationFn: async (tx: any) => {
      const res = await api.put(`/api/transactions/${tx.id}/`, tx);
      return res.data;
    },
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err: any) => {
      setValidationError(err.response?.data?.amount?.[0] || err.response?.data?.detail || 'Failed to update transaction.');
    }
  });

  // Delete transaction mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/transactions/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => {
      alert('Failed to delete transaction.');
    }
  });

  const openAddModal = () => {
    setEditingTransaction(null);
    setFormAmount('');
    setFormType('EXPENSE');
    setFormCategory(categories[0]?.id?.toString() || '');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormDescription('');
    setFormIsRecurring(false);
    setFormRecurrenceRule('');
    setValidationError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setFormAmount(tx.amount);
    setFormType(tx.type);
    setFormCategory(tx.category.toString());
    setFormDate(tx.date);
    setFormDescription(tx.description);
    setFormIsRecurring(tx.is_recurring);
    setFormRecurrenceRule(tx.recurrence_rule || '');
    setValidationError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const amountNum = parseFloat(formAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setValidationError('Amount must be a positive number.');
      return;
    }

    if (!formCategory) {
      setValidationError('Please select a category.');
      return;
    }

    const payload = {
      amount: formAmount,
      type: formType,
      category: parseInt(formCategory),
      date: formDate,
      description: formDescription,
      is_recurring: formIsRecurring,
      recurrence_rule: formIsRecurring ? formRecurrenceRule : null,
    };

    if (editingTransaction) {
      updateMutation.mutate({ ...payload, id: editingTransaction.id });
    } else {
      createMutation.mutate(payload);
    }
  };

  const clearFilters = () => {
    setCategoryFilter('');
    setTypeFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (typeFilter) params.append('type', typeFilter);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (ordering) params.append('ordering', ordering);

      const response = await api.get(`/api/transactions/export/?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transactions_export_${new Date().toISOString().substring(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      alert('Failed to export CSV transactions.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-900 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Transactions</h2>
          <p className="text-slate-400 text-sm mt-1">Manage and view your cashflow logs.</p>
        </div>
        <div className="flex gap-3 self-start sm:self-auto">
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-350 font-semibold text-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> : <Download className="h-4 w-4" />}
            <span>Export CSV</span>
          </button>
          
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-slate-950 font-semibold text-sm transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            <Plus className="h-4 w-4" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <Tag className="h-3 w-3 text-cyan-400" />
            <span>Category</span>
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-slate-700"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <Filter className="h-3 w-3 text-cyan-400" />
            <span>Type</span>
          </label>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-slate-700"
          >
            <option value="">All Types</option>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <Calendar className="h-3 w-3 text-cyan-400" />
            <span>Start Date</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-slate-700"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <Calendar className="h-3 w-3 text-cyan-400" />
            <span>End Date</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-slate-700"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={clearFilters}
            className="flex-grow py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold tracking-wide transition-all cursor-pointer"
          >
            Clear Filters
          </button>
          <button
            onClick={() => setOrdering(ordering === 'date' ? '-date' : 'date')}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all flex items-center justify-center cursor-pointer"
            title="Toggle Date Ordering"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Transaction Table / List */}
      <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : !data || data.results.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            No transactions found matching your filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-950/40 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <div className="col-span-2">Date</div>
              <div className="col-span-3">Description</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            <div className={`divide-y divide-slate-900/60 ${isPlaceholderData ? 'opacity-50' : ''}`}>
              {data.results.map((tx) => (
                <div key={tx.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-900/10 transition-all">
                  
                  {/* Mobile Row Headers / Date */}
                  <div className="col-span-2 flex justify-between md:block">
                    <span className="md:hidden text-xs text-slate-500 font-bold uppercase">Date</span>
                    <span className="text-sm font-mono text-slate-300">{tx.date}</span>
                  </div>

                  {/* Description */}
                  <div className="col-span-3 flex justify-between md:block">
                    <span className="md:hidden text-xs text-slate-500 font-bold uppercase">Desc</span>
                    <span className="text-sm text-slate-200 truncate max-w-[200px]" title={tx.description}>
                      {tx.description || <span className="text-slate-600 italic">No description</span>}
                    </span>
                  </div>

                  {/* Category Pill */}
                  <div className="col-span-2 flex justify-between md:block">
                    <span className="md:hidden text-xs text-slate-500 font-bold uppercase">Category</span>
                    <span className="flex items-center gap-1.5 self-end">
                      {tx.category_details ? (
                        <>
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: tx.category_details.color }}
                          />
                          <span className="text-xs font-semibold text-slate-300">
                            {tx.category_details.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-600 font-medium">Uncategorized</span>
                      )}
                    </span>
                  </div>

                  {/* Type */}
                  <div className="col-span-2 flex justify-between md:block">
                    <span className="md:hidden text-xs text-slate-500 font-bold uppercase">Type</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${
                      tx.type === 'INCOME' 
                        ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-rose-950/30 text-rose-400 border border-rose-500/20'
                    }`}>
                      {tx.type}
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="col-span-2 flex justify-between md:block md:text-right">
                    <span className="md:hidden text-xs text-slate-500 font-bold uppercase">Amount</span>
                    <span className={`text-sm font-bold ${
                      tx.type === 'INCOME' ? 'text-emerald-400' : 'text-slate-100'
                    }`}>
                      {tx.type === 'INCOME' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex justify-end md:justify-center gap-2 pt-2 md:pt-0">
                    <button
                      onClick={() => openEditModal(tx)}
                      className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(tx.id)}
                      className="p-1.5 rounded bg-slate-950 border border-slate-900 hover:border-rose-900/60 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {data && data.count > 20 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-xs text-slate-500">
            Showing Page {page} of {totalPages} ({data.count} items)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden relative z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-850 px-6 py-4">
              <h3 className="text-lg font-bold text-white">
                {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
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

                {/* Amount */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-100 outline-none text-sm focus:border-slate-700"
                  />
                </div>

                {/* Type Selection */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Transaction Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormType('EXPENSE')}
                      className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${
                        formType === 'EXPENSE'
                          ? 'bg-rose-950/30 text-rose-400 border-rose-500/30'
                          : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType('INCOME')}
                      className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${
                        formType === 'INCOME'
                          ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      Income
                    </button>
                  </div>
                </div>

                {/* Category Dropdown */}
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

                {/* Date Picker */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-100 outline-none text-sm focus:border-slate-700"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="e.g. Weekly Groceries"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-100 outline-none text-sm focus:border-slate-700"
                  />
                </div>

                {/* Recurrence Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-850">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-300">Recurring Transaction</span>
                    <span className="text-[10px] text-slate-500">Auto-repeat this transaction</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsRecurring}
                    onChange={(e) => setFormIsRecurring(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-slate-800 bg-transparent text-emerald-500 focus:ring-emerald-500 focus:ring-opacity-25"
                  />
                </div>

                {formIsRecurring && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Recurrence Rule (RRULE)
                    </label>
                    <select
                      value={formRecurrenceRule}
                      onChange={(e) => setFormRecurrenceRule(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-300 outline-none text-sm focus:border-slate-700"
                    >
                      <option value="">Select Recurrence</option>
                      <option value="FREQ=DAILY">Daily</option>
                      <option value="FREQ=WEEKLY">Weekly</option>
                      <option value="FREQ=MONTHLY">Monthly</option>
                      <option value="FREQ=YEARLY">Yearly</option>
                    </select>
                  </div>
                )}
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
                      <span>{editingTransaction ? 'Save' : 'Add'}</span>
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
