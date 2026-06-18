const BASE = '/api';

function getToken() {
  return localStorage.getItem('sm_token');
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `${BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    console.error('[api.req] network error', method, url, netErr);
    throw new Error(`Network error: ${netErr.message}`);
  }
  let data;
  try { data = await res.json(); }
  catch (parseErr) {
    console.error('[api.req] non-JSON response', method, url, res.status, parseErr);
    throw new Error(`Bad response (${res.status})`);
  }
  if (!res.ok) {
    console.error('[api.req] !ok', method, url, res.status, data);
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function uploadFile(file) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', headers, body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data; // { url, key, bucket, mime, size }
}

export const api = {
  uploadFile,
  // Auth
  login: (body) => req('POST', '/auth/login', body),
  register: (body) => req('POST', '/auth/register', body),
  me: () => req('GET', '/auth/me'),
  updateMe: (body) => req('PATCH', '/auth/me', body),

  // Formats
  getFormats: () => req('GET', '/formats'),
  getFormat: (id) => req('GET', `/formats/${id}`),
  createFormat: (body) => req('POST', '/formats', body),
  updateFormat: (id, body) => req('PATCH', `/formats/${id}`, body),
  deleteFormat: (id) => req('DELETE', `/formats/${id}`),

  // Angles
  getAngles: (opts = {}) => req('GET', `/angles${opts.archived ? '?archived=true' : ''}`),
  getAngle: (id) => req('GET', `/angles/${id}`),
  createAngle: (body) => req('POST', '/angles', body),
  updateAngle: (id, body) => req('PATCH', `/angles/${id}`, body),
  // v20: soft-delete — PATCH { archived: true|false }.
  archiveAngle: (id) => req('PATCH', `/angles/${id}`, { archived: true }),
  unarchiveAngle: (id) => req('PATCH', `/angles/${id}`, { archived: false }),

  // Copy lines
  getCopyLinesByAngle: (angleId) => req('GET', `/copy-lines/by-angle/${angleId}`),
  getCopyLinesByAngleAndType: (angleId, type) => req('GET', `/copy-lines/by-angle/${angleId}/type/${type}`),
  createCopyLine: (body) => req('POST', '/copy-lines', body),
  updateCopyLine: (id, body) => req('PATCH', `/copy-lines/${id}`, body),
  archiveCopyLine: (id) => req('PATCH', `/copy-lines/${id}`, { archived: true }),
  unarchiveCopyLine: (id) => req('PATCH', `/copy-lines/${id}`, { archived: false }),
  getArchivedCopyLines: () => req('GET', '/copy-lines/archived'),

  // Clips (v7 — unified library: hooks + body clips, distinguished by is_hook)
  getClips: (formatId) => req('GET', `/clips${formatId ? `?format_id=${formatId}` : ''}`),
  getClip: (id) => req('GET', `/clips/${id}`),
  createClip: (body) => req('POST', '/clips', body),
  updateClip: (id, body) => req('PUT', `/clips/${id}`, body),
  deleteClip: (id) => req('DELETE', `/clips/${id}`),
  getClipUsage: (id) => req('GET', `/clips/${id}/usage`),

  // Songs
  getSongs: () => req('GET', '/songs'),
  createSong: (body) => req('POST', '/songs', body),
  updateSong: (id, body) => req('PATCH', `/songs/${id}`, body),
  deleteSong: (id) => req('DELETE', `/songs/${id}`),

  // Vibes
  getVibes: () => req('GET', '/vibes'),
  createVibe: (body) => req('POST', '/vibes', body),
  updateVibe: (id, body) => req('PATCH', `/vibes/${id}`, body),
  deleteVibe: (id) => req('DELETE', `/vibes/${id}`),

  // Preset Concepts
  getPresetConcepts: () => req('GET', '/preset-concepts'),
  getPresetConcept: (id) => req('GET', `/preset-concepts/${id}`),
  createPresetConcept: (body) => req('POST', '/preset-concepts', body),
  updatePresetConcept: (id, body) => req('PATCH', `/preset-concepts/${id}`, body),

  // Concepts
  getConcepts: () => req('GET', '/concepts'),
  getConcept: (id) => req('GET', `/concepts/${id}`),
  createConcept: (body) => req('POST', '/concepts', body),
  advanceConceptStatus: (id) => req('PATCH', `/concepts/${id}/status`),
  setConceptStatus: (id, status) => req('PATCH', `/concepts/${id}/status`, { status }),
  setFootageLink: (id, footage_link) => req('PATCH', `/concepts/${id}/footage-link`, { footage_link }),
  deleteConcept: (id) => req('DELETE', `/concepts/${id}`),

  // Clip structures (v8 — format-level arrangements with takes)
  getClipStructures: (formatId) => req('GET', `/formats/${formatId}/clip-structures`),
  createClipStructure: (formatId, body) => req('POST', `/formats/${formatId}/clip-structures`, body),
  updateClipStructure: (id, body) => req('PATCH', `/clip-structures/${id}`, body),
  deleteClipStructure: (id) => req('DELETE', `/clip-structures/${id}`),

  // Format examples (v6)
  getFormatExamples: (formatId, filters = {}) => {
    const qs = Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return req('GET', `/formats/${formatId}/examples${qs ? `?${qs}` : ''}`);
  },
  createFormatExample: (formatId, body) => req('POST', `/formats/${formatId}/examples`, body),
  updateFormatExample: (id, body) => req('PATCH', `/format-examples/${id}`, body),
  deleteFormatExample: (id) => req('DELETE', `/format-examples/${id}`),

  // Clip examples (v11)
  getClipExamples: (clipId) => req('GET', `/clips/${clipId}/examples`),
  createClipExample: (clipId, body) => req('POST', `/clips/${clipId}/examples`, body),
  deleteClipExample: (id) => req('DELETE', `/clip-examples/${id}`),

  // Products (v12)
  getProducts: () => req('GET', '/products'),
  createProduct: (body) => req('POST', '/products', body),
  updateProduct: (id, body) => req('PATCH', `/products/${id}`, body),
  deleteProduct: (id) => req('DELETE', `/products/${id}`),

  // Users (strategist)
  getCreators: () => req('GET', '/users/creators'),
  updateCreator: (id, body) => req('PATCH', `/users/creators/${id}`, body),

  // Guide content (v21 — backend-driven creator Guide wizard copy/links)
  getGuideContent: () => req('GET', '/guide-content'),
  getGuidePicks: () => req('GET', '/guide-content/picks'),
  updateGuideContent: (body) => req('PATCH', '/guide-content', body),

  // Stats
  getStats: () => req('GET', '/stats'),

  // Performance
  getPerformance: () => req('GET', '/performance'),
  createPerformance: (body) => req('POST', '/performance', body),
  updatePerformance: (id, body) => req('PATCH', `/performance/${id}`, body),
};
