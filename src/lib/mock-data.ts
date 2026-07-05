/**
 * Mock data used when real systemd/journalctl/shell are unavailable
 * (e.g. inside the preview sandbox). Provides a realistic Ubuntu server
 * simulation so the UI is fully demoable.
 */

export interface MockUnit {
  name: string;
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
  enabled: "enabled" | "disabled" | "static" | "masked";
  type: "service" | "socket" | "timer" | "target" | "mount";
}

export const MOCK_UNITS: MockUnit[] = [
  { name: "nginx.service", description: "The NGINX HTTP and reverse proxy server", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "ssh.service", description: "OpenBSD Secure Shell server", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "postgresql@16-main.service", description: "PostgreSQL 16 database server", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "redis-server.service", description: "Redis In-Memory Data Store", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "docker.service", description: "Docker Application Container Engine", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "cron.service", description: "Regular background program processing daemon", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "rsyslog.service", description: "System Logging Service", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "systemd-resolved.service", description: "Network Name Resolution", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "systemd-timesyncd.service", description: "Network Time Synchronization", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "ufw.service", description: "Uncomplicated firewall", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "fail2ban.service", description: "Fail2Ban authentication failure monitor", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "snapd.service", description: "Snap Daemon", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "munin-node.service", description: "Munin Node", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "prometheus-node-exporter.service", description: "Prometheus node exporter", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "grafana-server.service", description: "Grafana service", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "mysql.service", description: "MySQL Community Server", loadState: "loaded", activeState: "inactive", subState: "dead", enabled: "disabled", type: "service" },
  { name: "apache2.service", description: "The Apache HTTP Server", loadState: "loaded", activeState: "inactive", subState: "dead", enabled: "disabled", type: "service" },
  { name: "named.service", description: "BIND Domain Name Server", loadState: "loaded", activeState: "failed", subState: "failed", enabled: "disabled", type: "service" },
  { name: "ntp.service", description: "Network Time Service", loadState: "loaded", activeState: "inactive", subState: "dead", enabled: "static", type: "service" },
  { name: "systemd-journald.service", description: "Journal Service", loadState: "loaded", activeState: "active", subState: "running", enabled: "static", type: "service" },
  { name: "systemd-udevd.service", description: "udev Kernel Device Manager", loadState: "loaded", activeState: "active", subState: "running", enabled: "static", type: "service" },
  { name: "getty@tty1.service", description: "Getty on tty1", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "service" },
  { name: "docker.socket", description: "Docker Socket for the API", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "socket" },
  { name: "snapd.socket", description: "Socket activation for snappy daemon", loadState: "loaded", activeState: "active", subState: "running", enabled: "enabled", type: "socket" },
  { name: "fstrim.timer", description: "Discard unused blocks once a week", loadState: "loaded", activeState: "active", subState: "waiting", enabled: "enabled", type: "timer" },
  { name: "apt-daily.timer", description: "Daily apt download activities", loadState: "loaded", activeState: "active", subState: "waiting", enabled: "enabled", type: "timer" },
  { name: "apt-daily-upgrade.timer", description: "Daily apt upgrade activities", loadState: "loaded", activeState: "active", subState: "waiting", enabled: "enabled", type: "timer" },
  { name: "logrotate.timer", description: "Daily rotation of log files", loadState: "loaded", activeState: "active", subState: "waiting", enabled: "enabled", type: "timer" },
];

