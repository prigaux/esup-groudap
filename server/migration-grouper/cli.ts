import { throw_ } from '../helpers'
import audit from './audit'
import composites from './composites'
import grouper_loader from './grouper_loader'
import mrights from './mrights'
import sgroups from './sgroups'
import * as ldapP from 'ldapjs-promise-disconnectwhenidle'

const [,, action, ...params] = process.argv

async function doit() {
    try {
        const p = 
            action === 'sgroups' ? sgroups() : 
            action === 'composites' ? composites() : 
            action === 'mrights' ? mrights() : 
            action === 'audit' ? audit() : 
            // @ts-expect-error
            action === 'grouper_loader' ? grouper_loader(...params) : 
            throw_("unknown action " + action)
        await p
        console.warn("\x1b[32mOK\x1b[0m (finished with no fatal error)")
    } catch (err) {
        console.error("\x1b[31mERROR\x1b[0m", err)
    } finally {
        ldapP.destroy()        
    }
}
  
doit()