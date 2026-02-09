---
title: "Runtime Security for AI Agents with Falco and auditd"
author: sk
pubDatetime: 2026-02-08T00:00:00Z
featured: false
draft: false
tags:
  - security
  - ai
  - agents
  - falco
  - linux
  - guide
description: "How to monitor AI coding agents at the kernel level using Falco (eBPF) and auditd -- detect sensitive file writes, dangerous commands, and unexpected behavior."
---

AI coding agents like Claude Code, Aider, and Cursor operate with broad system access. They read files, execute shell commands, install packages, modify configurations, and interact with network services. This is what makes them productive -- and what makes them a security concern.

Traditional security tooling is built around the assumption that threats come from outside. But when you give an AI agent `sudo` access and tell it to fix your Nginx config, the "threat" is an authorized process making legitimate-looking changes. The question becomes: how do you verify that what the agent did is what you intended?

This guide covers two complementary tools for runtime monitoring of AI agent activity: **Falco** (eBPF-based real-time detection) and **auditd** (kernel-level audit logging). Together, they give you a complete picture of what any process -- human or AI -- does on your system.

## Table of contents

## The Threat Model for AI Agents

Before building defenses, understand what you are defending against. The realistic threats when using AI coding agents are specific and different from traditional server security.

### What Can Go Wrong

| Scenario | How It Happens | Impact |
|----------|---------------|--------|
| **Unintended system changes** | Agent modifies `/etc/` files, creates systemd services, or installs packages you did not ask for | System instability, security regressions |
| **Accidental destructive commands** | Agent runs `rm -rf` on the wrong path, or uses `dd` without understanding the target | Data loss |
| **Privilege escalation** | Agent modifies sudoers, adds SSH keys, or creates new user accounts | Persistent unauthorized access |
| **Unexpected network activity** | Agent downloads dependencies from untrusted sources or opens listening ports | Exposure to network attacks |
| **Prompt injection** | Agent reads a malicious webpage or file containing hidden instructions | Arbitrary command execution under the agent's permissions |
| **Credential exposure** | Agent reads `.env` files or SSH keys and includes them in API context | Secrets sent to cloud providers |

### Why Traditional Security Is Not Enough

Standard Linux security tools assume a clear boundary between "authorized" and "unauthorized":

- **Firewalls** block external connections but cannot distinguish an agent's legitimate `npm install` from an agent downloading a malicious package.
- **File permissions** allow or deny access per user, but the agent runs as your user with your permissions.
- **AppArmor/SELinux** restrict what programs can do, but creating profiles for every command an agent might run is impractical.
- **Antivirus** scans for known malware signatures, but an agent writing a malicious cron job does not match any signature.

What you need is **behavioral monitoring** -- detecting unexpected actions regardless of who or what initiated them. This is where Falco and auditd come in.

## How Falco and auditd Work Together

```mermaid
graph TD
    subgraph Kernel Space
        SC[System Calls] -->|eBPF hooks| FALCO_K[Falco eBPF Driver]
        SC -->|audit hooks| AUDITD_K[auditd Kernel Module]
    end

    subgraph User Space
        FALCO_K -->|events| FALCO[Falco Engine]
        AUDITD_K -->|events| AUDITD[auditd Daemon]

        FALCO -->|matches rules| FALCO_RULES[Custom YAML Rules]
        FALCO -->|alerts| SYSLOG[syslog / journald]
        FALCO -->|alerts| NTFY[ntfy Push Notifications]
        FALCO -->|alerts| WEBHOOK[Webhooks]

        AUDITD -->|logs| AUDIT_LOG[/var/log/audit/audit.log]
        AUDITD -->|configured by| AUDIT_RULES[Audit Rules Files]
        AUDIT_LOG -->|query| AUSEARCH[ausearch / aureport]
        AUDIT_LOG -->|ship to| LOKI[Loki via Promtail]
    end

    subgraph Monitored Activity
        AGENT[AI Agent Process] -->|file writes, commands, network| SC
        USER[Human User] -->|file writes, commands, network| SC
        DOCKER[Docker Containers] -->|file writes, commands, network| SC
    end
```

**Falco** is the real-time alarm system. It hooks into kernel system calls via eBPF and fires alerts within milliseconds when a rule matches. Use it for immediate detection of dangerous actions.

