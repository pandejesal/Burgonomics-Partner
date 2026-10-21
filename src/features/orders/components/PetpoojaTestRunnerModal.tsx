import React, { useEffect, useRef, useState } from 'react';
import { X, FlaskConical, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  PETPOOJA_TEST_SCENARIOS,
  formatPetpoojaIdsForCopy,
  initialTestResults,
  petpoojaCopyListLines,
  runAllPetpoojaTestScenarios,
  type PetpoojaTestResult,
  type PetpoojaTestStatus,
  type TestScenarioRunner,
} from '@/features/orders/services/petpoojaTestRunnerService';

interface PetpoojaTestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Injectable relay (tests); defaults to the live test runner API. */
  runner?: TestScenarioRunner;
}

const STATUS_STYLES: Record<PetpoojaTestStatus, string> = {
  Pending: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  Relaying: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  Fulfilled: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  Failed: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
};

export function PetpoojaTestRunnerModal({ isOpen, onClose, runner }: PetpoojaTestRunnerModalProps) {
  const [results, setResults] = useState<PetpoojaTestResult[]>(() => initialTestResults());
  const [isRunning, setIsRunning] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setResults(initialTestResults());
    setIsRunning(false);
    setCopiedAll(false);
    runningRef.current = false;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !runningRef.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Reconciliation lines: the POS id when the vendor returned one, OUR client
  // reference otherwise (documented sandbox: 5/5 accepted with no id). This
  // mirrors formatPetpoojaIdsForCopy so the panel shows exactly what the copy
  // button sends — an accepted relay must never leave the list empty.
  const copyLines = petpoojaCopyListLines(results);
  const fulfilled = copyLines.length;

  const handleRunAll = async () => {
    if (isRunning) return;
    setIsRunning(true);
    runningRef.current = true;
    setCopiedAll(false);
    try {
      const finalResults = await runAllPetpoojaTestScenarios({
        scenarios: PETPOOJA_TEST_SCENARIOS,
        runner,
        onUpdate: (next) => setResults(next),
      });
      const okCount = finalResults.filter((r) => r.status === 'Fulfilled').length;
      const labelled = finalResults.filter(
        (r) => r.status === 'Fulfilled' && r.petpoojaOrderId,
      ).length;
      if (okCount === PETPOOJA_TEST_SCENARIOS.length && labelled === okCount) {
        toast.success('All 5 relays accepted — POS order IDs ready for support.');
      } else if (okCount === PETPOOJA_TEST_SCENARIOS.length) {
        toast.warning(
          'All 5 relays accepted — some POS order IDs were not returned; client references cover those rows.',
        );
      } else {
        toast.warning(`${okCount}/5 relays accepted — retry the failed ones.`);
      }
    } catch {
      toast.error('Test run aborted — no changes were confirmed. Retry safely.');
    } finally {
      setIsRunning(false);
      runningRef.current = false;
    }
  };

  const handleCopyAllIds = async () => {
    const text = formatPetpoojaIdsForCopy(results);
    if (!text) {
      toast.error('No relay references yet — run the scenarios first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      toast.success('Relay references copied — paste into your support email.');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error('Copy failed — long-press the references to copy them manually.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="petpooja-test-runner-title"
        className="bg-neutral-900 bg-surface border border-neutral-800 border-divider rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden text-white"
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 border-divider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800 border-divider">
              <FlaskConical className="w-5 h-5 text-[#FF6600]" />
            </div>
            <div>
              <h2 id="petpooja-test-runner-title" className="text-base font-black text-white">
                Petpooja Test Runner
              </h2>
              <p className="text-[11px] text-neutral-400">
                Relay 5 onboarding scenarios to the POS for support verification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            aria-label="Close test runner dialog"
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* 1-tap run */}
          <button
            type="button"
            onClick={handleRunAll}
            disabled={isRunning}
            className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Relaying scenarios...' : 'Run 5 Test Scenarios'}</span>
          </button>

          {/* Scenario list */}
          <ol className="space-y-2" aria-live="polite">
            {PETPOOJA_TEST_SCENARIOS.map((scenario, idx) => {
              const result = results[idx];
              const status: PetpoojaTestStatus = result?.status ?? 'Pending';
              return (
                <li
                  key={scenario.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-neutral-950 border border-neutral-800 border-divider"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-white text-xs">
                      <span className="font-mono text-[#FF6600] mr-1.5">{idx + 1}.</span>
                      {scenario.title}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{scenario.description}</p>
                    {result?.status === 'Fulfilled' && result.petpoojaOrderId && (
                      <p className="text-[11px] font-mono text-emerald-300 mt-1">
                        {result.petpoojaOrderId}
                      </p>
                    )}
                    {result?.status === 'Fulfilled' &&
                      !result.petpoojaOrderId &&
                      result.clientOrderRef && (
                        <p className="text-[11px] font-mono text-neutral-400 mt-1">
                          {result.clientOrderRef}
                          <span className="text-neutral-500"> (client reference)</span>
                        </p>
                      )}
                    {result?.status === 'Failed' && (
                      <p className="text-[11px] text-rose-300 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{result.error ?? 'Relay failed.'}</span>
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[status]}`}
                  >
                    {status}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Reconciliation references */}
          {fulfilled > 0 && (
            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 border-divider space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-400">
                  Relay references ({fulfilled}/5)
                </h3>
                <button
                  type="button"
                  onClick={handleCopyAllIds}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 bg-surface border border-neutral-800 border-divider hover:bg-neutral-800 text-white font-bold text-[11px] transition-colors cursor-pointer"
                >
                  {copiedAll ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedAll ? 'Copied!' : 'Copy All References'}</span>
                </button>
              </div>
              <ul className="space-y-1">
                {copyLines.map((line) => (
                  <li key={line} className="text-[11px] font-mono text-neutral-300">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PetpoojaTestRunnerModal;
