module.exports = {
  transform: {
    "^.+\\.ts$":  ['esbuild-jest', { sourcemap: true }],
  },
};
