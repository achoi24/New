import { useRef, useState, useCallback } from 'react';
import { FILE_SHIFT_MAP, processFiles } from '../engine/parser.js';

export default function FileUpload({ onFilesLoaded, loadedFiles }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    async (files) => {
      const results = await processFiles(files);
      onFilesLoaded(results);
    },
    [onFilesLoaded]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '28px 16px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragOver ? 'var(--accent-dim)' : 'transparent',
        transition: 'all 0.2s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(Array.from(e.target.files))}
      />
      <div style={{ fontSize: 26, marginBottom: 6, opacity: 0.6 }}>⬆</div>
      <div style={{ fontSize: 13, color: 'var(--text-bright)', fontWeight: 600 }}>
        Drop CSV surfaces here
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.5 }}>
        SPX_atm, SPX_up_25, SPX_up_50, SPX_up_75,<br />
        SPX_down_25, SPX_down_50, SPX_down_75
      </div>
      {Object.keys(loadedFiles).length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
          {Object.keys(FILE_SHIFT_MAP).map((key) => {
            const loaded = !!loadedFiles[key];
            return (
              <span
                key={key}
                style={{
                  fontSize: 9,
                  padding: '2px 7px',
                  borderRadius: 3,
                  background: loaded ? 'var(--green-dim)' : 'var(--bg-card)',
                  color: loaded ? 'var(--green)' : 'var(--text-dim)',
                  border: `1px solid ${loaded ? 'rgba(0,212,170,0.25)' : 'var(--border)'}`,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {key} {loaded ? '✓' : '—'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
