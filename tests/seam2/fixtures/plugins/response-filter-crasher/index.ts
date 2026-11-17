// Fixture filter plugin: always throws.
export default {
  filterResponse(): never {
    throw new Error("filter boom");
  },
};
