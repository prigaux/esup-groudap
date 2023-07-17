import { addSeconds } from "./helpers";


type durations = 'jours' | 'heures' | 'minutes'

export type Periodicity = 
    `jamais` |
    `tous les jours` | `toutes les ${durations}` | `toutes les ${bigint} ${durations}` |
    `tous les jours à ${bigint}h${number}`


function toSeconds(periodicity: Periodicity) {
    let m
    if (periodicity === 'tous les jours') {
        return 24 * 60 * 60
    } else if (m = periodicity.match(/^toutes les (\d+ )?heures/)) {
        return parseInt(m[1] || '1') * 60 * 60
    } else if (m = periodicity.match(/^toutes les (\d+ )?minutes/)) {
        return parseInt(m[1] || '1') * 60
    } else {
        return undefined
    }
}

export function next_elapse(periodicity: Periodicity, now?: Date): Date {
    now ||= new Date()
    const seconds = toSeconds(periodicity)
    if (seconds) {
        return addSeconds(now, seconds)
    } else if (periodicity === 'jamais') {
        return new Date(Date.UTC(9999, 0, 1))
    } else {
        const m = periodicity.match(/^tous les jours à (\d+)h(\d+)/)
        if (m) {
            const date = new Date(now);
            date.setHours(parseInt(m[1]))
            date.setMinutes(parseInt(m[2]))
            date.setSeconds(0)
            date.setMilliseconds(0)
            console.log("" + date, date.toISOString())
            if (+date < +now) date.setDate(date.getDate() + 1)
            return date
        }
        throw `internal error: not handled periodicity ${periodicity}`
    }
}
