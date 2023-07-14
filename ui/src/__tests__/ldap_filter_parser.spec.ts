import { ast, export_for_tests, spaces_option, to_html } from '@/ldap_filter_parser'
import { describe, it, expect } from 'vitest'

const { format_filter, parse } = export_for_tests

describe('parse', () => {

    function check_parse(filter: string, wantedAST: ast, expected_unparsed: string) {
        const { ast, unparsed } = parse(filter)
        expect(ast).toEqual(wantedAST)
        expect(unparsed).toEqual(expected_unparsed)
    }

    it('works on valid filters', () => {
        function check(filter: string, wantedAST: ast) {
            check_parse(filter, wantedAST, '')
        }
        check("(foo=bar)", { op: '=', attr: 'foo', value: 'bar' })
        check("(foo=*bar*)", { op: '=', attr: 'foo', value: '*bar*' })
        check("(|)", { op: '|', sub_filters: [] })
        check("(|(foo=bar))", { op: '|', sub_filters: [ { op: '=', attr: 'foo', value: 'bar' } ] })
        check("(|\n  (foo=bar)\n)", { op: '|', sub_filters: [ { op: '=', attr: 'foo', value: 'bar', post_spaces: "\n" } ], before_sub_spaces: "\n  " })
        check("(|(foo=bar)(a=b))", { op: '|', sub_filters: [ { op: '=', attr: 'foo', value: 'bar' }, { op: '=', attr: 'a', value: 'b' } ] })
        check("(|\n  (foo=bar)\n  (a=b)\n)", { op: '|', sub_filters: [ { op: '=', attr: 'foo', value: 'bar', post_spaces: "\n  " }, { op: '=', attr: 'a', value: 'b', post_spaces: "\n" } ], before_sub_spaces: "\n  " })
        check("(|(supannRoleEntite=*[role={SUPANN}D01]*[code=0031_A]*)(supannRoleEntite=*[role={SUPANN}D30]*[code=0031_A]*)(supannRoleEntite=*[role={SUPANN}P70]*[code=0031_A]*)(supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}20]*[code=0031_A]*)(supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}529]*[code=0031_A]*)(supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}530]*[code=0031_A]*)(supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}532]*[code=0031_A]*)(supannRoleEntite=*[role={UAI:0751717J:SIHAM:FCT}1531]*[code=0031_A]*)(supannRoleEntite=*[role={UAI:0751717J}DIR_SITE]*[code=0031_A]*))", {
            op: '|',
            sub_filters: [
            { op: '=', attr: 'supannRoleEntite', value: '*[role={SUPANN}D01]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={SUPANN}D30]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={SUPANN}P70]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={UAI:0751717J:HARPEGE.FCSTR}20]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={UAI:0751717J:HARPEGE.FCSTR}529]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={UAI:0751717J:HARPEGE.FCSTR}530]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={UAI:0751717J:HARPEGE.FCSTR}532]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={UAI:0751717J:SIHAM:FCT}1531]*[code=0031_A]*' },
            { op: '=', attr: 'supannRoleEntite', value: '*[role={UAI:0751717J}DIR_SITE]*[code=0031_A]*' }
            ]
        })
    })
    it('works on invalid filters', () => {
        const check = check_parse
        check("(foo=bar))", { op: '=', attr: 'foo', value: 'bar' }, ')')
        check("(foo=bar", { op: '=', attr: 'foo', value: 'bar', unclosed: true }, '')
        check("(|(foo=bar)", { op: '|', sub_filters: [ { op: '=', attr: 'foo', value: 'bar' } ], unclosed: true }, '')
        check("(|(foo=bar", { op: '|', sub_filters: [ { op: '=', attr: 'foo', value: 'bar', unclosed: true } ], unclosed: true }, '')
    })
})  

