import { useRef, useState, type ChangeEvent } from 'react';
import { useVault } from '../state/vaultStore';
import { LockIcon } from './icons';

export function Unlock() {
  const { actions, settings } = useVault();
  const [passphrase, setPassphrase] = useState('');
  const [trust, setTrust] = useState(settings.trustedUntil !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const unlock = async () => {
    setError(null);
    setBusy(true);
    try {
      await actions.unlock(passphrase, trust ? 30 : 0);
    } catch {
      setError('That passphrase could not unlock the vault.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!importFile) return;
    setError(null);
    setBusy(true);
    try {
      await actions.importArchive(await importFile.text(), importPassphrase);
    } catch {
      setError('Could not open that vault. Check the passphrase and file.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    setImportFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  return (
    <main className="auth auth--locked">
      <section className="auth__panel auth__panel--centered">
        <span className="brand__mark brand__mark--lg">
          <LockIcon size={24} />
        </span>
        <h1>Unlock Plain Note</h1>
        <p className="sheet__hint">Enter your passphrase to decrypt your notes on this device.</p>
        <input
          className="input input--lg"
          type="password"
          autoComplete="current-password"
          placeholder="Passphrase"
          autoFocus
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void unlock()}
        />
        <label className="checkbox">
          <input type="checkbox" checked={trust} onChange={(event) => setTrust(event.target.checked)} />
          <span>Stay unlocked on this device for 30 days</span>
        </label>

        {error && <p className="notice notice--warn">{error}</p>}

        <button
          type="button"
          className="button button--primary button--block"
          disabled={busy || passphrase.length === 0}
          onClick={() => void unlock()}
        >
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>

        <details className="disclosure">
          <summary>Restore from a vault file instead</summary>
          <div className="disclosure__body">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
            <button type="button" className="button" onClick={() => fileRef.current?.click()}>
              {importFile ? importFile.name : 'Choose vault file'}
            </button>
            {importFile && (
              <>
                <input
                  className="input"
                  type="password"
                  placeholder="Passphrase of that vault"
                  value={importPassphrase}
                  onChange={(event) => setImportPassphrase(event.target.value)}
                />
                <button
                  type="button"
                  className="button button--primary button--block"
                  disabled={busy || importPassphrase.length === 0}
                  onClick={() => void restore()}
                >
                  Restore vault
                </button>
              </>
            )}
          </div>
        </details>
      </section>
    </main>
  );
}
