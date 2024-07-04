import { existsSync, statSync } from 'fs'

import {
  useNuxt,
  defineNuxtModule,
  createResolver,
  addImportsDir,
} from '@nuxt/kit'

// 尝试借助这个模块创建一个空的db文件
export default defineNuxtModule({
  meta: {
    name: 'auto db',
  },
  async setup(_options, nuxt) {
    // const resolver = createResolver(import.meta.url)
    // if (existsSync(storesPath) && statSync(storesPath).isFile()) {
    //   // get config
    //   const configPath = resolver.resolve(storesPath)
    //   const config = await import(configPath)
    //   tsConfigs = Object.assign(tsConfigs, config.default)
    // }
  }
})
