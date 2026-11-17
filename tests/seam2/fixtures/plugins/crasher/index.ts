// Fixture plugin: fails on every call.
export default {
  getSeriesMetadata() {
    throw new Error("this plugin always fails");
  },
  getBookMetadata() {
    throw new Error("this plugin always fails");
  },
};
