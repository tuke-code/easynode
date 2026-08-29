<template>
  <div class="setting_container">
    <el-tabs v-model="tabKey" tab-position="left" class="setting_tabs">
      <el-tab-pane label="修改密码" name="user">
        <User />
      </el-tab-pane>
      <el-tab-pane label="登录管理" name="session" lazy>
        <Session />
      </el-tab-pane>
      <el-tab-pane label="通知配置" name="notify">
        <Notify />
      </el-tab-pane>
      <el-tab-pane label="代理服务" name="proxy">
        <Proxy />
      </el-tab-pane>
      <el-tab-pane label="AI 助手设置" name="ai-agent" lazy>
        <AiAgent />
      </el-tab-pane>
      <el-tab-pane label="Plus激活" name="plus">
        <UserPlus />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Session from './components/session.vue'
import User from './components/user.vue'
import Notify from './components/notify.vue'
import UserPlus from './components/user-plus.vue'
import Proxy from './components/proxy.vue'
import AiAgent from './components/ai-agent.vue'

const route = useRoute()
const router = useRouter()

const tabKey = computed({
  get() {
    return route.query.tabKey || 'user'
  },
  set(newVal) {
    router.push({ query: { tabKey: newVal } })
  }
})

watch(() => tabKey.value, (newVal) => {
  router.push({ query: { tabKey: newVal } })
})

</script>

<style lang="scss" scoped>
.setting_container {
  height: 100%;
  padding: 20px;
  overflow: hidden;
}

.setting_tabs {
  height: 100%;

  > :deep(.el-tabs__header.is-left) {
    width: 132px;
    margin-right: 24px;
  }

  > :deep(.el-tabs__header.is-left .el-tabs__item) {
    justify-content: flex-start;
    height: 44px;
    padding: 0 16px;
  }

  > :deep(.el-tabs__header.is-left .el-tabs__nav-wrap::after) { width: 1px; }
  > :deep(.el-tabs__header.is-left .el-tabs__active-bar) { width: 2px; }

  > :deep(.el-tabs__content) {
    min-width: 0;
    height: 100%;
    overflow: auto;
  }
}

@media (max-width: 768px) {
  .setting_tabs > :deep(.el-tabs__header.is-left) {
    width: 112px;
    margin-right: 12px;
  }

  .setting_tabs > :deep(.el-tabs__header.is-left .el-tabs__item) {
    padding: 0 10px;
  }
}
</style>
