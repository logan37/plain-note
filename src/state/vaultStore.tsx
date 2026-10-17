import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getVaultValue, KEY_HEADER, KEY_SETTINGS, setVaultValue } from '../lib/db';
import {
  buildArchive,
  download,
  isArchive,
  openArchive,
  timestamped,
  toMarkdown,
} from '../lib/portable';
import {
  FolderVaultMismatchError,
  joinFolderVault,
  syncVault,
} from '../lib/sync/engine';
import {
  canUseSyncFolders,
  forgetFolder,
  loadBackend,
  pickFolder,
  type SyncBackend,
} from '../lib/sync/platform';
import { DEFAULT_SETTINGS, type Note, type Settings, type SyncResult } from '../lib/types';
import {
  Vault,
  clearTrustedKey,
  loadTrustedKey,
  saveTrustedKey,
} from '../lib/vault';

export type VaultStatus = 'loading' | 'empty' | 'locked' | 'unlocked' | 'error';

interface VaultActions {
  createVault: (passphrase: string, trustDays: number) => Promise<void>;
  unlock: (passphrase: string, trustDays: number) => Promise<void>;
  lock: () => void;
  createNote: () => Promise<Note | null>;
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, 'content' | 'pinned' | 'favourite' | 'tags'>>,
  ) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  toggleFavourite: (id: string) => Promise<void>;
  setNoteTags: (id: string, tags: string[]) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  linkFolder: () => Promise<void>;
  unlinkFolder: () => Promise<void>;
  syncNow: () => Promise<SyncResult | null>;
  joinFolder: (passphrase: string) => Promise<void>;
  exportArchive: () => Promise<void>;
  importArchive: (text: string, passphrase: string) => Promise<void>;
  exportMarkdown: () => void;
}

