import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import styles from '../Creator.module.css';

const TYPE_LABELS = {
  talking_head: 'Talking Head',
  text_overlay: 'Text Overlay',
  voiceover: 'Voiceover',
  ugc_story: 'UGC Story',
};

export default function Step1Format() {
  const navigate = useNavigate();
  const [formats, setFormats] = useState([]);
  const [products, setProducts] = useState([]);
  const [step, setStep] = useState('format'); // 'format' | 'product' | 'variations'
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null); // null = no product
  const [variationCount, setVariationCount] = useState(5);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.getFormats().then(f => setFormats(f.filter(x => x.status === 'active')));
    api.getProducts().then(p => setProducts(p.filter(x => x.status === 'active')));
  }, []);

  function goToProductStep() {
    if (!selectedFormat) return;
    if (products.length === 0) {
      // No products configured — jump straight to variations step.
      setStep('variations');
      return;
    }
    setStep('product');
  }

  function goToVariationsStep(productId) {
    setSelectedProductId(productId);
    setStep('variations');
  }

  async function build() {
    if (creating) return;
    setCreating(true);
    try {
      const concept = await api.createConcept({
        format_id: selectedFormat.id,
        product_id: selectedProductId || null,
        variation_count: variationCount,
      });
      navigate(`/creator/concept/${concept.id}/shoot`);
    } catch (err) {
      alert(err.message);
      setCreating(false);
    }
  }

  if (step === 'product') {
    return (
      <div className={styles.builderPage}>
        <button className={styles.backBtn} onClick={() => setStep('format')}>← Back</button>

        <h1 className={styles.builderHeading}>Pick a product.</h1>
        <p className={styles.builderSub}>Which product is this video about?</p>

        <div className={styles.formatGrid}>
          {products.map(p => {
            const active = selectedProductId === p.id;
            return (
              <button
                key={p.id}
                className={`${styles.formatCard} ${active ? styles.formatCardActive : ''}`}
                onClick={() => setSelectedProductId(prev => prev === p.id ? null : p.id)}
              >
                <div className={styles.formatThumb}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} />
                    : <div className={styles.thumbPlaceholder} />}
                </div>
                <div className={styles.formatBody}>
                  <p className={styles.formatName}>{p.name}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className={styles.primaryBtn}
            disabled={!selectedProductId || creating}
            onClick={() => goToVariationsStep(selectedProductId)}
          >
            Next →
          </button>
          <button
            className={styles.backBtn}
            disabled={creating}
            onClick={() => goToVariationsStep(null)}
            style={{ alignSelf: 'center' }}
          >
            Skip — no specific product
          </button>
        </div>
      </div>
    );
  }

  if (step === 'variations') {
    return (
      <div className={styles.builderPage}>
        <button
          className={styles.backBtn}
          onClick={() => setStep(products.length === 0 ? 'format' : 'product')}
        >← Back</button>

        <h1 className={styles.builderHeading}>Variations</h1>
        <p className={styles.builderSub}>How many times do you want to make the same video, but slightly different each time? This determines how much footage you'll need.</p>

        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '32px 0',
          flexWrap: 'nowrap',
          width: '100%',
          maxWidth: 360,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          {[1, 2, 3, 4, 5].map(n => {
            const active = variationCount === n;
            return (
              <button
                key={n}
                onClick={() => setVariationCount(n)}
                style={{
                  flex: '0 0 auto',
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  border: active ? '2px solid var(--green)' : '1px solid #ccc',
                  background: active ? 'var(--green)' : '#fff',
                  color: active ? '#fff' : '#111',
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <button
          className={styles.primaryBtn}
          disabled={creating}
          onClick={build}
        >
          {creating ? 'Building concept...' : 'Build Concept'}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.builderPage}>
      <button className={styles.backBtn} onClick={() => navigate('/creator')}>← Back</button>

      <h1 className={styles.builderHeading}>Pick a format.</h1>
      <p className={styles.builderSub}>How do you want to shoot this video?</p>

      <div className={styles.formatGrid}>
        {formats.map(f => {
          const active = selectedFormat?.id === f.id;
          return (
            <button
              key={f.id}
              className={`${styles.formatCard} ${active ? styles.formatCardActive : ''}`}
              onClick={() => setSelectedFormat(prev => prev?.id === f.id ? null : f)}
            >
              <div className={styles.formatThumb}>
                {(f.thumbnail_url || f.reference_media_url)
                  ? <img src={f.thumbnail_url || f.reference_media_url} alt={f.name} />
                  : <div className={styles.thumbPlaceholder} />}
              </div>
              <div className={styles.formatBody}>
                <p className={styles.formatName}>{f.name}</p>
                {f.description && <p className={styles.formatDesc}>{f.description}</p>}
                {f.format_type && (
                  <span className={styles.typeBadge}>{TYPE_LABELS[f.format_type] || f.format_type}</span>
                )}
              </div>
            </button>
          );
        })}
        {formats.length === 0 && (
          <p className={styles.empty} style={{ gridColumn: '1 / -1' }}>No formats available yet.</p>
        )}
      </div>

      <button className={styles.primaryBtn} disabled={!selectedFormat || creating} onClick={goToProductStep}>
        {creating
          ? 'Building concept...'
          : (products.length === 0 ? 'Build Concept' : 'Next →')}
      </button>
    </div>
  );
}
