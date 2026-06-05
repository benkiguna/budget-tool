import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getGranularity(selectedMonth) {
  if (!selectedMonth) return 'all';
  if (selectedMonth.length === 4) return 'year';
  return 'month';
}

export default function PeriodNavigator({ transactions, selectedMonth, onMonthChange }) {
  const granularity = getGranularity(selectedMonth);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onOutside(e) {
      if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [dropdownOpen]);

  const { months, years, monthsByYear } = useMemo(() => {
    const monthSet = new Set();
    for (const tx of transactions) {
      const m = tx.date?.slice(0, 7);
      if (m) monthSet.add(m);
    }
    const months = [...monthSet].sort().reverse();
    const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse();
    const monthsByYear = {};
    for (const m of months) {
      const yr = m.slice(0, 4);
      if (!monthsByYear[yr]) monthsByYear[yr] = new Set();
      monthsByYear[yr].add(m.slice(5, 7));
    }
    return { months, years, monthsByYear };
  }, [transactions]);

  const currentYear  = granularity !== 'all' ? selectedMonth.slice(0, 4) : '';
  const currentMoNum = granularity === 'month' ? selectedMonth.slice(5, 7) : null;
  const currentMoIdx = granularity === 'month' ? months.indexOf(selectedMonth) : -1;
  const currentYrIdx = years.indexOf(currentYear);

  const canPrevMonth = currentMoIdx < months.length - 1;
  const canNextMonth = currentMoIdx > 0;
  const canPrevYear  = currentYrIdx < years.length - 1;
  const canNextYear  = currentYrIdx > 0;

  function stepMonth(dir) {
    onMonthChange(months[currentMoIdx - dir]);
  }

  function stepYear(dir) {
    const newYear = years[currentYrIdx - dir];
    if (!newYear) return;
    if (granularity === 'year') { onMonthChange(newYear); return; }
    if (currentMoNum && monthsByYear[newYear]?.has(currentMoNum)) {
      onMonthChange(`${newYear}-${currentMoNum}`);
    } else {
      const fallback = months.find((m) => m.startsWith(newYear));
      if (fallback) onMonthChange(fallback);
    }
  }

  function switchGranularity(g) {
    setDropdownOpen(false);
    if (g === 'all') return onMonthChange('');
    if (g === 'year') {
      const yr = selectedMonth?.slice(0, 4) || years[0] || String(new Date().getFullYear());
      return onMonthChange(yr);
    }
    const yr = selectedMonth?.slice(0, 4) || years[0];
    const m = months.find((m) => m.startsWith(yr)) || months[0] || '';
    onMonthChange(m);
  }

  const txCount   = selectedMonth
    ? transactions.filter((tx) => tx.date?.startsWith(selectedMonth)).length
    : transactions.length;
  const monthLabel = currentMoNum ? MONTH_NAMES[parseInt(currentMoNum, 10) - 1] : '';

  // ── Shared button styles ────────────────────────────────────────────────────
  const stepBtn = 'flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-95';
  const stepBtnSm = 'flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-95';

  return (
    /*
     * Mobile  → flex-col, centered
     * Desktop → single horizontal row: [granularity] ─── [steppers] ─── [count]
     */
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 py-1">

      {/* ── Left: granularity toggle ─────────────────────────────────────── */}
      <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 rounded-lg p-0.5 shrink-0">
        {['month', 'year', 'all'].map((g) => (
          <button
            key={g}
            onClick={() => switchGranularity(g)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              granularity === g
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {g === 'all' ? 'All' : g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Center: period control ───────────────────────────────────────── */}
      {granularity === 'all' ? (
        <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-xl sm:text-lg">
          All time
        </p>
      ) : (
        /*
         * Mobile  → stack year row above month row (flex-col)
         * Desktop → year + month side-by-side in one row (flex-row)
         */
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">

          {/* Year stepper */}
          <div className="flex items-center gap-2">
            <button onClick={() => stepYear(-1)} disabled={!canPrevYear} aria-label="Previous year"
              className={`w-7 h-7 sm:w-8 sm:h-8 ${stepBtnSm}`}>
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <AnimatePresence mode="wait">
              <motion.span key={currentYear}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.13 }}
                className="text-zinc-500 dark:text-zinc-400 font-semibold text-base sm:text-sm w-11 text-center tabular-nums select-none"
              >
                {currentYear}
              </motion.span>
            </AnimatePresence>

            <button onClick={() => stepYear(1)} disabled={!canNextYear} aria-label="Next year"
              className={`w-7 h-7 sm:w-8 sm:h-8 ${stepBtnSm}`}>
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Divider between year and month (desktop only) */}
          {granularity === 'month' && (
            <span className="hidden sm:block text-zinc-300 dark:text-zinc-700 select-none">/</span>
          )}

          {/* Month stepper + dropdown (month mode only) */}
          {granularity === 'month' && (
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => stepMonth(-1)} disabled={!canPrevMonth} aria-label="Previous month"
                className={`w-10 h-10 sm:w-9 sm:h-9 ${stepBtn}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Clickable month label → dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-4 py-2 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all"
                >
                  <AnimatePresence mode="wait">
                    <motion.span key={monthLabel}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.13 }}
                      className="text-zinc-900 dark:text-zinc-100 font-semibold text-xl sm:text-base w-10 sm:w-8 text-center select-none"
                    >
                      {monthLabel}
                    </motion.span>
                  </AnimatePresence>
                  <svg
                    className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-2 grid grid-cols-3 gap-1"
                      style={{ minWidth: 180 }}
                    >
                      {MONTH_NAMES.map((name, i) => {
                        const moNum = String(i + 1).padStart(2, '0');
                        const hasData = monthsByYear[currentYear]?.has(moNum);
                        const isSelected = currentMoNum === moNum;
                        return (
                          <button
                            key={moNum}
                            onClick={() => {
                              if (!hasData) return;
                              onMonthChange(`${currentYear}-${moNum}`);
                              setDropdownOpen(false);
                            }}
                            disabled={!hasData}
                            className={`px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                              isSelected
                                ? 'bg-indigo-500 text-white'
                                : hasData
                                ? 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                : 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button onClick={() => stepMonth(1)} disabled={!canNextMonth} aria-label="Next month"
                className={`w-10 h-10 sm:w-9 sm:h-9 ${stepBtn}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Right: transaction count ─────────────────────────────────────── */}
      <p className="text-zinc-400 dark:text-zinc-600 text-xs tabular-nums shrink-0">
        {txCount} transactions
      </p>

    </div>
  );
}
