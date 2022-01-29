<script lang="ts">
import { SubjectAttrs } from '@/my_types'
</script>

<script setup lang="ts">
import SgroupLink from './SgroupLink.vue'
import MyIcon from './MyIcon.vue'
import Subject from './Subject'

defineProps<{
  dn: string,
  subject: SubjectAttrs,
  ssdn?: string,
}>()
</script>

<template>
<span class="SgroupLink" v-if="subject.sgroup_id">
    <MyIcon name="folder" class="on-the-left" />
    <SgroupLink :sgroup="subject" />
</span>
<span class="Subject" v-else>
    <Subject :dn="dn" :subject="subject" :ssdn="ssdn" />
</span>
</template>
