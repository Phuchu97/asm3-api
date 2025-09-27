module.exports = {
  apps: [
    {
      name: 'asm3-api',
      script: './index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 4000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ],

  deploy: {
    production: {
      user: 'vuongphatsteel',
      host: '103.152.165.223',
      ref: 'origin/main',
      repo: 'git@github.com:Phuchu97/asm3-api.git',
      path: '/home/vuongphatsteel/asm3-api',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
