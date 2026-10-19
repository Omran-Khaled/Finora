const { stopManagedProcess } = require('./start-local.cjs');

void stopManagedProcess().then((result) => {
  if (result === 'unverified' || result === 'error') process.exitCode = 1;
});
