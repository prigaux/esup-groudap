<script lang="ts">
import { Dn, SubjectAttrs } from '@/my_types'
</script>

<script setup lang="ts">
import SgroupLink from './SgroupLink.vue'
import MyIcon from './MyIcon.vue'
import Subject from './Subject'

defineProps<{
  dn: Dn,
  subject: SubjectAttrs | null,
  ssdn?: Dn,
}>()
</script>

<template>
<i v-if="!subject">
    invalide {{ dn }}
</i>
<span v-else-if="subject.sgroup_id">
    <MyIcon name="folder" class="on-the-left" />
    <SgroupLink :sgroup="subject" />
</span>
<span v-else>
    <Subject :dn="dn" :subject="subject" :ssdn="ssdn" />
</span>
</template>
