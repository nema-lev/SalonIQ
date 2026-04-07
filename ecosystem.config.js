// PM2 ecosystem.config.js
// Използва се за стартиране на двата процеса на Oracle VM
// Команда: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'saloniq-backend',
      cwd: '/opt/saloniq/backend',
      script: 'dist/main.js',
      instances: 1,         // 1 инстанция (ARM VM с 2 OCPU)
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '400M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Логове
      out_file: '/var/log/saloniq/backend-out.log',
      error_file: '/var/log/saloniq/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    {
      name: 'saloniq-frontend',
      cwd: '/opt/saloniq/frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '350M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      out_file: '/var/log/saloniq/frontend-out.log',
      error_file: '/var/log/saloniq/frontend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
