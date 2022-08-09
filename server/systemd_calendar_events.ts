/* eslint-disable no-cond-assign */
import { internal_error, popen, throw_ } from "./helpers";
import { Option } from "./my_types";

function toDate(s: string) {
    const d = new Date(s)
    return d && !isNaN(+d) ? d : undefined
}

function parse_systemd_analyze_output(output: string) {
    const r: Map<string, Date> = new Map();
    let event: Option<string>
    for (const line of output.split("\n")) {
        let s: Option<string>;
        if (s = line.match(/^\s*Original form: (.*)/)?.[1]) {
            if (event) throw "invalid systemd-analyze output " + output
            event = s
        } else if (s = line.match(/^\s*Next elapse: \S+ (.*)/)?.[1]) {
            const next_elapse = toDate(s + "Z") ?? throw_(`invalid systemd-analyze output: next_elapse ''${s}''`)
            if (!event) throw "invalid systemd-analyze output " + output
            r.set(event, next_elapse)
            event = undefined
        }
    }
    return r
}

// Cf https://www.freedesktop.org/software/systemd/man/systemd.time.html#Calendar%20Events for the syntax of calendar events
// NB : timezone depends on TZ env var or /etc/localtime
export async function next_elapses(events: string[]): Promise<Map<string, Date>> {
    const output = await popen("", "/usr/bin/systemd-analyze", ["calendar", ...events], { TZ: 'C' })
    return parse_systemd_analyze_output(output)
}

export async function next_elapse(event: string): Promise<Date> {
    const m = await next_elapses([event])
    return m.get(event) ?? internal_error()
}