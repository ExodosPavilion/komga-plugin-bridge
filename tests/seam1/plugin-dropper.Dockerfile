FROM busybox:1.37
COPY plugins/reference /dropped/reference
COPY tests/seam1/slow-plugin /dropped/slow
CMD ["sh", "-c", "cp -r /dropped/. /plugins/"]
