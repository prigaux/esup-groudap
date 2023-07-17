import * as assert from 'assert';
import {it} from '@jest/globals';
import { Periodicity, next_elapse } from '../periodicity';

// NB: rely on TZ=Etc/GMT-3 passed to jest

it('next_elapse', () => {
    const now = new Date('2000-01-31T12:59:59Z')
    function check(periodicity: Periodicity, wanted: string) {
        assert.deepEqual(next_elapse(periodicity, now), new Date(wanted))
    }
    check("toutes les minutes"     , '2000-01-31T13:00:59Z')
    check("toutes les 5 minutes"   , '2000-01-31T13:04:59Z')
    check("toutes les heures"      , '2000-01-31T13:59:59Z')
    check("toutes les 2 heures"    , '2000-01-31T14:59:59Z')
    check("tous les jours"         , '2000-02-01T12:59:59Z')

    check("tous les jours à 16h30" , '2000-01-31T13:30:00Z')
    check("tous les jours à 6h30"  , '2000-02-01T03:30:00Z')

    check("jamais" , '9999-01-01T00:00:00Z')
})
