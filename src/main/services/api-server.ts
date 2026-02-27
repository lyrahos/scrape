// ============================================================================
// REST API Layer — Optional HTTP API for external integrations
// Serves data from the local database for PowerBI, Tableau, etc.
// ============================================================================
import http from 'http';
import { URL } from 'url';
import { HospitalRepo, PricingRepo, AnalyticsRepo, UpdateLogRepo } from '../storage/repositories';
import { executeSemanticQuery } from '../semantic/query-engine';

let server: http.Server | null = null;
const DEFAULT_PORT = 3001;

/**
 * Start the optional REST API server
 */
export function startAPIServer(port = DEFAULT_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    server = http.createServer(handleRequest);
    server.listen(port, () => {
      console.log(`API server listening on port ${port}`);
      resolve();
    });
    server.on('error', reject);
  });
}

export function stopAPIServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
      server = null;
    } else {
      resolve();
    }
  });
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  // CORS headers for external tool access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJSON(res, 405, { error: 'Method not allowed' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost`);
  const path = url.pathname;

  try {
    route(path, url.searchParams, res);
  } catch (err) {
    sendJSON(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
  }
}

function route(path: string, params: URLSearchParams, res: http.ServerResponse): void {
  // --- Hospitals ---
  if (path === '/api/hospitals/search') {
    const query = params.get('q') ?? '';
    const limit = parseInt(params.get('limit') ?? '50', 10);
    const results = HospitalRepo.search(query, limit);
    sendJSON(res, 200, { data: results, count: results.length });
    return;
  }

  if (path === '/api/hospitals/stats') {
    const stats = HospitalRepo.getStats();
    sendJSON(res, 200, { data: stats });
    return;
  }

  if (path.startsWith('/api/hospitals/state/')) {
    const state = path.split('/').pop()?.toUpperCase() ?? '';
    const results = HospitalRepo.listByState(state);
    sendJSON(res, 200, { data: results, count: results.length });
    return;
  }

  if (path.startsWith('/api/hospitals/') && !path.includes('/state/')) {
    const id = path.split('/').pop() ?? '';
    const hospital = HospitalRepo.getById(id);
    if (!hospital) { sendJSON(res, 404, { error: 'Hospital not found' }); return; }
    sendJSON(res, 200, { data: hospital });
    return;
  }

  // --- Pricing ---
  if (path === '/api/pricing/search') {
    const code = params.get('billing_code') ?? '';
    const state = params.get('state') ?? undefined;
    const results = PricingRepo.searchByCode(code, state);
    sendJSON(res, 200, { data: results, count: results.length });
    return;
  }

  if (path.startsWith('/api/pricing/hospital/')) {
    const hospitalId = path.split('/').pop() ?? '';
    const limit = parseInt(params.get('limit') ?? '100', 10);
    const results = PricingRepo.getByHospital(hospitalId, limit);
    sendJSON(res, 200, { data: results, count: results.length });
    return;
  }

  // --- Analytics ---
  if (path === '/api/analytics/state-averages') {
    const billingCode = params.get('billing_code') ?? undefined;
    const priceType = params.get('price_type') ?? undefined;
    const payer = params.get('payer') ?? undefined;
    const results = AnalyticsRepo.getStateAverages(billingCode, priceType, payer);
    sendJSON(res, 200, { data: results });
    return;
  }

  if (path === '/api/analytics/trends') {
    const billingCode = params.get('billing_code') ?? '';
    const state = params.get('state') ?? undefined;
    const areaCode = params.get('area_code') ?? undefined;
    if (!billingCode) { sendJSON(res, 400, { error: 'billing_code is required' }); return; }
    const results = AnalyticsRepo.getTrends(billingCode, state, areaCode);
    sendJSON(res, 200, { data: results });
    return;
  }

  if (path === '/api/analytics/variability') {
    const limit = parseInt(params.get('limit') ?? '10', 10);
    const results = AnalyticsRepo.getVariability(limit);
    sendJSON(res, 200, { data: results });
    return;
  }

  if (path === '/api/analytics/comparison') {
    const billingCode = params.get('billing_code') ?? '';
    const areaCode = params.get('area_code') ?? '';
    const startDate = params.get('start_date') ?? '';
    const endDate = params.get('end_date') ?? '';
    if (!billingCode || !areaCode) {
      sendJSON(res, 400, { error: 'billing_code and area_code are required' });
      return;
    }
    const results = AnalyticsRepo.getComparison(billingCode, areaCode, startDate, endDate);
    sendJSON(res, 200, { data: results });
    return;
  }

  if (path === '/api/analytics/dashboard') {
    const stats = AnalyticsRepo.getDashboardStats();
    sendJSON(res, 200, { data: stats });
    return;
  }

  // --- Semantic Query ---
  if (path === '/api/query') {
    const q = params.get('q') ?? '';
    if (!q) { sendJSON(res, 400, { error: 'q parameter is required' }); return; }
    const result = executeSemanticQuery(q);
    sendJSON(res, 200, { data: result });
    return;
  }

  // --- Update Log ---
  if (path === '/api/updates/log') {
    const limit = parseInt(params.get('limit') ?? '100', 10);
    const results = UpdateLogRepo.getRecent(limit);
    sendJSON(res, 200, { data: results, count: results.length });
    return;
  }

  // --- Export (PowerBI/Tableau-friendly endpoints) ---
  if (path === '/api/export/pricing') {
    // Return all current pricing as flat JSON — ideal for PowerBI Direct Query
    const billingCode = params.get('billing_code');
    const state = params.get('state');
    if (billingCode) {
      const results = PricingRepo.searchByCode(billingCode, state ?? undefined);
      sendJSON(res, 200, results); // Flat array for direct import
    } else {
      sendJSON(res, 400, { error: 'billing_code is required for export' });
    }
    return;
  }

  if (path === '/api/export/hospitals') {
    const state = params.get('state');
    if (state) {
      const results = HospitalRepo.listByState(state);
      sendJSON(res, 200, results);
    } else {
      sendJSON(res, 400, { error: 'state parameter is required for export' });
    }
    return;
  }

  // --- Health check ---
  if (path === '/api/health') {
    sendJSON(res, 200, { status: 'ok', version: '1.0.0' });
    return;
  }

  // --- API Documentation ---
  if (path === '/api' || path === '/api/') {
    sendJSON(res, 200, {
      name: 'Hospital Price Transparency API',
      version: '1.0.0',
      endpoints: [
        'GET /api/health',
        'GET /api/hospitals/search?q=<query>&limit=50',
        'GET /api/hospitals/stats',
        'GET /api/hospitals/state/<STATE>',
        'GET /api/hospitals/<id>',
        'GET /api/pricing/search?billing_code=<code>&state=<ST>',
        'GET /api/pricing/hospital/<id>?limit=100',
        'GET /api/analytics/state-averages?billing_code=&price_type=&payer=',
        'GET /api/analytics/trends?billing_code=<code>&state=&area_code=',
        'GET /api/analytics/variability?limit=10',
        'GET /api/analytics/comparison?billing_code=&area_code=&start_date=&end_date=',
        'GET /api/analytics/dashboard',
        'GET /api/query?q=<natural language query>',
        'GET /api/updates/log?limit=100',
        'GET /api/export/pricing?billing_code=<code>&state=<ST>',
        'GET /api/export/hospitals?state=<ST>',
      ],
    });
    return;
  }

  sendJSON(res, 404, { error: 'Endpoint not found. Visit /api for documentation.' });
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status);
  res.end(JSON.stringify(data, null, 2));
}
