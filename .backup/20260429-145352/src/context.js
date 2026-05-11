'use strict';

function requestContext(req, res, next) {
  req.context = {
    requestId: req.headers['x-request-id'] || `req_${Date.now().toString(36)}`,
    tenant: null,
    user: null
  };
  res.setHeader('x-request-id', req.context.requestId);
  next();
}

module.exports = { requestContext };
