# Seam 1 test driver: Deno plus the repository. Build context is the repository root.
FROM denoland/deno:2.5.6
WORKDIR /work
COPY . .
CMD ["deno", "test", "--allow-all", "tests/seam1/"]
