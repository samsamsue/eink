// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  nitro: {
    serverAssets: [
      {
        baseName: 'fonts',
        dir: './public/fonts'
      }
    ]
  },
  runtimeConfig:{
    APIKEY: process.env.APIKEY,
    DEVICEID: process.env.DEVICEID,
    PW: process.env.PW
  }
})
