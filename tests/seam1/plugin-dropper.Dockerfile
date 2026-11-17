FROM busybox:1.37
COPY plugins/reference /dropped/reference
COPY tests/seam1/slow-plugin /dropped/slow
COPY tests/seam1/fixtures/me-filter /dropped/me-filter
CMD ["sh", "-c", "cp -r /dropped/. /plugins/"]
