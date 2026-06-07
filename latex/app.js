const express = require('express');
const path = require('path');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.resolve(__dirname, '..')));
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-zа-я0-9-_]/gi, '');
}

app.get('/api/categories', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT slug, label FROM categories ORDER BY label');
  res.json(rows);
}));

app.post('/api/categories', asyncHandler(async (req, res) => {
  const { slug, label } = req.body || {};
  if (!slug || !label) return res.status(400).json({ error: 'slug and label are required' });
  const { rows } = await pool.query(
    `INSERT INTO categories (slug, label) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label
     RETURNING slug, label`,
    [slug, label]
  );
  res.json(rows[0]);
}));

app.get('/api/places', asyncHandler(async (req, res) => {
  const includeHidden = String(req.query.includeHidden || '') === '1';
  const query = includeHidden
    ? 'SELECT * FROM places ORDER BY name'
    : 'SELECT * FROM places WHERE visible = true ORDER BY name';
  const { rows } = await pool.query(query);
  res.json(rows.map((r) => ({ ...r, gallery: Array.isArray(r.gallery) ? r.gallery : [] })));
}));

app.post('/api/places', asyncHandler(async (req, res) => {
  const p = req.body || {};
  const values = [
    p.id, p.name, p.category, p.description, p.object_info || '', p.lat, p.lon,
    p.cover_image_url, JSON.stringify(Array.isArray(p.gallery) ? p.gallery : []), p.address || '',
    p.open_hours || '', p.phone || '', p.website_url || '', p.visible !== false,
  ];

  const { rows } = await pool.query(
    `INSERT INTO places (
      id, name, category, description, object_info, lat, lon, cover_image_url,
      gallery, address, open_hours, phone, website_url, visible, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      object_info = EXCLUDED.object_info,
      lat = EXCLUDED.lat,
      lon = EXCLUDED.lon,
      cover_image_url = EXCLUDED.cover_image_url,
      gallery = EXCLUDED.gallery,
      address = EXCLUDED.address,
      open_hours = EXCLUDED.open_hours,
      phone = EXCLUDED.phone,
      website_url = EXCLUDED.website_url,
      visible = EXCLUDED.visible,
      updated_at = NOW()
    RETURNING *`,
    values
  );

  res.json(rows[0]);
}));

app.delete('/api/places/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM places WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

app.get('/api/routes', asyncHandler(async (req, res) => {
  const includeHidden = String(req.query.includeHidden || '') === '1';
  const query = `
    SELECT
      r.*,
      COALESCE(
        json_agg(
          json_build_object(
            'place_id', rp.place_id,
            'position', rp.position,
            'place_name', p.name,
            'lat', p.lat,
            'lon', p.lon,
            'cover_image_url', p.cover_image_url,
            'category', p.category
          ) ORDER BY rp.position
        ) FILTER (WHERE rp.place_id IS NOT NULL),
        '[]'::json
      ) AS points
    FROM routes r
    LEFT JOIN route_points rp ON rp.route_id = r.id
    LEFT JOIN places p ON p.id = rp.place_id
    ${includeHidden ? '' : 'WHERE r.visible = true'}
    GROUP BY r.id
    ORDER BY r.updated_at DESC, r.name;
  `;

  const { rows } = await pool.query(query);
  res.json(rows.map((row) => ({ ...row, points: Array.isArray(row.points) ? row.points : [] })));
}));

app.post('/api/routes', asyncHandler(async (req, res) => {
  const data = req.body || {};
  const points = Array.isArray(data.points)
    ? data.points.map((p) => String(p || '').trim()).filter(Boolean)
    : [];

  if (!data.name) return res.status(400).json({ error: 'Route name is required' });
  if (points.length < 2) return res.status(400).json({ error: 'Route must contain at least start and end points' });

  const id = slugify(data.id || data.name) || `route-${Date.now()}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const routeRes = await client.query(
      `INSERT INTO routes (id, name, short_description, description, visible, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        short_description = EXCLUDED.short_description,
        description = EXCLUDED.description,
        visible = EXCLUDED.visible,
        updated_at = NOW()
       RETURNING *`,
      [id, data.name, data.short_description || '', data.description || '', data.visible !== false]
    );

    await client.query('DELETE FROM route_points WHERE route_id = $1', [id]);

    for (let i = 0; i < points.length; i += 1) {
      await client.query(
        `INSERT INTO route_points (route_id, place_id, position)
         VALUES ($1, $2, $3)`,
        [id, points[i], i]
      );
    }

    const full = await client.query(
      `SELECT
        r.*,
        COALESCE(
          json_agg(
            json_build_object(
              'place_id', rp.place_id,
              'position', rp.position,
              'place_name', p.name,
              'lat', p.lat,
              'lon', p.lon,
              'cover_image_url', p.cover_image_url,
              'category', p.category
            ) ORDER BY rp.position
          ) FILTER (WHERE rp.place_id IS NOT NULL),
          '[]'::json
        ) AS points
      FROM routes r
      LEFT JOIN route_points rp ON rp.route_id = r.id
      LEFT JOIN places p ON p.id = rp.place_id
      WHERE r.id = $1
      GROUP BY r.id`,
      [id]
    );

    await client.query('COMMIT');
    res.json(full.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message || 'route save failed' });
  } finally {
    client.release();
  }
}));

app.delete('/api/routes/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM routes WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

app.get('/', (_req, res) => res.redirect('/pages/index.html'));

app.use((err, _req, res, _next) => {
  console.error('API error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Kursk guide server started on http://localhost:${PORT}`);
});
