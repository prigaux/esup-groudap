<script lang="ts">
import { SubjectAttrs } from '@/my_types'
</script>

<script setup lang="ts">
import SgroupLink from './SgroupLink.vue'
import MyIcon from './MyIcon.vue'
import Subject from './Subject'

defineProps<{
  dn: string,
  attrs: SubjectAttrs,
}>()
</script>

<template>
<span v-if="attrs.sgroup_id">
    <MyIcon name="folder" class="on-the-left" />
    <SgroupLink :attrs="attrs" />
</span>
<span v-else>
    <MyIcon name="user" class="on-the-left" />
    <Subject :dn="dn" :attrs="attrs" />
</span>
</template>
