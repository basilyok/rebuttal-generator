import type { HistoryEntry } from './history'
import type { TFunction } from './i18n'

interface Props {
  t: TFunction
  language: string
  entries: HistoryEntry[]
  synced: boolean
  onRestore: (entry: HistoryEntry) => void
  onDelete: (id: string) => void
  onClear: () => void
}

/**
 * Local-first list of past replies. Always populated from IndexedDB, signed in
 * or not — the `synced` flag only changes the note shown above the list, never
 * whether the list itself is available.
 */
export default function HistoryPanel({ t, language, entries, synced, onRestore, onDelete, onClear }: Props) {
  return (
    <div className="history-panel">
      <p className="history-note">{synced ? t('history.synced') : t('history.localOnly')}</p>
      {entries.length === 0 ? (
        <p className="history-empty">{t('history.empty')}</p>
      ) : (
        <>
          <ul className="history-list">
            {entries.map((entry) => (
              <li key={entry.id} className="history-item">
                <button className="history-restore" onClick={() => onRestore(entry)}>
                  <span className="history-date">
                    {new Date(entry.createdAt).toLocaleDateString(language, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="history-snippet">{entry.argument.slice(0, 80)}</span>
                </button>
                <button
                  type="button"
                  className="link-button history-delete"
                  aria-label={t('history.delete')}
                  onClick={() => onDelete(entry.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="link-button history-clear" onClick={onClear}>
            {t('history.clear')}
          </button>
        </>
      )}
    </div>
  )
}
