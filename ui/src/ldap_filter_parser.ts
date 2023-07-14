type Option<T> = T | undefined

export type ast = {
    post_spaces?: string
    unclosed?: true
} & ({ 
    op: '&' | '|' | '!'
    before_sub_spaces?: string
    sub_filters: ast[]
} | {
    op: '='
    attr: string
    value: string
})

function parse(s: string) {
    function skip_spaces(offset_: number): [ string, number ] {
        for (let offset = offset_;; offset++) {
            const c = s.at(offset)
            if (c !== " " && c !== "\n" && c !== "\t") {
                return [ s.substring(offset_, offset), offset ]
            }
        }
    }
    function rec(offset: number): Option<{ offset: number, ast: ast }> {
        const c = s.at(offset)
        if (c !== '(') {
            if (c !== ')') console.log("expected '(' at beginning of", s.substring(offset), " whole filter was", s)
            return undefined
        }

        offset++;
        const op = s.at(offset)
        if (op === '|' || op === '&' || op === '!') {
            // NB: with allow spaces before&after sub filters (for indentation)
            let sub_filters: ast[] = []
            let ast: ast = { op, sub_filters }

            let before_sub_spaces;
            [ before_sub_spaces, offset ] = skip_spaces(offset + 1);
            if (before_sub_spaces) ast.before_sub_spaces = before_sub_spaces

            while (1) {
                const sub = rec(offset)
                if (!sub) break;

                let post_spaces
                [ post_spaces, offset ] = skip_spaces(sub.offset)
                if (post_spaces) sub.ast.post_spaces = post_spaces

                sub_filters.push(sub.ast)
                if (sub.ast.unclosed) {
                    ast.unclosed = true
                    return { offset, ast }
                }
            }
            if (s.at(offset) === ')') {
                offset++
            } else {
                ast.unclosed = true
                //console.log("expected ')' at beginning of", s.substring(offset), " whole filter was", s)
            }
            return { offset, ast }
        } else {
            const m = s.substring(offset).match(/^([^=()]*)=([^()]*)/)
            if (m) {
                let ast: ast = { op: '=', attr: m[1], value: m[2] }
                offset += m[0].length
                if (s.at(offset) === ')') {
                    offset++
                } else {
                    ast.unclosed = true
                }
                return { offset, ast }
            }
            console.log("expected xxx=xxx at beginning of", s.substring(offset))
        }
        return undefined
    }
    const r = rec(0)
    return r ? { ast: r.ast, unparsed: s.substring(r.offset) } : { ast: undefined, unparsed: s }
}

export type spaces_option = { keep_spaces: true } | { indent: string } | { remove_spaces: true }

function format_filter(filterAST: ast, spaces: spaces_option) {
    function rec(ast: ast): string[] {
        const close = ast.unclosed ? '' : ')' + ("keep_spaces" in spaces && ast.post_spaces || '')
        if (ast.op === '=') {
            return [ `(${ast.attr}${ast.op}${ast.value}${close}` ]
        } else if (ast.sub_filters) {
            const lines = ast.sub_filters.flatMap(rec)
            if ("indent" in spaces && (lines.length > 1 || lines?.[0]?.length > 60)) {
                return [ `(${ast.op}`, ...lines.map(line => spaces.indent + line), close ]
            } else {
                return [ `(${ast.op}${"keep_spaces" in spaces && ast.before_sub_spaces || ''}${lines.join('')}${close}` ]
            }
        } else {
            throw "format_filter: invalid filter AST " + JSON.stringify(ast)
        }
    }
    return rec(filterAST).join("\n")
}

function toPrismHtml(s: string, class_: string) {
    return `<span class="token ${class_}">${s}</span>`
}

function format_filter_html(filterAST: ast) {
    const nb_colors = 6;
    let count = 0
    function rec(ast: ast): string {
        const op = toPrismHtml(ast.op, 'operator')
        const open = toPrismHtml('(', ast.unclosed ? 'invalid' : 'punctuation' + (count % nb_colors))
        const close = ast.unclosed ? '' : toPrismHtml(')', 'punctuation' + (count % nb_colors)) + (ast.post_spaces || '')
        count++;
        if (ast.op === '=') {
            return `${open}${ast.attr}${op}${toPrismHtml(ast.value, 'string')}${close}`
        } else if (ast.sub_filters) {
            const lines = ast.sub_filters.map(sub => rec(sub))
            return `${open}${op}${ast.before_sub_spaces || ''}${lines.join('')}${close}`
        } else {
            throw "format_filter: invalid filter AST " + JSON.stringify(ast)
        }
    }
    return rec(filterAST)
}

export function indent(filter: string): any {
    const { ast, unparsed } = parse(filter)
    return (ast ? format_filter(ast, { indent: '  '}) : '') + unparsed
}

export function to_html(filter: string): any {
    const { ast, unparsed } = parse(filter)
    return `${ast ? format_filter_html(ast) : ''}${unparsed ? toPrismHtml(unparsed, 'invalid') : ''}`
}

export const export_for_tests = { parse, format_filter, format_filter_html }