// Adds the GitHub Pages sub-path (e.g. /fridge-tracker) for web builds; empty everywhere else.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL || '' },
});