export function generateMockLogs(count = 100, unit?: string): string[] {
  const sev = ["DEBUG", "INFO", "WARNING", "ERROR"];
  const messages = unit
    ? [
        `Started ${unit}.`,
        `Main process exited, code=exited, status=0/SUCCESS`,
        `Consumed 12.345s CPU time`,
        `Listening on port 80.`,
        `Reloading configuration...`,
        `Worker process spawned, pid=`,
        `Connection accepted from 192.168.1.42`,
        `Healthcheck: OK`,
        `Cache hit ratio 0.84`,
        `Warning: high memory usage 78%`,
      ]
    : [
        `systemd-resolved[821]: Using DNS server 8.8.8.8`,
        `sshd[1234]: Accepted publickey for root from 10.0.0.5`,
        `cron[999]: (root) CMD (test -x /usr/sbin/anacron)`,
        `nginx[567]: *89 worker_connections are not enough`,
        `kernel: [    1.234567] sd 0:0:0:0: [sda] Attached SCSI disk`,
        `rsyslogd: imuxsock: recvmsg returned -1`,
        `systemd[1]: Started Daily apt download activities.`,
        `fail2ban.sshd[456]: Ban 192.168.1.100 for 1h`,
        `dockerd[789]: Container 7f3c health: healthy`,
        `kernel: TCP: request_sock_TCP: Possible SYN flooding on port 443`,
      ];
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const ts = new Date(now - i * (Math.random() * 60_000 + 5_000));
    const host = "ubu-prod-01";
    const pid = Math.floor(Math.random() * 9000 + 1000);
    const msg = messages[Math.floor(Math.random() * messages.length)];
    const s = sev[Math.floor(Math.random() * (unit ? 4 : 3))];
    const proc = unit ? unit.replace(/\.service$/, "") : "systemd";
    out.push(
      `${ts.toISOString().slice(0, 19)} ${host} ${proc}[${pid}]: ${msg} [${s}]`
    );
  }
  return out;
}

export const MOCK_FILE_TREE = {
  "/": ["etc", "var", "home", "root", "usr", "opt", "srv", "tmp", "bin", "sbin"],
  "/etc": ["nginx", "systemd", "ssh", "apt", "cron.d", "hosts", "hostname", "passwd", "shadow", "fstab", "rsyslog.conf"],
  "/etc/nginx": ["nginx.conf", "sites-enabled", "sites-available", "conf.d", "mime.types"],
  "/etc/nginx/sites-enabled": ["default"],
  "/etc/nginx/sites-available": ["default"],
  "/etc/nginx/conf.d": [],
  "/etc/systemd": ["system", "user"],
  "/etc/systemd/system": ["nginx.service", "docker.service", "multi-user.target.wants"],
  "/var": ["log", "lib", "cache", "spool", "www"],
  "/var/log": ["syslog", "auth.log", "kern.log", "nginx", "apt", "journal"],
  "/var/log/nginx": ["access.log", "error.log"],
  "/var/www": ["html"],
  "/var/www/html": ["index.html", "index.nginx-debian.html"],
  "/home": ["admin", "deploy"],
  "/home/admin": [".bashrc", ".profile", ".ssh", "projects"],
  "/home/admin/projects": ["app.py", "config.toml", "main.go"],
  "/root": [".bashrc", ".ssh", ".bash_history"],
  "/opt": ["myapp"],
  "/opt/myapp": ["app.js", "package.json", "config.toml", "Dockerfile"],
  "/srv": [],
  "/usr": ["bin", "lib", "share", "local"],
  "/tmp": [],
} as Record<string, string[]>;

export const MOCK_FILE_CONTENTS: Record<string, string> = {
  "/etc/nginx/nginx.conf": `user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 768;
}

http {
    sendfile on;
    tcp_nopush on;
    types_hash_max_size 2048;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log /var/log/nginx/access.log;

    gzip on;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
`,
  "/etc/hostname": "ubu-prod-01\n",
  "/etc/hosts": `127.0.0.1 localhost
127.0.1.1 ubu-prod-01

# The following lines are desirable for IPv6 capable hosts
::1     ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
`,
  "/opt/myapp/app.js": `const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ healthy: true });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
  "/opt/myapp/config.toml": `[server]
host = "0.0.0.0"
port = 3000

[database]
url = "postgres://localhost:5432/myapp"
pool_size = 10

[logging]
level = "info"
format = "json"
`,
  "/home/admin/projects/main.go": `package main

import (
    "fmt"
    "net/http"
    "os"
)

func main() {
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Hello from Go on %s", port)
    })

    fmt.Println("Listening on :" + port)
    http.ListenAndServe(":"+port, nil)
}
`,
  "/home/admin/projects/app.py": `from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route('/')
def index():
    return jsonify(status='ok', service='admin-api')

@app.route('/health')
def health():
    return jsonify(healthy=True)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
