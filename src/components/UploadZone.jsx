import { useRef, useState } from 'react';
import { parseCSV } from '../lib/parsers/index.js';

// onParsed: receives raw parsed results before commit (for preview)
// onTransactions: legacy direct-commit callback
export default function UploadZone({ onTransactions, onParsed }) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files) {
    setError(null);
    const results = [];
    for (const file of files) {
      try {
        const text = await file.text();
        const { bank, transactions } = parseCSV(text);
        results.push({ bank, transactions, fileName: file.name });
      } catch (e) {
        setError(`${file.name}: ${e.message}`);
        return;
      }
    }
    if (results.length > 0) {
      if (onParsed) onParsed(results);
      else onTransactions?.(results);
    }
  }

  function onFileChange(e) {
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
        dragging
          ? 'border-indigo-500 bg-indigo-500/5'
          : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 bg-white dark:bg-zinc-900'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={onFileChange}
      />
      <div className="text-4xl mb-3">📂</div>
      <p className="text-zinc-900 dark:text-zinc-100 font-medium mb-1">Drop CSV files here or click to browse</p>
      <p className="text-zinc-500 text-sm">Supports Chase, Capital One, and Discover exports</p>
      {error && (
        <p className="mt-4 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
