// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: {
    enabled: false
  },
  compatibilityDate: "2024-07-03",
  modules: [
    "@nuxt/eslint",
    "@pinia/nuxt",
    "@nuxtjs/tailwindcss",
    "@element-plus/nuxt"
  ],
  elementPlus: {}
})
