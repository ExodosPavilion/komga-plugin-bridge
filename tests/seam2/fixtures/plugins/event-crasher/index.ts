// Fixture plugin: subscribed to LibraryScanned and always fails on it.
export default {
  onEvent() {
    throw new Error("cannot handle this event");
  },
};
