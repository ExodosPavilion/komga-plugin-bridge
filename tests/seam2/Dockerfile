# Seam 2 test image: Deno plus the repository. Build context is the repository root.
FROM denoland/deno:2.5.6
WORKDIR /work
COPY . .
# The test runner package carries a copy of the Plugin Host and stand-ins; build it (see the script).
RUN deno run --allow-read --allow-write plugin-test-runner/scripts/bundle.ts
CMD ["deno", "test", "--allow-all", "tests/seam2/"]
