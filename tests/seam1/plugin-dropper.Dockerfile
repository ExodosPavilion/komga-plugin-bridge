FROM busybox:1.37
COPY plugins/reference /dropped/reference
COPY tests/seam1/slow-plugin /dropped/slow
COPY tests/seam1/fixtures/plugins/event-sink /dropped/event-sink
CMD ["sh", "-c", "cp -r /dropped/. /plugins/"]
