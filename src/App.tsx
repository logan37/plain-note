import { Onboarding } from './components/Onboarding';
import { Unlock } from './components/Unlock';
import { Workspace } from './components/Workspace';
import { LockIcon } from './components/icons';
import { VaultProvider, useVault } from './state/vaultStore';

function Splash() {
  return (
    <div className="splash">
      <span className="brand__mark brand__mark--lg">
        <LockIcon size={22} />
      </span>
      <p>Opening your notes…</p>
    </div>
  );
}

function FatalError({ message }: { message: string | null }) {
  return (
    <div className="splash">
      <h1>Something went wrong</h1>
      <p className="notice notice--warn">{message ?? 'Unknown error.'}</p>
      <button type="button" className="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

function Root() {
  const { status, error } = useVault();
  if (status === 'loading') return <Splash />;
  if (status === 'error') return <FatalError message={error} />;
  if (status === 'empty') return <Onboarding />;
  if (status === 'locked') return <Unlock />;
  return <Workspace />;
}

export default function App() {
  return (
    <VaultProvider>
      <Root />
    </VaultProvider>
  );
}
