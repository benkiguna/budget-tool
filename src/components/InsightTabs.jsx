import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CategoryDelta from './CategoryDelta.jsx';
import CategoryTrend from './CategoryTrend.jsx';
import MedianSpend from './MedianSpend.jsx';
import CardSummary from './CardSummary.jsx';
import UnusualSpend from './UnusualSpend.jsx';
import DuplicateCharges from './DuplicateCharges.jsx';
import PriceCreep from './PriceCreep.jsx';
import TransferPairing from './TransferPairing.jsx';
import { unmatchedTransferCount } from '../lib/transferPairing.js';

function anomalyCount(transactions) {
  let count = 0;

  // Duplicate charges
  const WINDOW_DAYS = 5;
  const spend = transactions.filter((tx) => tx.amount < 0);
  const groups = {};
  for (const tx of spend) {
    const key = `${tx.merchant}||${Math.round(Math.abs(tx.amount) * 100)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }
  for (const txs of Object.values(groups)) {
    if (txs.length < 2) continue;
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const diff = Math.abs(new Date(sorted[i].date) - new Date(sorted[j].date)) / 86400000;
        if (diff <= WINDOW_DAYS) { count++; break; }
      }
      break;
    }
  }

  // Unmatched transfers
  count += unmatchedTransferCount(transactions);

  return count;
}

const TABS = ['Overview', 'Cards', 'Anomalies'];

export default function InsightTabs({ transactions, filtered, selectedMonth, settings, onCategoryClick, activeTab, onTabChange }) {
  const [internalTab, setInternalTab] = useState('Overview');
  const active = activeTab ?? internalTab;
  const setActive = (tab) => { onTabChange ? onTabChange(tab) : setInternalTab(tab); };
  const badgeCount = anomalyCount(transactions);

  // Swipe to change tabs on mobile
  const touchStartX = useRef(null);
  function handleTouchStart(e) { touchStartX.current = e.targetTouches[0].clientX; }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(diff) < 50) return;
    const idx = TABS.indexOf(active);
    if (diff > 0 && idx < TABS.length - 1) setActive(TABS[idx + 1]);
    if (diff < 0 && idx > 0) setActive(TABS[idx - 1]);
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`relative flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors ${
                isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {tab}
              {tab === 'Anomalies' && badgeCount > 0 && (
                <span className="text-xs bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800/40 rounded-full px-1.5 py-0.5 leading-none">
                  {badgeCount}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                  transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content — swipeable on mobile */}
      <div className="p-5" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {active === 'Overview' && (
              <div className="space-y-5">
                <CategoryTrend transactions={transactions} onCategoryClick={onCategoryClick} />
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5">
                  <MedianSpend transactions={transactions} />
                </div>
                <CategoryDelta transactions={transactions} selectedMonth={selectedMonth} onCategoryClick={onCategoryClick} />
              </div>
            )}

            {active === 'Cards' && (
              <CardSummary transactions={filtered} cards={settings.cards ?? {}} />
            )}

            {active === 'Anomalies' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                  <UnusualSpend transactions={transactions} selectedMonth={selectedMonth} />
                  <DuplicateCharges transactions={filtered} />
                  <PriceCreep transactions={transactions} />
                </div>
                <TransferPairing transactions={transactions} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
