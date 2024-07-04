<template>
  <div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-sm mt-32">
      <img class="mx-auto h-10 w-auto" src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600">
      <!-- <h2 class="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">Sign in to your account</h2> -->
      <h2 class="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">EasyNode</h2>
    </div>

    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <form class="space-y-6" action="#" method="POST">
        <div>
          <label for="email" class="block text-sm font-medium leading-6 text-gray-900">用户名</label>
          <div class="mt-2">
            <n-input-group>
              <n-input v-model="username" />
            </n-input-group>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label for="password" class="block text-sm font-medium leading-6 text-gray-900">密码</label>
            <!-- <div class="text-sm">
              <a href="#" class="font-semibold text-indigo-600 hover:text-indigo-500">忘记密码?</a>
            </div> -->
          </div>
          <div class="mt-2">
            <n-input-group>
              <n-input type="password" v-model="password" show-password-on="mousedown" :maxlength="18" />
            </n-input-group>
          </div>
        </div>
        <n-button type="primary" class="w-full">
          登录
        </n-button>
      </form>

      <!-- <p class="mt-10 text-center text-sm text-gray-500">
        Not a member?
        <a href="#" class="font-semibold leading-6 text-indigo-600 hover:text-indigo-500">Start a 14 day free trial</a>
      </p> -->
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const username = ref('');
const password = ref('');

const onLogin = () => {
  // 实现登录逻辑
  console.log('Username:', username.value);
  console.log('Password:', password.value);
  // 这里可以添加向后端发送请求的代码
};
</script>

<style>
/* 可以在这里添加额外的CSS样式 */
</style>
