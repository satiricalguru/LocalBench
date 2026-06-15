import { useState, useEffect } from 'react';
import type { Run } from '../types';
import { 
  History as HistoryIcon, Trash2, Calendar, 
  Search, Eye, CheckCircle2, ChevronRight, Square, CheckSquare
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

interface HistoryProps {
  onNavigateToResults: (runId: string) => void;
}

export default function History({ onNavigateToResults }: HistoryProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ runId?: string; bulk: boolean } | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const historyList = await window.electronAPI.getRunHistory();
      setRuns(historyList);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleExport = async (e: React.MouseEvent, runId: string, format: 'json' | 'csv') => {
    e.stopPropagation();
    try {
      const filePath = await window.electronAPI.exportRun(runId, format);
      if (filePath) {
        // Log success or alert
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    setConfirmDelete({ runId, bulk: false });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.bulk) {
      try {
        for (const runId of selectedRuns) {
          await window.electronAPI.deleteRun(runId);
        }
        setSelectedRuns([]);
        await fetchHistory();
      } catch (err) {
        console.error(err);
      }
    } else if (confirmDelete.runId) {
      try {
        await window.electronAPI.deleteRun(confirmDelete.runId);
        setSelectedRuns(selectedRuns.filter(id => id !== confirmDelete.runId));
        await fetchHistory();
      } catch (err) {
        console.error(err);
      }
    }
    setConfirmDelete(null);
  };

  const handleBulkDelete = () => {
    if (selectedRuns.length === 0) return;
    setConfirmDelete({ bulk: true });
  };

  const toggleSelectRun = (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    if (selectedRuns.includes(runId)) {
      setSelectedRuns(selectedRuns.filter(id => id !== runId));
    } else {
      setSelectedRuns([...selectedRuns, runId]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedRuns.length === filteredRuns.length) {
      setSelectedRuns([]);
    } else {
      setSelectedRuns(filteredRuns.map(r => r.id));
    }
  };

  const formatDuration = (start: number, end: number | null) => {
    if (!end) return 'Incomplete';
    const totalSecs = Math.round((end - start) / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Filter runs based on search
  const cleanMName = (id: string) => id.split('/').pop()?.split(':')?.[0] ?? id;
  const filteredRuns = runs.filter(run => {
    const searchLower = searchTerm.toLowerCase();
    if (!searchLower) return true;
    
    // Check if models list or tasks contain term
    const matchesModels = run.models.some(m => cleanMName(m).toLowerCase().includes(searchLower));
    const matchesDate = run.startedAt && !isNaN(new Date(run.startedAt).getTime())
      ? new Date(run.startedAt).toLocaleDateString().includes(searchLower)
      : false;
    
    return matchesModels || matchesDate;
  });

  return (
    <div className="space-y-6 select-none">
      
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Benchmark History</h2>
          <p className="text-sm text-muted-foreground">Manage and filter historical benchmark evaluations.</p>
        </div>
        
        {selectedRuns.length > 0 && (
          <button 
            onClick={handleBulkDelete}
            className="btn-destructive h-9 flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Selected ({selectedRuns.length})
          </button>
        )}
      </div>

      {/* Filter search strip */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4 justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search runs by model name, date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input text-xs pl-10 h-9"
          />
        </div>
        
        <span className="text-xs text-muted-foreground font-semibold">
          Showing {filteredRuns.length} of {runs.length} Runs
        </span>
      </div>

      {/* History Table */}
      <div className="p-5 rounded-xl bg-card border border-border shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <HistoryIcon className="h-8 w-8 mx-auto animate-spin mb-2" />
            Loading benchmark history...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5 px-2 w-10 text-center">
                    <button onClick={toggleSelectAll} className="text-primary hover:text-foreground">
                      {selectedRuns.length === filteredRuns.length && filteredRuns.length > 0 ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground/60" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5">Date & Time</th>
                  <th className="py-2.5">Models Evaluated</th>
                  <th className="py-2.5 text-center">Tasks</th>
                  <th className="py-2.5 text-right">Avg Quality</th>
                  <th className="py-2.5 text-center">Duration</th>
                  <th className="py-2.5 text-right w-52">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRuns.map(run => {
                  const isRowSelected = selectedRuns.includes(run.id);
                  const modelNames = run.models.map(m => cleanMName(m)).join(', ');

                  return (
                    <tr 
                      key={run.id} 
                      onClick={() => onNavigateToResults(run.id)}
                      className="hover:bg-secondary/20 transition-colors cursor-pointer group"
                    >
                      {/* Checkbox selector */}
                      <td className="py-3 px-2 text-center" onClick={(e) => toggleSelectRun(e, run.id)}>
                        <button className="text-primary">
                          {isRowSelected ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground/60 group-hover:text-muted-foreground" />
                          )}
                        </button>
                      </td>

                      {/* Date */}
                      <td className="py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {run.startedAt && !isNaN(new Date(run.startedAt).getTime())
                            ? new Date(run.startedAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Unknown Date'}
                        </div>
                      </td>

                      {/* Models List */}
                      <td className="py-3 font-medium text-foreground max-w-[240px] truncate" title={modelNames}>
                        {modelNames}
                      </td>

                      {/* Tasks */}
                      <td className="py-3 text-center text-muted-foreground font-semibold">
                        {run.tasks.length}
                      </td>

                      {/* Avg quality */}
                      <td className="py-3 text-right font-bold text-emerald-500">
                        {run.avgScore !== null ? (
                          <span className="flex items-center justify-end gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            {Math.round(run.avgScore * 100)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground/45">N/A</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3 text-center font-medium text-muted-foreground">
                        {formatDuration(run.startedAt, run.finishedAt)}
                      </td>

                      {/* Exports/Delete */}
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {/* Details */}
                          <button
                            onClick={() => onNavigateToResults(run.id)}
                            className="p-1 text-primary rounded hover:bg-primary/10"
                            title="View full results"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          
                          {/* Export JSON */}
                          <button
                            onClick={(e) => handleExport(e, run.id, 'json')}
                            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
                            title="Export to JSON"
                          >
                            <span className="text-[10px] font-bold">JSON</span>
                          </button>

                          {/* Export CSV */}
                          <button
                            onClick={(e) => handleExport(e, run.id, 'csv')}
                            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
                            title="Export to CSV"
                          >
                            <span className="text-[10px] font-bold">CSV</span>
                          </button>

                          {/* Delete */}
                          <button
                            onClick={(e) => handleDelete(e, run.id)}
                            className="p-1 text-red-500 hover:text-red-400 rounded hover:bg-red-500/10"
                            title="Delete run record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>

                          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredRuns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground font-medium">
                      <HistoryIcon className="h-10 w-10 mx-auto opacity-30 mb-2" />
                      No matching run records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Run"
        message={confirmDelete?.bulk
          ? `Are you sure you want to permanently delete the ${selectedRuns.length} selected runs? This cannot be undone.`
          : 'Are you sure you want to permanently delete this benchmark run? This cannot be undone.'}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
