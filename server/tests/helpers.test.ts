import * as assert from 'assert';
import {it} from '@jest/globals';
import { fromPairsGrouped, generalized_time_to_iso8601, iso8601_to_generalized_time } from "../helpers";


it('test_generalized_time_to_iso8601', () => {
    assert.equal(generalized_time_to_iso8601("20991231235959Z"), "2099-12-31T23:59:59");
    assert.equal(generalized_time_to_iso8601("20991231235959Z "), "2099-12-31T23:59:59");
    assert.equal(generalized_time_to_iso8601("20991231235959"), undefined);
    assert.equal(generalized_time_to_iso8601("20991231235959 "), undefined);
})

it('test_iso8601_to_generalized_time', () => {
    assert.equal(iso8601_to_generalized_time("2099-12-31T23:59:59Z"), "20991231235959Z");
    assert.equal(iso8601_to_generalized_time("2099-12-31T23:59:59.999Z"), "20991231235959Z");
    assert.equal(iso8601_to_generalized_time("2099-12-31T23:59:"), undefined);
})

it('oMap', () => {
    const undefined_ = undefined as string|undefined
    const null_ = null as string|null
    const zero = 0 as number|undefined
    assert.equal(""?.oMap(z => z), "")
    assert.equal("a"?.oMap(z => z), "a")
    assert.equal("a"?.oMap(z => z+"."), "a.")
    assert.equal(zero?.oMap(z => z+1), 1)
    assert.deepEqual([]?.oMap(z => z), [])
    assert.deepEqual(["a"]?.oMap(z => z[0]), "a")
    assert.deepEqual({}?.oMap(z => z), {})
    assert.deepEqual({ a: "A" }?.oMap(z => z.a), "A")
    assert.equal(undefined_?.oMap(z => z), undefined)
    assert.equal(null_?.oMap(z => z), undefined)
})

it('fromPairsGrouped', () => {
    assert.deepEqual(fromPairsGrouped([["a", "A"]]), { "a": ["A"] })
    assert.deepEqual(fromPairsGrouped([["a", "A"], ["a", "AA"]]), { "a": ["A", "AA"] })
    assert.deepEqual(fromPairsGrouped([["a", "A"], ["a", "A"]]), { "a": ["A", "A"] })
    assert.deepEqual(fromPairsGrouped([["a", "A"], ["b", "B"]]), { "a": ["A"], "b": ["B"] })
    assert.deepEqual(fromPairsGrouped([]), {})
})
