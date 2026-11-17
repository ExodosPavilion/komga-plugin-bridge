// Fixture filter plugin: never answers.
export default {
  filterResponse() {
    return new Promise(() => {});
  },
};
