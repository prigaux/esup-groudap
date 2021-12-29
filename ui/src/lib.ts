import { PRecord, Right } from "./my_types"

export const right2text: PRecord<Right, string> = {
    "admin": "Administrer",
    "updater": "Modifier les membres",
    "reader": "Lire",
}

export const list_of_rights: Right[] = ['reader', 'updater', 'admin']