interface VaultContextValue {
  status: VaultStatus;
  notes: Note[];
  tags: string[];
  settings: Settings;
  error: string | null;
  syncing: boolean;
  syncMessage: string | null;
  syncError: string | null;
  canSync: boolean;
  hasFolder: boolean;
  actions: VaultActions;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hasFolder, setHasFolder] = useState(false);

  const vaultRef = useRef<Vault | null>(null);
  const backendRef = useRef<SyncBackend | null>(null);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);

  const refresh = useCallback(() => {
    const vault = vaultRef.current;
    setNotes(vault ? [...vault.list()] : []);
    setTags(vault ? vault.tags() : []);
  }, []);

  const persistSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await setVaultValue(KEY_SETTINGS, next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedSettings = (await getVaultValue<Settings>(KEY_SETTINGS)) ?? DEFAULT_SETTINGS;
      if (cancelled) return;
      settingsRef.current = { ...DEFAULT_SETTINGS, ...storedSettings };
      setSettings(settingsRef.current);
      setHasFolder(Boolean(await loadBackend()));

      if (!(await Vault.exists())) {
        setStatus('empty');
        return;
      }
      const header = await getVaultValue<{ salt: string }>(KEY_HEADER);
      if (header) {
        const trusted = loadTrustedKey(header.salt);
        if (trusted) {
          try {
            const vault = await Vault.openWithTrustedKey(trusted);
            if (vault && !cancelled) {
              vaultRef.current = vault;
              refresh();
              setStatus('unlocked');
              return;
            }
          } catch {
            clearTrustedKey(header.salt);
          }
        }
      }
      if (!cancelled) setStatus('locked');
    })().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
      root.dataset.theme = theme;
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  const createVault = useCallback(
    async (passphrase: string, trustDays: number) => {
      const vault = await Vault.create(passphrase);
      vaultRef.current = vault;
      refresh();
      setStatus('unlocked');
      if (trustDays > 0) {
        saveTrustedKey(await vault.makeTrustedKey(trustDays));
        await persistSettings({ trustedUntil: Date.now() + trustDays * 86_400_000 });
      }
    },
    [persistSettings, refresh],
  );

  const unlock = useCallback(
    async (passphrase: string, trustDays: number) => {
      const vault = await Vault.open(passphrase);
      vaultRef.current = vault;
      refresh();
      setStatus('unlocked');
      if (trustDays > 0) {
        saveTrustedKey(await vault.makeTrustedKey(trustDays));
        await persistSettings({ trustedUntil: Date.now() + trustDays * 86_400_000 });
      }
    },
    [persistSettings, refresh],
  );

  const lock = useCallback(() => {
    const salt = vaultRef.current?.header.salt;
    vaultRef.current = null;
    setNotes([]);
    setTags([]);
    setStatus('locked');
    setSyncMessage(null);
    setSyncError(null);
    if (salt) clearTrustedKey(salt);
    void persistSettings({ trustedUntil: null });
  }, [persistSettings]);

  const requireVault = useCallback((): Vault => {
    const vault = vaultRef.current;
    if (!vault) throw new Error('Vault is locked');
    return vault;
  }, []);

  const createNote = useCallback(async () => {
    const vault = vaultRef.current;
    if (!vault) return null;
    const note = await vault.createNote('');
    refresh();
    return note;
  }, [refresh]);

  const updateNote = useCallback(
    async (id: string, patch: Partial<Pick<Note, 'content' | 'pinned' | 'favourite' | 'tags'>>) => {
      await requireVault().updateNote(id, patch);
      refresh();
    },
    [refresh, requireVault],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await requireVault().deleteNote(id);
      refresh();
    },
    [refresh, requireVault],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const note = vaultRef.current?.get(id);
      if (note) await updateNote(id, { pinned: !note.pinned });
    },
    [updateNote],
  );

  const toggleFavourite = useCallback(
    async (id: string) => {
      const note = vaultRef.current?.get(id);
      if (note) await updateNote(id, { favourite: !note.favourite });
    },
    [updateNote],
  );

  const setNoteTags = useCallback(
    async (id: string, nextTags: string[]) => {
      await updateNote(id, { tags: nextTags });
    },
    [updateNote],
  );

  const ensureBackend = useCallback(async (): Promise<SyncBackend | null> => {
    if (backendRef.current) return backendRef.current;
    const backend = await loadBackend();
    backendRef.current = backend;
    setHasFolder(Boolean(backend));
    return backend;
  }, []);

  const linkFolder = useCallback(async () => {
    const backend = await pickFolder();
    if (!backend) return;
    backendRef.current = backend;
    setHasFolder(true);
    setSyncError(null);
    await persistSettings({ syncEnabled: true, syncFolderLabel: backend.label });
  }, [persistSettings]);

  const unlinkFolder = useCallback(async () => {
    await forgetFolder();
    backendRef.current = null;
    setHasFolder(false);
    await persistSettings({ syncEnabled: false, syncFolderLabel: null });
  }, [persistSettings]);

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    const vault = vaultRef.current;
    if (!vault) return null;
    const backend = await ensureBackend();
    if (!backend) {
      setSyncError('No sync folder is configured yet.');
      return null;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await syncVault(vault, backend, setSyncMessage);
      refresh();
      setHasFolder(true);
      await persistSettings({
        lastSyncedAt: result.at,
        syncFolderLabel: backend.label,
        syncEnabled: true,
      });
      return result;
    } catch (cause) {
      if (cause instanceof FolderVaultMismatchError) {
        setSyncError(
          'This folder belongs to a different vault. Use “Join folder vault” below to adopt it.',
        );
      } else {
        setSyncError(cause instanceof Error ? cause.message : String(cause));
      }
      return null;
    } finally {
      setSyncing(false);
      setSyncMessage(null);
    }
  }, [ensureBackend, persistSettings, refresh]);

  const joinFolder = useCallback(
    async (passphrase: string) => {
      const vault = vaultRef.current;
      if (!vault) return;
      const backend = await ensureBackend();
      if (!backend) throw new Error('No sync folder is configured yet.');
      setSyncing(true);
      setSyncError(null);
      try {
        await joinFolderVault(vault, backend, passphrase, setSyncMessage);
        refresh();
      } finally {
        setSyncing(false);
        setSyncMessage(null);
      }
    },
    [ensureBackend, refresh],
  );

  const exportArchive = useCallback(async () => {
    const vault = requireVault();
    const archive = await buildArchive(vault);
    download(timestamped('plain-note-vault', 'json'), JSON.stringify(archive));
  }, [requireVault]);

  const importArchive = useCallback(
    async (text: string, passphrase: string) => {
      const parsed: unknown = JSON.parse(text);
      if (!isArchive(parsed)) throw new Error('That file is not a Plain Note vault.');
      const opened = await openArchive(parsed, passphrase);
      const vault = await Vault.replaceWith(opened.header, opened.key, opened.notes);
      vaultRef.current = vault;
      refresh();
      setStatus('unlocked');
      setError(null);
    },
    [refresh],
  );

  const exportMarkdown = useCallback(() => {
    const vault = vaultRef.current;
    if (!vault) return;
    download(timestamped('plain-note-export', 'md'), toMarkdown(vault.list()), 'text/markdown');
  }, []);

  useEffect(() => {
    if (status !== 'unlocked' || settings.autoSyncMinutes <= 0) return;
    const interval = window.setInterval(() => {
      void syncNow();
    }, settings.autoSyncMinutes * 60_000);
    return () => window.clearInterval(interval);
  }, [settings.autoSyncMinutes, status, syncNow]);

  const actions = useMemo<VaultActions>(
    () => ({
      createVault,
      unlock,
      lock,
      createNote,
      updateNote,
      deleteNote,
      togglePin,
      toggleFavourite,
      setNoteTags,
      updateSettings: persistSettings,
      linkFolder,
      unlinkFolder,
      syncNow,
      joinFolder,
      exportArchive,
      importArchive,
      exportMarkdown,
    }),
    [
      createVault,
      unlock,
      lock,
      createNote,
      updateNote,
      deleteNote,
      togglePin,
      toggleFavourite,
      setNoteTags,
      persistSettings,
      linkFolder,
      unlinkFolder,
      syncNow,
      joinFolder,
      exportArchive,
      importArchive,
      exportMarkdown,
    ],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      notes,
      tags,
      settings,
      error,
      syncing,
      syncMessage,
      syncError,
      canSync: canUseSyncFolders(),
      hasFolder,
      actions,
    }),
    [status, notes, tags, settings, error, syncing, syncMessage, syncError, hasFolder, actions],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used inside <VaultProvider>');
  return context;
}