`,
};

/** Mock terminal: respond to a handful of common commands. */
export function mockTerminalExec(cmd: string, cwd: string): { stdout: string; stderr: string; exitCode: number; cwd: string } {
  const trimmed = cmd.trim();
  const lower = trimmed.toLowerCase();
  let newCwd = cwd;

  // cd handling
  if (trimmed.startsWith("cd ")) {
    const arg = trimmed.slice(3).trim();
    if (arg === "" || arg === "~") {
      newCwd = "/root";
    } else if (arg.startsWith("/")) {
      newCwd = arg;
    } else {
      newCwd = newCwd === "/" ? "/" + arg : newCwd + "/" + arg;
    }
    return { stdout: "", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "pwd") {
    return { stdout: cwd + "\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "whoami" || lower === "id") {
    return { stdout: "root\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "ls" || trimmed.startsWith("ls ")) {
    const dir = MOCK_FILE_TREE[cwd];
    if (dir) {
      return { stdout: dir.join("  ") + "\n", stderr: "", exitCode: 0, cwd: newCwd };
    }
    return { stdout: "", stderr: `ls: cannot access '${cwd}': No such file or directory\n`, exitCode: 2, cwd: newCwd };
  }

  if (lower === "uname -a" || lower === "uname") {
    return { stdout: "Linux ubu-prod-01 6.8.0-31-generic #31-Ubuntu SMP x86_64 GNU/Linux\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "uptime") {
    return { stdout: " 14:23:45 up 42 days,  3:21,  1 user,  load average: 0.42, 0.51, 0.49\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "free -h") {
    return { stdout: "               total        used        free      shared  buff/cache   available\nMem:            7.7Gi       2.3Gi       3.1Gi       145Mi       2.3Gi       5.0Gi\nSwap:             0B          0B          0B\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "df -h") {
    return { stdout: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        46G   18G   26G  41% /\ntmpfs           3.9G     0  3.9G   0% /dev/shm\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "systemctl list-units" || lower === "systemctl") {
    const lines = MOCK_UNITS.map(u =>
      `  ${u.name.padEnd(45)} ${u.loadState} ${u.activeState} ${u.subState} ${u.enabled}`
    );
    return { stdout: lines.join("\n") + "\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (trimmed.startsWith("systemctl status ")) {
    const name = trimmed.slice("systemctl status ".length).trim();
    const u = MOCK_UNITS.find(x => x.name === name || x.name === name + ".service");
    if (u) {
      return {
        stdout: `● ${u.name} - ${u.description}
     Loaded: loaded (${u.enabled})
     Active: ${u.activeState} (${u.subState}) since 2025-06-01 10:00:00 UTC
   Main PID: ${Math.floor(Math.random() * 9000 + 1000)}
      Tasks: 5 (limit: 38379)
     Memory: 12.3M
        CPU: 1.234s
`,
        stderr: "",
        exitCode: 0,
        cwd: newCwd,
      };
    }
  }

  if (lower === "echo hello" || trimmed.startsWith("echo ")) {
    return { stdout: trimmed.slice(5) + "\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (lower === "date") {
    return { stdout: new Date().toString() + "\n", stderr: "", exitCode: 0, cwd: newCwd };
  }

  if (trimmed === "") {
    return { stdout: "", stderr: "", exitCode: 0, cwd: newCwd };
  }

  return {
    stdout: "",
    stderr: `bash: ${trimmed.split(" ")[0]}: command not found (mock mode)\n`,
    exitCode: 127,
    cwd: newCwd,
  };
}

/** Mock bash completion — returns common commands/files based on prefix. */
export function mockBashComplete(line: string, cwd: string): string[] {
  if (line.startsWith("systemctl ")) {
    return ["start", "stop", "restart", "status", "enable", "disable", "reload"].filter(c => c.startsWith(line.split(" ")[1] || ""));
  }
  if (line.startsWith("cd ") || line.startsWith("ls ") || line.startsWith("cat ")) {
    const last = line.split(" ").pop() || "";
    const dir = MOCK_FILE_TREE[cwd] || [];
    return dir.filter(f => f.startsWith(last)).map(f => f + (MOCK_FILE_TREE["/" + (cwd === "/" ? "" : cwd) + "/" + f] ? "/" : ""));
  }
  const cmds = ["systemctl", "journalctl", "ls", "cd", "cat", "grep", "tail", "head", "echo", "df", "free", "uptime", "uname", "ps", "top", "kill", "sudo", "apt", "vim", "nano", "exit"];
  return cmds.filter(c => c.startsWith(line));
}
