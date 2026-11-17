// Fixture plugin for seam 1: hangs for any series whose name starts with "Slow", so the Plugin
// Host has to cut it off at its time limit.
export default {
  getSeriesMetadata({ series }: { series: { name: string } }) {
    if (series.name.startsWith("Slow")) return new Promise(() => {});
    return null;
  },
};
