import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { FolderPlus, Trash2, Edit3, Loader2, AlertCircle, Plus, Check, Undo } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  is_default: boolean;
}

const PRESET_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#6b7280', // Slate
];

export default function CategoryManager() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch Categories
  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/api/categories/');
      return res.data;
    },
  });

  // Create Category Mutation
  const createMutation = useMutation({
    mutationFn: async (newCat: { name: string; color: string }) => {
      const res = await api.post('/api/categories/', newCat);
      return res.data;
    },
    onSuccess: () => {
      setName('');
      setColor('#3b82f6');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => {
      setError(err.response?.data?.name?.[0] || 'Failed to create category.');
    },
  });

  // Edit Category Mutation
  const updateMutation = useMutation({
    mutationFn: async (updatedCat: { id: number; name: string; color: string }) => {
      const res = await api.put(`/api/categories/${updatedCat.id}/`, {
        name: updatedCat.name,
        color: updatedCat.color,
      });
      return res.data;
    },
    onSuccess: () => {
      setEditingId(null);
      setName('');
      setColor('#3b82f6');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => {
      setError(err.response?.data?.name?.[0] || 'Failed to update category.');
    },
  });

  // Delete Category Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/categories/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => {
      setError('Failed to delete category.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      updateMutation.mutate({ id: editingId, name, color });
    } else {
      createMutation.mutate({ name, color });
    }
  };

  const handleEditClick = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setColor(cat.color);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setColor('#3b82f6');
    setError(null);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-900 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Category Manager</h2>
          <p className="text-slate-400 text-sm mt-1">
            Create and customize transaction categories. Default starting categories can be customized or deleted.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Category Form */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 h-fit space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-emerald-400" />
            <span>{editingId ? 'Edit Category' : 'New Category'}</span>
          </h3>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Category Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rent, Subscriptions"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 focus:border-slate-700 outline-none text-sm text-slate-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Select Color Theme
              </label>
              
              {/* Presets */}
              <div className="grid grid-cols-4 gap-2.5 mb-4">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    className="h-9 w-full rounded-lg border border-white/5 relative flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    style={{ backgroundColor: preset }}
                  >
                    {color === preset && (
                      <Check className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Custom Picker */}
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-12 rounded border border-slate-800 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={color.toUpperCase()}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#000000"
                  maxLength={7}
                  className="w-28 px-3 py-1.5 rounded bg-slate-950/60 border border-slate-800 text-sm font-mono text-center uppercase focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Undo className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
              )}
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-grow py-2 px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 text-slate-950 text-sm font-semibold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Save Changes</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Add Category</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Categories List */}
        <div className="md:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-white">Existing Categories</h3>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          ) : categories.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-slate-900/20 border border-slate-800/60 rounded-2xl">
              No categories found. Create a category to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-900/20 backdrop-blur-md flex items-center justify-between hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-medium text-slate-200">{cat.name}</span>
                    {cat.is_default && (
                      <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {!cat.is_default && (
                      <>
                        <button
                          onClick={() => handleEditClick(cat)}
                          className="p-2 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(cat.id)}
                          className="p-2 rounded bg-slate-950 border border-slate-900 hover:border-rose-900/60 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
