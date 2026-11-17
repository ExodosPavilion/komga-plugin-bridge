// Fixture plugin: fails while a file named "fail" exists beside it, and succeeds otherwise.
const failing = () => {
  try {
    Deno.statSync(new URL("./fail", import.meta.url));
    return true;
  } catch {
    return false;
  }
};

export default {
  getSeriesMetadata() {
    if (failing()) throw new Error("toggle is set to fail");
    return { summary: "toggle ok" };
  },
};
