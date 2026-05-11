'use strict';

const express = require('express');
const path = require('path');
const config = require('./config');
const { requestContext } = require('./context');
const { optionalUser } = require('./auth');
const { resolveTenant } = require('./tenant');
const { router } = require('./routes');

function createApp() {
  const app = express();

  if (config.trustProxy) {
    app.set('trust proxy', true);
  }

  app.use((req, res, next) => {
    if (req.path === '/v1/billing/webhook') return next();
    return express.json({ limit: '1mb' })(req, res, next);
  });
  app.use(requestContext);
  app.use(optionalUser);
  app.use(resolveTenant);
  app.use(router);
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, _next) => {
    console.error('[control-plane]', req.context?.requestId, err);
    res.status(500).json({
      error: 'internal_error',
      requestId: req.context?.requestId || null
    });
  });

  return app;
}

module.exports = { createApp };
