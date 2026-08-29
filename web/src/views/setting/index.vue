<template>
  <div ref="settingRef" class="setting_container">
    <el-tabs
      v-model="tabKey"
      :tab-position="isMobileScreen ? 'top' : 'left'"
      class="setting_tabs"
      @tab-change="handleTabChange"
    >
      <el-tab-pane
        v-for="tab in settingTabs"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
        :lazy="tab.lazy"
      >
        <section class="setting_page" :class="`is_${ tab.layout }`">
          <header class="setting_page_header">
            <h1>{{ tab.title }}</h1>
            <p>{{ tab.description }}</p>
          </header>
          <div class="setting_content">
            <component :is="tab.component" />
          </div>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import useMobileWidth from '@/composables/useMobileWidth'
import Session from './components/session.vue'
import IpAccess from './components/ip-access.vue'
import User from './components/user.vue'
import Notify from './components/notify.vue'
import UserPlus from './components/user-plus.vue'
import Proxy from './components/proxy.vue'
import AiAgent from './components/ai-agent.vue'

const route = useRoute()
const router = useRouter()
const settingRef = ref(null)
const { isMobileScreen } = useMobileWidth()

const settingTabs = [
  {
    label: '修改密码',
    name: 'user',
    title: '账户与安全',
    description: '更新登录信息与两步验证，修改后所有设备需要重新登录。',
    component: User,
    layout: 'form',
    lazy: false
  },
  {
    label: '登录管理',
    name: 'session',
    title: '登录管理',
    description: '查看当前设备和历史登录会话，并撤销不再使用的登录凭证。',
    component: Session,
    layout: 'wide',
    lazy: true
  },
  {
    label: '访问控制',
    name: 'ip-access',
    title: '访问控制',
    description: '限制可以访问面板、WebSocket 与 RDP 服务的来源 IP。',
    component: IpAccess,
    layout: 'standard',
    lazy: true
  },
  {
    label: '通知配置',
    name: 'notify',
    title: '通知配置',
    description: '配置通知渠道，并选择需要接收提醒的事件。',
    component: Notify,
    layout: 'standard',
    lazy: false
  },
  {
    label: '代理服务',
    name: 'proxy',
    title: '代理服务',
    description: '集中维护远程连接使用的代理节点。',
    component: Proxy,
    layout: 'wide',
    lazy: false
  },
  {
    label: 'AI 助手',
    name: 'ai-agent',
    title: 'AI 助手',
    description: '配置模型服务、外部工具和主机权限策略。',
    component: AiAgent,
    layout: 'ai',
    lazy: true
  },
  {
    label: 'Plus 激活',
    name: 'plus',
    title: 'Plus 激活',
    description: '管理授权状态、设备额度与 Plus 专属功能。',
    component: UserPlus,
    layout: 'standard',
    lazy: false
  },
]

const tabKey = computed({
  get() {
    return route.query.tabKey || 'user'
  },
  set(newVal) {
    router.push({ query: { ...route.query, tabKey: newVal } })
  }
})

const handleTabChange = () => {
  nextTick(() => {
    const content = settingRef.value?.querySelector('.el-tabs__content')
    if (content) content.scrollTop = 0
  })
}

</script>

<style lang="scss" scoped>
.setting_container {
  height: 100%;
  padding: 20px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}

.setting_tabs {
  height: 100%;

  > :deep(.el-tabs__header.is-left) {
    width: 148px;
    margin-right: 24px;
    padding: 8px;
    box-sizing: border-box;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
    background: var(--el-bg-color);
  }

  > :deep(.el-tabs__header.is-left .el-tabs__nav),
  > :deep(.el-tabs__header.is-left .el-tabs__item) {
    width: 100%;
  }

  > :deep(.el-tabs__header.is-left .el-tabs__item) {
    justify-content: flex-start;
    height: 42px;
    margin: 2px 0;
    padding: 0 14px;
    border-radius: 7px;
    transition: color var(--el-transition-duration-fast), background-color var(--el-transition-duration-fast);

    &:hover {
      background: var(--el-fill-color-light);
    }

    &.is-active {
      background: var(--el-color-primary-light-9);
    }
  }

  > :deep(.el-tabs__header .el-tabs__nav-wrap::after),
  > :deep(.el-tabs__header .el-tabs__active-bar) {
    display: none;
  }

  > :deep(.el-tabs__content) {
    min-width: 0;
    height: 100%;
    padding-right: 4px;
    overflow: auto;
  }
}

.setting_page {
  width: 100%;
  max-width: 1200px;
  margin: 0;
  padding: 2px 0 20px;

  &.is_form {
    max-width: 900px;
  }

  &.is_wide {
    max-width: 1440px;
  }
}

.setting_page_header {
  margin-bottom: 18px;

  h1 {
    margin: 0 0 6px;
    color: var(--el-text-color-primary);
    font-size: 22px;
    font-weight: 600;
    line-height: 1.4;
  }

  p {
    max-width: 720px;
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.6;
  }
}

.setting_content {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-lighter);
}

.setting_page.is_form .setting_content {
  padding: 28px 32px;
}

.setting_page.is_ai .setting_content {
  padding: 0;
  overflow: hidden;
}

.setting_page.is_form :deep(.password-form) {
  max-width: 720px;
}

.setting_page :deep(.el-form-item .input) {
  max-width: 100%;
}

@media (max-width: 968px) {
  .setting_container {
    padding: 58px 10px 10px;
  }

  .setting_tabs.el-tabs--top {
    display: flex;
    flex-direction: column;
  }

  .setting_tabs > :deep(.el-tabs__header.is-top) {
    flex-shrink: 0;
    margin: 0 0 12px;
    padding: 4px 8px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 9px;
    background: var(--el-bg-color);
  }

  .setting_tabs > :deep(.el-tabs__header.is-top .el-tabs__item) {
    height: 40px;
    padding: 0 14px;
    border-radius: 6px;

    &.is-active {
      background: var(--el-color-primary-light-9);
    }
  }

  .setting_tabs > :deep(.el-tabs__content) {
    height: auto;
    flex: 1;
    padding-right: 0;
  }

  .setting_page {
    padding-bottom: 10px;
  }

  .setting_page_header {
    margin-bottom: 14px;

    h1 {
      font-size: 20px;
    }
  }

  .setting_content,
  .setting_page.is_form .setting_content {
    padding: 18px 16px;
    border-radius: 8px;
  }

  .setting_page.is_ai .setting_content {
    padding: 0;
  }

  .setting_page :deep(.el-form-item) {
    max-width: 100%;
  }
}
</style>
