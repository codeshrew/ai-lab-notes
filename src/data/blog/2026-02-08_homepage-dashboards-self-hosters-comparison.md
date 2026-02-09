---
title: "Homepage Dashboards for Self-Hosters: Comparing 8 Tools"
author: sk
pubDatetime: 2026-02-08T00:00:00Z
featured: false
draft: false
tags:
  - self-hosted
  - docker
  - dashboard
  - guide
  - review
description: "A practical comparison of 8 self-hosted dashboard tools -- Homepage, Homarr, Dashy, Glance, and more -- with setup instructions for the winner."
---

If you run more than a handful of self-hosted services, you know the problem: too many ports to remember, too many browser bookmarks, no single place to check if everything is healthy. Was Grafana on port 3002 or 3003? Is Ollama actually running?

A homepage dashboard solves this by giving you a single page with links, status indicators, and live widgets for all your services. This post compares eight popular options and walks through setting up the best one for a git-tracked, monitoring-integrated setup.

## Table of contents

## What to Look For

Before comparing tools, it helps to define what matters for a self-hosted dashboard:

1. **Quick launch** -- links to all your services in one place, organized by category
2. **Health checks** -- at-a-glance status showing which services are up or down
3. **Configuration as code** -- YAML or JSON config files you can track in git, not a database you have to back up
4. **Docker awareness** -- auto-discovery of containers, live status, resource stats
5. **Service integrations** -- native widgets for tools like Prometheus, Grafana, and Docker
6. **Low resource usage** -- the dashboard itself should not be the thing that needs monitoring
7. **Fully self-hosted** -- no cloud dependency, no telemetry, no account required

## The Comparison

| Tool | Stars | License | Config Method | Health Checks | Docker Discovery | RAM Usage |
|------|-------|---------|---------------|---------------|------------------|-----------|
| **Homepage** | 28k+ | GPL-3.0 | YAML files | Ping + HTTP + Docker | Labels + socket | ~50 MB |
| **Glance** | 31k+ | AGPL-3.0 | YAML file | Docker status | Via socket | ~20 MB |
| **Dashy** | 24k+ | MIT | YAML + UI editor | HTTP status | No auto-discovery | ~100-200 MB |
| **Homer** | 11k+ | Apache-2.0 | Single YAML file | Offline health check | No | ~10 MB |
| **Heimdall** | 9k+ | MIT | GUI | Enhanced app stats | No auto-discovery | ~100 MB |
| **Flame** | 6k+ | MIT | GUI editors | No built-in | Docker labels | ~80 MB |
| **Organizr** | 6k+ | GPL-3.0 | GUI (tabs) | Limited | No | ~100 MB |
| **Homarr** | 3k+ | Apache-2.0 | Drag-and-drop GUI | Docker + widgets | Via socket | ~300 MB |

All eight tools are open source, self-hosted, and have no cloud dependency. They differ primarily in configuration approach (code vs. GUI), integration depth, and resource usage.

## Deep Dive: Top 3

### 1. Homepage -- Best for Git-Tracked, Integration-Heavy Setups

