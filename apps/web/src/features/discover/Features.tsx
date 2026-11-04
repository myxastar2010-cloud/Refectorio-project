import type { CSSProperties } from 'react';
import { discover } from '../../content/discover.ru';
import { NamedIcon } from './icons';

/** The six key functions. */
export function Features() {
  const { features } = discover;
  return (
    <section className="dsc-section" id="dsc-features" aria-labelledby="dsc-features-title">
      <header className="dsc-head" data-reveal>
        <p className="dsc-eyebrow">{features.eyebrow}</p>
        <h2 id="dsc-features-title" className="dsc-title">
          {features.title}
        </h2>
      </header>
      <ul className="dsc-features">
        {features.items.map((item, index) => (
          <li
            key={item.title}
            className="dsc-feature"
            data-reveal
            style={{ '--d': `${(index % 3) * 80}ms` } as CSSProperties}
          >
            <span className="dsc-feature-icon">
              <NamedIcon name={item.icon} />
            </span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
