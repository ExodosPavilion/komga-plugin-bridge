// Fixture plugin: forwards each event it subscribed to (LibraryScanned) to the test driver, which
// listens at http://tests:9099. Errors are swallowed: the driver is not always listening.
export default {
  async onEvent(event: unknown) {
    try {
      const response = await fetch("http://tests:9099/event", { method: "POST", body: JSON.stringify(event) });
      await response.body?.cancel();
    } catch { /* driver not listening */ }
  },
};
