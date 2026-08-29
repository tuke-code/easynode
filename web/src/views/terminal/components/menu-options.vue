<template>
  <div class="menu_options_content">
    <el-form
      ref="formRef"
      label-suffix="："
      label-width="100px"
      :show-message="false"
    >
      <el-form-item label="实例" prop="instanceGroup">
        <el-radio-group
          v-model="hostGroupCascader"
          size="small"
          text-color="#fff"
          fill="#13ce66"
        >
          <el-radio-button :value="true">分组级联展示</el-radio-button>
          <el-radio-button :value="false">不分组单列展示</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="脚本库" prop="scriptLibrary">
        <el-radio-group
          v-model="scriptLibraryCascader"
          size="small"
          text-color="#fff"
          :fill="scriptLibrary ? '#13ce66' : '#999'"
          :disabled="!scriptLibrary"
        >
          <el-radio-button :value="true">分组级联展示</el-radio-button>
          <el-radio-button :value="false">不分组单列展示</el-radio-button>
        </el-radio-group>
        <span class="script_library_switch">
          <el-switch
            v-model="scriptLibrary"
            class="switch"
            inline-prompt
            style="--el-switch-on-color: #13ce66; --el-switch-off-color: #999"
            active-text="显示"
            inactive-text="隐藏"
          />
        </span>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { computed, getCurrentInstance } from 'vue'

const { proxy: { $store } } = getCurrentInstance()

const scriptLibrary = computed({
  get: () => $store.menuSetting.scriptLibrary,
  set: (newVal) => $store.setMenuSetting({ scriptLibrary: newVal })
})

const scriptLibraryCascader = computed({
  get: () => $store.menuSetting.scriptLibraryCascader,
  set: (newVal) => $store.setMenuSetting({ scriptLibraryCascader: newVal })
})

const hostGroupCascader = computed({
  get: () => $store.menuSetting.hostGroupCascader,
  set: (newVal) => $store.setMenuSetting({ hostGroupCascader: newVal })
})
</script>

<style lang="scss" scoped>
.script_library_switch {
  margin-left: 20px;
}
</style>
