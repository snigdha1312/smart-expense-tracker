import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../utils/api';
import { 
  Upload, 
  FileText, 
  Loader2, 
  Check, 
  AlertCircle, 
  DollarSign, 
  Calendar, 
  Store, 
  Tag, 
  ArrowRight,
  RefreshCw
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
  color: string;
  is_default: boolean;
}

interface Receipt {
  id: number;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  image: string;
  extracted_amount: string | null;
  extracted_date: string | null;
  extracted_merchant: string | null;
}

export default function ReceiptUpload() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form fields for receipt review
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [description, setDescription] = useState('');

  // Fetch categories for the confirmation dropdown
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/api/categories/');
      return res.data;
    },
  });

  // Fetch Receipt status
  const { data: receiptDetails, refetch: refetchReceipt } = useQuery<Receipt>({
    queryKey: ['receipt', receiptId],
    queryFn: async () => {
      const res = await api.get(`/api/receipts/${receiptId}/`);
      return res.data;
    },
    enabled: !!receiptId,
  });

  // Handle polling Receipt state every 2 seconds
  useEffect(() => {
    let interval: any;
    if (polling && receiptId) {
      interval = setInterval(async () => {
        const { data } = await refetchReceipt();
        if (data && data.status !== 'PENDING') {
          setPolling(false);
          if (data.status === 'PROCESSED') {
            setAmount(data.extracted_amount || '');
            setDate(data.extracted_date || new Date().toISOString().split('T')[0]);
            setMerchant(data.extracted_merchant || '');
            // Default category fallback to "Other"
            const otherCat = categories.find(c => c.name.toLowerCase() === 'other');
            if (otherCat) {
              setCategoryId(String(otherCat.id));
            } else if (categories.length > 0) {
              setCategoryId(String(categories[0].id));
            }
          }
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [polling, receiptId, categories, refetchReceipt]);

  // Handle File Input selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setUploadError(null);
    }
  };

  // Upload Receipt Mutation
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const res = await api.post('/api/receipts/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReceiptId(res.data.id);
      setPolling(true);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.response?.data?.error || 'Failed to upload receipt file.');
    } finally {
      setUploading(false);
    }
  };

  // Confirm Transaction Mutation
  const confirmMutation = useMutation({
    mutationFn: async (confirmData: {
      amount: string;
      date: string;
      merchant: string;
      category_id: number;
      type: string;
      description: string;
    }) => {
      const res = await api.post(`/api/receipts/${receiptId}/confirm/`, confirmData);
      return res.data;
    },
    onSuccess: () => {
      navigate('/transactions');
    },
    onError: (err: any) => {
      setUploadError(err.response?.data?.error || 'Failed to confirm transaction.');
    },
  });

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !date) {
      setUploadError('Amount and Date are required.');
      return;
    }
    confirmMutation.mutate({
      amount,
      date,
      merchant,
      category_id: Number(categoryId),
      type,
      description: description || `OCR Receipt: ${merchant || 'Unknown'}`
    });
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setReceiptId(null);
    setPolling(false);
    setUploadError(null);
    setAmount('');
    setDate('');
    setMerchant('');
    setCategoryId('');
    setDescription('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">OCR Receipt Scanner</h2>
        <p className="text-slate-400 text-sm mt-1">
          Upload receipt images. The system will extract transaction details asynchronously using OCR.
        </p>
      </div>

      {uploadError && (
        <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {!receiptId ? (
        /* Upload Wizard Step */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 flex flex-col justify-between h-96 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-400" />
                <span>Upload Image</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Supported formats: PNG, JPG, JPEG. Ensure the receipt is well-lit, laid flat, and not blurry. Text-based totals, merchant names, and transaction dates are parsed automatically.
              </p>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <label className="border border-dashed border-slate-800 hover:border-slate-700 rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all hover:bg-slate-950/20">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileText className="h-8 w-8 text-slate-500 mb-2" />
                <span className="text-sm font-medium text-slate-300">
                  {selectedFile ? selectedFile.name : 'Select or drop a receipt image'}
                </span>
                <span className="text-xs text-slate-500 mt-1">Maximum size 5MB</span>
              </label>

              <button
                type="submit"
                disabled={!selectedFile || uploading}
                className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 text-slate-950 text-sm font-semibold tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <span>Upload & Process Receipt</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[384px]">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Receipt preview"
                className="max-h-80 w-full object-contain rounded-lg border border-slate-800"
              />
            ) : (
              <div className="text-center space-y-2">
                <p className="text-sm text-slate-500">Image Preview Window</p>
                <p className="text-xs text-slate-600">Select a file to display preview here.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Status & Processing Wizard Step */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
          {/* Left panel showing file & status */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                <span>Processing Status</span>
              </h3>

              {receiptDetails?.status === 'PENDING' && (
                <div className="p-6 rounded-xl bg-slate-950/40 border border-slate-850 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                  <p className="text-sm font-semibold text-slate-200">Analyzing Receipt Image</p>
                  <p className="text-xs text-slate-500 text-center leading-relaxed">
                    Executing Tesseract OCR character recognition, identifying transaction amounts, and parsing merchant location. This typically takes 3-5 seconds.
                  </p>
                </div>
              )}

              {receiptDetails?.status === 'PROCESSED' && (
                <div className="p-6 rounded-xl bg-emerald-950/10 border border-emerald-500/20 flex flex-col items-center justify-center space-y-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-emerald-400" />
                  </div>
                  <p className="text-sm font-semibold text-emerald-400">OCR Extraction Completed</p>
                  <p className="text-xs text-slate-400 text-center leading-relaxed">
                    Text scanned successfully. Please review the pre-populated values on the right and adjust as necessary before confirming.
                  </p>
                </div>
              )}

              {receiptDetails?.status === 'FAILED' && (
                <div className="p-6 rounded-xl bg-rose-950/10 border border-rose-500/20 flex flex-col items-center justify-center space-y-3">
                  <div className="h-10 w-10 rounded-full bg-rose-500/20 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-rose-400" />
                  </div>
                  <p className="text-sm font-semibold text-rose-400">OCR Scan Failed</p>
                  <p className="text-xs text-slate-400 text-center leading-relaxed">
                    Tesseract was unable to read the characters. Ensure the receipt is well-lit and upload again.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Upload Another</span>
              </button>
            </div>
          </div>

          {/* Right panel showing Review Form */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6">Review Extracted Fields</h3>

            {receiptDetails?.status === 'PENDING' ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-xs">Awaiting parser results...</span>
              </div>
            ) : receiptDetails?.status === 'FAILED' ? (
              <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-850 text-slate-500 text-xs text-center">
                Parser was unsuccessful. Use the upload button on the left to retry with another image.
              </div>
            ) : (
              <form onSubmit={handleConfirmSubmit} className="space-y-4">
                {/* Merchant */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Merchant Name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Store className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm text-slate-100 transition-all"
                    />
                  </div>
                </div>

                {/* Amount & Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <DollarSign className="h-4 w-4" />
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm text-slate-100 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Type
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm text-slate-100 transition-all"
                    >
                      <option value="EXPENSE">Expense</option>
                      <option value="INCOME">Income</option>
                    </select>
                  </div>
                </div>

                {/* Date & Category */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Transaction Date
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Calendar className="h-4 w-4" />
                      </span>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm text-slate-100 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Category
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Tag className="h-4 w-4" />
                      </span>
                      <select
                        required
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm text-slate-100 transition-all"
                      >
                        <option value="">Select Category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Description / Notes
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide any additional transaction details here..."
                    className="w-full px-4 py-2 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm text-slate-100 transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={confirmMutation.isPending}
                  className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 text-slate-950 text-sm font-semibold tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
                >
                  {confirmMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Confirm & Add Transaction</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
