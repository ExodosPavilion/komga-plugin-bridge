// Fixture plugin: never answers.
export default {
  getSeriesMetadata() {
    return new Promise(() => {});
  },
  getBookMetadata() {
    return new Promise(() => {});
  },
};
