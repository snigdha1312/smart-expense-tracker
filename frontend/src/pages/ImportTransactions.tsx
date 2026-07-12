import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { 
  Upload, CheckCircle, AlertTriangle, XCircle, ArrowRight, 
  FileText, Loader2, ArrowLeft, Database
} from 'lucide-react';

interface ValidItem {
  row_index: number;
  date: string;
  amount: string;
  type: string;
  category_id: number;
  category_name: string;
  description: string;
  is_duplicate: boolean;
}

interface ErrorItem {
  row_index: number;
  raw_data: string;
  reason: string;
}

interface PreviewResponse {
  valid: ValidItem[];
  errors: ErrorItem[];
}

export default function ImportTransactions() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'valid' | 'duplicates' | 'errors'>('valid');
  const [selectedDuplicates, setSelectedDuplicates] = useState<Record<number, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);

  // Mutation 1: Preview CSV
  const previewMutation = useMutation({
    mutationFn: async (targetFile: File) => {
      const formData = new FormData();
      formData.append('file', targetFile);
      const res = await api.post<PreviewResponse>('/api/transactions/import-preview/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setErrorMessage(null);
      // Pre-select tab with items if possible
      const cleanCount = data.valid.filter(x => !x.is_duplicate).length;
      const dupCount = data.valid.filter(x => x.is_duplicate).length;
      if (cleanCount > 0) {
        setActiveTab('valid');
      } else if (dupCount > 0) {
        setActiveTab('duplicates');
      } else if (data.errors.length > 0) {
        setActiveTab('errors');
      }
      
      // Reset selected duplicates mapping
      const initialDups: Record<number, boolean> = {};
      data.valid.forEach(x => {
        if (x.is_duplicate) {
          initialDups[x.row_index] = false; // default to skip
        }
      });
      setSelectedDuplicates(initialDups);
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Failed to upload and parse CSV file.');
    }
  });

  // Mutation 2: Confirm Import
  const confirmMutation = useMutation({
    mutationFn: async (transactionsToImport: Omit<ValidItem, 'is_duplicate' | 'row_index'>[]) => {
      const res = await api.post<{ imported: number }>('/api/transactions/import-confirm/', {
        transactions: transactionsToImport
      });
      return res.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['categoryBreakdown'] });
      queryClient.invalidateQueries({ queryKey: ['analyticsBudgetVsActual'] });
      queryClient.invalidateQueries({ queryKey: ['analyticsTrend'] });
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Database transaction failed during import.');
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreviewData(null);
      setImportResult(null);
      setErrorMessage(null);
    }
  };

  const handleUploadClick = () => {
    if (file) {
      previewMutation.mutate(file);
    }
  };

  const toggleDuplicate = (rowIndex: number) => {
    setSelectedDuplicates(prev => ({
      ...prev,
      [rowIndex]: !prev[rowIndex]
    }));
  };

  const handleConfirmImport = () => {
    if (!previewData) return;

    // Filter valid items: import all non-duplicates, and only checked duplicates
    const finalImportList = previewData.valid.filter(item => {
      if (!item.is_duplicate) return true;
      return selectedDuplicates[item.row_index] === true;
    }).map(({ date, amount, type, category_id, category_name, description }) => ({
      date,
      amount,
      type,
      category_id,
      category_name,
      description
    }));

    if (finalImportList.length === 0) {
      setErrorMessage('No transactions selected to import.');
      return;
    }

    confirmMutation.mutate(finalImportList);
  };

  const handleReset = () => {
    setFile(null);
    setPreviewData(null);
    setImportResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cleanTransactions = previewData?.valid.filter(x => !x.is_duplicate) || [];
  const duplicateTransactions = previewData?.valid.filter(x => x.is_duplicate) || [];
  const errorTransactions = previewData?.errors || [];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-slate-900 pb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Import CSV Transactions</h2>
        <p className="text-slate-400 text-sm mt-1">
          Upload real-world bank statements and CSV exports. We parse date formats and flag potential duplicates.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-xl text-rose-350 text-xs flex items-start gap-2.5">
          <XCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* STEP 1: Upload File */}
      {!previewData && !importResult && (
        <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-6">
          <div className="p-4 bg-slate-950/80 rounded-full border border-slate-800 text-emerald-400">
            <Upload className="h-8 w-8" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-base font-bold text-white">Choose your transaction CSV file</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Ensure your CSV has Date, Amount, Description, and Category headers. If not, columns will map to default layouts.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              id="csv-file-upload"
            />
            <div className="flex gap-3">
              <label
                htmlFor="csv-file-upload"
                className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-350 hover:text-white cursor-pointer font-bold text-xs uppercase tracking-wider hover:border-slate-700 transition-all"
              >
                Select CSV File
              </label>

              {window.location.hostname === 'localhost' && (
                <button
                  type="button"
                  id="load-mock-csv-btn"
                  onClick={() => {
                    const csvContent = `Date,Amount,Description,Category,Type
2026-06-15,120.50,Weekly Groceries,Food,Expense
2026-06-20,2500.00,Monthly Salary,Other,Income
2026-06-15,120.50,Weekly Groceries,Food,Expense
2026-abc-15,50.00,Bad date row,Food,Expense
2026-06-16,xyz,Bad amount row,Food,Expense`;
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const mockFile = new File([blob], 'test_transactions.csv', { type: 'text/csv' });
                    setFile(mockFile);
                    setPreviewData(null);
                    setImportResult(null);
                    setErrorMessage(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold uppercase tracking-wider hover:border-slate-700 transition-all cursor-pointer"
                >
                  Load Test CSV
                </button>
              )}
            </div>
            
            {file && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold bg-emerald-950/30 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <FileText className="h-3.5 w-3.5" />
                <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>

          {file && (
            <button
              onClick={handleUploadClick}
              disabled={previewMutation.isPending}
              className="px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-extrabold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center gap-2"
            >
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing File...</span>
                </>
              ) : (
                <>
                  <span>Upload & Preview</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* STEP 2: Preview & Verify */}
      {previewData && !importResult && (
        <div className="space-y-6">
          
          {/* File Header Overview */}
          <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-xl border border-slate-900">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-xs font-bold text-white">{file?.name}</p>
                <p className="text-[10px] text-slate-400">
                  {cleanTransactions.length} clean, {duplicateTransactions.length} duplicates, {errorTransactions.length} errors
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold transition-all cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </button>
          </div>

          {/* Validation Review Tabs */}
          <div className="flex border-b border-slate-900 gap-2">
            
            <button
              onClick={() => setActiveTab('valid')}
              className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider relative transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'valid' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'
              }`}
            >
              <CheckCircle className="h-4 w-4" />
              <span>Ready ({cleanTransactions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('duplicates')}
              className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider relative transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'duplicates' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Duplicates ({duplicateTransactions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('errors')}
              className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider relative transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'errors' ? 'text-rose-400 border-b-2 border-rose-400' : 'text-slate-500'
              }`}
            >
              <XCircle className="h-4 w-4" />
              <span>Errors ({errorTransactions.length})</span>
            </button>

          </div>

          {/* Tab 1: Clean Ready */}
          {activeTab === 'valid' && (
            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden">
              {cleanTransactions.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  No new transactions ready to import.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-850 bg-slate-900/60 text-slate-400 uppercase font-bold tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">Row</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/60">
                      {cleanTransactions.map((tx) => (
                        <tr key={tx.row_index} className="hover:bg-slate-900/25">
                          <td className="py-3 px-4 text-center text-slate-500">{tx.row_index}</td>
                          <td className="py-3 px-4 text-slate-350">{tx.date}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-300">
                              {tx.category_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-100 font-medium">{tx.description}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              tx.type === 'INCOME' ? 'bg-emerald-950/40 text-emerald-450 border border-emerald-500/20' : 'bg-rose-950/40 text-rose-450 border border-rose-500/20'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-bold ${
                            tx.type === 'INCOME' ? 'text-emerald-400' : 'text-slate-100'
                          }`}>
                            {tx.type === 'INCOME' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Duplicates */}
          {activeTab === 'duplicates' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl text-amber-350 text-[11px] flex gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  These transactions already exist in the database (matching Date + Amount + Description).
                  Check the box next to any rows you want to force import anyway; unchecked duplicates will be skipped.
                </p>
              </div>

              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden">
                {duplicateTransactions.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 text-xs">
                    No potential duplicates detected in this file.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-850 bg-slate-900/60 text-slate-400 uppercase font-bold tracking-wider">
                          <th className="py-3 px-4 w-12 text-center">Import?</th>
                          <th className="py-3 px-4 w-12 text-center">Row</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/60">
                        {duplicateTransactions.map((tx) => (
                          <tr key={tx.row_index} className="hover:bg-slate-900/25 bg-amber-950/5">
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={selectedDuplicates[tx.row_index] === true}
                                onChange={() => toggleDuplicate(tx.row_index)}
                                className="h-4.5 w-4.5 rounded border-slate-800 bg-slate-950 text-emerald-500 accent-emerald-500 outline-none"
                              />
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500">{tx.row_index}</td>
                            <td className="py-3 px-4 text-slate-350">{tx.date}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-300">
                                {tx.category_name}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-100 font-medium">{tx.description}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                tx.type === 'INCOME' ? 'bg-emerald-950/40 text-emerald-450' : 'bg-rose-950/40 text-rose-450'
                              }`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-350">
                              ${parseFloat(tx.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Errors */}
          {activeTab === 'errors' && (
            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden">
              {errorTransactions.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  Clean parse! No rows contain data validation errors.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-850 bg-slate-900/60 text-slate-400 uppercase font-bold tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">Row</th>
                        <th className="py-3 px-4 w-1/3">Raw File Row</th>
                        <th className="py-3 px-4">Failure Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/60">
                      {errorTransactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/25 bg-rose-950/5">
                          <td className="py-3 px-4 text-center text-slate-500 font-mono">{tx.row_index}</td>
                          <td className="py-3 px-4 text-slate-450 font-mono text-[10px] truncate max-w-xs">{tx.raw_data}</td>
                          <td className="py-3 px-4 text-rose-400 font-medium">{tx.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Actions Bottom panel */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={handleReset}
              className="px-5 py-2.5 rounded-xl bg-slate-950 border border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={confirmMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold uppercase tracking-widest transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center gap-2"
            >
              {confirmMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5" />
                  <span>Confirm Import</span>
                </>
              )}
            </button>
          </div>

        </div>
      )}

      {/* STEP 3: Results Summary */}
      {importResult && (
        <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-6">
          <div className="p-4 bg-emerald-950/40 rounded-full border border-emerald-500/20 text-emerald-400">
            <CheckCircle className="h-10 w-10" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Import Complete!</h3>
            <p className="text-xs text-slate-400 max-w-md">
              Successfully registered <strong className="text-emerald-400 text-sm font-extrabold">{importResult.imported}</strong> new transaction records to your account.
            </p>
          </div>

          <div className="border border-slate-900 rounded-xl p-4 bg-slate-950/40 w-full max-w-md text-left text-xs divide-y divide-slate-850/60">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Clean Transactions Imported</span>
              <span className="font-bold text-white">{cleanTransactions.length}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Duplicates Saved (Forced)</span>
              <span className="font-bold text-white">
                {Object.values(selectedDuplicates).filter(Boolean).length}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Duplicates Skipped</span>
              <span className="font-bold text-slate-500">
                {duplicateTransactions.length - Object.values(selectedDuplicates).filter(Boolean).length}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Row Failures (Omitted)</span>
              <span className={`font-bold ${errorTransactions.length > 0 ? 'text-rose-450' : 'text-slate-550'}`}>
                {errorTransactions.length}
              </span>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="px-6 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-350 hover:text-white font-bold text-xs uppercase tracking-wider hover:border-slate-700 transition-all cursor-pointer"
          >
            Import Another File
          </button>
        </div>
      )}

    </div>
  );
}
