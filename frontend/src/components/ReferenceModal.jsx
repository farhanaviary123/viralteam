import styles from './ReferenceModal.module.css';

/**
 * Inline reference-media popup.
 *
 * Renders a dark overlay with the media centred. Tapping the overlay
 * (anything outside the media) closes. No new tabs opened anywhere.
 *
 * Image extensions render as <img>; everything else (incl. Cloudinary
 * video URLs without an extension) renders as <video> with autoplay,
 * loop, muted, playsInline, controls.
 *
 * Props:
 *   url    — reference_media_url
 *   alt    — accessible label
 *   onClose — close handler
 */
const IMAGE_RE = /\.(gif|png|jpe?g|webp|svg)(\?.*)?$/i;

export default function ReferenceModal({ url, alt = 'Reference', onClose }) {
  if (!url) return null;
  const isImage = IMAGE_RE.test(url);
  console.log('[ReferenceModal] opening', { url, isImage });
  return (
    <div className={styles.overlay} onClick={onClose}>
      {isImage ? (
        <img
          className={styles.media}
          src={url}
          alt={alt}
          onClick={e => e.stopPropagation()}
          onError={(e) => console.error('[ReferenceModal] img error', url, e)}
        />
      ) : (
        <video
          className={styles.media}
          src={url}
          autoPlay
          loop
          muted
          playsInline
          controls
          onClick={e => e.stopPropagation()}
          onError={(e) => console.error('[ReferenceModal] video error', url, e.target.error)}
          onLoadedData={() => console.log('[ReferenceModal] video loaded OK', url)}
        />
      )}
    </div>
  );
}
