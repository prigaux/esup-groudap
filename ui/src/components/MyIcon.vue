<script lang="ts">
import folder from '@fortawesome/fontawesome-free/svgs/regular/folder.svg?raw'
import users from '@fortawesome/fontawesome-free/svgs/solid/users.svg?raw'
import user from '@fortawesome/fontawesome-free/svgs/regular/user.svg?raw'
import cogs from '@fortawesome/fontawesome-free/svgs/solid/cogs.svg?raw'
import pencil from '@fortawesome/fontawesome-free/svgs/solid/pencil-alt.svg?raw'
import close from '@fortawesome/fontawesome-free/svgs/solid/window-close.svg?raw'
import check from '@fortawesome/fontawesome-free/svgs/solid/check-square.svg?raw'

</script>

<script setup lang="ts">
defineProps<{
  name: 'folder' | 'users' | 'user' | 'cogs' | 'pencil' | 'close' | 'check',
}>()

const icons = { folder, users, user, cogs, pencil, close, check }
</script>

<template>
<span class="my-icon" :class="'my-icon-' + name" v-html="icons[name]"></span>
</template>

<style>
.my-icon {
  --my-icon-size: 12px;
  display: inline-block;
  vertical-align: middle;
}
.my-icon > svg {
  width: auto;
  height: var(--my-icon-size);
  display: block;
}
.my-icon.on-the-left {
  margin-right: 0.5rem;
}
.my-icon.on-the-right {
  margin-left: 0.5rem;
}
</style>
