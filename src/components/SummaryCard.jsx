import { useEffect, useState } from 'react';
import { motion, animate } from 'framer-motion';

function AnimatedNumber({ value, format }) {
  const [display, setDisplay] = useState(format(0));

  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.9,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(format(v)),
    });
    return controls.stop;
  }, [value]);

  return <span>{display}</span>;
}

export default function SummaryCard({ label, value, format, trend, trendLabel, color, delay = 0, sub }) {
  const trendUp = trend > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 relative overflow-hidden group hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      {/* Soft glow */}
      <div
        className="absolute -top-6 -right-6 w-28 h-28 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ backgroundColor: color }}
      />

      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1.5 font-medium">{label}</p>

      <p className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tabular-nums leading-none">
        <AnimatedNumber value={value} format={format} />
      </p>

      {sub && <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-1.5">{sub}</p>}

      {trend !== undefined && trend !== null && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendUp ? 'text-rose-400' : 'text-emerald-400'}`}>
          <span className="text-base leading-none">{trendUp ? '↑' : '↓'}</span>
          <span>{Math.abs(trend).toFixed(1)}%</span>
          <span className="text-zinc-500 dark:text-zinc-600 font-normal ml-0.5">{trendLabel ?? 'vs last month'}</span>
        </div>
      )}

      {/* Bottom accent bar */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, delay: delay + 0.2, ease: 'easeOut' }}
        className="absolute bottom-0 left-0 h-0.5 w-full origin-left rounded-b-2xl"
        style={{ backgroundColor: color, opacity: 0.5 }}
      />
    </motion.div>
  );
}
