import { objectSortBy } from '@/helpers'
import { describe, it, expect } from 'vitest'


describe('objectSortBy', () => {
  it('works on strings', () => {
    const o = { "a": "aa", "c": "cc", "b": "bb" }
    expect(Object.keys(objectSortBy(o, (n, _) => n))).toEqual(["a", "b", "c"])
  })
  it('works on sub-objects', () => {
    const o = { "a": { k1: "aa", k2: "zz" }, "c": { k1: "cc", k2: "cc" }, "b": { k1: "bb", k2: "_" } }
    expect(Object.keys(objectSortBy(o, (o_, _) => o_.k1))).toEqual(["a", "b", "c"])
    expect(Object.keys(objectSortBy(o, (o_, _) => o_.k2))).toEqual(["b", "c", "a"])
  })
})