**auditd** is the audit trail. It records detailed logs of file access, command execution, and privilege changes. Use it for after-the-fact forensics and compliance.

| Aspect | Falco | auditd |
|--------|-------|--------|
| **Detection speed** | Real-time (milliseconds) | Log-based (query after the fact) |
| **Rule format** | YAML with rich condition syntax | Simple watch rules |
| **Overhead** | ~100m CPU, ~512 MB RAM | Minimal (~10 MB RAM) |
| **Best for** | Alerting on dangerous actions as they happen | Complete audit trail of all file and command activity |
| **Output** | syslog, webhooks, ntfy, Slack | Log files queried with ausearch/aureport |
| **Backing** | CNCF Graduated (Apache 2.0) | Linux kernel project (GPL) |

## Falco: Real-Time Detection

### What Is Falco?

Falco is a CNCF Graduated project (the highest level of open-source maturity) that monitors system calls via eBPF. It evaluates every relevant system call against a set of YAML rules and fires an alert when a condition matches.

**Falco is not Kubernetes-only.** While it is widely known in the container security space, Falco runs perfectly well as a systemd service on a plain Linux desktop or server. The eBPF driver (`modern_ebpf`) requires kernel 5.8 or later, which any modern distribution provides.

**Resource overhead:** ~100m CPU and ~512 MB RAM at baseline. The eBPF driver handles 10,000+ events per second at less than 5% CPU overhead.

### Installing Falco

```bash
# Add the Falco repository
curl -fsSL https://falco.org/repo/falcosecurity-packages.asc | \
  sudo gpg --dearmor -o /usr/share/keyrings/falco-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/falco-archive-keyring.gpg] \
  https://download.falco.org/packages/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/falcosecurity.list

sudo apt update && sudo apt install falco

# Start with the modern eBPF driver
sudo systemctl enable falco-modern-bpf
sudo systemctl start falco-modern-bpf

# Verify it is running
sudo systemctl status falco-modern-bpf

# Watch alerts in real time
sudo journalctl -u falco-modern-bpf -f
```

Falco ships with a comprehensive set of default rules that cover common security scenarios: shell spawning in containers, sensitive file reads, privilege escalation, and more. But the real power comes from writing custom rules tailored to AI agent behavior.

### Custom Rules for AI Agent Detection

Create a custom rules file at `/etc/falco/rules.d/ai-agent.yaml`. Files in this directory are automatically loaded by Falco.

#### Detect Writes to Sensitive System Files

AI agents should not be writing to `/etc/` unless they are running a package manager. This rule fires when any process other than `apt`, `dpkg`, or `etckeeper` modifies files in `/etc/`:

```yaml
- rule: Sensitive File Write by Non-Package-Manager
  desc: Detect writes to /etc by processes other than apt/dpkg
  condition: >
    open_write and container.id = host
    and fd.name startswith /etc/
    and not proc.name in (dpkg, apt, apt-get, aptitude, etckeeper)
  output: >
    Sensitive file write
    (user=%user.name command=%proc.cmdline
    file=%fd.name parent=%proc.pname)
  priority: WARNING
  tags: [filesystem, ai-agent]
```

If you use `pip`, `npm`, or other package managers that write to `/etc/`, add them to the exclusion list.

#### Detect Dangerous Commands

Some commands are almost never legitimate when run by an AI agent. Flag them immediately:

```yaml
- rule: Dangerous Command Executed
  desc: Detect potentially destructive commands
  condition: >
    spawned_process and
    proc.name in (dd, mkfs, fdisk, parted, shred)
  output: >
    Dangerous command executed
    (user=%user.name command=%proc.cmdline
    parent=%proc.pname gparent=%proc.aname[2])
  priority: CRITICAL
  tags: [process, ai-agent]
```

#### Detect Unexpected Network Connections

Flag outbound connections on non-standard ports. Customize the allowed port list based on your services:

```yaml
- rule: Unexpected Outbound Connection
  desc: Detect outbound connections to non-standard ports
  condition: >
    evt.type in (connect) and evt.dir=< and container.id = host
    and fd.typechar = 4 and fd.ip != "0.0.0.0"
    and not fd.sport in (80, 443, 53, 11434, 8080, 22)
  output: >
    Unexpected outbound connection
    (user=%user.name command=%proc.cmdline
    connection=%fd.name)
  priority: NOTICE
  tags: [network, ai-agent]
```

