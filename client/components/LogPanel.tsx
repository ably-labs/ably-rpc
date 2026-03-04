import { useEffect, useRef } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'rpc' | 'error' | 'warn';
  message: string;
}

interface LogPanelProps {
  entries: LogEntry[];
  maxHeight?: string;
}

const typeColors: Record<LogEntry['type'], string> = {
  info: 'text-blue-400',
  rpc: 'text-green-400',
  error: 'text-red-400',
  warn: 'text-yellow-400',
};

export function LogPanel({ entries, maxHeight = '300px' }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div
      className="bg-gray-900 rounded-lg overflow-auto font-mono text-sm"
      style={{ maxHeight }}
    >
      <div className="p-4 space-y-1">
        {entries.length === 0 && (
          <div className="text-gray-600 italic">No events yet...</div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className="text-gray-600 shrink-0">
              {entry.timestamp.toLocaleTimeString()}
            </span>
            <span className={typeColors[entry.type]}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
