<template>
  <el-alert type="success" :closable="false">
    <template #title>
      <span style="letter-spacing: 2px;"> 登录白名单IP设置: </span>
      <el-tooltip placement="top">
        <template #content>
          <div class="ip_tips">
            IP地址为包含匹配, 如输入: 192.168则匹配IP地址包含192.168的所有IP
          </div>
        </template>
        <el-icon>
          <InfoFilled />
        </el-icon>
      </el-tooltip>
      <el-input-tag v-model="allowedIPs" tag-type="success" tag-effect="plain" />
      <el-button
        style="margin-top: 6px;"
        type="success"
        :loading="btnLoading"
        @click="handleSaveAllowedIPs"
      >
        保存
      </el-button>
    </template>
  </el-alert>

  <el-alert
    class="retention_tip"
    type="info"
    title="登录记录默认保留 90 天，超过 90 天的记录将自动清理"
    show-icon
    :closable="false"
  />

  <!-- table -->
  <el-table v-loading="loading" :data="loginRecordList">
    <el-table-column prop="ip" label="IP" />
    <el-table-column
      prop="address"
      label="地点"
      min-width="126"
      show-overflow-tooltip
    >
      <template #default="scope">
        <span style="letter-spacing: 2px;"> {{ scope.row.country }} {{ scope.row.city }} </span>
      </template>
    </el-table-column>
    <el-table-column
      prop="agentInfo"
      label="设备信息"
      min-width="126"
      show-overflow-tooltip
    >
      <template #default="scope">
        <div style="letter-spacing: 2px;"> {{ scope.row.os }} </div>
        <div style="letter-spacing: 2px;"> {{ scope.row.browser }} </div>
        <el-tag
          v-if="scope.row.deviceId === deviceId"
          type="success"
          size="small"
        >
          当前设备
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="create" label="登录时间" min-width="126" />
    <el-table-column prop="expireAt" label="过期时间" min-width="126">
      <template #default="{ row }">
        {{ row.expireAt }}
      </template>
    </el-table-column>
    <el-table-column label="状态">
      <template #default="{ row }">
        <el-tag v-if="row.isExpired" type="info" size="small">已过期</el-tag>
        <el-tag v-else-if="row.revoked" type="warning" size="small">已注销</el-tag>
        <el-tag v-else type="success" size="small">正常</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="200">
      <template #header>
        <el-button
          type="warning"
          size="small"
          :loading="revokeAllLoading"
          @click="handleRevokeAllSessions"
        >
          注销所有会话
        </el-button>
      </template>
      <template #default="{ row }">
        <el-button
          v-if="!row.isExpired && !row.revoked"
          type="warning"
          size="small"
          :loading="removeSidLoading"
          @click="handleRemoveSid(row.id)"
        >
          注销
        </el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ref, onMounted, getCurrentInstance, watch, computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'

const { proxy: { $api, $message, $messageBox, $store, $router } } = getCurrentInstance()
const route = useRoute()

const loginRecordList = ref([])
const loading = ref(false)
const btnLoading = ref(false)
const revokeAllLoading = ref(false)
const removeSidLoading = ref(false)
const total = ref('')
const allowedIPs = ref([])
const deviceId = computed(() => $store.deviceId)

watch(() => route.query.refresh, (newVal) => {
  if (newVal) {
    handleLookupLoginRecord()
  }
})

const handleLookupLoginRecord = () => {
  loading.value = true
  $api.getLoginRecord()
    .then(({ data }) => {
      const { list, ipWhiteList } = data
      total.value = list.length
      allowedIPs.value = ipWhiteList?.filter(ip => Boolean(ip)) || []
      loginRecordList.value = list.map((item) => {
        item.create = dayjs(item.create).format('YYYY-MM-DD HH:mm:ss')
        item.expireAt = dayjs(item.expireAt).format('YYYY-MM-DD HH:mm:ss')
        item.isExpired = dayjs().isAfter(dayjs(item.expireAt))
        const { agentInfo: { os, browser } } = item
        item.browser = browser ? (browser.name + browser.version) : '--'
        item.os = os ? (os.name + os.version) : '--'
        return item
      })
    })
    .finally(() => {
      loading.value = false
    })
}

const handleSaveAllowedIPs = async () => {
  btnLoading.value = true
  const ipWhiteList = [...new Set(allowedIPs.value),].filter(item => /[\d\.]/.test(item))
  try {
    await $api.saveIpWhiteList({ ipWhiteList })
    handleLookupLoginRecord()
    $message.success('success')
  } finally {
    btnLoading.value = false
  }
}

const handleRevokeAllSessions = async () => {
  $messageBox.confirm('确定要注销所有会话吗？所有设备（包括当前设备）都将立即退出登录。', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      revokeAllLoading.value = true
      try {
        const { msg } = await $api.revokeAllSessions()
        $message.success(msg)
        await $store.removeLoginInfo()
        await $router.push('/login')
      } catch (error) {
        console.error(error)
        $message.error('注销所有会话失败')
      } finally {
        revokeAllLoading.value = false
      }
    })
}

const handleRemoveSid = async (id) => {
  $messageBox.confirm('确定要注销该设备登录凭证吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      removeSidLoading.value = true
      try {
        const { msg } = await $api.revokeLoginSid(id)
        handleLookupLoginRecord()
        $message.success(msg)
      } finally {
        removeSidLoading.value = false
      }
    })
}
onMounted(() => {
  handleLookupLoginRecord()
})
</script>

<style lang="scss" scoped>
.allowed_ip_tag {
  margin: 0 5px;
}

.retention_tip {
  margin: 12px 0;
}
</style>
