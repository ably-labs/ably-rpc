interface ConnectionStatusProps {
  status: 'connected' | 'disconnected' | 'waiting';
  label?: string;
}

const colors: Record<ConnectionStatusProps['status'], string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-red-500',
  waiting: 'bg-yellow-500 animate-pulse',
};

const defaultLabels: Record<ConnectionStatusProps['status'], string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  waiting: 'Waiting...',
};

export function ConnectionStatus({ status, label }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${colors[status]}`} />
      <span className="text-sm text-gray-600">{label || defaultLabels[status]}</span>
    </div>
  );
}
