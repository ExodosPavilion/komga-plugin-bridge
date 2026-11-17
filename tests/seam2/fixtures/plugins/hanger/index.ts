// Fixture plugin: never answers.
export default {
  getSeriesMetadata() {
    return new Promise(() => {});
  },
};
