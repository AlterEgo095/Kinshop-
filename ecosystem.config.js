/**
 * PM2 Ecosystem — KinShop production
 * Modèle serveur : Next.js standalone derrière nginx (port local 3310)
 */
module.exports = {
  apps: [
    {
      name: "kinshop",
      script: "/opt/KINSHOP/.next/standalone/server.js",
      cwd: "/opt/KINSHOP/.next/standalone",
      env: {
        NODE_ENV: "production",
        PORT: 3310,
        HOSTNAME: "127.0.0.1",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      min_uptime: "10s",
      max_restarts: 10,
      restart_window: "1h",
      exp_backoff_restart_delay: 200,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/opt/KINSHOP/logs/kinshop-error.log",
      out_file: "/opt/KINSHOP/logs/kinshop-out.log",
      merge_logs: true,
      stop_exit_codes: [0],
    },
  ],
};
