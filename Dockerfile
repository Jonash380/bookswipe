FROM python:3.12-slim

WORKDIR /app

# Copy only what's needed for the server + frontend
COPY server.py start.sh sw.js index.html ./
COPY css/ css/
COPY js/ js/
COPY static/ static/

# Server binds to 0.0.0.0 for container networking
ENV BOOKSWIPE_BIND=0.0.0.0
ENV BOOKSWIPE_PORT=3000

RUN useradd -r -s /bin/false bookswipe
RUN chown -R bookswipe:bookswipe /app
USER bookswipe

EXPOSE 3000

# Health check against the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1

# Run in foreground (no daemonization in container)
CMD ["python3", "server.py"]