describe('parse then format', () => {

    function check_format_filter(filter: string, unparsed: string, spaces: spaces_option) {
        const r = parse(filter + unparsed)
        expect(unparsed).toEqual(r.unparsed)
        //console.log(JSON.stringify(r.ast))
        const filter_ = r.ast && format_filter(r.ast, spaces)
        //console.log(filter_)
        expect(filter_).toEqual(filter)
    }
    
    it('works on simple valid filters', () => {
        function check(filter: string) {
            check_format_filter(filter, '', { remove_spaces: true })
        }
        check("(foo=bar)")
        check("(foo=*bar*)")
        check("(|)")
        check("(|(foo=bar))")
        check("(|(foo=bar)(a=b))")
    })

    it('works on simple invalid filters', () => {
        function check(filter: string, unparsed: string) {
            check_format_filter(filter, unparsed, { remove_spaces: true })
        }
        check("(foo=bar)", ")")
        check("(foo=bar", "")
        check("(|(foo=bar)", "")
        check("(|(foo=bar", "")
    })

    it('keep spaces', () => {
        function check(filter: string) {
            check_format_filter(filter, '', { keep_spaces: true })
        }
        check("(| (foo=bar) (a=b) )")
        check(`(!
            (!(eduPersonAffiliation=staff))
        )`)
        check_format_filter(`(&
  (uid=*)
  (|
    (uid=*)
    (foo=bar)`, `ERR
      )
    )`, { keep_spaces: true })

    })

    it('indents', () => {
        function check(filter: string) {
            check_format_filter(filter, '', { indent: '  ' })
        }
        check("(foo=bar)")
        check("(foo=*bar*)")
        check("(|)")
        check("(|\n  (foo=bar)\n  (a=b)\n)")
        check(`(&
  (|
    (foo=bar)
    (a=b)
  )
)`)

        check(`(|
  (supannRoleEntite=*[role={SUPANN}D01]*[code=0031_A]*)
  (supannRoleEntite=*[role={SUPANN}D30]*[code=0031_A]*)
  (supannRoleEntite=*[role={SUPANN}P70]*[code=0031_A]*)
  (supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}20]*[code=0031_A]*)
  (supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}529]*[code=0031_A]*)
  (supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}530]*[code=0031_A]*)
  (supannRoleEntite=*[role={UAI:0751717J:HARPEGE.FCSTR}532]*[code=0031_A]*)
  (supannRoleEntite=*[role={UAI:0751717J:SIHAM:FCT}1531]*[code=0031_A]*)
  (supannRoleEntite=*[role={UAI:0751717J}DIR_SITE]*[code=0031_A]*)
)`)

        check(`(&
  (|
    (supannEntiteAffectation=U08)
    (supannEntiteAffectation=U08SI)
  )
  (|
    (eduPersonAffiliation=staff)
    (eduPersonAffiliation=faculty)
    (eduPersonAffiliation=teacher)
    (eduPersonAffiliation=emeritus)
  )
  (eduPersonAffiliation=member)
  (!
    (up1Profile=[up1Source={HARPEGE}contrat]*[employeeType=Personnel en activité ponctuelle*[supannEntiteAffectationPrincipale=U08]*)
  )
)`)
    })

})

describe('parse then format HTML', () => {
    function check(filter: string, expected: string) {
        const html = to_html(filter)
        console.log(html)
        expect(html).toEqual(expected)
    }
    const foo_bar_html = `<span class="token punctuation0">(</span>foo<span class="token operator">=</span><span class="token string">bar</span><span class="token punctuation0">)</span>`
    it("should work on simple filters", () => {
        check("(foo=bar)", foo_bar_html)
    })
    it("should keep spaces", () => {
        check("(foo=bar)\n", `${foo_bar_html}<span class="token invalid">\n</span>`)
    })
    it("should work on complex filters", () => {
        check(`(!
    (!(eduPersonAffiliation=staff))
)`, /*html*/`<span class="token punctuation0">(</span><span class="token operator">!</span>
    <span class="token punctuation1">(</span><span class="token operator">!</span><span class="token punctuation2">(</span>eduPersonAffiliation<span class="token operator">=</span><span class="token string">staff</span><span class="token punctuation2">)</span><span class="token punctuation1">)</span>
<span class="token punctuation0">)</span>`)
    })
})
