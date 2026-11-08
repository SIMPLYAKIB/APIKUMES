import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer, build as buildVite } from 'vite';
import apiApp from './Apikume/Server/App.js';
import {
  handleSignup,
  handleLogin,
  handleGetMe,
  handleSaveContinue,
  handleSaveList,
  handleSaveSettings,
  handleChangeUsername,
  handleChangeEmail,
  handleChangePassword,
  handleChangeProfile,
  handleDeleteAccount,
} from './Anikume/src/lib/auth-service.js';
import {
  handleGetComments,
  handleAddComment,
  handleReactComment,
  handleDeleteComment,
  handleEditComment,
} from './Anikume/src/lib/comments-service.js';

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.set('etag', false);
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // AniKume Auth API routes (/api/auth/*)
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const clientIp = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '') as string;
      const result = await handleSignup(req.body, clientIp);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const clientIp = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '') as string;
      const result = await handleLogin(req.body, clientIp);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const result = await handleGetMe(req.headers.authorization || null);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/save-continue', async (req, res) => {
    try {
      const result = await handleSaveContinue(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/save-list', async (req, res) => {
    try {
      const result = await handleSaveList(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/save-settings', async (req, res) => {
    try {
      const result = await handleSaveSettings(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/change-username', async (req, res) => {
    try {
      const result = await handleChangeUsername(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/change-email', async (req, res) => {
    try {
      const result = await handleChangeEmail(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const result = await handleChangePassword(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/change-profile', async (req, res) => {
    try {
      const result = await handleChangeProfile(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  app.post('/api/auth/delete-account', async (req, res) => {
    try {
      const result = await handleDeleteAccount(req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Auth server error' });
    }
  });

  // AniKume Comments API routes (/api/comments*)
  app.get(['/api/comments', '/api/comments/:mediaId'], async (req, res) => {
    try {
      const mediaId = String(req.params.mediaId || req.query.id || '');
      const epNum = req.query.ep ? Number(req.query.ep) : undefined;
      const result = await handleGetComments(mediaId, epNum);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Comments server error' });
    }
  });

  app.post('/api/comments/add', async (req, res) => {
    try {
      const result = await handleAddComment(req.headers.authorization || null, req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Comments server error' });
    }
  });

  app.post('/api/comments/react', async (req, res) => {
    try {
      const result = await handleReactComment(req.headers.authorization || null, req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Comments server error' });
    }
  });

  app.post('/api/comments/edit', async (req, res) => {
    try {
      const result = await handleEditComment(req.headers.authorization || null, req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Comments server error' });
    }
  });

  app.post('/api/comments/delete', async (req, res) => {
    try {
      const result = await handleDeleteComment(req.headers.authorization || null, req.body);
      res.status(result.status).json(result.data || { error: result.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Comments server error' });
    }
  });

  // VAST ad proxy endpoints used by AniKume player/test-ad routes
  app.all(['/api/vast', '/api/vast-proxy'], async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.status(204).set({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }).end();
        return;
      }
      const targetVastUrl = String(req.query.url || req.query.tag || '');
      if (!targetVastUrl) {
        res.status(400).set({
          'Content-Type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        }).send('<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"><Error><![CDATA[Missing url parameter]]></Error></VAST>');
        return;
      }
      const decodedTarget = decodeURIComponent(targetVastUrl);
      const clientIp = String(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || '185.220.101.5');
      const clientUa = String(req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      let reqReferer = String(req.headers.referer || req.headers.origin || 'https://anikume.cc/');
      if (reqReferer.includes('localhost') || reqReferer.includes('127.0.0.1') || reqReferer.includes('magsrv.com') || reqReferer.includes('loyal-product')) {
        reqReferer = 'https://anikume.cc/';
      }
      const vastRes = await fetch(decodedTarget, {
        method: 'GET',
        headers: {
          'User-Agent': clientUa,
          Accept: 'application/xml,text/xml,application/json,text/html,*/*',
          Referer: reqReferer,
          Origin: new URL(reqReferer).origin,
          'X-Forwarded-For': clientIp,
        },
      });
      const vastXmlText = await vastRes.text();
      res.status(200).set({
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }).send(vastXmlText);
    } catch (err: any) {
      res.status(500).set({
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      }).send(`<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"><Error><![CDATA[${err?.message || 'VAST Fetch Failed'}]]></Error></VAST>`);
    }
  });

  // Mount Apikume API on /api/anime/* and /api/apikume/* (rewriting to /anime/*) and /api/*
  app.use('/api/apikume', (req, res, next) => {
    req.url = req.url === '/' ? '/anime' : req.url;
    apiApp(req, res, next);
  });
  app.use('/api', apiApp);

  // Serve static files from Anikume/public before hitting rate-limited apiApp
  const publicPath = path.resolve(process.cwd(), 'Anikume/public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  // Decide whether an incoming non-/api request belongs to the Apikume backend API
  const shouldRouteToApikumeApi = (req: express.Request): boolean => {
    const pathname = req.path || '/';
    const accept = String(req.headers.accept || '');
    const isHtmlNavigation = req.method === 'GET' && accept.includes('text/html');

    // Dedicated Apikume backend endpoints
    if (
      pathname === '/status' ||
      pathname === '/health' ||
      pathname === '/heroslider' ||
      pathname === '/trendingnow' ||
      pathname === '/thisseason' ||
      pathname === '/popular' ||
      pathname === '/top10' ||
      pathname === '/upcoming' ||
      pathname === '/search' ||
      pathname.startsWith('/overview/') ||
      pathname.startsWith('/dub/') ||
      pathname.startsWith('/logo/') ||
      pathname.startsWith('/map/') ||
      pathname === '/test/anime' ||
      pathname === '/proxy' ||
      pathname.startsWith('/proxy/') ||
      pathname.startsWith('/anime/map/') ||
      pathname.startsWith('/anime/sourcemap/') ||
      pathname === '/chiaki' ||
      pathname.startsWith('/chiaki/') ||
      pathname.startsWith('/mkissa/') ||
      pathname === '/openapi.json' ||
      pathname === '/openapi.yaml' ||
      pathname === '/openapi.yml' ||
      pathname === '/.well-known/ai-plugin.json' ||
      pathname === '/ai-plugin.json'
    ) {
      return true;
    }

    // /anime?section=... is always the Apikume home/section catalog API
    if (pathname === '/anime') {
      return true;
    }

    // /anime/:id, /anime/browse, /anime/watch/:id/:ep
    // If it has ?data= query param OR it's a JSON/fetch call (not a browser text/html page navigation), route to Apikume API
    if (pathname.startsWith('/anime/')) {
      if (req.query && req.query.data !== undefined) {
        return true;
      }
      if (!isHtmlNavigation) {
        return true;
      }
      return false;
    }

    return false;
  };

  app.use((req, res, next) => {
    if (shouldRouteToApikumeApi(req)) {
      return apiApp(req, res, next);
    }
    next();
  });

  // Serve compiled production dist/ build whenever available or in production mode
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  if (process.env.NODE_ENV === 'production' && !fs.existsSync(distIndexPath)) {
    try {
      await buildVite();
    } catch (buildErr) {
      console.error('Failed to auto-build dist/ on startup:', buildErr);
    }
  }

  if (fs.existsSync(distIndexPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && !req.originalUrl.startsWith('/api')) return next();
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      if (!fs.existsSync(distIndexPath)) {
        res.status(503).set({ 'Content-Type': 'text/html', 'Retry-After': '2' }).send('<!doctype html><html><head><meta http-equiv="refresh" content="1"></head><body style="background:#09090b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Loading...</body></html>');
        return;
      }
      res.status(200).sendFile(distIndexPath, (err) => {
        if (err && !res.headersSent) {
          next(err);
        }
      });
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      if (req.method !== 'GET' && !req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        const statusCode = req.originalUrl.startsWith('/api') ? 404 : 200;
        res.status(statusCode).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  }

  // 404 handler for any undefined API route
  app.use((req, res) => {
    res.status(404).json({
      error: true,
      code: 'NOT_FOUND',
      message: 'Not Found',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AniKume + Apikume Server running on http://localhost:${PORT}`);
  });
}

startServer();
