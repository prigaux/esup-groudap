import { defineAsyncComponent, defineComponent } from "vue";
import * as api from '@/api'
import { SubjectSourceConfig } from "@/my_types";
import MyIcon from './MyIcon.vue'

const compute_default_vue_template = (sscfg: SubjectSourceConfig) => (
    sscfg.display_attrs.map((attr, i) =>
        `<span ${i ? "v-else-if" : "v-if"}="attrs.${attr}">{{attrs.${attr}}}</span>`
    ).join('')
)

export default defineAsyncComponent(async () => {
    const sscfgs = await api.config_subject_sources()

    const template = sscfgs.subject_sources.map(sscfg => {
        const sub_tmpl = sscfg.vue_template || compute_default_vue_template(sscfg)
        return `<span v-if="(ssdn || attrs.sscfg_dn) === '${sscfg.dn}'">${sub_tmpl}</span>`
    }).join('')

    return defineComponent({
        props: {
            dn: String,
            attrs: {},
            ssdn: String,
        },
        components: { MyIcon },
        methods: {
            first_line(s: string) {
                return s.replace(/\n.*/s, '')
            },
        },
        template,
    });
});