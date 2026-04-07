module.exports = {
  port: 3000,
  sessionSecret: 'demo-app-secret-not-for-production',

  users: {
    'alice@example.com': { password: 'password1', name: 'Alice' },
    'bob@example.com':   { password: 'password2', name: 'Bob' },
  },

  behaviors: {
    // loginDelayMs: 0,
    // failLoginFor: [],
  },
};
