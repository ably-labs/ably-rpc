import { Landing } from './components/Landing';
import { ProtocolLanding } from './components/ProtocolLanding';
import { ServerView } from './components/ServerView';
import { ClientView } from './components/ClientView';
import type { Protocol } from '../shared/protocol';

function App() {
  const params = new URLSearchParams(location.search);
  const protocol = params.get('protocol') as Protocol | null;
  const role = params.get('role');

  if (protocol && role === 'server') return <ServerView protocol={protocol} />;
  if (protocol && role === 'client') return <ClientView protocol={protocol} />;
  if (protocol) return <ProtocolLanding protocol={protocol} />;
  return <Landing />;
}

export default App;
