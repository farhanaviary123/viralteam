import { useState } from 'react';
import StrategistLayout from './StrategistLayout';
import StrategyView from './views/StrategyView';
import ClipsView from './views/ClipsView';
import SongsView from './views/SongsView';
import PresetConceptsView from './views/PresetConceptsView';
import ProductsView from './views/ProductsView';
import styles from './Strategist.module.css';

const TABS = [
  { id: 'strategy', label: 'Strategy' },
  { id: 'clips', label: 'Clip Library' },
  { id: 'songs', label: 'Songs' },
  { id: 'products', label: 'Products' },
  { id: 'presets', label: 'Preset Concepts' },
];

export default function CreativeStrategy() {
  const [tab, setTab] = useState('strategy');

  return (
    <StrategistLayout>
      <div className={styles.pageHeader}>
        <p className={styles.pageWordmark}>VIRAL TEAM</p>
        <h1 className={styles.pageTitle}>Creative Strategy</h1>
      </div>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'strategy' && <StrategyView />}
      {tab === 'clips' && <ClipsView />}
      {tab === 'songs' && <SongsView />}
      {tab === 'products' && <ProductsView />}
      {tab === 'presets' && <PresetConceptsView />}
    </StrategistLayout>
  );
}