#### Detect SSH Key and Identity File Access

Reading SSH keys, `/etc/shadow`, or `/etc/sudoers` outside of authentication flows is suspicious:

```yaml
- rule: Sensitive Identity File Read
  desc: Detect reads of SSH keys, shadow, and sudoers
  condition: >
    open_read and container.id = host
    and (fd.name startswith /home and fd.name contains .ssh/id_
        or fd.name = /etc/shadow
        or fd.name = /etc/sudoers)
    and not proc.name in (sshd, sudo, su, login, passwd)
  output: >
    Sensitive identity file read
    (user=%user.name command=%proc.cmdline
    file=%fd.name parent=%proc.pname)
  priority: WARNING
  tags: [filesystem, identity, ai-agent]
```

#### Detect New Systemd Services

An AI agent creating a new systemd service file could establish persistence:

```yaml
- rule: New Systemd Service Created
  desc: Detect creation of new systemd service files
  condition: >
    (open_write or evt.type = rename) and container.id = host
    and (fd.name startswith /etc/systemd/system/
        or fd.name startswith /usr/lib/systemd/system/)
    and not proc.name in (dpkg, apt, apt-get)
  output: >
    New systemd service file created
    (user=%user.name command=%proc.cmdline
    file=%fd.name parent=%proc.pname)
  priority: WARNING
  tags: [persistence, ai-agent]
```

### Loading Custom Rules

After creating or editing rules:

```bash
# Validate the rules file
sudo falco --validate /etc/falco/rules.d/ai-agent.yaml

# Restart Falco to pick up new rules
sudo systemctl restart falco-modern-bpf

# Test that alerts fire (in another terminal, try writing to /etc):
echo "test" | sudo tee /etc/falco-test-file
sudo rm /etc/falco-test-file

# Check for the alert
sudo journalctl -u falco-modern-bpf --since "1 minute ago"
```

### Routing Falco Alerts to ntfy

Falco can output alerts via HTTP webhooks. If you run ntfy (covered in the monitoring stack post), you can get push notifications for every rule trigger.

Edit `/etc/falco/falco.yaml` and add an HTTP output:

```yaml
http_output:
  enabled: true
  url: http://localhost:8090/falco-alerts
```

