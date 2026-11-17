FROM busybox:1.37
COPY plugins/reference /dropped/reference
CMD ["sh", "-c", "cp -r /dropped/. /plugins/"]
