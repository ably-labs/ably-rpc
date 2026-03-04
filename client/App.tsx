import { Landing } from './components/Landing';
import { ServerView } from './components/ServerView';
import { ClientView } from './components/ClientView';

function App() {
  const role = new URLSearchParams(location.search).get('role');
  if (role === 'server') return <ServerView />;
  if (role === 'client') return <ClientView />;
  return <Landing />;
}

export default App;