For more sophisticated routing (different channels for different priorities, Slack integration, Grafana annotations), use [Falcosidekick](https://github.com/falcosecurity/falcosidekick), a companion tool that routes Falco alerts to over 60 destinations.

## auditd: Kernel-Level Audit Trail

### What Is auditd?

auditd is the Linux kernel's built-in audit framework. It records file access, command execution, privilege escalation, and system call events into `/var/log/audit/audit.log`. Unlike Falco's real-time alerting, auditd excels at creating a comprehensive audit trail that you can query after the fact.

### Installing and Enabling auditd

```bash
# Install
sudo apt install auditd audispd-plugins

# Enable and start
sudo systemctl enable auditd
sudo systemctl start auditd
```

### Audit Rules for AI Agent Monitoring

Create a rules file at `/etc/audit/rules.d/ai-agent.rules`. These rules watch specific files and directories for modifications:

```bash
# Monitor identity and access files
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k sudoers
-w /etc/sudoers.d/ -p wa -k sudoers

# Monitor SSH configuration
-w /etc/ssh/sshd_config -p wa -k sshd_config
-w /home/ -p wa -k ssh_keys
# Note: use your actual home directory path for .ssh/

# Monitor systemd service files
-w /etc/systemd/system/ -p wa -k systemd_changes
-w /usr/lib/systemd/system/ -p wa -k systemd_changes

# Monitor cron jobs
-w /etc/crontab -p wa -k cron
-w /etc/cron.d/ -p wa -k cron
-w /var/spool/cron/ -p wa -k cron

# Monitor package management
-w /var/log/apt/history.log -p wa -k package_install
-w /var/log/dpkg.log -p wa -k package_install

# Monitor Docker configuration
-w /etc/docker/ -p wa -k docker_config
-w /var/run/docker.sock -p wa -k docker_socket

# Monitor network configuration
-w /etc/hosts -p wa -k network_config
-w /etc/resolv.conf -p wa -k network_config

# Monitor firewall rules
-w /etc/ufw/ -p wa -k firewall

# Monitor shell profile changes
-w /etc/profile -p wa -k system_profile
-w /etc/bash.bashrc -p wa -k system_profile
```

**Rule syntax explained:**

- `-w /path` -- watch this file or directory
- `-p wa` -- trigger on **w**rite and **a**ttribute changes (permissions, ownership)
- `-k keyname` -- tag events with this key for easy searching

Load the rules:

```bash
sudo augenrules --load

# Verify rules are active
sudo auditctl -l
```

### Querying Audit Logs

The power of auditd comes from its query tools. After an AI agent session, you can investigate exactly what happened:

```bash
# What changed in identity files?
sudo ausearch -k identity --interpret

# Were sudoers modified?
sudo ausearch -k sudoers --interpret

# Any new systemd services?
sudo ausearch -k systemd_changes --interpret

# Any cron job changes?
sudo ausearch -k cron --interpret

# What packages were installed?
sudo ausearch -k package_install --interpret

# Generate a summary report
sudo aureport

# Executable report -- what programs ran
sudo aureport -x

# File access report
sudo aureport -f
```

The `--interpret` flag translates UIDs and syscall numbers into human-readable names, making the output much easier to parse.

### Time-Based Queries

After an AI agent session, query for all audit events during the session window:

```bash
# Events from the last hour
sudo ausearch -ts recent

# Events from a specific time range
sudo ausearch -ts 14:00:00 -te 15:30:00

# Events from today
sudo ausearch -ts today

# Combine with key filtering
sudo ausearch -ts today -k identity
```

## What to Monitor: A Checklist

Here is a prioritized list of what to watch when AI agents have system access:

### Critical (Alert Immediately)

| What | Why | Tool |
|------|-----|------|
| Writes to `/etc/passwd`, `/etc/shadow`, `/etc/sudoers` | Identity changes enable persistent access | Falco + auditd |
| `dd`, `mkfs`, `fdisk`, `parted`, `shred` commands | Destructive disk operations | Falco |
| New systemd service files | Persistence mechanism | Falco + auditd |
| SSH key creation or modification | Backdoor access | auditd |
| Writes to `/etc/ssh/sshd_config` | SSH configuration changes | auditd |

### High Priority (Review Daily)

| What | Why | Tool |
|------|-----|------|
| Package installations | Unexpected dependencies | auditd + apt logs |
| New cron jobs | Scheduled persistence | Falco + auditd |
| Docker socket access | Container escape risk | auditd |
| Network configuration changes | Routing changes, DNS poisoning | auditd |
| Shell profile modifications | Command injection on login | auditd |

### Medium Priority (Review Weekly)

| What | Why | Tool |
|------|-----|------|
| New listening ports | Unexpected services exposed | Prometheus + custom script |
| Firewall rule changes | Security policy modifications | auditd |
| File permission changes (chmod/chown) | Weakened file security | auditd |
| Unusual outbound connections | Data exfiltration | Falco |

## Drift Detection: Comparing Against a Baseline

Beyond real-time monitoring, periodically compare your system state against a known-good baseline. This catches changes that slipped through the cracks.

```bash
#!/bin/bash
# drift-check.sh -- Run daily via cron

ALERT_URL="http://localhost:8090/workstation-alerts"

# Check for new listening ports
EXPECTED_PORTS="22 80 443 3000 8080 9090 11434"
CURRENT_PORTS=$(ss -tlnp | awk 'NR>1 {print $4}' | grep -oP '\d+$' | sort -u)
for port in $CURRENT_PORTS; do
  if ! echo "$EXPECTED_PORTS" | grep -qw "$port"; then
    curl -s -H "Title: New port detected" \
      -H "Priority: high" \
      -d "Port $port is now listening" \
      "$ALERT_URL" > /dev/null
  fi
done

# Check for new systemd services
BASELINE="/path/to/systemd-services-baseline.txt"
if [ -f "$BASELINE" ]; then
  CURRENT=$(systemctl list-unit-files --state=enabled \
    --type=service --no-legend | awk '{print $1}' | sort)
  NEW=$(echo "$CURRENT" | comm -13 "$BASELINE" -)
  if [ -n "$NEW" ]; then
    curl -s -H "Title: New systemd services" \
      -H "Priority: high" \
      -d "New services: $NEW" \
      "$ALERT_URL" > /dev/null
  fi
fi

# Check for uncommitted /etc changes (if using etckeeper)
ETC_CHANGES=$(cd /etc && sudo git status --porcelain 2>/dev/null)
if [ -n "$ETC_CHANGES" ]; then
  curl -s -H "Title: Uncommitted /etc changes" \
    -d "$ETC_CHANGES" \
    "$ALERT_URL" > /dev/null
fi
```

Create the baseline:

```bash
systemctl list-unit-files --state=enabled --type=service --no-legend | \
  awk '{print $1}' | sort > /path/to/systemd-services-baseline.txt
```

Schedule the drift check:

```bash
# Add to crontab
# Run daily at 6 AM
0 6 * * * /usr/local/bin/drift-check.sh
```

## The NOPASSWD Approach for Safe Agent Operations

A common pattern for AI agent setups is a sudoers whitelist that allows specific safe commands without requiring a password (or hardware token):

```bash
# /etc/sudoers.d/ai-agent-whitelist
your_user ALL=(ALL) NOPASSWD: /usr/bin/apt install *
your_user ALL=(ALL) NOPASSWD: /usr/bin/apt update
your_user ALL=(ALL) NOPASSWD: /usr/bin/systemctl status *
your_user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ollama
your_user ALL=(ALL) NOPASSWD: /usr/bin/docker ps
your_user ALL=(ALL) NOPASSWD: /usr/bin/docker logs *
```

This allows agents to perform routine operations (install packages, check service status) without elevated privileges for dangerous commands. Any `sudo` command not on the whitelist will require interactive authentication -- a hardware security key tap, a password prompt, or whatever your system uses.

**Combine this with Falco and auditd:** Even whitelisted commands are logged and monitored. If an agent runs `sudo apt install something-unexpected`, auditd records it and your daily review catches it.

## Putting It All Together

A complete runtime security setup for AI agents looks like this:

1. **Falco** monitors system calls in real time and alerts on dangerous patterns (writes to `/etc/`, destructive commands, unexpected network connections, new services).
2. **auditd** records a detailed log of all file access, command execution, and privilege changes for after-the-fact review.
3. **etckeeper** version-controls `/etc/` so you can see exactly what changed and roll back if needed.
4. **A drift detection script** compares current system state against a known baseline daily.
5. **ntfy** delivers alerts to your phone so you know about critical events immediately.
6. **A sudoers whitelist** limits what agents can do with elevated privileges.

None of these tools prevent an agent from doing its job. They ensure you have visibility into what the agent did, alerts when something unexpected happens, and the ability to roll back changes.

## Practical Deployment Order

If you are setting up from scratch, follow this order:

1. **Install auditd and load the rules** (15 minutes). This starts recording immediately with zero configuration beyond the rules file.
2. **Install etckeeper** (5 minutes). `sudo apt install etckeeper` -- it initializes automatically and starts tracking `/etc/` changes.
3. **Install Falco** (20 minutes). Add the repository, install, configure custom rules, and start the service.
4. **Create the drift detection script** (15 minutes). Set up the baseline and schedule via cron.
5. **Set up ntfy** (10 minutes if already running). Configure Falco HTTP output to point to your ntfy instance.

Total setup time: roughly one hour. After that, you have kernel-level monitoring running continuously with minimal resource overhead.

## Further Reading

- [Falco documentation](https://falco.org/docs/)
- [Falco default rules reference](https://falco.org/docs/reference/rules/default-rules/)
- [Falcosidekick](https://github.com/falcosecurity/falcosidekick) -- routes Falco alerts to 60+ destinations
- [auditd man page](https://linux.die.net/man/8/auditd)
- [Linux audit system guide](https://www.baeldung.com/linux/auditd-monitor-file-access)
- [etckeeper](https://etckeeper.branchable.com/) -- version control for `/etc/`
- [CNCF landscape: security and compliance](https://landscape.cncf.io/card-mode?category=security-compliance)
