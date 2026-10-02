#!/usr/bin/env node

import app from '../app.js';

const port = process.env.PORT || 3000;

const server = app.listen(port, (err) => {
  if (err) {
    // handle specific listen errors with friendly messages
    switch (err.code) {
      case 'EACCES':
        console.error(`Port ${port} requires elevated privileges`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(`Port ${port} is already in use`);
        process.exit(1);
        break;
      default:
        throw err;
    }
  }

  console.log(`Listening on port ${port}`);
});

// close the server gracefully when asked to stop
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