**GitHub:** [gethomepage/homepage](https://github.com/gethomepage/homepage)
**Stack:** Next.js (statically generated)

Homepage is the most complete service-focused dashboard available. Its defining feature is the sheer depth of its integrations: over 100 service widgets with first-class support for Prometheus, Grafana, Docker, Portainer, Plex, Home Assistant, and dozens more.

**What sets it apart:**

- **YAML configuration** across four files (`services.yaml`, `settings.yaml`, `widgets.yaml`, `docker.yaml`). Every change is diffable and version-controllable.
- **Docker auto-discovery** via container labels. Add labels to your existing `docker-compose.yml` and the services appear automatically on the dashboard.
- **Docker socket integration** shows real-time container status and resource stats.
- **Server-side API proxy** -- API keys for Grafana, Prometheus, and other services are kept server-side and never exposed to the browser.
- **System resource widgets** for CPU, RAM, disk, and GPU right on the dashboard.
- **Search, bookmarks, weather, and multi-language** support out of the box.

**Trade-offs:**

- No visual drag-and-drop editor. All configuration is through YAML files.
- Each service widget has its own configuration format, so there is a learning curve when adding new integrations.
- Grid layout is defined in settings, not positioned freely.

**Resource usage:** ~50 MB RAM. Runs comfortably on a Raspberry Pi.

### 2. Glance -- Best for a Lightweight, Feed-Focused Start Page

**GitHub:** [glanceapp/glance](https://github.com/glanceapp/glance)
**Stack:** Go single binary

Glance is the most starred dashboard tool (31k+) and the lightest. It is a single Go binary that runs with virtually zero overhead. The UI is beautiful out of the box, with a modern, magazine-style layout.

**What sets it apart:**

- **Ultralight** -- ~20 MB RAM, single binary, no runtime dependencies
- **YAML config**, git-trackable
- **Feed-centric design** with widgets for RSS, Hacker News, Reddit, YouTube, weather, markets, and more
- **Docker status widget** available
- **Fast development pace** -- very active maintainer

**Trade-offs:**

- Fewer service-specific integrations than Homepage. No Prometheus widget, no Grafana embed, no per-service API widgets.
- More of a "personal start page" than a "service monitoring dashboard." It aggregates content first, monitors services second.
- Docker integration is basic -- container status only, no auto-discovery via labels.
- No HTTP endpoint health checking beyond Docker container state.
- Pre-1.0 (v0.8.x), so the API and configuration format may change.

**Best for:** Developers who want a beautiful start page that combines news feeds, weather, and service links in one view. Less suitable if deep service monitoring integration is the priority.

### 3. Homarr -- Best for Visual Configuration

**GitHub:** [homarr-labs/homarr](https://github.com/homarr-labs/homarr)
**Stack:** TypeScript (Next.js, tRPC, Redis)

Homarr is the opposite of Homepage in philosophy: everything is configured through a polished drag-and-drop GUI. No YAML editing required.

**What sets it apart:**

- **Beautiful drag-and-drop interface** with zero config files
- **10,000+ built-in icons** for services
- **Docker socket integration** with container management (start, stop, restart from the dashboard)
- **Real-time WebSocket updates**
- **Multi-user with authentication** (OIDC, LDAP)
- **Responsive design** from 4K monitors down to mobile

**Trade-offs:**

- **Higher resource usage** at ~300 MB RAM -- significantly more than Homepage or Glance
- **Config stored in a database**, not YAML files. This makes git tracking and version control much harder. You would need to back up the database separately.
- Fewer service-specific API integrations than Homepage (30 vs 100+). No dedicated Prometheus or Grafana widgets.
- The drag-and-drop approach, while user-friendly, works against the configuration-as-code philosophy.

**Best for:** Users who prefer a visual editor and do not need to version-control their dashboard configuration. Good for homelab setups where you want to manage Docker containers directly from the dashboard.

## Why Homepage Wins for a Monitoring-Integrated Setup

If you already run a monitoring stack (Prometheus, Grafana, Alertmanager) and track your configuration in git, Homepage is the clear choice:

1. **YAML config** lives in your repo alongside your Docker Compose files
2. **100+ service widgets** means Prometheus, Grafana, Docker, and most self-hosted tools have native integration
3. **Docker auto-discovery** means monitoring containers show up automatically
4. **Server-side API proxy** keeps your Grafana API keys out of the browser
5. **~50 MB RAM** is trivial overhead on any system
6. **Most actively maintained** -- frequent releases, large contributor community

Glance would be the pick for a feed-centric start page, and Homarr for a visual editor experience. But for monitoring integration depth with git-trackable config, Homepage has no real competitor.

## Quick Start: Homepage in Docker

### Directory Structure

```
homepage/
  docker-compose.yml
  config/
    services.yaml      # Service groups and links
    settings.yaml      # Layout, theme, title
    widgets.yaml       # System resource widgets
    docker.yaml        # Docker socket connection
    bookmarks.yaml     # Quick links (optional)
```

### Docker Compose

```yaml
# homepage/docker-compose.yml
services:
  homepage:
    image: ghcr.io/gethomepage/homepage:latest
    container_name: homepage
    ports:
      - "3010:3000"
    volumes:
      - ./config:/app/config
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - HOMEPAGE_ALLOWED_HOSTS=localhost:3010,your-hostname:3010
      - PUID=1000
      - PGID=1000
    restart: unless-stopped
```

**Important notes for Linux:**

- **Port 3010** avoids conflicts with Next.js dev servers (3000), Grafana (3002), and other common services.
- **Docker socket is mounted read-only** (`:ro`). Homepage only reads container status; it does not manage containers.
- **`HOMEPAGE_ALLOWED_HOSTS`** must include the port number. Without this, you will get a "host not allowed" error when accessing the dashboard. Add every hostname/IP and port combination you use to access it.
- **`PGID`** should be set to your Docker group's GID. On most systems this is the `docker` group. Find it with `getent group docker | cut -d: -f3`.

If your user is not in the `docker` group and you get permission denied errors on the Docker socket:

```bash
# Check your docker group GID
getent group docker | cut -d: -f3

# Use that GID as PGID in docker-compose.yml
```

### Docker Socket Configuration

```yaml
# config/docker.yaml
---
my-docker:
  socket: /var/run/docker.sock
```

This names your Docker socket connection `my-docker`. You will reference this name in `services.yaml` when configuring Docker-aware widgets.

### Services Configuration

```yaml
# config/services.yaml
---
- AI Tools:
    - Ollama:
        icon: ollama
        href: http://localhost:11434
        description: Local LLM API
        ping: http://localhost:11434

    - Open WebUI:
        icon: open-webui
        href: http://localhost:8080
        description: Chat interface
        server: my-docker
        container: open-webui

- Monitoring:
    - Grafana:
        icon: grafana
        href: http://localhost:3002
        description: Dashboards
        server: my-docker
        container: grafana-monitoring
        widget:
          type: grafana
          url: http://grafana-monitoring:3000
          username: admin
          password: "{{HOMEPAGE_VAR_GRAFANA_PASSWORD}}"

    - Prometheus:
        icon: prometheus
        href: http://localhost:9090
        description: Metrics collection
        server: my-docker
        container: prometheus
        widget:
          type: prometheus
          url: http://prometheus:9090

    - Alertmanager:
        icon: alertmanager
        href: http://localhost:9093
        description: Alert routing
        server: my-docker
        container: alertmanager

    - ntfy:
        icon: ntfy-sh
        href: http://localhost:8090
        description: Push notifications
        server: my-docker
        container: ntfy

- Development:
    - Browserless:
        icon: chrome
        href: http://localhost:3100
        description: Headless Chrome
        server: my-docker
        container: browserless
```

**How the `server` and `container` fields work:**

- `server: my-docker` tells Homepage to use the Docker socket connection named `my-docker` (from `docker.yaml`)
- `container: grafana-monitoring` maps to the Docker container name. Homepage will show its running status and resource usage.
- `ping: http://localhost:11434` is a fallback for services not running in Docker. Homepage checks the URL and shows up/down status.

### Integrating Prometheus and Grafana Widgets

The Prometheus widget shows scrape target health and alert status directly on the dashboard. The Grafana widget shows dashboard statistics and alert counts.

For the Grafana widget, you need an API key:

1. Open Grafana at `http://localhost:3002`
2. Go to **Administration** > **Service accounts** > **Add service account**
3. Name it `homepage`, set role to **Viewer**
4. Create a token for the service account
5. Store the token securely (in 1Password, a `.env` file, or as an environment variable)

In `docker-compose.yml`, pass the token as an environment variable:

```yaml
environment:
  - HOMEPAGE_VAR_GRAFANA_PASSWORD=your-grafana-service-account-token
```

Homepage substitutes `{{HOMEPAGE_VAR_GRAFANA_PASSWORD}}` in the YAML config with the actual value at runtime, keeping the token out of your config files.

**Connecting to host services from inside Docker:**

If your monitoring services and Homepage are in separate Docker Compose stacks, Homepage needs to reach them. Add `extra_hosts` to the Homepage service:

```yaml
services:
  homepage:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Then use `http://host.docker.internal:9090` as the Prometheus URL in your widget config instead of `http://prometheus:9090`.

### System Widgets

```yaml
# config/widgets.yaml
---
- resources:
    cpu: true
    memory: true
    disk: /
    cputemp: true
    uptime: true

- search:
    provider: duckduckgo
    target: _blank

- datetime:
    text_size: xl
    format:
      dateStyle: long
      timeStyle: short
```

The `resources` widget shows system stats at the top of the dashboard. The `disk: /` field monitors the root partition -- add additional disks as needed.

### Settings

```yaml
# config/settings.yaml
---
title: Workstation Dashboard
theme: dark
color: slate

layout:
  AI Tools:
    style: row
    columns: 4
  Monitoring:
    style: row
    columns: 3
  Development:
    style: row
    columns: 2

headerStyle: clean
```

### Deploy and Access

```bash
cd homepage/
docker compose up -d

# Open the dashboard
xdg-open http://localhost:3010
```

## Tips and Gotchas

### Docker Socket Permissions on Linux

The most common issue on Linux is permission errors when Homepage tries to read the Docker socket. The socket is owned by `root:docker`, and the container process needs to match the `docker` group GID.

```bash
# Find your docker group GID
getent group docker | cut -d: -f3
# Typically 999 or 998

# Set PGID in docker-compose.yml to match
environment:
  - PGID=999  # Use your actual docker group GID
```

### HOMEPAGE_ALLOWED_HOSTS Must Include the Port

A common gotcha: if you access the dashboard at `http://10.0.0.100:3010`, the `HOMEPAGE_ALLOWED_HOSTS` variable must include the port:

```yaml
environment:
  - HOMEPAGE_ALLOWED_HOSTS=localhost:3010,10.0.0.100:3010
```

Without the port, you will see a "host not allowed" error page.

### Using Docker Labels for Auto-Discovery

Instead of manually listing every container in `services.yaml`, you can add labels to your existing Docker Compose files:

```yaml
# In your monitoring docker-compose.yml
services:
  grafana:
    image: grafana/grafana:latest
    labels:
      - homepage.group=Monitoring
      - homepage.name=Grafana
      - homepage.icon=grafana
      - homepage.href=http://localhost:3002
      - homepage.description=Dashboards & Visualization
```

Homepage will automatically discover labeled containers and add them to the dashboard. This is useful when you frequently add or remove services.

### Config Reloading

Homepage watches its config files for changes. When you edit `services.yaml` or any other config file, the dashboard updates within a few seconds without needing to restart the container.

## Further Reading

- [Homepage documentation](https://gethomepage.dev/)
- [Homepage service widgets](https://gethomepage.dev/configs/services/)
- [Homepage Docker integration](https://gethomepage.dev/configs/docker/)
- [Glance documentation](https://github.com/glanceapp/glance)
- [Homarr documentation](https://homarr.dev/)
