import { useLayoutEffect, useRef, useState } from 'react';

type Tab<T extends string> = { readonly id: T; readonly label: string };

type Props<T extends string> = {
  readonly tabs: readonly Tab<T>[];
  readonly active: T;
  readonly onChange: (id: T) => void;
  readonly label: string;
  /** Ids of the tabs and their panel: `${idBase}-tab-${id}`, `${idBase}-panel`. */
  readonly idBase: string;
};

/**
 * Segmented tabs (ТЗ фаза 4 §8): a black pill slides under the active tab. The pill is a white-on-black copy of the
 * labels clipped to the active tab, so the text turns white exactly where the pill is (a small element: clip-path is
 * allowed here). ←/→, Home/End move and select; the row scrolls sideways on narrow screens.
 */
export function Segmented<T extends string>({ tabs, active, onChange, label, idBase }: Props<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [clip, setClip] = useState<string | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const place = () => {
      const tab = track.querySelector<HTMLElement>(`[data-tab="${active}"]`);
      if (!tab) return;
      const right = track.offsetWidth - tab.offsetLeft - tab.offsetWidth;
      setClip(`inset(0 ${String(right)}px 0 ${String(tab.offsetLeft)}px round 999px)`);
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(track);
    return () => {
      observer.disconnect();
    };
  }, [active, tabs]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const to =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    document.getElementById(`${idBase}-tab-${next.id}`)?.focus();
  };

  return (
    <div className="seg">
      <div
        ref={trackRef}
        className="seg-track"
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${idBase}-tab-${tab.id}`}
            type="button"
            role="tab"
            className="seg-tab"
            data-tab={tab.id}
            aria-selected={tab.id === active}
            aria-controls={`${idBase}-panel`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => {
              onChange(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
        <div
          className="seg-ink"
          aria-hidden
          style={clip ? { clipPath: clip } : { visibility: 'hidden' }}
        >
          {tabs.map((tab) => (
            <span key={tab.id} className="seg-tab">
              {tab.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
