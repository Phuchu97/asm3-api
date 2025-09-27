module.exports = {
  apps: [
    {
      name: 'asm3-api',
      script: './index.js',         // file entry point của BE
      instances: 1,                 // số instance chạy
      autorestart: true,            // tự restart nếu crash
      watch: false,                 // không theo dõi file thay đổi

      env: {                        // development
        NODE_ENV: 'development',
        PORT: 4000,
        JWTKEY: 'your_dev_jwt_key',
        MONGOOSE_URL: 'mongodb+srv://username:password@cluster.mongodb.net/devdb'
      },

      env_staging: {                // staging
        NODE_ENV: 'staging',
        PORT: 4001,
        JWTKEY: 'your_staging_jwt_key',
        MONGOOSE_URL: 'mongodb+srv://username:password@cluster.mongodb.net/stagingdb'
      },

      env_production: {             // production
        NODE_ENV: 'production',
        PORT: 4000,
        JWTKEY: 'your_production_jwt_key',
        MONGOOSE_URL: 'mongodb+srv://username:password@cluster.mongodb.net/proddb'
      }
    }
  ],

  deploy: {
    production: {
      user: 'vuongphatsteel',                  // user mới
      host: '103.152.165.223',                  // IP server
      ref: 'origin/main',                      // nhánh git
      repo: 'your_git_repository_url',         // repo BE
      path: '/home/vuongphatsteel/asm3-api',  // path trên server

      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
