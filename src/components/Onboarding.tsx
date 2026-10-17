import { useRef, useState, type ChangeEvent } from 'react';
import { useVault } from '../state/vaultStore';
import { CheckIcon, CloudIcon, LockIcon, SearchIcon, TagIcon } from './icons';

export function Onboarding() {
  const { actions } = useVault();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    setError(null);
    if (passphrase.length < 8) {
      setError('Use at least 8 characters. There is no way to recover a forgotten passphrase.');
      return;
    }
    if (passphrase !== confirm) {
      setError('The passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      await actions.createVault(passphrase, trust ? 30 : 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not open that vault. Check the passphrase and file.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    setImportFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  return (
    <main className="auth">
      <section className="auth__pitch">
        <div className="brand brand--lg">
          <span className="brand__mark">
            <LockIcon size={20} />
          </span>
          <span className="brand__name">Plain Note</span>
        </div>
        <p className="auth__tagline">
          Fast, tiny notes that live in your own cloud. Encrypted before they ever leave the device.
        </p>
        <ul className="features">
          <li>
            <CheckIcon size={15} /> First line becomes the bold title
          </li>
          <li>
            <SearchIcon size={15} /> Instant search across titles, text and tags
          </li>
          <li>
            <TagIcon size={15} /> Tags, pins and favourites built in
          </li>
          <li>
            <CloudIcon size={15} /> Encrypted folder sync — bring your own storage
          </li>
        </ul>
      </section>

      <section className="auth__panel">
        <h1>Create your vault</h1>
        <p className="sheet__hint">
          One passphrase unlocks everything. It is never uploaded and cannot be reset, so keep it
          safe.
        </p>
        <label className="field">
          <span>Passphrase</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Confirm passphrase</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void create()}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={trust} onChange={(event) => setTrust(event.target.checked)} />
          <span>Stay unlocked on this device for 30 days</span>
        </label>

        {error && <p className="notice notice--warn">{error}</p>}

        <button type="button" className="button button--primary button--block" disabled={busy} onClick={() => void create()}>
          {busy ? 'Creating…' : 'Create vault'}
        </button>

        <details className="disclosure">
          <summary>Already have a vault file?</summary>
          <div className="disclosure__body">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
            <div className="button-row">
              <button type="button" className="button" onClick={() => fileRef.current?.click()}>
                Choose vault file
              </button>
              {importFile && <span className="row__value">{importFile.name}</span>}
            </div>
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
