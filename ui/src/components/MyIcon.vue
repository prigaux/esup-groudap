<script lang="ts">
import folder from '@fortawesome/fontawesome-free/svgs/regular/folder.svg?raw'
import users from '@fortawesome/fontawesome-free/svgs/solid/users.svg?raw'
import user from '@fortawesome/fontawesome-free/svgs/regular/user.svg?raw'
</script>

<script setup lang="ts">
defineProps<{
  name: 'folder' | 'users' | 'user',
}>()

const icons = { folder, users, user }
</script>

<template>
<span class="my-icon" :class="'my-icon-' + name" v-html="icons[name]"></span>
</template>

<style>
.my-icon {
  --my-icon-size: 12px;
  display: inline-block;
}
.my-icon > svg {
  width: auto;
  height: var(--my-icon-size);
  display: block;
}
.my-icon.on-the-left {
  margin-right: 0.5rem;
}
</style>
